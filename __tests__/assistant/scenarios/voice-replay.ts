import { act, fireEvent, waitFor, type render } from "@testing-library/react-native"
import { nativeVoiceInput } from "@app/assistant/ui/native-voice-input"
import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import type { fakeRuntime } from "../ui/thread-harness"
import type { ScenarioStep } from "./types"

loadLocale("en")
const LL = i18nObject("en")
type RenderedScreen = ReturnType<typeof render>

export const checkVoiceUnavailable = async (view: RenderedScreen | undefined) => {
  const currentView = view
  if (!currentView) throw new Error("Voice state requires a mounted screen")
  await waitFor(() =>
    expect(
      currentView.getByTestId("ask-flash-talk").props.accessibilityState.disabled,
    ).toBe(true),
  )
  expect(currentView.getByText(LL.AskFlash.voiceUnavailable())).toBeTruthy()
  expect(nativeVoiceInput.start).not.toHaveBeenCalled()
}
export const failVoice = async (
  view: RenderedScreen | undefined,
  harness: ReturnType<typeof fakeRuntime>,
  failure: Extract<ScenarioStep, { voiceFailure: string }>["voiceFailure"],
) => {
  const currentView = view
  if (!currentView) throw new Error("Voice failure requires screen replay")
  const before = harness.runtime.transcript.get().entries.length
  const starts = jest.mocked(nativeVoiceInput.start).mock.calls.length
  await waitFor(() =>
    expect(
      currentView.getByTestId("ask-flash-talk").props.accessibilityState.disabled,
    ).toBe(false),
  )
  const permission = ["denied", "blocked", "restricted"].includes(failure)
  if (permission)
    jest
      .mocked(nativeVoiceInput.permission)
      .mockResolvedValueOnce(failure as "denied" | "blocked" | "restricted")
  await act(async () =>
    fireEvent(currentView.getByTestId("ask-flash-talk"), "responderGrant"),
  )
  if (permission) {
    expect(nativeVoiceInput.start).toHaveBeenCalledTimes(starts)
    expect(currentView.getByText(LL.AskFlash.voicePermission())).toBeTruthy()
  } else {
    const id = jest.mocked(nativeVoiceInput.start).mock.calls.at(-1)?.[0]
    const listener = jest.mocked(nativeVoiceInput.subscribe).mock.calls.at(-1)?.[0]
    if (!id || !listener) throw new Error("Voice session did not start")
    act(() => listener({ sessionId: id, type: "started" }))
    if (failure === "cancelled") {
      act(() => {
        listener({ sessionId: id, type: "final", text: "Pay alice two cents" })
        fireEvent(currentView.getByTestId("ask-flash-talk"), "responderTerminate")
      })
      expect(nativeVoiceInput.abort).toHaveBeenLastCalledWith(id)
    } else {
      act(() =>
        listener(
          failure === "empty"
            ? { sessionId: id, type: "final", text: "   " }
            : { sessionId: id, type: "error", text: failure },
        ),
      )
    }
    await act(async () => {
      fireEvent(currentView.getByTestId("ask-flash-talk"), "responderRelease")
      listener({ sessionId: id, type: "end" })
      listener({ sessionId: "stale-session", type: "final", text: "Pay bob 99 USD" })
    })
    if (failure === "unavailable")
      expect(currentView.getByText(LL.AskFlash.voiceUnavailable())).toBeTruthy()
    if (failure === "failed")
      expect(currentView.getByText(LL.AskFlash.voiceFailed())).toBeTruthy()
  }
  expect(harness.runtime.transcript.get().entries).toHaveLength(before)
  expect(currentView.getByTestId("ask-flash-input").props.editable).toBe(true)
}
