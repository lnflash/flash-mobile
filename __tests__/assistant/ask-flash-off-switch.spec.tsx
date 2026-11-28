/**
 * Ask Flash's off switch (ask-flash-hardening, order 01).
 *
 * Store builds leave Ask Flash out whatever Remote Config says
 * (assistantInThisBuild, app/config/assistant-dev-override.ts). Debug and e2e
 * builds (__DEV__) and the test phones' builds (ASSISTANT_DEV_LINK=true) keep
 * it behind assistantEnabled, as before. The askFlash route renders the
 * thread only while assistantEnabled holds and closes itself otherwise
 * (AskFlashGate, app/assistant/ui/ask-flash-gate.tsx).
 */
import * as React from "react"
import { Text } from "react-native"
import {
  createNavigationContainerRef,
  NavigationContainer,
} from "@react-navigation/native"
import { createStackNavigator } from "@react-navigation/stack"
import { act, render, screen } from "@testing-library/react-native"
import { getRemoteConfig } from "@react-native-firebase/remote-config"

import { AskFlashGate } from "@app/assistant/ui"
import { assistantInThisBuild } from "@app/config/assistant-dev-override"
import {
  FeatureFlagContext,
  FeatureFlagContextProvider,
  useFeatureFlags,
} from "@app/config/feature-flags-context"

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
// The thread itself has its own spec; here it stands for a thread holding a
// card with a Confirm button.
jest.mock("@app/assistant/ui/ask-flash-screen", () => {
  const { Text: MockText } = jest.requireActual("react-native")
  const MockReact = jest.requireActual("react")
  return {
    AskFlashScreen: () =>
      MockReact.createElement(MockText, { testID: "ask-flash-confirm" }, "Confirm"),
  }
})

type Dev = { __DEV__: boolean }
const setDev = (value: boolean) => {
  ;(globalThis as unknown as Dev).__DEV__ = value
}

const remoteConfig = getRemoteConfig() as unknown as {
  fetchAndActivate: jest.Mock
  getValue: jest.Mock
}
const remoteConfigHolds = (value: boolean) => {
  remoteConfig.fetchAndActivate.mockReset()
  remoteConfig.fetchAndActivate.mockResolvedValue(true)
  remoteConfig.getValue.mockReset()
  remoteConfig.getValue.mockImplementation(() => ({
    asBoolean: () => value,
    getSource: () => "remote",
  }))
}

beforeEach(() => {
  setDev(true)
  mockAssistantDevLink = undefined
  remoteConfigHolds(false)
})

afterAll(() => {
  setDev(true)
  mockAssistantDevLink = undefined
})

describe("the build switch (assistantInThisBuild)", () => {
  it("keeps Ask Flash in a development build", () => {
    expect(assistantInThisBuild()).toBe(true)
  })

  it("leaves Ask Flash out of a store build", () => {
    setDev(false)
    expect(assistantInThisBuild()).toBe(false)
  })

  it("keeps Ask Flash in a test phone's build, bundled with ASSISTANT_DEV_LINK=true", () => {
    setDev(false)
    mockAssistantDevLink = "true"
    expect(assistantInThisBuild()).toBe(true)
  })
})

const AssistantFlag = () => {
  const { assistantEnabled } = useFeatureFlags()
  return <Text testID="assistant-enabled">{String(assistantEnabled)}</Text>
}

const assistantEnabledWith = async () => {
  render(
    <FeatureFlagContextProvider>
      <AssistantFlag />
    </FeatureFlagContextProvider>,
  )
  await act(async () => {})
  return screen.getByTestId("assistant-enabled").props.children
}

describe("assistantEnabled", () => {
  it("stays off in a store build when Remote Config turns it on", async () => {
    setDev(false)
    remoteConfigHolds(true)
    expect(await assistantEnabledWith()).toBe("false")
  })

  it("follows Remote Config in a development build", async () => {
    remoteConfigHolds(true)
    expect(await assistantEnabledWith()).toBe("true")
  })

  it("follows Remote Config in a test phone's build", async () => {
    setDev(false)
    mockAssistantDevLink = "true"
    remoteConfigHolds(true)
    expect(await assistantEnabledWith()).toBe("true")
  })
})

type Flags = React.ComponentProps<typeof FeatureFlagContext.Provider>["value"]

const flagsWith = (assistantEnabled: boolean): Flags => ({
  deviceAccountEnabled: false,
  bridgeTopupEnabled: false,
  cashuCardUsdEnabled: false,
  assistantEnabled,
  assistantVoice: false,
  assistantVoiceReplies: false,
  assistantServerFallback: false,
  assistantOnDeviceModel: false,
})

const Stack = createStackNavigator()
const nav = createNavigationContainerRef<Record<string, undefined>>()
const Home = () => <Text testID="home">Home</Text>
const Receive = () => <Text testID="receive">Receive</Text>

const app = (assistantEnabled: boolean) => (
  <FeatureFlagContext.Provider value={flagsWith(assistantEnabled)}>
    <NavigationContainer ref={nav}>
      <Stack.Navigator initialRouteName="Primary">
        <Stack.Screen name="Primary" component={Home} />
        <Stack.Screen name="askFlash" component={AskFlashGate} />
        <Stack.Screen name="receiveBitcoin" component={Receive} />
      </Stack.Navigator>
    </NavigationContainer>
  </FeatureFlagContext.Provider>
)

const routeNames = () => nav.getRootState().routes.map((route) => route.name)

const open = async (name: string) => {
  await act(async () => {
    nav.navigate(name)
  })
}

describe("the askFlash route (AskFlashGate)", () => {
  it("opens the thread while assistantEnabled holds", async () => {
    render(app(true))
    await open("askFlash")

    expect(screen.getByTestId("ask-flash-confirm")).toBeTruthy()
    expect(routeNames()).toEqual(["Primary", "askFlash"])
  })

  it("shows nothing and closes when reached with the flag off", async () => {
    render(app(false))
    await open("askFlash")

    expect(screen.queryByTestId("ask-flash-confirm")).toBeNull()
    expect(routeNames()).toEqual(["Primary"])
  })

  it("closes the open thread, and its Confirm, when the flag turns off", async () => {
    const view = render(app(true))
    await open("askFlash")
    expect(screen.getByTestId("ask-flash-confirm")).toBeTruthy()

    await act(async () => {
      view.rerender(app(false))
    })

    expect(screen.queryByTestId("ask-flash-confirm")).toBeNull()
    expect(routeNames()).toEqual(["Primary"])
  })

  it("removes itself, not the screen above it, when the flag turns off", async () => {
    const view = render(app(true))
    await open("askFlash")
    await open("receiveBitcoin")
    expect(routeNames()).toEqual(["Primary", "askFlash", "receiveBitcoin"])

    await act(async () => {
      view.rerender(app(false))
    })

    expect(screen.queryByTestId("ask-flash-confirm")).toBeNull()
    expect(routeNames()).toEqual(["Primary", "receiveBitcoin"])
  })
})
