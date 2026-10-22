import * as React from "react"
import { AppState, StyleSheet } from "react-native"
import { nativeVoiceInput } from "@app/assistant/ui/native-voice-input"
import { act, fireEvent, render, waitFor } from "@testing-library/react-native"
import { ThemeProvider } from "@rneui/themed"

// The runtime's auth gate imports the biometric and key-store modules, as
// auth-gate.spec.ts mocks them; a text-initiated Confirm never prompts.
let mockVoiceListener: (event: { sessionId: string; type: string; text?: string }) => void
jest.mock("@app/assistant/ui/native-voice-input", () => ({
  nativeVoiceInput: {
    available: jest.fn(async () => true),
    permission: jest.fn(async () => "granted"),
    subscribe: jest.fn((listener) => {
      mockVoiceListener = listener
      return jest.fn()
    }),
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
  },
}))
jest.mock("react-native-haptic-feedback", () => ({
  __esModule: true,
  default: { trigger: jest.fn() },
}))
jest.mock("react-native-fingerprint-scanner", () => ({
  __esModule: true,
  default: { isSensorAvailable: jest.fn(), authenticate: jest.fn(), release: jest.fn() },
}))
jest.mock("react-native-secure-key-store", () => ({
  __esModule: true,
  default: { get: jest.fn(), set: jest.fn(), remove: jest.fn() },
  ACCESSIBLE: {},
}))
const mockNavigate = jest.fn()
const mockOpenSupportChat = jest.fn()
jest.mock("@app/hooks/use-open-support-chat", () => ({
  useOpenSupportChat: () => mockOpenSupportChat,
}))
jest.mock("@react-navigation/native", () => {
  const actual = jest.requireActual("@react-navigation/native")
  const { useEffect } = jest.requireActual("react")
  return {
    ...actual,
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
    // The app's transaction row opens a payment's details.
    useNavigation: () => ({ navigate: mockNavigate }),
  }
})
jest.mock("@app/i18n/i18n-react", () => {
  const { i18nObject: i18n } = jest.requireActual("@app/i18n/i18n-util")
  return { useI18nContext: () => ({ LL: i18n("en"), locale: "en" }) }
})
jest.mock("@apollo/client", () => ({
  ...jest.requireActual("@apollo/client"),
  useApolloClient: () => ({}),
}))
let mockOffline = false
jest.mock("@app/hooks/use-connectivity", () => ({
  useConnectivity: () => ({ isOffline: mockOffline, justReconnected: false }),
}))
jest.mock("@app/hooks/use-app-config", () => ({
  useAppConfig: () => ({
    appConfig: {
      galoyInstance: {
        graphqlUri: "https://api.example/graphql",
        lnAddressHostname: "flashapp.me",
      },
    },
  }),
}))
// The app's formatter, written so a spec can predict it: "USD 1234", and
// "~ USD 1234" for a converted amount. The account's display currency is
// USD unless a case says otherwise.
let mockDisplay = { displayCurrency: "USD", fiatSymbol: "$" }
jest.mock("@app/hooks/use-display-currency", () => {
  const fmt = ({
    moneyAmount,
  }: {
    moneyAmount: { currencyCode: string; amount: number }
  }) => `${moneyAmount.currencyCode} ${moneyAmount.amount}`
  return {
    useDisplayCurrency: () => ({
      displayCurrency: mockDisplay.displayCurrency,
      fiatSymbol: mockDisplay.fiatSymbol,
      fractionDigits: 2,
      formatMoneyAmount: fmt,
      moneyAmountToDisplayCurrencyString: ({
        moneyAmount,
      }: {
        moneyAmount: { currencyCode: string; amount: number }
      }) => `~ ${fmt({ moneyAmount })}`,
      formatDisplayAndWalletAmount: ({ displayAmount }: { displayAmount: never }) =>
        fmt({ moneyAmount: displayAmount }),
      formatCurrency: ({
        amountInMajorUnits,
        currency,
      }: {
        amountInMajorUnits: number
        currency: string
      }) => `${currency} ${amountInMajorUnits}`,
    }),
  }
})
jest.mock("@app/hooks/use-keyboard-padding", () => {
  const { View } = jest.requireActual("react-native")
  return { Animated: { View }, useKeyboardPaddingStyle: () => ({}) }
})
jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context")
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }
})
let mockRuntime: unknown
jest.mock("@app/assistant/ui/assistant-runtime", () => ({
  ...jest.requireActual("@app/assistant/ui/assistant-runtime"),
  getAssistantRuntime: () => mockRuntime,
}))

import { MockedProvider } from "@apollo/client/testing"

import { confirmPaymentFixture } from "@app/assistant/cards/fixtures"
import type { ModelAdapter } from "@app/assistant/engine/model-adapter"
import type { ToolResult } from "@app/assistant/registry/types"
import { AskFlashScreen } from "@app/assistant/ui"
import { FeatureFlagContext } from "@app/config/feature-flags-context"
import { createCache } from "@app/graphql/cache"
import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import theme from "@app/rne-theme/theme"
import { makeAction } from "../executor-harness"
import {
  btcPayment,
  fakeModelAdapter,
  graphqlTx,
  JMD_PRICE,
  modelCall,
  page,
  unavailableModelAdapter,
  USD_PRICE,
} from "../fakes"
import { CASH_WALLETS, fakeRuntime } from "./thread-harness"

loadLocale("en")
const en = i18nObject("en")

// The Ask Flash screen (app/assistant/ui/ask-flash-screen.tsx): every string
// through LL, every figure from a tool's payload by the app's formatter,
// cards through ActionCardView, the typing line, and the offline states.

jest.setTimeout(30000)

type Flags = React.ComponentProps<typeof FeatureFlagContext.Provider>["value"]

const FLAGS_OFF: Flags = {
  deviceAccountEnabled: false,
  bridgeTopupEnabled: false,
  cashuCardUsdEnabled: false,
  assistantEnabled: false,
  assistantVoice: false,
  assistantVoiceReplies: false,
  assistantServerFallback: false,
  assistantOnDeviceModel: false,
}

const show = <M extends ModelAdapter>(
  options: { flags?: Partial<Flags>; modelAdapter?: M } = {},
) => {
  const harness = fakeRuntime({ modelAdapter: options.modelAdapter })
  mockRuntime = harness.runtime
  // The app's transaction row reads the hidden-balance flag and the price
  // from the Apollo cache, as it does on the home screen.
  const screen = render(
    <FeatureFlagContext.Provider value={{ ...FLAGS_OFF, ...options.flags }}>
      <MockedProvider mocks={[]} cache={createCache()}>
        <ThemeProvider theme={theme}>
          <AskFlashScreen />
        </ThemeProvider>
      </MockedProvider>
    </FeatureFlagContext.Provider>,
  )
  return { ...harness, screen }
}

const ask = async (screen: ReturnType<typeof render>, text: string) => {
  fireEvent.changeText(screen.getByTestId("ask-flash-input"), text)
  await act(async () => {
    fireEvent.press(screen.getByTestId("ask-flash-send"))
  })
}

afterEach(() => {
  mockOffline = false
  mockDisplay = { displayCurrency: "USD", fiatSymbol: "$" }
  jest.clearAllMocks()
})

describe("AskFlashScreen", () => {
  it("shows the account address without offline messaging while online", async () => {
    const { screen, runtime } = show()
    runtime.getOwnUsername = jest.fn(async () => "alice")
    await ask(screen, "Whats my Flash address")
    expect(screen.getByText("alice@flashapp.me")).toBeTruthy()
    expect(screen.getByTestId("ask-flash-address-copy")).toBeTruthy()
    expect(screen.queryByText(en.AskFlashHelp.addressSaved())).toBeNull()
    expect(screen.queryByText(en.AskFlashHelp.addressOfflineUnavailable())).toBeNull()
  })

  it("answers a tappable starter locally without warming the model", async () => {
    const { screen, modelAdapter, runTool } = show()
    fireEvent.press(screen.getByTestId("ask-flash-example-0"))
    await waitFor(() =>
      expect(screen.getByText(en.AskFlashHelp.capabilities())).toBeTruthy(),
    )
    expect(modelAdapter.prewarm).not.toHaveBeenCalled()
    expect(runTool).not.toHaveBeenCalled()
  })
  it("opens the existing scanner only after the help action is tapped", async () => {
    const { screen } = show()
    await ask(screen, "How do I scan a payment QR code?")
    expect(mockNavigate).not.toHaveBeenCalled()
    fireEvent.press(screen.getByTestId("ask-flash-help-action"))
    expect(mockNavigate).toHaveBeenCalledWith("scanningQRCode")
  })
  it("opens a named screen only after its answer button is tapped, even offline", async () => {
    mockOffline = true
    const { screen, runTool } = show()
    await ask(screen, "Where is the map?")
    expect(
      screen.getByText(en.AskFlashHelp.screenLocation({ screen: en.MapScreen.title() })),
    ).toBeTruthy()
    expect(mockNavigate).not.toHaveBeenCalled()
    fireEvent.press(screen.getByTestId("ask-flash-screen-action"))
    expect(mockNavigate).toHaveBeenCalledWith("Primary", { screen: "Map" })
    expect(runTool).not.toHaveBeenCalled()
  })
  it("routes a chat profile request to the existing profile editor", async () => {
    const { screen } = show()
    await ask(screen, "Where is my chat profile?")
    fireEvent.press(screen.getByTestId("ask-flash-screen-action"))
    expect(mockNavigate).toHaveBeenCalledWith("EditNostrProfile")
  })
  it("asks for the missing swap amount in the thread and routes the follow-up", async () => {
    const { screen, runTool } = show()
    await ask(screen, "Convert BTC to USD")
    expect(screen.getByTestId("ask-flash-conversion-amount")).toBeTruthy()
    expect(runTool).not.toHaveBeenCalled()
    runTool.mockResolvedValue({
      kind: "error",
      userMessage: "Assistant.invalidArguments",
    } as ToolResult<unknown>)
    await ask(screen, "20000 sats")
    expect(runTool.mock.calls[0][0]).toEqual({
      intent: "prepareConversion",
      args: { from: "BTC", to: "USD", amount: "0.00020000", currency: "BTC" },
    })
  })
  it("opens the existing in-app support chat from help", async () => {
    const { screen } = show()
    await ask(screen, "How do I contact support?")
    expect(mockOpenSupportChat).not.toHaveBeenCalled()
    fireEvent.press(screen.getByTestId("ask-flash-help-action"))
    expect(mockOpenSupportChat).toHaveBeenCalledTimes(1)
  })
  it("offers offline guidance without opening a network-backed screen", async () => {
    mockOffline = true
    const { screen, runTool } = show()
    await ask(screen, "How do I add money to Flash?")
    expect(screen.getByText(en.AskFlashHelp.funding())).toBeTruthy()
    expect(screen.queryByTestId("ask-flash-help-action")).toBeNull()
    expect(runTool).not.toHaveBeenCalled()
  })

  it("lets the on-device model read what the grammar misses while both its flags are on", async () => {
    const { screen, graphql, modelAdapter } = show({
      flags: { assistantEnabled: true, assistantOnDeviceModel: true },
      modelAdapter: fakeModelAdapter(modelCall({ intent: "getBalances", args: {} })),
    })
    graphql.wallets.mockResolvedValue(CASH_WALLETS)

    await ask(screen, "how loaded am i right now")

    expect(modelAdapter.decide).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByTestId("ask-flash-balances")).toBeTruthy())
    expect(screen.getByText("USD 1234")).toBeTruthy()
  })

  // Plain loops rather than it.each: this repo's tsconfig types `it` without
  // .each (navigation-container-wrapper.spec.tsx).
  const ONE_FLAG: [string, Partial<Flags>][] = [
    ["the assistant's flag alone", { assistantEnabled: true }],
    ["the model's flag alone", { assistantOnDeviceModel: true }],
  ]
  ONE_FLAG.forEach(([name, flags]) =>
    it(`never asks the on-device model with ${name} on`, async () => {
      const { screen, modelAdapter } = show({
        flags,
        modelAdapter: fakeModelAdapter(modelCall({ intent: "getBalances", args: {} })),
      })

      await ask(screen, "how loaded am i right now")

      expect(modelAdapter.isAvailable).not.toHaveBeenCalled()
      expect(modelAdapter.decide).not.toHaveBeenCalled()
      expect(screen.getByText(en.Assistant.unknownIntent())).toBeTruthy()
    }),
  )

  const BOTH_ON: Partial<Flags> = { assistantEnabled: true, assistantOnDeviceModel: true }

  it("does not warm the model on opening or while answering guaranteed questions", async () => {
    const off = show()
    await act(async () => undefined)
    const openedWithoutModel = off.events.map(({ type }) => type)
    off.screen.unmount()

    const { screen, graphql, modelAdapter, events } = show({
      flags: BOTH_ON,
      modelAdapter: fakeModelAdapter(modelCall({ intent: "getBalances", args: {} })),
    })

    expect(modelAdapter.prewarm).not.toHaveBeenCalled()
    expect(modelAdapter.decide).not.toHaveBeenCalled()
    // Opening reports what it does without a model, and nothing more.
    expect(events.map(({ type }) => type)).toEqual(openedWithoutModel)

    // Typing and a grammar hit render the screen again: the model is not
    // asked, and the warm-up stays at one.
    graphql.wallets.mockResolvedValue(CASH_WALLETS)
    await ask(screen, "what's my balance")
    await waitFor(() => expect(screen.getByTestId("ask-flash-balances")).toBeTruthy())
    expect(modelAdapter.decide).not.toHaveBeenCalled()
    expect(modelAdapter.prewarm).not.toHaveBeenCalled()
  })

  it("warms the next session after each ask the on-device model reads, so every ask finds one (ENG-749)", async () => {
    const { screen, graphql, modelAdapter } = show({
      flags: BOTH_ON,
      modelAdapter: fakeModelAdapter(modelCall({ intent: "getBalances", args: {} })),
    })
    graphql.wallets.mockResolvedValue(CASH_WALLETS)
    expect(modelAdapter.prewarm).not.toHaveBeenCalled()

    await ask(screen, "how loaded am i right now")
    await waitFor(() => expect(modelAdapter.prewarm).toHaveBeenCalledTimes(1))
    await ask(screen, "am i loaded or what")
    await waitFor(() => expect(modelAdapter.prewarm).toHaveBeenCalledTimes(2))

    expect(modelAdapter.decide).toHaveBeenCalledTimes(2)
  })

  ONE_FLAG.forEach(([name, flags]) =>
    it(`never warms the on-device model with ${name} on (ENG-749)`, async () => {
      const { modelAdapter } = show({ flags, modelAdapter: fakeModelAdapter() })

      await act(async () => undefined)

      expect(modelAdapter.isAvailable).not.toHaveBeenCalled()
      expect(modelAdapter.prewarm).not.toHaveBeenCalled()
    }),
  )

  it("never warms an on-device model that is not there (ENG-749)", async () => {
    const { modelAdapter } = show({
      flags: BOTH_ON,
      modelAdapter: unavailableModelAdapter(),
    })

    expect(modelAdapter.isAvailable).not.toHaveBeenCalled()
    expect(modelAdapter.prewarm).not.toHaveBeenCalled()
  })

  it("greets an empty thread with its hint, an input and an Ask button, all from LL", () => {
    const { screen } = show()

    expect(screen.getByText(en.AskFlash.emptyHint())).toBeTruthy()
    expect(screen.getByTestId("ask-flash-input").props.placeholder).toBe(
      en.AskFlash.placeholder(),
    )
    expect(screen.getByText(en.AskFlash.send())).toBeTruthy()
    // Nothing to ask yet.
    expect(screen.getByTestId("ask-flash-send")).toBeDisabled()
    expect(screen.queryByTestId("ask-flash-offline")).toBeNull()
  })

  it("shows what the user typed and the templated reply, and empties the input", async () => {
    const { screen } = show()

    await ask(screen, "what is lightning")

    expect(screen.getByTestId("ask-flash-user-bubble")).toBeTruthy()
    expect(screen.getByText("what is lightning")).toBeTruthy()
    expect(screen.getByText(en.AskFlashHelp.lightning())).toBeTruthy()
    expect(screen.getByTestId("ask-flash-input").props.value).toBe("")
    expect(screen.queryByTestId("ask-flash-empty")).toBeNull()
  })

  it("draws a balances answer from the tool's payload, through the app's formatter", async () => {
    const { screen, graphql } = show()
    graphql.wallets.mockResolvedValue(CASH_WALLETS)

    await ask(screen, "what's my balance")

    await waitFor(() => expect(screen.getByTestId("ask-flash-balances")).toBeTruthy())
    expect(screen.getByText(en.AskFlash.balancesTitle())).toBeTruthy()
    expect(screen.getByText(en.HomeScreen.cash())).toBeTruthy()
    expect(screen.getByText("USD 1234")).toBeTruthy()
    // The BTC wallet is off: its reply, never a zero.
    expect(screen.getByText(en.HomeScreen.bitcoin())).toBeTruthy()
    expect(screen.getByText(en.Assistant.btcDisabled())).toBeTruthy()
    expect(screen.queryByTestId("ask-flash-stale")).toBeNull()
  })

  it("says it is offline, labels what comes from the cache, and refuses to send", async () => {
    const { screen, graphql } = show()
    graphql.wallets.mockResolvedValue(CASH_WALLETS)
    await ask(screen, "what's my balance")
    graphql.wallets.mockClear()
    mockOffline = true
    fireEvent.changeText(screen.getByTestId("ask-flash-input"), "refresh")

    expect(screen.getByText(en.AskFlash.offlineBanner())).toBeTruthy()

    await ask(screen, "what's my balance")
    await waitFor(() =>
      expect(screen.getAllByTestId("ask-flash-balances")).toHaveLength(2),
    )
    expect(screen.getByTestId("ask-flash-stale")).toBeTruthy()
    expect(
      screen.getByText(
        en.AskFlashHelp.savedAt({ time: new Date(1_760_000_000_000).toLocaleString() }),
      ),
    ).toBeTruthy()
    expect(graphql.wallets).not.toHaveBeenCalled()

    await ask(screen, "send $5 to bob")
    expect(screen.getByText(en.Assistant.actionsOffline())).toBeTruthy()
  })

  it("shows the typing line while a turn runs, with the input and Ask off", async () => {
    const { screen, runtime } = show()
    let finish: (result: ToolResult<unknown>) => void = () => undefined
    runtime.runTool = jest.fn(
      () =>
        new Promise<ToolResult<unknown>>((resolve) => {
          finish = resolve
        }),
    )

    await ask(screen, "what's my balance")

    expect(screen.getByText(en.AskFlash.typing())).toBeTruthy()
    expect(screen.getByTestId("ask-flash-input").props.editable).toBe(false)
    fireEvent.changeText(screen.getByTestId("ask-flash-input"), "bitcoin price")
    expect(screen.getByTestId("ask-flash-send")).toBeDisabled()

    await act(async () => {
      finish({ kind: "error", userMessage: "Assistant.toolFailed" })
    })
    expect(screen.queryByTestId("ask-flash-typing")).toBeNull()
    expect(screen.getByText(en.Assistant.toolFailed())).toBeTruthy()
  })

  it("draws a prepared action's card through ActionCardView, armed", async () => {
    const { screen, runtime } = show()
    const { expiresAt: _e, preparedActionId: _p, ...summary } = confirmPaymentFixture
    const action = makeAction({
      threadId: runtime.threadId,
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      summary,
    })
    runtime.runTool = jest.fn(
      async (): Promise<ToolResult<unknown>> => ({
        kind: "prepared",
        preparedAction: action,
      }),
    )

    await ask(screen, "send $5 to mom")

    await waitFor(() =>
      expect(screen.getByTestId("assistant-card-confirm-button")).not.toBeDisabled(),
    )
    expect(screen.getByTestId("assistant-card-confirm")).toBeTruthy()
    expect(screen.getByText(confirmPaymentFixture.payeeLabel)).toBeTruthy()
  })

  it("draws the price of one bitcoin from the tool's payload", async () => {
    const { screen, graphql } = show()
    graphql.realtimePrice.mockResolvedValue(USD_PRICE)

    await ask(screen, "bitcoin price")

    await waitFor(() => expect(screen.getByTestId("ask-flash-price")).toBeTruthy())
    expect(screen.getByText(en.common.bitcoinPrice())).toBeTruthy()
    // 0.063 cents a sat, so 6,300,000 cents a bitcoin.
    expect(screen.getByTestId("ask-flash-price-value")).toBeTruthy()
    expect(screen.getByText("USD 6300000")).toBeTruthy()
  })

  it("draws the payments a history ask found, and the window it searched", async () => {
    const { screen, graphql } = show()
    graphql.transactions.mockResolvedValue(
      page([graphqlTx({ id: "tx-1", createdAt: Math.floor(Date.now() / 1000) - 60 })]),
    )

    await ask(screen, "show my transactions")

    await waitFor(() => expect(screen.getByTestId("assistant-card-txlist")).toBeTruthy())
    expect(screen.getByText(en.Assistant.searchedWindow({ count: 1 }))).toBeTruthy()
    expect(screen.getByTestId("ask-flash-tx-0")).toBeTruthy()
    expect(screen.getByText("USD 500")).toBeTruthy()
  })

  it("draws each payment with the app's own row, from the payment itself, memo and all", async () => {
    // "show my payments" searched nothing, so the tool's answer carries no
    // memo or payee (spec §4). The thread draws each row from the payment
    // its rail handed the tool, with TxItem, as home and the history
    // screens do (spec §6).
    const { screen, graphql, btcRail } = show()
    const now = Math.floor(Date.now() / 1000)
    graphql.transactions.mockResolvedValue(
      page([graphqlTx({ id: "tx-rent", createdAt: now - 60, memo: "Rent for October" })]),
    )
    btcRail.listPayments.mockResolvedValue([
      btcPayment({ id: "pay-1", timestamp: now - 120, paymentType: 1, sats: 2_100 }),
    ])

    await ask(screen, "show my payments")

    await waitFor(() => expect(screen.getByTestId("ask-flash-tx-1")).toBeTruthy())
    // The memo the answer itself does not carry, on the app's row.
    expect(screen.getByText("Rent for October")).toBeTruthy()
    // The app's row says which way and which wallet, and converts the amount.
    expect(screen.getByText("Sent USD")).toBeTruthy()
    expect(screen.getByText("~ USD 500")).toBeTruthy()
    expect(screen.getByText("Received BTC")).toBeTruthy()

    // A tap opens the payment, as anywhere else in the app.
    fireEvent.press(screen.getByText("Rent for October"))
    expect(mockNavigate).toHaveBeenCalledWith(
      "transactionDetail",
      expect.objectContaining({ tx: expect.objectContaining({ id: "tx-rent" }) }),
    )
  })

  it("draws the price in US dollars on a J$ account by the screens' own conversion", async () => {
    mockDisplay = { displayCurrency: "JMD", fiatSymbol: "J$" }
    const { screen, graphql } = show()
    graphql.realtimePrice.mockResolvedValue(USD_PRICE)

    await ask(screen, "bitcoin price in usd")

    await waitFor(() => expect(screen.getByTestId("ask-flash-price")).toBeTruthy())
    expect(graphql.realtimePrice).toHaveBeenCalledWith("USD")
    // 0.063 US cents a sat: 6,300,000 cents a bitcoin, as a US dollar
    // amount (toUsdMoneyAmount), never as J$.
    expect(screen.getByText("USD 6300000")).toBeTruthy()
  })

  it("draws the price in a currency that is neither the account's nor US dollars", async () => {
    const { screen, graphql } = show()
    graphql.realtimePrice.mockResolvedValue({
      ...USD_PRICE,
      denominatorCurrency: "EUR",
      btcSatPrice: { ...USD_PRICE.btcSatPrice, base: 54_000, offset: 6 },
    })

    await ask(screen, "bitcoin price in eur")

    await waitFor(() => expect(screen.getByTestId("ask-flash-price")).toBeTruthy())
    expect(graphql.realtimePrice).toHaveBeenCalledWith("EUR")
    // 0.054 euro cents a sat: 5,400,000 cents, so 54,000 euros a bitcoin,
    // handed to the app's formatter in euros.
    expect(screen.getByText("EUR 54000")).toBeTruthy()
  })

  it("draws the price in the account's own currency on a J$ account", async () => {
    mockDisplay = { displayCurrency: "JMD", fiatSymbol: "J$" }
    const { screen, graphql } = show()
    graphql.realtimePrice.mockResolvedValue(JMD_PRICE)

    await ask(screen, "bitcoin price")

    await waitFor(() => expect(screen.getByTestId("ask-flash-price")).toBeTruthy())
    expect(graphql.realtimePrice).toHaveBeenCalledWith("JMD")
    // 9.891 J$ cents a sat: 989,100,000 cents a bitcoin, as a display amount.
    expect(screen.getByText("JMD 989100000")).toBeTruthy()
  })

  it("asks about an amount with an example in the account's own currency", async () => {
    mockDisplay = { displayCurrency: "JMD", fiatSymbol: "J$" }
    const { screen, runtime } = show()
    runtime.runTool = jest.fn()

    await ask(screen, "send $500 to tanya")

    expect(runtime.runTool).not.toHaveBeenCalled()
    expect(screen.getByText(en.Assistant.amountUnclear({ currency: "JMD" }))).toBeTruthy()
  })
})

const voiceFlags = { assistantEnabled: true, assistantVoice: true }

it("shows the talk button on first render while capability detection is still pending", async () => {
  let resolve: (value: boolean) => void = () => undefined
  ;(nativeVoiceInput.available as jest.Mock).mockImplementationOnce(
    () =>
      new Promise<boolean>((done) => {
        resolve = done
      }),
  )
  const { screen } = show({ flags: voiceFlags })
  expect(screen.getByTestId("ask-flash-talk").props.accessibilityState.disabled).toBe(
    true,
  )
  await act(async () => resolve(true))
  expect(screen.getByTestId("ask-flash-talk").props.accessibilityState.disabled).toBe(
    false,
  )
})

const activateTalk = async (screen: ReturnType<typeof render>) => {
  Object.defineProperty(AppState, "currentState", { configurable: true, value: "active" })
  await waitFor(() =>
    expect(screen.getByTestId("ask-flash-talk").props.accessibilityState.disabled).toBe(
      false,
    ),
  )
  await act(async () => {
    fireEvent(screen.getByTestId("ask-flash-talk"), "responderGrant")
  })
  const id = jest.mocked(nativeVoiceInput.start).mock.calls.slice(-1)[0][0]
  act(() => mockVoiceListener({ sessionId: id, type: "started" }))
  return id
}

it("shows a large dedicated talk button only with both flags", async () => {
  const off = show()
  expect(off.screen.queryByTestId("ask-flash-talk")).toBeNull()
  off.screen.unmount()
  const one = show({ flags: { assistantVoice: true } })
  expect(one.screen.queryByTestId("ask-flash-talk")).toBeNull()
  one.screen.unmount()
  const on = show({ flags: voiceFlags })
  await waitFor(() =>
    expect(
      on.screen.getByTestId("ask-flash-talk").props.accessibilityState.disabled,
    ).toBe(false),
  )
  const style = StyleSheet.flatten(on.screen.getByTestId("ask-flash-talk").props.style)
  expect(style.minHeight).toBeGreaterThanOrEqual(72)
  expect(style.alignSelf).toBe("stretch")
})

it("previews voice above the button, disables typed send and submits the final text once", async () => {
  const { screen, runtime } = show({ flags: voiceFlags })
  fireEvent.changeText(screen.getByTestId("ask-flash-input"), "old draft")
  const id = await activateTalk(screen)
  act(() => mockVoiceListener({ sessionId: id, type: "interim", text: "what's my" }))
  expect(screen.getByTestId("ask-flash-input").props.value).toBe("what's my")
  expect(screen.getByTestId("ask-flash-input").props.editable).toBe(false)
  expect(screen.getByTestId("ask-flash-send")).toBeDisabled()
  act(() => fireEvent(screen.getByTestId("ask-flash-talk"), "responderRelease"))
  act(() => {
    mockVoiceListener({ sessionId: id, type: "final", text: "what's my balance" })
    mockVoiceListener({ sessionId: id, type: "end" })
    mockVoiceListener({ sessionId: id, type: "end" })
  })
  await waitFor(() => expect(runtime.transcript.get().busy).toBe(false))
  expect(
    runtime.transcript.get().entries.filter((entry) => entry.kind === "user"),
  ).toEqual([expect.objectContaining({ text: "what's my balance" })])
  expect(screen.getByTestId("ask-flash-input").props.value).toBe("")
})

it("restores a draft on responder cancellation and exposes accessible start/stop", async () => {
  const { screen, runtime } = show({ flags: voiceFlags })
  fireEvent.changeText(screen.getByTestId("ask-flash-input"), "keep this")
  const id = await activateTalk(screen)
  act(() => fireEvent(screen.getByTestId("ask-flash-talk"), "responderTerminate"))
  act(() => mockVoiceListener({ sessionId: id, type: "end" }))
  expect(screen.getByTestId("ask-flash-input").props.value).toBe("keep this")
  expect(runtime.transcript.get().entries).toHaveLength(0)
  await act(async () => {
    fireEvent(screen.getByTestId("ask-flash-talk"), "accessibilityAction", {
      nativeEvent: { actionName: "activate" },
    })
  })
  expect(nativeVoiceInput.start).toHaveBeenCalledTimes(2)
  act(() =>
    fireEvent(screen.getByTestId("ask-flash-talk"), "accessibilityAction", {
      nativeEvent: { actionName: "activate" },
    }),
  )
  expect(nativeVoiceInput.stop).toHaveBeenCalled()
})

it("keeps typing usable when on-device voice is unavailable", async () => {
  jest.mocked(nativeVoiceInput.available).mockResolvedValueOnce(false)
  const { screen, runtime } = show({ flags: voiceFlags })
  await waitFor(() => expect(screen.getByTestId("ask-flash-voice-message")).toBeTruthy())
  expect(screen.getByTestId("ask-flash-talk").props.accessibilityState.disabled).toBe(
    true,
  )
  expect(screen.getByTestId("ask-flash-input").props.editable).toBe(true)
  await ask(screen, "what's my balance")
  expect(runtime.transcript.get().entries).toContainEqual(
    expect.objectContaining({
      kind: "user",
      text: "what's my balance",
    }),
  )
})
