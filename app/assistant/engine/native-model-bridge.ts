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
//
// Nothing the module answers is trusted: model-adapter.ts reads it, and the
// model tier checks the call as the router checks any other.

export type AssistantModelBridge = {
  isAvailable: () => Promise<boolean>
  /** `promptJson` is a ModelPrompt (model-prompt.ts) as JSON. */
  complete: (promptJson: string, timeoutMs: number) => Promise<string>
}

/** The module, when this build has one with both methods. Read on each call. */
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
