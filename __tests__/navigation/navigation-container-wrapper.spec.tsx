/**
 * ENG-634: dev card links (`flash://dev/...`) never reach a route. The
 * navigation container maps ":payment" to the send screen, so a dev link it
 * let through would be read as a payment destination. These pin, in a
 * development and a release build alike, that the wrapper's linking drops a
 * dev link from `getInitialURL` and from `subscribe`, while an ordinary
 * payment link still passes.
 */
import * as React from "react"
import { Linking } from "react-native"
import { act, render } from "@testing-library/react-native"
import { LinkingOptions } from "@react-navigation/native"

import {
  NavigationContainerWrapper,
  useAuthenticationContext,
} from "../../app/navigation/navigation-container-wrapper"
import { RootStackParamList } from "../../app/navigation/stack-param-lists"

type Linkingish = LinkingOptions<RootStackParamList>
let mockLinking: Linkingish | undefined

jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  NavigationContainer: ({
    linking,
    children,
  }: {
    linking: Linkingish
    children: React.ReactNode
  }) => {
    mockLinking = linking
    return children
  },
}))
jest.mock("@rneui/themed", () => ({
  ...jest.requireActual("@rneui/themed"),
  useTheme: () => ({ theme: { mode: "light" } }),
}))
jest.mock("react-native-bootsplash", () => ({ hide: jest.fn() }))
jest.mock("../../app/graphql/is-authed-context", () => ({ useIsAuthed: () => true }))

const DEV_LINKS = [
  "flash://dev/card-bridge?url=http://localhost:9876&mint=http://localhost:3338&stubPay=1",
  "flash://dev/card-tap",
  "FLASH://DEV/card-tap",
]
const PAYMENT_LINK = "flash://alice"

type Dev = { __DEV__: boolean }
const setDev = (value: boolean) => {
  ;(globalThis as unknown as Dev).__DEV__ = value
}

let unlock: (() => void | Promise<void>) | undefined
const Unlocker = () => {
  unlock = useAuthenticationContext().setAppUnlocked
  return null
}

let initialUrl: string | null = null
let urlHandler: ((event: { url: string }) => void) | undefined

beforeEach(() => {
  mockLinking = undefined
  unlock = undefined
  urlHandler = undefined
  initialUrl = null
  jest.spyOn(Linking, "getInitialURL").mockImplementation(async () => initialUrl)
  jest.spyOn(Linking, "addEventListener").mockImplementation(((
    _event: string,
    handler: (event: { url: string }) => void,
  ) => {
    urlHandler = handler
    return { remove: jest.fn() }
  }) as unknown as typeof Linking.addEventListener)
  jest.spyOn(console, "log").mockImplementation(() => undefined)
})

afterEach(() => {
  setDev(true)
  jest.restoreAllMocks()
})

/** Renders the wrapper unlocked, as a signed-in user past the lock screen. */
const renderUnlocked = async (): Promise<Linkingish> => {
  render(
    <NavigationContainerWrapper>
      <Unlocker />
    </NavigationContainerWrapper>,
  )
  await act(async () => {
    await unlock?.()
  })
  if (!mockLinking) throw new Error("NavigationContainer was not rendered")
  return mockLinking
}

// Plain loops rather than describe.each, as detail-amount-note.spec.tsx does:
// this repo's tsconfig types describe without .each.
const BUILDS: [string, boolean][] = [
  ["a development build", true],
  ["a release build", false],
]
BUILDS.forEach(([name, dev]) =>
  describe(`NavigationContainerWrapper linking, in ${name}`, () => {
    beforeEach(() => setDev(dev))

    it("getInitialURL drops a dev link and keeps a payment link", async () => {
      const linking = await renderUnlocked()
      for (const url of DEV_LINKS) {
        initialUrl = url
        await expect(linking.getInitialURL?.()).resolves.toBeNull()
      }
      initialUrl = PAYMENT_LINK
      await expect(linking.getInitialURL?.()).resolves.toBe(PAYMENT_LINK)
    })

    it("subscribe never hands a dev link to the navigator, and hands it a payment link", async () => {
      const linking = await renderUnlocked()
      const listener = jest.fn()
      const unsubscribe = linking.subscribe?.(listener)
      for (const url of DEV_LINKS) urlHandler?.({ url })
      expect(listener).not.toHaveBeenCalled()
      urlHandler?.({ url: PAYMENT_LINK })
      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith(PAYMENT_LINK)
      if (typeof unsubscribe === "function") unsubscribe()
    })
  }),
)
