import { getAnalytics } from "@react-native-firebase/analytics"

import { analyticsTelemetry } from "@app/assistant/engine/telemetry"
import {
  logAssistantClarificationAbandoned,
  logAssistantEvent,
  logAssistantThreadOpened,
  logSendOpenToConfirm,
} from "@app/utils/analytics"

/* eslint-disable camelcase -- Firebase event params are snake_case */

const logEvent = getAnalytics().logEvent as jest.Mock

beforeEach(() => {
  logEvent.mockClear()
})

describe("assistant analytics (ENG-687, spec §8)", () => {
  it("logs a tool event with exactly its five closed fields", () => {
    logAssistantEvent({
      intent: "getBalances",
      tier: "read",
      outcome: "answered",
      latencyMs: 41.6,
      onDeviceModelAvailable: false,
    })

    expect(logEvent).toHaveBeenCalledWith("assistant_event", {
      intent: "getBalances",
      tier: "read",
      outcome: "answered",
      latency_ms: 42,
      on_device_model_available: false,
    })
  })

  it("logs why the model tier refused the model's call, beside the five, when it did (ENG-751)", () => {
    const reasons = [
      "precheck",
      "ungrounded",
      "groupSend",
      "timeFilter",
      "ungroundedFilter",
    ] as const
    reasons.forEach((reason) =>
      logAssistantEvent({
        intent: "prepareSend",
        tier: "action",
        outcome: "rejected",
        latencyMs: 0,
        onDeviceModelAvailable: true,
        onDeviceModelReason: reason,
      }),
    )

    expect(logEvent.mock.calls).toEqual(
      reasons.map((reason) => [
        "assistant_event",
        {
          intent: "prepareSend",
          tier: "action",
          outcome: "rejected",
          latency_ms: 0,
          on_device_model_available: true,
          on_device_model_reason: reason,
        },
      ]),
    )
  })

  it("logs a thread open, the weekly-active-users event", () => {
    logAssistantThreadOpened()

    expect(logEvent).toHaveBeenCalledWith("assistant_thread_opened")
  })

  it("logs an abandoned clarification with its count", () => {
    logAssistantClarificationAbandoned({ clarificationCount: 2 })

    expect(logEvent).toHaveBeenCalledWith("assistant_clarification_abandoned", {
      clarification_count: 2,
    })
  })

  it("logs open-to-confirm for both flows under one event", () => {
    logSendOpenToConfirm({ flow: "classic", openToConfirmMs: 1500.4 })
    logSendOpenToConfirm({ flow: "assistant", openToConfirmMs: 900 })

    expect(logEvent.mock.calls).toEqual([
      ["send_open_to_confirm", { flow: "classic", open_to_confirm_ms: 1500 }],
      ["send_open_to_confirm", { flow: "assistant", open_to_confirm_ms: 900 }],
    ])
  })

  it("wires the engine's telemetry to these events, the assistant's flow included", () => {
    analyticsTelemetry.tool({
      intent: "unknown",
      tier: "none",
      outcome: "rejected",
      latencyMs: 3,
      onDeviceModelAvailable: false,
    })
    analyticsTelemetry.threadOpened()
    analyticsTelemetry.clarificationAbandoned({ clarificationCount: 1 })
    analyticsTelemetry.openToConfirm({ openToConfirmMs: 12_000 })

    expect(logEvent.mock.calls.map(([event]) => event)).toEqual([
      "assistant_event",
      "assistant_thread_opened",
      "assistant_clarification_abandoned",
      "send_open_to_confirm",
    ])
    expect(logEvent).toHaveBeenLastCalledWith("send_open_to_confirm", {
      flow: "assistant",
      open_to_confirm_ms: 12_000,
    })
  })
})
