/**
 * ENG-634: the dev card links the e2e flows open. `useDevCardLinks` sets or
 * clears the card bridge and taps the card, from the launch link and from
 * links that arrive while the app runs; a bridge also hides LogBox, whose
 * toasts cover the bottom of the screen the flows tap. Nothing happens in a
 * release build, and nothing but flash://dev/ links is acted on.
 */
import * as fs from "fs"
import * as path from "path"
import * as React from "react"
import { Linking, LogBox } from "react-native"
import { render, renderHook, waitFor } from "@testing-library/react-native"

import { DevCardLinks, useDevCardLinks } from "@app/hooks/use-tap-flashcard"
import { getCardBridge, setCardBridge } from "@app/utils/cashu-card-bridge"

const mockNavigate = jest.fn()
const mockReadFlashcard = jest.fn()

jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({ navigate: mockNavigate }),
}))
jest.mock("@app/hooks/useFlashcard", () => ({
  useFlashcard: () => ({ readFlashcard: mockReadFlashcard }),
}))

type Dev = { __DEV__: boolean }
const setDev = (value: boolean) => {
  ;(globalThis as unknown as Dev).__DEV__ = value
}

const BRIDGE_LINK =
  "flash://dev/card-bridge?url=http://localhost:9876&mint=http://localhost:3338&stubPay=1"

let urlListener: ((event: { url: string }) => void) | undefined
const remove = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  setCardBridge(undefined)
  urlListener = undefined
  jest.spyOn(Linking, "getInitialURL").mockResolvedValue(null)
  jest.spyOn(Linking, "addEventListener").mockImplementation(((
    _type: string,
    listener: (event: { url: string }) => void,
  ) => {
    urlListener = listener
    return { remove }
  }) as unknown as typeof Linking.addEventListener)
  jest.spyOn(LogBox, "ignoreAllLogs").mockImplementation(() => undefined)
  mockReadFlashcard.mockResolvedValue({ cashuCard: { pubkey: "02ab" } })
})

afterEach(() => {
  setDev(true)
  setCardBridge(undefined)
})

describe("useDevCardLinks", () => {
  it("sets the bridge from the launch link, and hides LogBox", async () => {
    ;(Linking.getInitialURL as jest.Mock).mockResolvedValue(BRIDGE_LINK)
    renderHook(() => useDevCardLinks())
    await waitFor(() =>
      expect(getCardBridge()).toEqual({
        url: "http://localhost:9876",
        mintUrl: "http://localhost:3338",
        stubPay: true,
      }),
    )
    expect(LogBox.ignoreAllLogs).toHaveBeenCalledWith(true)
  })

  it("taps the card on a tap link that arrives while running, and opens the card screen", async () => {
    renderHook(() => useDevCardLinks())
    await waitFor(() => expect(urlListener).toBeDefined())
    urlListener?.({ url: "flash://dev/card-tap" })
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("FlashcardV2"))
    expect(mockReadFlashcard).toHaveBeenCalledTimes(1)
  })

  it("clears the bridge on off=1, and shows LogBox again", async () => {
    setCardBridge({ url: "http://localhost:9876" })
    renderHook(() => useDevCardLinks())
    await waitFor(() => expect(urlListener).toBeDefined())
    urlListener?.({ url: "flash://dev/card-bridge?off=1" })
    expect(getCardBridge()).toBeUndefined()
    expect(LogBox.ignoreAllLogs).toHaveBeenCalledWith(false)
  })

  it("keeps no bridge that points the pay stub at the production mint", async () => {
    jest.spyOn(console, "warn").mockImplementationOnce(() => undefined)
    renderHook(() => useDevCardLinks())
    await waitFor(() => expect(urlListener).toBeDefined())
    urlListener?.({
      url: "flash://dev/card-bridge?url=http://localhost:9876&mint=https://forge.flashapp.me&stubPay=1",
    })
    expect(getCardBridge()).toBeUndefined()
    expect(LogBox.ignoreAllLogs).not.toHaveBeenCalled()
  })

  it("ignores every other link", async () => {
    renderHook(() => useDevCardLinks())
    await waitFor(() => expect(urlListener).toBeDefined())
    urlListener?.({ url: "flash://payment-user" })
    urlListener?.({ url: "https://pay.getflash.io/dev/card-tap" })
    expect(getCardBridge()).toBeUndefined()
    expect(mockReadFlashcard).not.toHaveBeenCalled()
  })

  it("listens to nothing in a release build", async () => {
    setDev(false)
    ;(Linking.getInitialURL as jest.Mock).mockResolvedValue(BRIDGE_LINK)
    const { unmount } = renderHook(() => useDevCardLinks())
    expect(Linking.getInitialURL).not.toHaveBeenCalled()
    expect(Linking.addEventListener).not.toHaveBeenCalled()
    unmount()
  })

  it("stops listening on unmount", async () => {
    const { unmount } = renderHook(() => useDevCardLinks())
    await waitFor(() => expect(urlListener).toBeDefined())
    unmount()
    expect(remove).toHaveBeenCalledTimes(1)
  })
})

describe("DevCardLinks", () => {
  it("runs the dev card links and renders nothing", async () => {
    ;(Linking.getInitialURL as jest.Mock).mockResolvedValue(BRIDGE_LINK)
    const { toJSON } = render(<DevCardLinks />)
    expect(toJSON()).toBeNull()
    await waitFor(() =>
      expect(getCardBridge()).toMatchObject({ url: "http://localhost:9876" }),
    )
  })

  // The hook reads FlashcardContext, whose value is a new object on every
  // provider render. Called from RootStack it re-rendered every screen on
  // each card state change, release builds included: only its own
  // component, mounted in development builds, may call it.
  const source = (file: string) =>
    fs.readFileSync(path.join(__dirname, "../../app", file), "utf8")

  it("is mounted from app.tsx in development builds only, inside FlashcardProvider", () => {
    const app = source("app.tsx")
    const provider = app.indexOf("<FlashcardProvider>")
    const mounted = app.indexOf("{__DEV__ && <DevCardLinks />}")
    expect(provider).toBeGreaterThan(-1)
    expect(mounted).toBeGreaterThan(provider)
    expect(mounted).toBeLessThan(app.indexOf("</FlashcardProvider>"))
    expect(app.match(/<DevCardLinks \/>/g)).toHaveLength(1)
  })

  it("is not called from RootStack, which would subscribe it to FlashcardContext", () => {
    const rootNavigator = source("navigation/root-navigator.tsx")
    expect(rootNavigator).not.toMatch(/useDevCardLinks|useTapFlashcard|useFlashcard/)
  })
})
