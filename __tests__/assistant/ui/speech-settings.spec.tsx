import React from "react"
import { ApolloClient, InMemoryCache } from "@apollo/client"
import { act, fireEvent, render, waitFor } from "@testing-library/react-native"
import { ThemeProvider } from "@rneui/themed"
import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import { SpeechSettings } from "@app/assistant/ui/speech-settings"
import { createSpeechPreference } from "@app/assistant/ui/speech-preference"
import { useVoicePack, voicePack } from "@app/assistant/ui/voice-pack"
import { nativeSpeechOutput } from "@app/assistant/ui/native-speech-output"
jest.mock("@app/assistant/ui/native-speech-output", () => ({
  nativeSpeechOutput: {
    voices: jest.fn(async () => [
      { id: "a", name: "Clear", language: "en-US", quality: 2 },
      { id: "b", name: "Warm", language: "en-GB", quality: 3 },
    ]),
  },
}))
jest.mock("@app/assistant/ui/voice-pack", () => ({
  useVoicePack: jest.fn(() => ({
    phase: "missing",
    supported: false,
    sourceAvailable: false,
    receivedBytes: 0,
    totalBytes: 102466705,
  })),
  voicePack: { download: jest.fn(), cancel: jest.fn(), remove: jest.fn() },
}))
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
loadLocale("en")
const LL = i18nObject("en")
afterEach(() => jest.clearAllMocks())
it("previews every voice selection immediately and preserves settings", async () => {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    connectToDevTools: false,
  })
  const preference = createSpeechPreference(client, "account")
  const onPreview = jest.fn()
  const onChange = jest.fn()
  const onClose = jest.fn()
  const view = render(
    <ThemeProvider>
      <SpeechSettings
        preference={preference}
        locale="en-US"
        LL={LL}
        previewing={false}
        onPreview={onPreview}
        onChange={onChange}
        onClose={onClose}
      />
    </ThemeProvider>,
  )
  await waitFor(() =>
    expect(view.getByText(LL.AskFlashSpeech.recommended())).toBeTruthy(),
  )
  expect(view.queryByLabelText("Clear, United States · Enhanced")).toBeNull()
  expect(view.queryByLabelText("Warm, United Kingdom · Premium")).toBeNull()
  expect(onPreview).not.toHaveBeenCalled()
  fireEvent.press(view.getByText(LL.AskFlashSpeech.recommended()))
  fireEvent.press(view.getByText("0.8×"))
  expect(preference.settings()).toEqual({ voiceId: undefined, rate: 0.8 })
  expect(preference.get()).toBe(false)
  expect(onPreview).toHaveBeenCalledWith(true)
  fireEvent.press(view.getByText(LL.AskFlashSpeech.preview()))
  expect(onPreview).toHaveBeenCalledTimes(2)
  fireEvent(view.getByLabelText(LL.AskFlashSpeech.automatic()), "valueChange", true)
  expect(preference.get()).toBe(true)
  fireEvent.press(view.getByText(LL.AskFlashSpeech.recommended()))
  expect(preference.settings()).toEqual({ voiceId: undefined, rate: 0.8 })
  fireEvent.press(view.getByText(LL.AskFlashSpeech.done()))
  expect(onClose).toHaveBeenCalledTimes(1)
  expect(onChange).toHaveBeenCalledTimes(2)
  expect(onPreview).toHaveBeenNthCalledWith(1, true)
  expect(onPreview).toHaveBeenNthCalledWith(3, true)
  view.unmount()
})
it("explains a removed voice and falls back without changing stored settings", async () => {
  const preference = createSpeechPreference(
    new ApolloClient({ cache: new InMemoryCache(), connectToDevTools: false }),
    "account",
  )
  act(() => preference.configure({ voiceId: "removed", rate: 1 }))
  const view = render(
    <ThemeProvider>
      <SpeechSettings
        preference={preference}
        locale="en-US"
        LL={LL}
        previewing={false}
        onPreview={jest.fn()}
        onChange={jest.fn()}
        onClose={jest.fn()}
      />
    </ThemeProvider>,
  )
  await waitFor(() =>
    expect(view.getByText(LL.AskFlashSpeech.voiceMissing())).toBeTruthy(),
  )
  expect(nativeSpeechOutput.voices).toHaveBeenCalledWith("en-US")
  view.unmount()
})

it("downloads only on request, selects Heart and preserves reply/speed preferences", async () => {
  jest.mocked(useVoicePack).mockReturnValue({
    phase: "missing",
    supported: true,
    sourceAvailable: true,
    receivedBytes: 0,
    totalBytes: 102466705,
  })
  jest.mocked(voicePack.download).mockResolvedValue({
    phase: "ready",
    receivedBytes: 102466705,
    totalBytes: 102466705,
  })
  const preference = createSpeechPreference(
    new ApolloClient({ cache: new InMemoryCache(), connectToDevTools: false }),
    "pack-test",
  )
  preference.configure({ voiceId: "b", rate: 1.2 })
  const view = render(
    <ThemeProvider>
      <SpeechSettings
        preference={preference}
        locale="en-US"
        LL={LL}
        previewing={false}
        onPreview={jest.fn()}
        onChange={jest.fn()}
        onClose={jest.fn()}
      />
    </ThemeProvider>,
  )
  expect(voicePack.download).not.toHaveBeenCalled()
  expect(view.getByText(LL.AskFlashSpeech.packSize({ size: "102.5" }))).toBeTruthy()
  fireEvent.press(view.getByLabelText(LL.AskFlashSpeech.packDownload()))
  await waitFor(() =>
    expect(preference.settings()).toEqual({ voiceId: "flash:af_heart", rate: 1.2 }),
  )
  expect(preference.get()).toBe(false)
  view.unmount()
})
it("shows only curated voices and migrates a saved system choice without changing other settings", async () => {
  jest.mocked(useVoicePack).mockReturnValue({
    phase: "ready",
    supported: true,
    sourceAvailable: true,
    receivedBytes: 102466705,
    totalBytes: 102466705,
  })
  jest.mocked(nativeSpeechOutput.voices).mockResolvedValueOnce([
    {
      id: "flash:af_heart",
      name: "Heart",
      language: "en-US",
      quality: 3,
      source: "pack",
    },
    {
      id: "flash:am_michael",
      name: "Michael",
      language: "en-US",
      quality: 3,
      source: "pack",
    },
    { id: "flash:bf_emma", name: "Emma", language: "en-GB", quality: 3, source: "pack" },
    { id: "system", name: "System", language: "en-AU", quality: 1 },
  ])
  const preference = createSpeechPreference(
    new ApolloClient({ cache: new InMemoryCache(), connectToDevTools: false }),
    "curated-test",
  )
  preference.configure({ voiceId: "system", rate: 1.2 })
  preference.set(true)
  const view = render(
    <ThemeProvider>
      <SpeechSettings
        preference={preference}
        locale="en-US"
        LL={LL}
        previewing={false}
        onPreview={jest.fn()}
        onChange={jest.fn()}
        onClose={jest.fn()}
      />
    </ThemeProvider>,
  )
  await waitFor(() => expect(view.getByLabelText("Heart, United States")).toBeTruthy())
  expect(view.queryByLabelText("System, Australia")).toBeNull()
  expect(view.queryByText(LL.AskFlashSpeech.systemVoices())).toBeNull()
  expect(view.queryByText(LL.AskFlashSpeech.recommended())).toBeNull()
  expect(view.getAllByTestId("ask-flash-voice-choice")).toHaveLength(3)
  expect(preference.settings()).toEqual({ voiceId: "flash:af_heart", rate: 1.2 })
  expect(preference.get()).toBe(true)
  fireEvent.press(view.getByLabelText("Emma, United Kingdom"))
  expect(preference.settings()).toEqual({ voiceId: "flash:bf_emma", rate: 1.2 })
  view.unmount()
})
