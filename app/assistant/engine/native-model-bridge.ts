import { NativeModules } from "react-native"

// The on-device model's native module (ENG-690), reached the way
// app/utils/widget.ts reaches the widget's: AssistantModelBridge, Foundation
// Models on iOS 26 (ios/LNFlash/AssistantModelBridge.swift) and Gemini Nano
// through ML Kit on Android (com/lnflash/assistant/). No module (an older
// build, the Alt app) means no model.
//
// - isAvailable: whether the system model can answer now. Never rejects.
// - complete: at most one tool call for the prompt, as a JSON string
//   {"intent": "<an intent, or none>", "argsJson": "<its arguments>"}. It
//   rejects when there is no model, when the time runs out (the native side
//   cancels the work at `timeoutMs`), or when the model fails.
// - prewarm (ENG-749): start the model's session for the instructions every
//   request carries, and send nothing; Ask Flash calls it when it opens, and
//   after each ask the model reads (tryOnDeviceModel). It resolves at once
//   and never rejects. A build without it is warmed by nothing, and the next
//   request starts its session itself.
//
// Nothing the module answers is trusted: model-adapter.ts reads it, and the
// model tier checks the call as the router checks any other.

export type AssistantModelBridge = {
  isAvailable: () => Promise<boolean>
  /**
   * `promptJson` is a ModelPrompt (model-prompt.ts) as JSON: the
   * instructions, the prompt, and the tools iOS shapes the answer from.
   */
  complete: (promptJson: string, timeoutMs: number) => Promise<string>
  /**
   * `warmupJson` is a ModelWarmup (model-prompt.ts) as JSON: the
   * instructions every request carries. Absent from a build made before it.
   */
  prewarm?: (warmupJson: string) => Promise<unknown>
}

/** The module, when this build has one with isAvailable and complete. Read on each call. */
export const nativeModelBridge = (): AssistantModelBridge | undefined => {
  const { AssistantModelBridge: bridge } = NativeModules as {
    AssistantModelBridge?: Partial<AssistantModelBridge>
  }
  if (
    typeof bridge?.isAvailable !== "function" ||
    typeof bridge.complete !== "function"
  ) {
    return undefined
  }
  return bridge as AssistantModelBridge
}
