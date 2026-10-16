/**
 * ENG-689, architect decision 3: a debug or e2e build may turn the assistant
 * on with a dev link, so the Maestro flows can open Ask Flash; a release
 * build never does. Only assistantEnabled follows it: voice, spoken replies
 * and the server fallback stay Remote Config's alone.
 */
import * as React from "react"
import { Linking, Text } from "react-native"
import { act, render, renderHook } from "@testing-library/react-native"
import { getRemoteConfig } from "@react-native-firebase/remote-config"

import {
  assistantDevOverride,
  DevAssistantLink,
  parseAssistantDevLink,
  setAssistantDevOverride,
  useDevAssistantLink,
} from "@app/config/assistant-dev-override"
import {
  FeatureFlagContextProvider,
  useFeatureFlags,
} from "@app/config/feature-flags-context"

jest.mock("@app/hooks", () => ({
  useAppConfig: () => ({ appConfig: { galoyInstance: { id: "Test" } } }),
}))
// Signed in, so the provider renders at once instead of waiting on the gate.
jest.mock("@app/graphql/level-context", () => ({
  useLevel: () => ({ currentLevel: "ONE" }),
}))

type Dev = { __DEV__: boolean }
const setDev = (value: boolean) => {
  ;(globalThis as unknown as Dev).__DEV__ = value
}

const remoteConfig = getRemoteConfig() as unknown as {
  fetchAndActivate: jest.Mock
  getValue: jest.Mock
}

const Flags = () => {
  const flags = useFeatureFlags()
  return (
    <Text testID="flags">
      {JSON.stringify({
        assistantEnabled: flags.assistantEnabled,
        assistantVoice: flags.assistantVoice,
        assistantVoiceReplies: flags.assistantVoiceReplies,
        assistantServerFallback: flags.assistantServerFallback,
      })}
    </Text>
  )
}

const renderFlags = async () => {
  const screen = render(
    <FeatureFlagContextProvider>
      <Flags />
    </FeatureFlagContextProvider>,
  )
  await act(async () => {})
  return {
    screen,
    flags: () => JSON.parse(screen.getByTestId("flags").props.children),
  }
}

let urlListener: ((event: { url: string }) => void) | undefined
const remove = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  setDev(true)
  setAssistantDevOverride(false)
  urlListener = undefined
  remoteConfig.fetchAndActivate.mockReset()
  remoteConfig.fetchAndActivate.mockResolvedValue(true)
  remoteConfig.getValue.mockReset()
  // Remote Config holds every assistant flag off.
  remoteConfig.getValue.mockImplementation(() => ({
    asBoolean: () => false,
    getSource: () => "remote",
  }))
  jest.spyOn(Linking, "getInitialURL").mockResolvedValue(null)
  jest.spyOn(Linking, "addEventListener").mockImplementation(((
    _type: string,
    listener: (event: { url: string }) => void,
  ) => {
    urlListener = listener
    return { remove }
  }) as unknown as typeof Linking.addEventListener)
})

afterEach(() => {
  setDev(true)
  setAssistantDevOverride(false)
  jest.restoreAllMocks()
})

describe("parseAssistantDevLink", () => {
  it("reads on and off, and nothing else", () => {
    expect(parseAssistantDevLink("flash://dev/assistant?on=1")).toBe(true)
    expect(parseAssistantDevLink("flash://dev/assistant/?on=1")).toBe(true)
    expect(parseAssistantDevLink("flash://dev/assistant?off=1")).toBe(false)
    expect(parseAssistantDevLink("flash://dev/assistant")).toBeUndefined()
    expect(parseAssistantDevLink("flash://dev/assistant?on=yes")).toBeUndefined()
    expect(parseAssistantDevLink("flash://dev/card-tap")).toBeUndefined()
    expect(parseAssistantDevLink("flash://assistant?on=1")).toBeUndefined()
    expect(
      parseAssistantDevLink("https://flashapp.me/dev/assistant?on=1"),
    ).toBeUndefined()
  })

  it("reads nothing in a release build", () => {
    setDev(false)
    expect(parseAssistantDevLink("flash://dev/assistant?on=1")).toBeUndefined()
  })
})

describe("the assistant's dev override", () => {
  it("is off until a link turns it on", () => {
    expect(assistantDevOverride()).toBe(false)
    setAssistantDevOverride(true)
    expect(assistantDevOverride()).toBe(true)
  })

  it("is never on in a release build, whatever set it", () => {
    setDev(false)
    setAssistantDevOverride(true)
    expect(assistantDevOverride()).toBe(false)

    // Set in a debug run, read by a release one: still off.
    setDev(true)
    setAssistantDevOverride(true)
    setDev(false)
    expect(assistantDevOverride()).toBe(false)
  })

  it("turns on assistantEnabled alone, while Remote Config holds it off", async () => {
    const { flags } = await renderFlags()
    expect(flags().assistantEnabled).toBe(false)

    act(() => setAssistantDevOverride(true))

    expect(flags()).toEqual({
      assistantEnabled: true,
      assistantVoice: false,
      assistantVoiceReplies: false,
      assistantServerFallback: false,
    })

    act(() => setAssistantDevOverride(false))
    expect(flags().assistantEnabled).toBe(false)
  })

  it("leaves assistantEnabled to Remote Config in a release build", async () => {
    setDev(false)
    const { flags } = await renderFlags()

    act(() => setAssistantDevOverride(true))

    expect(flags().assistantEnabled).toBe(false)
  })
})

describe("useDevAssistantLink", () => {
  it("acts on the link the app was opened with", async () => {
    ;(Linking.getInitialURL as jest.Mock).mockResolvedValue("flash://dev/assistant?on=1")

    renderHook(() => useDevAssistantLink())
    await act(async () => {})

    expect(assistantDevOverride()).toBe(true)
  })

  it("acts on links that arrive while the app runs, and stops listening on unmount", async () => {
    const view = render(<DevAssistantLink />)
    await act(async () => {})

    act(() => urlListener?.({ url: "flash://dev/assistant?on=1" }))
    expect(assistantDevOverride()).toBe(true)
    act(() => urlListener?.({ url: "flash://dev/card-tap" }))
    expect(assistantDevOverride()).toBe(true)
    act(() => urlListener?.({ url: "flash://dev/assistant?off=1" }))
    expect(assistantDevOverride()).toBe(false)

    view.unmount()
    expect(remove).toHaveBeenCalled()
  })

  it("does not listen in a release build", async () => {
    setDev(false)

    renderHook(() => useDevAssistantLink())
    await act(async () => {})

    expect(Linking.addEventListener).not.toHaveBeenCalled()
    expect(Linking.getInitialURL).not.toHaveBeenCalled()
  })
})
