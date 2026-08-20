import * as React from "react"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { render, waitFor } from "@testing-library/react-native"

import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"
import DetailAmountNote from "../../app/components/send-flow/DetailAmountNote"
import { WalletCurrency } from "../../app/graphql/generated"
import { PaymentDetail } from "../../app/screens/send-bitcoin-screen/payment-details"

type MoneyAmountLike = { amount: number; currency: string; currencyCode: string }

// Controllable per-suite: the BTC cases only need convertMoneyAmount to be
// callable, but the cash-wallet cases (ENG-556) depend on what it converts to.
const mockConvertMoneyAmount = jest.fn(
  (amount: MoneyAmountLike, _currency?: string): MoneyAmountLike => amount,
)
const mockFormatDisplayAndWalletAmount = jest.fn()

jest.mock("@app/hooks", () => ({
  useBreez: () => ({ btcWallet: { balance: 1_633_284 } }),
  // checkErrorMessage bails when convertMoneyAmount is unavailable, so the
  // mock must return a callable even though the BTC branch never invokes it.
  usePriceConversion: () => ({
    convertMoneyAmount: (...args: unknown[]) =>
      (mockConvertMoneyAmount as (...a: unknown[]) => unknown)(...args),
  }),
  useDisplayCurrency: () => ({
    formatDisplayAndWalletAmount: (...args: unknown[]) =>
      (mockFormatDisplayAndWalletAmount as (...a: unknown[]) => unknown)(...args),
  }),
  useFormatSats: () => (sats: number) => `${sats} sats`,
}))

afterEach(() => {
  mockConvertMoneyAmount.mockImplementation((amount: MoneyAmountLike) => amount)
  mockFormatDisplayAndWalletAmount.mockReset()
})

jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))

// The amount/note inputs pull in their own hook trees — irrelevant to the
// limit-validation behavior under test.
jest.mock("@app/components/amount-input/amount-input", () => ({
  AmountInput: () => null,
}))
jest.mock("@app/components/note-input", () => ({
  NoteInput: () => null,
}))

const makeBtcPaymentDetail = (
  overrides: Partial<PaymentDetail<WalletCurrency>> = {},
): PaymentDetail<WalletCurrency> =>
  ({
    sendingWalletDescriptor: { id: "btc-wallet-id", currency: WalletCurrency.Btc },
    paymentType: "intraledger",
    canSetAmount: true,
    canSendMax: false,
    isSendingMax: false,
    canSetMemo: false,
    memo: undefined,
    settlementAmount: {
      amount: 1_391_690,
      currency: WalletCurrency.Btc,
      currencyCode: "BTC",
    },
    unitOfAccountAmount: {
      amount: 1_391_690,
      currency: WalletCurrency.Btc,
      currencyCode: "BTC",
    },
    convertMoneyAmount: (amount: unknown) => amount,
    setAmount: jest.fn(),
    ...overrides,
  } as unknown as PaymentDetail<WalletCurrency>)

const renderComponent = (
  paymentDetail: PaymentDetail<WalletCurrency>,
  receiverLimits: { minSats: number; maxSats: number } | null,
) => {
  const setAsyncErrorMessage = jest.fn()
  render(
    <ThemeProvider theme={createTheme()}>
      <DetailAmountNote
        usdWallet={undefined}
        paymentDetail={paymentDetail}
        setPaymentDetail={jest.fn()}
        setAsyncErrorMessage={setAsyncErrorMessage}
        receiverLimits={receiverLimits}
      />
    </ThemeProvider>,
  )
  return { setAsyncErrorMessage }
}

beforeAll(() => {
  loadLocale("en")
})

describe("DetailAmountNote BTC receiver-limit validation", () => {
  it("flags an amount above the receiver's max (the 150k-sat cap regression)", async () => {
    const { setAsyncErrorMessage } = renderComponent(makeBtcPaymentDetail(), {
      minSats: 1,
      maxSats: 150_000,
    })

    await waitFor(() =>
      expect(setAsyncErrorMessage).toHaveBeenCalledWith(
        "The most this recipient can receive per payment is 150000 sats",
      ),
    )
  })

  it("flags an amount below the receiver's min", async () => {
    const paymentDetail = makeBtcPaymentDetail({
      settlementAmount: {
        amount: 5,
        currency: WalletCurrency.Btc,
        currencyCode: "BTC",
      },
    } as Partial<PaymentDetail<WalletCurrency>>)
    const { setAsyncErrorMessage } = renderComponent(paymentDetail, {
      minSats: 10,
      maxSats: 150_000,
    })

    await waitFor(() =>
      expect(setAsyncErrorMessage).toHaveBeenCalledWith(
        "The minimum this recipient can receive is 10 sats",
      ),
    )
  })

  it("clears the error when the amount is within the receiver's limits", async () => {
    const paymentDetail = makeBtcPaymentDetail({
      settlementAmount: {
        amount: 50_000,
        currency: WalletCurrency.Btc,
        currencyCode: "BTC",
      },
    } as Partial<PaymentDetail<WalletCurrency>>)
    const { setAsyncErrorMessage } = renderComponent(paymentDetail, {
      minSats: 1,
      maxSats: 150_000,
    })

    await waitFor(() => expect(setAsyncErrorMessage).toHaveBeenCalledWith(""))
  })

  it("does not flag anything while the receiver's limits are unknown", async () => {
    const { setAsyncErrorMessage } = renderComponent(makeBtcPaymentDetail(), null)

    await waitFor(() => expect(setAsyncErrorMessage).toHaveBeenCalledWith(""))
    expect(setAsyncErrorMessage).not.toHaveBeenCalledWith(
      expect.stringContaining("recipient can receive"),
    )
  })

  it("applies the same validation to lnurl payments from the BTC wallet", async () => {
    const paymentDetail = makeBtcPaymentDetail({
      paymentType: "lnurl",
    } as Partial<PaymentDetail<WalletCurrency>>)
    const { setAsyncErrorMessage } = renderComponent(paymentDetail, {
      minSats: 1,
      maxSats: 150_000,
    })

    await waitFor(() =>
      expect(setAsyncErrorMessage).toHaveBeenCalledWith(
        "The most this recipient can receive per payment is 150000 sats",
      ),
    )
  })
})

// ENG-556, reproduced from production (v0.6.6, USD wallet -> rastafari@strike.me):
// nothing under $1.00 could be sent, and the error named the minimum as "NaN".
//
// LUD-06 bounds are SATS; a cash wallet's settlementAmount is CENTS. Comparing
// them directly read Strike's 100-sat floor as 100 cents, so the app demanded
// $1.00 for a receiver whose real minimum is worth single-digit cents.
//
// DetailAmountNote routes USD and USDT wallets through one branch, so every
// case below runs against both.

// Strike's advertised bounds (minSendable 100_000 msat, maxSendable 16 BTC).
const MIN_SATS = 100
const MAX_SATS = 16_000_000

// A cash wallet's number pad accepts whole cents only, so the bound the
// component enforces has to be a whole cent too — the minimum rounded UP, the
// maximum rounded DOWN, so the quantized bound is one the receiver accepts.
// Every expected bound below is written out rather than recomputed from the
// rate: a test that re-derives the answer with the rule under test cannot
// disagree with it.

// Mirrors the real formatDisplayAndWalletAmount for a cash wallet under a USD
// display currency: same currency on both sides, so the secondary amount is
// dropped and the string is just the display amount. Deliberately not an echo
// of its own input — a mock that repeats what it was handed cannot catch a
// call that hands it the wrong thing.
const formatCents = ({ displayAmount }: { displayAmount: MoneyAmountLike }) =>
  `$${(displayAmount.amount / 100).toFixed(2)}`

// Sats -> cash-wallet cents at a fixed rate, plus the cents -> display-currency
// leg (1:1 for a USD display currency). Keyed on `amount.currency`, never on
// `currencyCode`: the component builds its sat bound with toBtcMoneyAmount,
// whose currencyCode is "BTC".
const makeConvert =
  (centsPerSat: number, walletCurrency: string) =>
  (amount: MoneyAmountLike, currency: string = walletCurrency): MoneyAmountLike => {
    const cents =
      amount.currency === WalletCurrency.Btc ? amount.amount * centsPerSat : amount.amount
    if (currency === "DisplayCurrency") {
      return { amount: cents, currency: "DisplayCurrency", currencyCode: "USD" }
    }
    return { amount: cents, currency, currencyCode: currency }
  }

const makeCashLnurlDetail = ({
  walletCurrency,
  centsPerSat,
  cents,
  minSats = MIN_SATS,
  maxSats = MAX_SATS,
}: {
  walletCurrency: WalletCurrency
  centsPerSat: number
  cents: number
  minSats?: number
  maxSats?: number
}) =>
  ({
    sendingWalletDescriptor: { id: "cash-wallet-id", currency: walletCurrency },
    paymentType: "lnurl",
    canSetAmount: true,
    canSendMax: false,
    isSendingMax: false,
    canSetMemo: false,
    lnurlParams: { min: minSats, max: maxSats },
    settlementAmount: {
      amount: cents,
      currency: walletCurrency,
      currencyCode: walletCurrency,
    },
    unitOfAccountAmount: {
      amount: cents,
      currency: walletCurrency,
      currencyCode: walletCurrency,
    },
    convertMoneyAmount: makeConvert(centsPerSat, walletCurrency),
    setAmount: jest.fn(),
  } as unknown as PaymentDetail<WalletCurrency>)

// Rates where the converted 100-sat floor is not already a whole cent.
const AWKWARD_RATES = [
  // BTC $64,000: 100 sats = 6.4c, a genuinely fractional bound, so the
  // smallest typeable amount that clears it is 7c.
  { label: "a fractional bound (BTC $64,000)", centsPerSat: 0.064, namedCents: 7 },
  // BTC $70,000: 100 sats is exactly 7c, but IEEE-754 computes
  // 7.000000000000001 — a naive ceiling names 8c as the floor of a bound the
  // receiver already accepts at 7c.
  { label: "a float-noise bound (BTC $70,000)", centsPerSat: 0.07, namedCents: 7 },
]

// The message the component settled on. Lives at module scope so the
// per-rate cases below stay inside the repo's max-nested-callbacks limit.
const lastErrorMessage = async (
  setAsyncErrorMessage: jest.Mock<void, [string]>,
): Promise<string> => {
  await waitFor(() => expect(setAsyncErrorMessage).toHaveBeenCalled())
  return setAsyncErrorMessage.mock.calls[setAsyncErrorMessage.mock.calls.length - 1][0]
}

// Plain loops rather than describe.each: this repo's tsconfig pulls in the
// wdio/mocha globals, whose `describe` has no `.each`.
const CASH_WALLETS: WalletCurrency[] = [WalletCurrency.Usd, WalletCurrency.Usdt]

CASH_WALLETS.forEach((walletCurrency) => {
  describe(`DetailAmountNote cash-wallet LNURL bounds (ENG-556) — ${walletCurrency} wallet`, () => {
    // ~$65k/BTC. The mock converts explicitly so the test does not depend on
    // a live rate.
    const CENTS_PER_SAT = 0.065
    // 100 sats = 6.5c, rounded up to a typeable 7c.
    const FLOOR_CENTS = 7
    // 16,000,000 sats = 1,040,000c exactly.
    const CEILING_CENTS = 1_040_000

    // Renders the component with `cents` typed into the pad, against Strike's
    // bounds priced at `centsPerSat`.
    const renderAt = (cents: number, centsPerSat: number = CENTS_PER_SAT) => {
      mockConvertMoneyAmount.mockImplementation(makeConvert(centsPerSat, walletCurrency))
      return renderComponent(
        makeCashLnurlDetail({ walletCurrency, centsPerSat, cents }),
        null,
      )
    }

    beforeEach(() => {
      mockConvertMoneyAmount.mockImplementation(
        makeConvert(CENTS_PER_SAT, walletCurrency),
      )
      mockFormatDisplayAndWalletAmount.mockImplementation(formatCents)
    })

    it("allows 50c to Strike, whose floor is 100 sats (~7c)", async () => {
      // The production report: this was refused outright.
      const { setAsyncErrorMessage } = renderAt(50)

      await waitFor(() => expect(setAsyncErrorMessage).toHaveBeenCalled())
      expect(setAsyncErrorMessage).toHaveBeenLastCalledWith("")
    })

    it("still flags an amount genuinely below the receiver's floor", async () => {
      // 5c is under 100 sats (~7c), so this one really is too small.
      const { setAsyncErrorMessage } = renderAt(5)

      await waitFor(() =>
        expect(setAsyncErrorMessage).toHaveBeenLastCalledWith(
          expect.stringContaining("less than minimum amount"),
        ),
      )
    })

    it("names the minimum in the wallet's own units instead of saying NaN", async () => {
      const { setAsyncErrorMessage } = renderAt(5)

      await waitFor(() => {
        const message = setAsyncErrorMessage.mock.calls.at(-1)?.[0] as string
        expect(message).not.toMatch(/NaN/)
        expect(message).toContain("$0.07")
      })
      // Assert on the arguments, not on a string the mock fabricated: the
      // amount handed to the formatter is the quantized bound in wallet minor
      // units (7c), NOT the raw 100-sat bound.
      expect(mockFormatDisplayAndWalletAmount).toHaveBeenCalledWith(
        expect.objectContaining({
          walletAmount: expect.objectContaining({
            amount: FLOOR_CENTS,
            currency: walletCurrency,
          }),
        }),
      )
    })

    it("flags an amount above the receiver's ceiling", async () => {
      // The max check was equally broken: comparing cents to sats meant it only
      // fired above $160,000 for a 16M-sat ceiling, so it never protected anyone.
      const { setAsyncErrorMessage } = renderAt(2_000_000)

      await waitFor(() =>
        expect(setAsyncErrorMessage).toHaveBeenLastCalledWith(
          expect.stringContaining("greater than maximum amount"),
        ),
      )
    })

    // The bounds themselves. A bounds check whose tests all sit an order of
    // magnitude away from the bound is not a tested bounds check.
    it(`refuses one cent below the quantized floor (${FLOOR_CENTS - 1}c)`, async () => {
      const { setAsyncErrorMessage } = renderAt(FLOOR_CENTS - 1)

      await waitFor(() =>
        expect(setAsyncErrorMessage).toHaveBeenLastCalledWith(
          expect.stringContaining("less than minimum amount"),
        ),
      )
    })

    it(`accepts exactly the quantized floor (${FLOOR_CENTS}c)`, async () => {
      const { setAsyncErrorMessage } = renderAt(FLOOR_CENTS)

      await waitFor(() => expect(setAsyncErrorMessage).toHaveBeenCalled())
      expect(setAsyncErrorMessage).toHaveBeenLastCalledWith("")
    })

    it(`accepts exactly the quantized ceiling (${CEILING_CENTS}c)`, async () => {
      const { setAsyncErrorMessage } = renderAt(CEILING_CENTS)

      await waitFor(() => expect(setAsyncErrorMessage).toHaveBeenCalled())
      expect(setAsyncErrorMessage).toHaveBeenLastCalledWith("")
    })

    it(`refuses one cent above the quantized ceiling (${
      CEILING_CENTS + 1
    }c)`, async () => {
      const { setAsyncErrorMessage } = renderAt(CEILING_CENTS + 1)

      await waitFor(() =>
        expect(setAsyncErrorMessage).toHaveBeenLastCalledWith(
          expect.stringContaining("greater than maximum amount"),
        ),
      )
    })

    it("names a ceiling the user can actually type", async () => {
      const { setAsyncErrorMessage } = renderAt(CEILING_CENTS + 1)

      await waitFor(() => expect(setAsyncErrorMessage).toHaveBeenCalled())
      expect(mockFormatDisplayAndWalletAmount).toHaveBeenCalledWith(
        expect.objectContaining({
          walletAmount: expect.objectContaining({
            amount: CEILING_CENTS,
            currency: walletCurrency,
          }),
        }),
      )
    })

    // The regression test for the dead end: at a rate where the bound is not a
    // whole cent, the amount NAMED in the error must itself be accepted when
    // the user re-enters it. Left fractional, the validator refused anything
    // under 6.4c while the message said "$0.06" — refuse, retype, refuse.
    AWKWARD_RATES.forEach(({ label, centsPerSat, namedCents }) => {
      const namedDollars = `$${(namedCents / 100).toFixed(2)}`

      it(`names ${namedDollars} as the minimum with ${label}`, async () => {
        const { setAsyncErrorMessage } = renderAt(namedCents - 1, centsPerSat)

        expect(await lastErrorMessage(setAsyncErrorMessage)).toContain(namedDollars)
        expect(mockFormatDisplayAndWalletAmount).toHaveBeenCalledWith(
          expect.objectContaining({
            walletAmount: expect.objectContaining({ amount: namedCents }),
          }),
        )
      })

      it(`accepts ${namedDollars} when re-entered, with ${label}`, async () => {
        const { setAsyncErrorMessage } = renderAt(namedCents, centsPerSat)

        expect(await lastErrorMessage(setAsyncErrorMessage)).toBe("")
      })
    })
  })
})
