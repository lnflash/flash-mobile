/**
 * ENG-689, architect decision 3: a debug or e2e build may turn the assistant
 * on with a dev link, so the Maestro flows can open Ask Flash; a release
 * build never does. Only assistantEnabled follows it: voice, spoken replies
 * and the server fallback stay Remote Config's alone.
 *
 * ENG-734: the test phones carry a production-mode bundle, so __DEV__ is
 * false there; ASSISTANT_DEV_LINK=true in the .env they were bundled with
 * honours the link too. Nothing else does.
 */
import * as fs from "fs"
import * as path from "path"
import * as React from "react"
import { Linking, LogBox, Text } from "react-native"
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

// react-native-dotenv inlines ASSISTANT_DEV_LINK from .env when the app is
// bundled. Here a getter reads it, so each test picks its own value.
let mockAssistantDevLink: string | undefined
jest.mock("@env", () => ({
  get ASSISTANT_DEV_LINK() {
    return mockAssistantDevLink
  },
}))
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
const setDevLink = (value: string | undefined) => {
  mockAssistantDevLink = value
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
  setDevLink(undefined)
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
  jest.spyOn(LogBox, "ignoreAllLogs").mockImplementation(() => undefined)
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
  setDevLink(undefined)
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

  it("hides LogBox when it turns the assistant on, as the card bridge's link does", async () => {
    // Its toasts cover the thread's input and Ask button, where the flows tap.
    render(<DevAssistantLink />)
    await act(async () => {})

    act(() => urlListener?.({ url: "flash://dev/assistant?on=1" }))
    expect(LogBox.ignoreAllLogs).toHaveBeenCalledWith(true)

    // Off leaves it as it is: the card bridge may be hiding it too.
    ;(LogBox.ignoreAllLogs as jest.Mock).mockClear()
    act(() => urlListener?.({ url: "flash://dev/assistant?off=1" }))
    act(() => urlListener?.({ url: "flash://dev/card-tap" }))
    expect(LogBox.ignoreAllLogs).not.toHaveBeenCalled()
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
    expect(LogBox.ignoreAllLogs).not.toHaveBeenCalled()
  })
})

describe("a production-mode build with ASSISTANT_DEV_LINK (ENG-734)", () => {
  beforeEach(() => {
    setDev(false)
  })

  it('honours the link when it is "true"', () => {
    setDevLink("true")

    expect(parseAssistantDevLink("flash://dev/assistant?on=1")).toBe(true)
    expect(parseAssistantDevLink("flash://dev/assistant?off=1")).toBe(false)
    expect(parseAssistantDevLink("flash://dev/card-tap")).toBeUndefined()
    expect(parseAssistantDevLink("flash://assistant?on=1")).toBeUndefined()

    setAssistantDevOverride(true)
    expect(assistantDevOverride()).toBe(true)
  })

  // Plain loops rather than it.each: this repo's tsconfig pulls in the
  // wdio/mocha globals, whose `it` has no `.each`.
  for (const value of [undefined, "false", "", "1", "TRUE"]) {
    it(`ignores the link when it is ${JSON.stringify(value)}`, () => {
      setDevLink(value)

      expect(parseAssistantDevLink("flash://dev/assistant?on=1")).toBeUndefined()
      setAssistantDevOverride(true)
      expect(assistantDevOverride()).toBe(false)
    })
  }

  it("is off again without it, whatever set it", () => {
    setDevLink("true")
    setAssistantDevOverride(true)

    setDevLink(undefined)
    expect(assistantDevOverride()).toBe(false)
  })

  it('turns on assistantEnabled alone when it is "true"', async () => {
    setDevLink("true")
    const { flags } = await renderFlags()
    expect(flags().assistantEnabled).toBe(false)

    act(() => setAssistantDevOverride(true))

    expect(flags()).toEqual({
      assistantEnabled: true,
      assistantVoice: false,
      assistantVoiceReplies: false,
      assistantServerFallback: false,
    })
  })

  it('leaves assistantEnabled to Remote Config when it is "false"', async () => {
    setDevLink("false")
    const { flags } = await renderFlags()

    act(() => setAssistantDevOverride(true))

    expect(flags().assistantEnabled).toBe(false)
  })

  it('acts on the link at launch and while the app runs when it is "true"', async () => {
    setDevLink("true")
    ;(Linking.getInitialURL as jest.Mock).mockResolvedValue("flash://dev/assistant?on=1")

    render(<DevAssistantLink />)
    await act(async () => {})

    expect(assistantDevOverride()).toBe(true)
    expect(LogBox.ignoreAllLogs).toHaveBeenCalledWith(true)

    act(() => urlListener?.({ url: "flash://dev/assistant?off=1" }))
    expect(assistantDevOverride()).toBe(false)
  })

  for (const value of [undefined, "false"]) {
    it(`does not listen when it is ${JSON.stringify(value)}`, async () => {
      setDevLink(value)

      render(<DevAssistantLink />)
      await act(async () => {})

      expect(Linking.addEventListener).not.toHaveBeenCalled()
      expect(Linking.getInitialURL).not.toHaveBeenCalled()
      expect(LogBox.ignoreAllLogs).not.toHaveBeenCalled()
    })
  }
})

describe("App", () => {
  // The link's own gate is the only one: a __DEV__ guard where App mounts it
  // would leave the link dead on the test phones again (ENG-734).
  it("mounts DevAssistantLink in every build", () => {
    const app = fs.readFileSync(path.join(__dirname, "../../app/app.tsx"), "utf8")

    expect(app).toMatch(/<DevAssistantLink \/>/)
    expect(app).not.toMatch(/__DEV__\s*&&\s*<DevAssistantLink/)
  })
})
