import * as fs from "fs"
import * as path from "path"

import { INTENTS } from "@app/assistant/registry/types"
import { repoDir } from "../import-scan"

// The on-device model's native side (ENG-690), held to the JS side and to the
// one rule that keeps iOS launching (architect decision 9). The app runs on
// iOS 15.1 and Foundation Models only on iOS 26: a use of the framework
// outside `#if canImport(FoundationModels)` and `@available(iOS 26.0, *)`,
// or a strong link to it, is a crash at launch for every user below iOS 26.
// The compiler checks availability; these specs check what it cannot see:
// the link, the guards' extent, the intents the model may name, and that
// both platforms register the module JS reaches by name.

const read = (...parts: string[]) => fs.readFileSync(path.join(repoDir, ...parts), "utf8")

const swift = read("ios", "LNFlash", "AssistantModelBridge.swift")
const objc = read("ios", "LNFlash", "AssistantModelBridge.m")
const pbxproj = read("ios", "LNFlash.xcodeproj", "project.pbxproj")

/** Each line of `source` with whether it sits inside an `#if canImport(FoundationModels)` block. */
const linesWithGuard = (source: string) => {
  let depth = 0
  let guardedAt: number | undefined
  return source.split("\n").map((line) => {
    const trimmed = line.trim()
    if (trimmed.startsWith("#if")) {
      depth += 1
      if (trimmed === "#if canImport(FoundationModels)" && guardedAt === undefined) {
        guardedAt = depth
      }
    }
    const guarded = guardedAt !== undefined
    if (trimmed.startsWith("#endif")) {
      if (guardedAt === depth) guardedAt = undefined
      depth -= 1
    }
    return { line, guarded }
  })
}

/** The LNFlash app target's two build configurations. */
const appConfigs = (): string[] => {
  const ids =
    /13B07F931A680F5B00A75B9A \/\* Build configuration list for PBXNativeTarget "LNFlash" \*\/ = \{[\s\S]*?buildConfigurations = \(([\s\S]*?)\);/.exec(
      pbxproj,
    )?.[1]
  const configIds = [...(ids ?? "").matchAll(/([0-9A-F]{24}) \/\*/g)].map(([, id]) => id)
  return configIds.map((id) => {
    const start = pbxproj.indexOf(
      `\t\t${id} /* `,
      pbxproj.indexOf("/* Begin XCBuildConfiguration section */"),
    )
    return pbxproj.slice(start, pbxproj.indexOf("\n\t\t};", start))
  })
}

describe("the iOS bridge", () => {
  it("uses Foundation Models only inside the canImport guard, each use marked iOS 26", () => {
    const framework =
      /\b(SystemLanguageModel|LanguageModelSession|GenerationOptions|DynamicGenerationSchema|GenerationSchema|Generable|import FoundationModels)\b/
    const lines = linesWithGuard(swift)

    const unguarded = lines.filter(
      ({ line, guarded }) => framework.test(line) && !guarded,
    )
    expect(unguarded.map(({ line }) => line.trim())).toEqual([])
    // A check that can never fail proves nothing: it reached the uses.
    expect(
      lines.some(({ line, guarded }) => guarded && /LanguageModelSession/.test(line)),
    ).toBe(true)
    expect(linesWithGuard("SystemLanguageModel.default")[0].guarded).toBe(false)
    // Every type declared inside the guard is marked iOS 26: each
    // declaration line, with the attribute lines right above it.
    const declarations = lines.flatMap(({ line, guarded }, index) => {
      const name = /^(?:struct|enum|class|extension) (\w+)/.exec(line)?.[1]
      if (name === undefined) return []
      const attributes: string[] = []
      for (let at = index - 1; at >= 0 && lines[at].line.startsWith("@"); at -= 1) {
        attributes.unshift(lines[at].line)
      }
      return [{ name, attributes, guarded }]
    })
    const guardedTypes = declarations.filter(({ guarded }) => guarded)
    expect(guardedTypes.map(({ name }) => name)).toEqual([
      "AssistantAnswerSchema",
      "AssistantOnDeviceModel",
    ])
    guardedTypes.forEach(({ attributes }) =>
      expect(attributes).toContain("@available(iOS 26.0, *)"),
    )
  })

  it("reaches the guarded code only behind a runtime iOS 26 check", () => {
    const calls = swift
      .split("\n")
      .filter((line) => /AssistantOnDeviceModel\.\w+\(/.test(line))
    expect(calls.length).toBeGreaterThan(0)
    // Each call into it sits right inside an `if #available(iOS 26.0, *)`.
    const checks = swift.match(
      /if #available\(iOS 26\.0, \*\) \{\n\s+(resolve\(AssistantOnDeviceModel|AssistantOnDeviceModel)\./g,
    )
    expect(checks).toHaveLength(calls.length)
  })

  it("holds the model to the tools the prompt carries, or none, with no list of its own", () => {
    // The answer's shape is built from ModelPrompt.tools, which lists every
    // registered intent (model-prompt.spec.ts): no intent is written here,
    // so the registry stays the one list.
    expect(swift).toContain('let tools = parts["tools"] as? [[String: Any]]')
    expect(swift).toContain("AssistantAnswerSchema.of(tools)")
    expect(swift).toContain('intentProperty("none")')
    expect(swift).toContain("guides: [.constant(intent)]")
    expect(swift).toContain("schema: schema,")
    INTENTS.forEach((intent) => expect(swift).not.toContain(`"${intent}"`))
  })

  it("exports the two methods JS calls, by the names native-model-bridge.ts uses", () => {
    expect(objc).toContain("RCT_EXTERN_MODULE(AssistantModelBridge, NSObject)")
    expect(objc).toMatch(
      /RCT_EXTERN_METHOD\(isAvailable:\(RCTPromiseResolveBlock\)resolve/,
    )
    expect(objc).toMatch(
      /RCT_EXTERN_METHOD\(complete:\(NSString \*\)promptJson\s+timeoutMs:/,
    )
    expect(swift).toContain("@objc(AssistantModelBridge)")
    expect(swift).toContain("@objc(isAvailable:rejecter:)")
    expect(swift).toContain("@objc(complete:timeoutMs:resolver:rejecter:)")
  })

  it("is compiled into the app target, which weak-links the framework and stays on iOS 15.1", () => {
    const sources =
      /13B07F871A680F5B00A75B9A \/\* Sources \*\/ = \{[\s\S]*?files = \(([\s\S]*?)\);/.exec(
        pbxproj,
      )?.[1]
    expect(sources).toContain("AssistantModelBridge.swift in Sources")
    expect(sources).toContain("AssistantModelBridge.m in Sources")

    const configs = appConfigs()
    expect(configs).toHaveLength(2)
    configs.forEach((config) => {
      const flags = /OTHER_LDFLAGS = \(([\s\S]*?)\);/
        .exec(config)?.[1]
        .split(",")
        .map((flag) => flag.trim())
      expect(flags).toEqual(expect.arrayContaining(['"-weak_framework"']))
      expect(flags?.[(flags?.indexOf('"-weak_framework"') ?? -2) + 1]).toBe(
        "FoundationModels",
      )
      // If the deployment target ever reaches 26, the guards may go; until
      // then they are what keeps iOS 15 to 25 launching.
      expect(config).toContain("IPHONEOS_DEPLOYMENT_TARGET = 15.1;")
    })
  })
})

describe("the Android bridge", () => {
  const java = read(
    "android",
    "app",
    "src",
    "main",
    "java",
    "com",
    "lnflash",
    "assistant",
    "AssistantModelBridgeModule.java",
  )
  const application = read(
    "android",
    "app",
    "src",
    "main",
    "java",
    "com",
    "lnflash",
    "MainApplication.kt",
  )
  const gradle = read("android", "app", "build.gradle")

  it("is registered under the name JS reaches, with the same two methods", () => {
    expect(java).toContain('static final String NAME = "AssistantModelBridge"')
    expect(java).toMatch(/@ReactMethod\s+public void isAvailable\(Promise promise\)/)
    expect(java).toMatch(
      /@ReactMethod\s+public void complete\(String promptJson, double timeoutMs, Promise promise\)/,
    )
    expect(application).toContain(
      "import com.lnflash.assistant.AssistantModelBridgePackage",
    )
    expect(application).toContain("add(AssistantModelBridgePackage())")
  })

  it("counts only a model AICore reports AVAILABLE, and never starts a download", () => {
    expect(java).toContain("status == FeatureStatus.AVAILABLE")
    expect(java).not.toMatch(/\.download\(/)
  })

  it("pins the GenAI Prompt API to one exact version", () => {
    expect(gradle).toMatch(
      /implementation\("com\.google\.mlkit:genai-prompt:\d+\.\d+\.\d+-[a-z]+\d+"\)/,
    )
  })
})
