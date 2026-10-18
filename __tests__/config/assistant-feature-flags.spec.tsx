/**
 * ENG-687: the assistant flags (docs/ai-assistant-tool-registry.md §1, rule
 * 7), and ENG-690's fifth, assistantOnDeviceModel. They default off, follow
 * Remote Config, and unlike the older flags are NOT forced on for the Local
 * instance: dogfooding flips the remote flag.
 */
import * as React from "react"
import { Text } from "react-native"
import { act, render } from "@testing-library/react-native"
import { getRemoteConfig } from "@react-native-firebase/remote-config"

import {
  FeatureFlagContextProvider,
  useFeatureFlags,
} from "../../app/config/feature-flags-context"

let mockGaloyInstanceId = "Main"
jest.mock("@app/hooks", () => ({
  useAppConfig: () => ({ appConfig: { galoyInstance: { id: mockGaloyInstanceId } } }),
}))

// Signed in, so the provider renders at once instead of waiting on the gate.
jest.mock("@app/graphql/level-context", () => ({
  useLevel: () => ({ currentLevel: "ONE" }),
}))

const remoteConfig = getRemoteConfig() as unknown as {
  setDefaults: jest.Mock
  fetchAndActivate: jest.Mock
  getValue: jest.Mock
}

const ASSISTANT_KEYS = [
  "assistantEnabled",
  "assistantVoice",
  "assistantVoiceReplies",
  "assistantServerFallback",
  "assistantOnDeviceModel",
] as const

// Captured before any test clears the mocks: setDefaults runs once, when the
// module is imported.
const registeredDefaults = remoteConfig.setDefaults.mock.calls[0]?.[0]

// What RN Firebase's JS cache holds; undefined is a key it does not hold yet.
let active: Record<string, boolean | undefined> = {}

const Flags = () => {
  const flags = useFeatureFlags()
  return (
    <Text testID="flags">
      {JSON.stringify({
        assistantEnabled: flags.assistantEnabled,
        assistantVoice: flags.assistantVoice,
        assistantVoiceReplies: flags.assistantVoiceReplies,
        assistantServerFallback: flags.assistantServerFallback,
        assistantOnDeviceModel: flags.assistantOnDeviceModel,
        bridgeTopupEnabled: flags.bridgeTopupEnabled,
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
  return JSON.parse(screen.getByTestId("flags").props.children)
}

beforeEach(() => {
  mockGaloyInstanceId = "Main"
  active = {}
  remoteConfig.fetchAndActivate.mockReset()
  remoteConfig.fetchAndActivate.mockResolvedValue(true)
  remoteConfig.getValue.mockReset()
  remoteConfig.getValue.mockImplementation((key: string) => ({
    asBoolean: () => active[key] ?? false,
    getSource: () => (active[key] === undefined ? "static" : "remote"),
  }))
})

describe("assistant feature flags", () => {
  it("registers all five as Remote Config defaults, off", () => {
    expect(registeredDefaults).toEqual(
      expect.objectContaining({
        assistantEnabled: false,
        assistantVoice: false,
        assistantVoiceReplies: false,
        assistantServerFallback: false,
        assistantOnDeviceModel: false,
      }),
    )
  })

  it("are all off when nothing has been fetched", async () => {
    const flags = await renderFlags()

    ASSISTANT_KEYS.forEach((key) => expect(flags[key]).toBe(false))
  })

  it("follow Remote Config once it turns them on", async () => {
    active = {
      assistantEnabled: true,
      assistantVoice: true,
      assistantVoiceReplies: true,
      assistantServerFallback: true,
      assistantOnDeviceModel: true,
    }

    const flags = await renderFlags()

    ASSISTANT_KEYS.forEach((key) => expect(flags[key]).toBe(true))
  })

  it("can be turned on one at a time", async () => {
    active = { assistantEnabled: true, assistantVoice: false }

    const flags = await renderFlags()

    expect(flags).toMatchObject({
      assistantEnabled: true,
      assistantVoice: false,
      assistantVoiceReplies: false,
      assistantServerFallback: false,
      assistantOnDeviceModel: false,
    })
  })

  it("keep the on-device model off until its own flag is on, the assistant's alone is not enough", async () => {
    active = { assistantEnabled: true }
    expect((await renderFlags()).assistantOnDeviceModel).toBe(false)

    active = { assistantEnabled: true, assistantOnDeviceModel: true }
    expect(await renderFlags()).toMatchObject({
      assistantEnabled: true,
      assistantOnDeviceModel: true,
    })
  })

  it("stay off on the Local instance, which forces the older flags on", async () => {
    mockGaloyInstanceId = "Local"

    const flags = await renderFlags()

    // The Local override still applies to the flags that have it...
    expect(flags.bridgeTopupEnabled).toBe(true)
    // ...and to none of the assistant's.
    ASSISTANT_KEYS.forEach((key) => expect(flags[key]).toBe(false))
  })
})
