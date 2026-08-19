import React from "react"
import { ActivityIndicator } from "react-native"
import { render, fireEvent } from "@testing-library/react-native"
import { ThemeProvider } from "@rneui/themed"
import theme from "@app/rne-theme/theme"
import { i18nObject, locales } from "../../../i18n/i18n-util"
import { loadAllLocales } from "../../../i18n/i18n-util.sync"
import PaymentSuccessScreen from "../payment-success-screen"
import type { Locales } from "../../../i18n/i18n-types"
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
    // "Crediting to" IS true here, and only here among the uncredited phases —
    // pending is the one where the money really is on its way.
    expect(queryByText(`${en.PaymentSuccessScreen.destinationWallet()}:`)).not.toBeNull()
    expect(queryByText(`${en.PaymentSuccessScreen.depositedTo()}:`)).toBeNull()
    expect(queryByText(`${en.PaymentSuccessScreen.wallet()}:`)).toBeNull()
  })

  it("does NOT claim to be crediting a wallet nobody was asked about", () => {
    // `unaskable` is a legacy device-built link: no checkout id, so nothing was
    // asked and nothing answered. It is also EVERY card top-up in production
    // while `fygaro.checkout.enabled` is off, which is what made this the
    // widest-reach claim on the screen.
    //
    // It used to resolve to `pending`, so the screen said "We've received your
    // payment and are crediting your wallet. We'll let you know as soon as it
    // lands", with ⏱ above it and "Crediting to: USD Wallet" below — an
    // assertion about crediting made from a Fygaro redirect, structurally the
    // same claim this PR exists to remove. In the incident shape (over-limit
    // capture → HELD_FOR_REVIEW) it never lands.
    const { queryByText } = renderScreen({ phase: "unaskable" })

    expect(queryByText(en.PaymentSuccessScreen.unaskableMessage())).not.toBeNull()
    expect(queryByText(en.PaymentSuccessScreen.pendingMessage())).toBeNull()
    // The payment itself IS evidenced — the screen is only reached on a success
    // redirect — so the headline may still say received.
    expect(queryByText(en.PaymentSuccessScreen.receivedTitle())).not.toBeNull()
    // ...but nothing may imply the money is on its way to a wallet.
    expect(queryByText("⏱")).toBeNull()
    expect(queryByText(`${en.PaymentSuccessScreen.destinationWallet()}:`)).toBeNull()
    expect(queryByText(`${en.PaymentSuccessScreen.depositedTo()}:`)).toBeNull()
    // The wallet is still named neutrally, the same way `unconfirmed` does it,
    // so an account with more than one knows which payment this was.
    expect(queryByText(`${en.PaymentSuccessScreen.wallet()}:`)).not.toBeNull()
    expect(queryByText("USD Wallet")).not.toBeNull()
  })

  it("keeps `pending` saying we are crediting — it is the phase the backend confirmed", () => {
    // The other half: splitting `unaskable` out must not water down the real
    // PROCESSING answer, where the backend HAS said it is crediting.
    const { queryByText } = renderScreen({ phase: "pending" })

    expect(queryByText(en.PaymentSuccessScreen.pendingMessage())).not.toBeNull()
    expect(queryByText(en.PaymentSuccessScreen.unaskableMessage())).toBeNull()
    expect(queryByText("⏱")).not.toBeNull()
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
    // ...and the DETAIL ROW may not say it either. "Payment on hold", then
    // "This payment is on hold for review", then "Crediting to: USD Wallet" is
    // the same false claim, moved one row down the screen.
    expect(queryByText(`${en.PaymentSuccessScreen.destinationWallet()}:`)).toBeNull()
    expect(queryByText(`${en.PaymentSuccessScreen.depositedTo()}:`)).toBeNull()
    expect(queryByText(`${en.PaymentSuccessScreen.wallet()}:`)).not.toBeNull()
  })

  it("NEVER tells a failed customer we are crediting their wallet either", () => {
    const { queryByText } = renderScreen({ phase: "failed" })

    expect(queryByText(en.PaymentSuccessScreen.pendingMessage())).toBeNull()
    expect(queryByText(en.PaymentSuccessScreen.failedTitle())).not.toBeNull()
    expect(queryByText(en.PaymentSuccessScreen.failedMessage())).not.toBeNull()
    expect(queryByText("⚠")).not.toBeNull()
    // "Payment not credited" directly above "Crediting to: USD Wallet".
    expect(queryByText(`${en.PaymentSuccessScreen.destinationWallet()}:`)).toBeNull()
    expect(queryByText(`${en.PaymentSuccessScreen.depositedTo()}:`)).toBeNull()
    expect(queryByText(`${en.PaymentSuccessScreen.wallet()}:`)).not.toBeNull()
  })

  it("still names the wallet on the stalled phases — neutrally", () => {
    // Dropping the row entirely would be the other overcorrection: an account
    // with both wallets still needs to know WHICH one this payment was for.
    const held = renderScreen({ phase: "held" })
    expect(held.queryByText("USD Wallet")).not.toBeNull()
    held.unmount()

    const failed = renderScreen({ phase: "failed" })
    expect(failed.queryByText("USD Wallet")).not.toBeNull()
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

describe("PaymentSuccessScreen copy in EVERY language", () => {
  // Each locale dictionary is `merge({}, en, rawTranslated)` (app/i18n/es/index.ts
  // and its 20 siblings), so a stale entry in raw-i18n/translations/<locale>.json
  // WINS over the corrected English. Rewriting `en` alone therefore fixed this
  // screen for English speakers and left everyone else on "Payment Successful /
  // Your payment has been processed successfully" — the precise claim the screen
  // was rebuilt to stop making, for a payment that may never have been credited.

  const phaseKeys = [
    "checkingTitle",
    "checkingMessage",
    "receivedTitle",
    "pendingMessage",
    "unaskableMessage",
    "unconfirmedTitle",
    "unconfirmedMessage",
    "heldTitle",
    "heldMessage",
    "failedTitle",
    "failedMessage",
    "destinationWallet",
    "wallet",
    "amountCredited",
  ] as const

  locales.forEach((locale: Locales) => {
    it(`never claims success in the old wording (${locale})`, () => {
      const L = i18nObject(locale)

      expect(L.PaymentSuccessScreen.title()).not.toBe("Payment Successful")
      expect(L.PaymentSuccessScreen.successMessage()).not.toBe(
        "Your payment has been processed successfully",
      )
    })

    it(`carries every payment-outcome phase (${locale})`, () => {
      // A missing key resolves to "" and would render a blank headline on the
      // screen a customer lands on immediately after being charged.
      const L = i18nObject(locale).PaymentSuccessScreen

      phaseKeys.forEach((key) => expect(L[key]()).not.toBe(""))
    })
  })
})

describe("PaymentSuccessScreen exit", () => {
  it("sends the customer home from Done", () => {
    const { getAllByText } = renderScreen({ phase: "credited" })

    fireEvent.press(getAllByText(en.PaymentSuccessScreen.done())[0])

    expect(mockNavigate).toHaveBeenCalledWith("Primary")
  })

  it("does NOT claim receipt when no payment has been observed", async () => {
    // The payment page closes on a decline exactly as it does on a success, so
    // "we've received your payment" here would tell someone whose card bounced
    // that we have their money — the same false claim this screen removes, one
    // state later.
    const { queryByText } = renderScreen({ phase: "unconfirmed" })

    expect(queryByText(en.PaymentSuccessScreen.unconfirmedTitle())).toBeTruthy()
    expect(queryByText(en.PaymentSuccessScreen.unconfirmedMessage())).toBeTruthy()
    expect(queryByText(en.PaymentSuccessScreen.receivedTitle())).toBeNull()
    expect(queryByText(en.PaymentSuccessScreen.pendingMessage())).toBeNull()
    expect(queryByText(en.PaymentSuccessScreen.title())).toBeNull()
  })

  it("NEVER tells an unconfirmed customer we are crediting their wallet either", () => {
    // `unconfirmed` was added to the hook after the label ternary was written
    // and fell through it to "Crediting to" — so a customer whose card was
    // DECLINED got "We haven't seen this payment yet" with "Crediting to: USD
    // Wallet" two rows below it and the ⏱ "on its way" icon above it. The same
    // assertions held and failed already carry; their absence here is why it
    // shipped.
    const { queryByText } = renderScreen({ phase: "unconfirmed" })

    expect(queryByText(`${en.PaymentSuccessScreen.destinationWallet()}:`)).toBeNull()
    expect(queryByText(`${en.PaymentSuccessScreen.depositedTo()}:`)).toBeNull()
    expect(queryByText(`${en.PaymentSuccessScreen.wallet()}:`)).not.toBeNull()
    // ...and the wallet is still named, so an account with more than one knows
    // which payment this was.
    expect(queryByText("USD Wallet")).not.toBeNull()
    // A clock says "on its way". Nothing is on its way here.
    expect(queryByText("⏱")).toBeNull()
    expect(queryByText("⚠")).not.toBeNull()
  })

  it("stays neutral about the wallet while it is still checking", () => {
    // The spinner phase knows even less than `unconfirmed` does. "Crediting to"
    // under "Confirming your top-up" is a verdict the screen has not been given.
    const { queryByText } = renderScreen({ phase: "checking" })

    expect(queryByText(`${en.PaymentSuccessScreen.destinationWallet()}:`)).toBeNull()
    expect(queryByText(`${en.PaymentSuccessScreen.depositedTo()}:`)).toBeNull()
    expect(queryByText(`${en.PaymentSuccessScreen.wallet()}:`)).not.toBeNull()
  })
})
