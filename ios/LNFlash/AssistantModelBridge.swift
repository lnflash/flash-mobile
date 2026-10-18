//
//  AssistantModelBridge.swift
//  LNFlash
//
//  The Flash assistant's on-device model on iOS (ENG-690): Apple's Foundation
//  Models framework, on iOS 26 and an Apple Intelligence iPhone. The JS layer
//  (app/assistant/engine/native-model-bridge.ts) asks `isAvailable` on every
//  turn the grammar tier cannot read, then `complete` for at most one tool
//  call, which JS validates before anything runs.
//
//  The app still runs on iOS 15.1 (IPHONEOS_DEPLOYMENT_TARGET) and the
//  framework exists only on iOS 26, so:
//
//   - every use of it sits inside `#if canImport(FoundationModels)` (an SDK
//     without it compiles this module down to "no model") and
//     `@available(iOS 26.0, *)` (older systems answer "no model");
//   - it is weak-linked (OTHER_LDFLAGS: -weak_framework FoundationModels),
//     so dyld does not look for it at launch on iOS 15 to 25.
//
//  A strong link or an unguarded use is a crash at launch for every user
//  below iOS 26.
//

import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

@objc(AssistantModelBridge)
class AssistantModelBridge: NSObject {

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  /// Whether the system model can answer now: `.available` only. Resolves
  /// false when it is not ready, Apple Intelligence is off, the device is not
  /// eligible, and on any iOS before 26. Never rejects.
  @objc(isAvailable:rejecter:)
  func isAvailable(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      resolve(AssistantOnDeviceModel.isAvailable())
      return
    }
    #endif
    resolve(false)
  }

  /// One tool call for the prompt, as {"intent": "...", "argsJson": "..."}.
  /// `promptJson` holds the prompt's two parts, `instructions` and `prompt`
  /// (app/assistant/engine/model-prompt.ts). Rejects with "unavailable",
  /// "invalid_prompt", "timeout" (no answer within `timeoutMs`, the work is
  /// cancelled) or "generation_failed"; JS reads any rejection as no model.
  @objc(complete:timeoutMs:resolver:rejecter:)
  func complete(
    _ promptJson: String,
    timeoutMs: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let promise = AssistantModelPromise(resolve: resolve, reject: reject)
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      AssistantOnDeviceModel.complete(
        promptJson: promptJson,
        timeoutMs: timeoutMs.intValue,
        promise: promise
      )
      return
    }
    #endif
    promise.reject("unavailable", "No on-device model on this system")
  }
}

/// Settles a React Native promise once: the model's answer and the timeout
/// race, and only the first of them reaches JS.
final class AssistantModelPromise: @unchecked Sendable {
  private let lock = NSLock()
  private var settled = false
  private let resolveBlock: RCTPromiseResolveBlock
  private let rejectBlock: RCTPromiseRejectBlock

  init(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    resolveBlock = resolve
    rejectBlock = reject
  }

  private func claim() -> Bool {
    lock.lock()
    defer { lock.unlock() }
    if settled { return false }
    settled = true
    return true
  }

  func resolve(_ value: String) {
    if claim() { resolveBlock(value) }
  }

  func reject(_ code: String, _ message: String) {
    if claim() { rejectBlock(code, message, nil) }
  }
}

#if canImport(FoundationModels)
/// The answer's shape, built from the tools the prompt carries (JS sends each
/// registered tool's intent, description and arguments, in its schema's
/// order: app/assistant/engine/model-prompt.ts, ModelTool). Guided generation
/// then holds the model to one of them, or to "none":
///
///   {"intent": "<intent>", "args": {<that tool's arguments>}}
///
/// so an intent outside the registry, or an argument a tool does not take,
/// cannot be generated at all, and JS still checks everything it gets.
/// Arguments are typed from each tool's JSON Schema (an enum is its choices,
/// an integer an Int, a list a list); the schema's patterns are left to JS:
/// guided generation takes few of them.
@available(iOS 26.0, *)
enum AssistantAnswerSchema {
  struct Invalid: Error {}

  static func argument(_ name: String, _ spec: [String: Any]) -> DynamicGenerationSchema {
    if let choices = spec["enum"] as? [String] {
      return DynamicGenerationSchema(name: name, anyOf: choices)
    }
    switch spec["type"] as? String {
    case "integer":
      return DynamicGenerationSchema(type: Int.self)
    case "number":
      return DynamicGenerationSchema(type: Double.self)
    case "boolean":
      return DynamicGenerationSchema(type: Bool.self)
    case "array":
      return DynamicGenerationSchema(
        arrayOf: argument("\(name)_item", spec["items"] as? [String: Any] ?? [:]),
        minimumElements: spec["minItems"] as? Int,
        maximumElements: spec["maxItems"] as? Int
      )
    default:
      return DynamicGenerationSchema(type: String.self)
    }
  }

  static func intentProperty(_ intent: String) -> DynamicGenerationSchema.Property {
    DynamicGenerationSchema.Property(
      name: "intent",
      schema: DynamicGenerationSchema(type: String.self, guides: [.constant(intent)])
    )
  }

  static func tool(_ tool: [String: Any]) throws -> DynamicGenerationSchema {
    guard let intent = tool["intent"] as? String, intent != "none" else { throw Invalid() }
    let arguments = try (tool["arguments"] as? [[String: Any]] ?? []).map { argument in
      guard let name = argument["name"] as? String else { throw Invalid() }
      return DynamicGenerationSchema.Property(
        name: name,
        schema: Self.argument("\(intent)_\(name)", argument["schema"] as? [String: Any] ?? [:]),
        isOptional: (argument["required"] as? Bool) != true
      )
    }
    var properties = [intentProperty(intent)]
    if !arguments.isEmpty {
      properties.append(
        DynamicGenerationSchema.Property(
          name: "args",
          schema: DynamicGenerationSchema(name: "\(intent)_args", properties: arguments)
        )
      )
    }
    return DynamicGenerationSchema(
      name: intent,
      description: tool["description"] as? String,
      properties: properties
    )
  }

  static func of(_ tools: [[String: Any]]) throws -> GenerationSchema {
    guard !tools.isEmpty else { throw Invalid() }
    let none = DynamicGenerationSchema(name: "none", properties: [intentProperty("none")])
    let root = DynamicGenerationSchema(
      name: "ToolCall",
      anyOf: try tools.map { try tool($0) } + [none]
    )
    return try GenerationSchema(root: root, dependencies: [])
  }
}

@available(iOS 26.0, *)
enum AssistantOnDeviceModel {
  /// A call is one short JSON object; this leaves room for a group send's
  /// payees and a memo, and cuts a runaway answer short.
  static let maximumResponseTokens = 160

  static func isAvailable() -> Bool {
    if case .available = SystemLanguageModel.default.availability {
      return true
    }
    return false
  }

  static func complete(promptJson: String, timeoutMs: Int, promise: AssistantModelPromise) {
    guard isAvailable() else {
      promise.reject("unavailable", "No on-device model is available")
      return
    }
    guard
      let data = promptJson.data(using: .utf8),
      let parts = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
      let instructions = parts["instructions"] as? String,
      let prompt = parts["prompt"] as? String,
      let tools = parts["tools"] as? [[String: Any]],
      let schema = try? AssistantAnswerSchema.of(tools)
    else {
      promise.reject("invalid_prompt", "The prompt could not be read")
      return
    }

    // The answer and the deadline race; the first settles the promise, and
    // the other is cancelled: the timer once the answer is in, or the
    // generation once its time is up.
    Task {
      await withTaskGroup(of: Void.self) { group in
        group.addTask {
          do {
            // A new session per request: nothing from one turn carries into
            // the next, and the thread the model sees is the one JS quoted.
            // The instructions already list every tool's arguments, so the
            // schema is not repeated in the prompt: both would not fit the
            // model's 4,096 tokens.
            let session = LanguageModelSession(instructions: instructions)
            let response = try await session.respond(
              to: prompt,
              schema: schema,
              includeSchemaInPrompt: false,
              options: GenerationOptions(
                sampling: .greedy,
                maximumResponseTokens: maximumResponseTokens
              )
            )
            promise.resolve(answerJson(response.content.jsonString))
          } catch {
            promise.reject("generation_failed", "The on-device model failed")
          }
        }
        group.addTask {
          do {
            try await Task.sleep(nanoseconds: UInt64(max(0, timeoutMs)) * 1_000_000)
          } catch {
            return
          }
          promise.reject("timeout", "The on-device model did not answer in time")
        }
        await group.next()
        group.cancelAll()
      }
    }
  }

  /// The bridge's answer for what the model generated: {"intent": ...,
  /// "argsJson": ...}, or none for anything that is not one call.
  static func answerJson(_ generated: String) -> String {
    let none = "{\"intent\":\"none\"}"
    guard
      let data = generated.data(using: .utf8),
      let call = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
      let intent = call["intent"] as? String
    else {
      return none
    }
    var answer: [String: Any] = ["intent": intent]
    if let args = call["args"] {
      guard
        let argsData = try? JSONSerialization.data(withJSONObject: args),
        let argsJson = String(data: argsData, encoding: .utf8)
      else {
        return none
      }
      answer["argsJson"] = argsJson
    }
    guard
      let answerData = try? JSONSerialization.data(withJSONObject: answer),
      let text = String(data: answerData, encoding: .utf8)
    else {
      return none
    }
    return text
  }
}
#endif
