import React from "react"
import { ActivityIndicator } from "react-native"
import { render, fireEvent } from "@testing-library/react-native"
import { ThemeProvider } from "@rneui/themed"
import theme from "@app/rne-theme/theme"
import { i18nObject } from "../../../i18n/i18n-util"
import { loadAllLocales } from "../../../i18n/i18n-util.sync"
import PaymentSuccessScreen from "../payment-success-screen"
import type { FygaroTopupResolution } from "@app/hooks/use-fygaro-topup-status"

// Without this, i18nObject("en") resolves every key to "" and text queries
// match arbitrary empty text nodes.
loadAllLocales()

// Deterministic, synchronous i18n (the real TypesafeI18n loads its dictionary
// asynchronously, leaving LL-derived labels empty on first render).
jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))

const mockNavigate = jest.fn()
const mockRoute = {
  key: "paymentSuccess",
  name: "paymentSuccess",
  params: { amount: 60, wallet: "USD", checkoutId: "intent-1" },
}
jest.mock("@react-navigation/native", () => {
  const actual = jest.requireActual("@react-navigation/native")
  return {
    ...actual,
    useNavigation: () => ({ navigate: mockNavigate }),
    useRoute: () => mockRoute,
  }
})

// The phase-to-copy mapping is what this screen IS. The hook that produces the
// phase has its own coverage in __tests__/hooks/use-fygaro-topup-status.spec.tsx.
const mockResolution: jest.Mock = jest.fn()
jest.mock("@app/hooks/use-fygaro-topup-status", () => ({
  useFygaroTopupStatus: () => mockResolution(),
}))

const en = i18nObject("en")

const renderScreen = (resolution: FygaroTopupResolution) => {
  mockResolution.mockReturnValue(resolution)
  return render(
    <ThemeProvider theme={theme}>
      <PaymentSuccessScreen navigation={{} as never} route={mockRoute as never} />
    </ThemeProvider>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockRoute.params = { amount: 60, wallet: "USD", checkoutId: "intent-1" }
})

describe("PaymentSuccessScreen copy per phase", () => {
  it("says it is still checking, and shows a spinner rather than an outcome icon", () => {
    const screen = renderScreen({ phase: "checking" })

    expect(screen.queryByText(en.PaymentSuccessScreen.checkingTitle())).not.toBeNull()
    expect(screen.queryByText(en.PaymentSuccessScreen.checkingMessage())).not.toBeNull()
    // No verdict icon while there is no verdict.
    expect(screen.queryByText("✓")).toBeNull()
    expect(screen.queryByText("⏱")).toBeNull()
    expect(screen.queryByText("⚠")).toBeNull()
    expect(screen.UNSAFE_queryAllByType(ActivityIndicator).length).toBeGreaterThan(0)
  })

  it("claims a completed top-up ONLY when the backend says credited", () => {
    const { queryByText } = renderScreen({ phase: "credited", netAmountCents: 5652 })

    expect(queryByText(en.PaymentSuccessScreen.title())).not.toBeNull()
    expect(queryByText(en.PaymentSuccessScreen.successMessage())).not.toBeNull()
    expect(queryByText("✓")).not.toBeNull()
    // The net that actually landed, next to the gross that was charged.
    expect(queryByText(`${en.PaymentSuccessScreen.amountCredited()}:`)).not.toBeNull()
    expect(queryByText("$56.52")).not.toBeNull()
    expect(queryByText("$60.00")).not.toBeNull()
    expect(queryByText(`${en.PaymentSuccessScreen.depositedTo()}:`)).not.toBeNull()
  })

  it("omits the credited row when the backend did not say what net landed", () => {
    const { queryByText } = renderScreen({ phase: "credited" })

    expect(queryByText(`${en.PaymentSuccessScreen.amountCredited()}:`)).toBeNull()
  })

  it("says only that the payment was received while the credit is outstanding", () => {
    const { queryByText } = renderScreen({ phase: "pending" })

    expect(queryByText(en.PaymentSuccessScreen.receivedTitle())).not.toBeNull()
    expect(queryByText(en.PaymentSuccessScreen.pendingMessage())).not.toBeNull()
    expect(queryByText("⏱")).not.toBeNull()
    // "Deposited to" would be the old lie: nothing has been deposited yet.
    expect(queryByText(`${en.PaymentSuccessScreen.destinationWallet()}:`)).not.toBeNull()
    expect(queryByText(`${en.PaymentSuccessScreen.depositedTo()}:`)).toBeNull()
  })

  it("renders the server's reason verbatim on a held payment", () => {
    const { queryByText } = renderScreen({
      phase: "held",
      reason: "This is more than your remaining daily top-up limit of $25.00.",
    })

    expect(queryByText(en.PaymentSuccessScreen.heldTitle())).not.toBeNull()
    expect(
      queryByText("This is more than your remaining daily top-up limit of $25.00."),
    ).not.toBeNull()
    expect(queryByText("⚠")).not.toBeNull()
  })

  it("NEVER tells a held customer we are crediting their wallet, reason or no reason", () => {
    // `reason` is Maybe<String>. With a null one this screen used to fall back
    // to pendingMessage — "We've received your payment and are crediting your
    // wallet" — for a payment that is explicitly frozen until a human acts.
    const { queryByText } = renderScreen({ phase: "held" })

    expect(queryByText(en.PaymentSuccessScreen.pendingMessage())).toBeNull()
    expect(queryByText(en.PaymentSuccessScreen.heldTitle())).not.toBeNull()
    expect(queryByText(en.PaymentSuccessScreen.heldMessage())).not.toBeNull()
    expect(queryByText("⏱")).toBeNull()
  })

  it("NEVER tells a failed customer we are crediting their wallet either", () => {
    const { queryByText } = renderScreen({ phase: "failed" })

    expect(queryByText(en.PaymentSuccessScreen.pendingMessage())).toBeNull()
    expect(queryByText(en.PaymentSuccessScreen.failedTitle())).not.toBeNull()
    expect(queryByText(en.PaymentSuccessScreen.failedMessage())).not.toBeNull()
    expect(queryByText("⚠")).not.toBeNull()
  })

  it("renders the server's reason verbatim on a failed payment", () => {
    const { queryByText } = renderScreen({ phase: "failed", reason: "Card declined." })

    expect(queryByText("Card declined.")).not.toBeNull()
    expect(queryByText(en.PaymentSuccessScreen.failedMessage())).toBeNull()
  })

  it("gives held and failed headlines of their own, not the received one", () => {
    // Both title branches used to read `receivedTitle`, so "on hold" and
    // "not credited" both announced themselves as a received payment.
    const held = renderScreen({ phase: "held" })
    expect(held.queryByText(en.PaymentSuccessScreen.receivedTitle())).toBeNull()
    held.unmount()

    const failed = renderScreen({ phase: "failed" })
    expect(failed.queryByText(en.PaymentSuccessScreen.receivedTitle())).toBeNull()
    expect(failed.queryByText(en.PaymentSuccessScreen.heldTitle())).toBeNull()
  })
})

describe("PaymentSuccessScreen exit", () => {
  it("sends the customer home from Done", () => {
    const { getAllByText } = renderScreen({ phase: "credited" })

    fireEvent.press(getAllByText(en.PaymentSuccessScreen.done())[0])

    expect(mockNavigate).toHaveBeenCalledWith("Primary")
  })
})
