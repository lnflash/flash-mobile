import * as React from "react"
import { act, fireEvent, render, waitFor } from "@testing-library/react-native"
import { ThemeProvider } from "@rneui/themed"

// The runtime's auth gate imports the biometric and key-store modules, as
// auth-gate.spec.ts mocks them; a text-initiated Confirm never prompts.
jest.mock("react-native-fingerprint-scanner", () => ({
  __esModule: true,
  default: { isSensorAvailable: jest.fn(), authenticate: jest.fn(), release: jest.fn() },
}))
jest.mock("react-native-secure-key-store", () => ({
  __esModule: true,
  default: { get: jest.fn(), set: jest.fn(), remove: jest.fn() },
  ACCESSIBLE: {},
}))
jest.mock("@react-navigation/native", () => {
  const actual = jest.requireActual("@react-navigation/native")
  const { useEffect } = jest.requireActual("react")
  return {
    ...actual,
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
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
// The app's formatter, written so a spec can predict it: "USD 1234".
jest.mock("@app/hooks/use-display-currency", () => {
  const fmt = ({
    moneyAmount,
  }: {
    moneyAmount: { currencyCode: string; amount: number }
  }) => `${moneyAmount.currencyCode} ${moneyAmount.amount}`
  return {
    useDisplayCurrency: () => ({
      displayCurrency: "USD",
      fiatSymbol: "$",
      fractionDigits: 2,
      formatMoneyAmount: fmt,
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

import { confirmPaymentFixture } from "@app/assistant/cards/fixtures"
import type { ToolResult } from "@app/assistant/registry/types"
import { AskFlashScreen } from "@app/assistant/ui"
import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import theme from "@app/rne-theme/theme"
import { makeAction } from "../executor-harness"
import { graphqlTx, page, USD_PRICE } from "../fakes"
import { CASH_WALLETS, fakeRuntime } from "./thread-harness"

loadLocale("en")
const en = i18nObject("en")

// The Ask Flash screen (app/assistant/ui/ask-flash-screen.tsx): every string
// through LL, every figure from a tool's payload by the app's formatter,
// cards through ActionCardView, the typing line, and the offline states.

jest.setTimeout(30000)

const show = () => {
  const harness = fakeRuntime()
  mockRuntime = harness.runtime
  const screen = render(
    <ThemeProvider theme={theme}>
      <AskFlashScreen />
    </ThemeProvider>,
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
})

describe("AskFlashScreen", () => {
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
    expect(screen.getByText(en.Assistant.unknownIntent())).toBeTruthy()
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
    mockOffline = true
    const { screen, cachedGraphql, graphql } = show()
    cachedGraphql.wallets.mockResolvedValue(CASH_WALLETS)

    expect(screen.getByText(en.AskFlash.offlineBanner())).toBeTruthy()

    await ask(screen, "what's my balance")
    await waitFor(() => expect(screen.getByTestId("ask-flash-balances")).toBeTruthy())
    expect(screen.getByTestId("ask-flash-stale")).toBeTruthy()
    expect(screen.getByText(en.AskFlash.staleBadge())).toBeTruthy()
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
})
