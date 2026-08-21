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
const mockFormatMoneyAmount = jest.fn()

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
    formatMoneyAmount: (...args: unknown[]) =>
      (mockFormatMoneyAmount as (...a: unknown[]) => unknown)(...args),
  }),
  useFormatSats: () => (sats: number) => `${sats} sats`,
}))

afterEach(() => {
  mockConvertMoneyAmount.mockImplementation((amount: MoneyAmountLike) => amount)
  mockFormatDisplayAndWalletAmount.mockReset()
  mockFormatMoneyAmount.mockReset()
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

// The bound is ENFORCED in sats — the unit the receiver checks and the unit
// the request is built in. It is QUOTED in whole minor units of whatever the
// number pad is denominated in, rounded inward, so the amount the message
// names is one the pad can produce and the receiver accepts. Every expected
// bound below is written out rather than recomputed from the rate: a test
// that re-derives the answer with the rule under test cannot disagree with it.

// Currency symbols, mirroring use-display-currency's dictionary for the two
// display currencies exercised here.
const SYMBOLS: Record<string, string> = { USD: "$", JMD: "J$" }

// Mirrors use-display-currency's formatMoneyAmount: minor units -> major
// units under the currency's own symbol, plus the "USD" suffix a USDT amount
// carries (currencyInfo maps Usdt onto the USD symbol AND the USD code, which
// is what makes the duplication below possible). Deliberately not an echo of
// its own input — a mock that repeats what it was handed cannot catch a call
// that hands it the wrong thing.
const formatAmount = ({ moneyAmount }: { moneyAmount: MoneyAmountLike }): string => {
  const isUsdt = moneyAmount.currency === WalletCurrency.Usdt
  const code = isUsdt ? "USD" : moneyAmount.currencyCode
  const formatted = `${SYMBOLS[code] ?? code}${(moneyAmount.amount / 100).toFixed(2)}`
  return isUsdt ? `${formatted} USD` : formatted
}

// Reimplements use-display-currency's secondary-amount rule rather than
// reading displayAmount alone. getSecondaryAmountIfCurrencyIsDifferent
// compares walletAmount.currency ("USDT") against displayAmount.currencyCode
// ("USD"), so a USDT wallet under a USD display currency counts as "different"
// and the real hook appends a second copy of the same figure —
// "$0.07 ($0.07 USD)". A mock that dropped the secondary unconditionally could
// never show that.
const formatDisplayAndWallet = ({
  primaryAmount,
  displayAmount,
  walletAmount,
}: {
  primaryAmount?: MoneyAmountLike
  displayAmount: MoneyAmountLike
  walletAmount: MoneyAmountLike
}): string => {
  const primary = primaryAmount ?? displayAmount
  if (walletAmount.currency === displayAmount.currencyCode) {
    return formatAmount({ moneyAmount: primary })
  }
  const secondary = primary.currency === "DisplayCurrency" ? walletAmount : displayAmount
  return `${formatAmount({ moneyAmount: primary })} (${formatAmount({
    moneyAmount: secondary,
  })})`
}

// A three-way converter: sats <-> cash-wallet cents <-> display-currency minor
// units. Keyed on `amount.currency`, never on `currencyCode`: the component
// builds its sat bound with toBtcMoneyAmount, whose currencyCode is "BTC".
//
// Mirrors use-price-conversion's asymmetry exactly — BTC targets are rounded
// to a whole sat (line 112-114 there), every other target is left FRACTIONAL.
// That asymmetry is the whole point: with the pad in display currency, a cash
// wallet's settlement amount is a fraction of a cent, so any check that
// quantizes the bound into whole cents refuses valid amounts.
type ConversionRates = {
  centsPerSat: number
  walletCurrency: string
  /** Display-currency minor units per cash-wallet cent. 1 for a USD display. */
  displayMinorPerCent?: number
  displayCode?: string
}

const makeConvert =
  ({
    centsPerSat,
    walletCurrency,
    displayMinorPerCent = 1,
    displayCode = "USD",
  }: ConversionRates) =>
  (amount: MoneyAmountLike, currency: string = walletCurrency): MoneyAmountLike => {
    let cents: number
    if (amount.currency === WalletCurrency.Btc) {
      cents = amount.amount * centsPerSat
    } else if (amount.currency === "DisplayCurrency") {
      cents = amount.amount / displayMinorPerCent
    } else {
      cents = amount.amount
    }

    if (currency === WalletCurrency.Btc) {
      return {
        amount: Math.round(cents / centsPerSat),
        currency: WalletCurrency.Btc,
        currencyCode: "BTC",
      }
    }
    if (currency === "DisplayCurrency") {
      return {
        amount: cents * displayMinorPerCent,
        currency: "DisplayCurrency",
        currencyCode: displayCode,
      }
    }
    return { amount: cents, currency, currencyCode: currency }
  }

const makeCashLnurlDetail = ({
  walletCurrency,
  centsPerSat,
  cents,
  displayMinorUnits,
  displayMinorPerCent = 1,
  displayCode = "USD",
  minSats = MIN_SATS,
  maxSats = MAX_SATS,
}: {
  walletCurrency: WalletCurrency
  centsPerSat: number
  /** Pad entry in the wallet's own minor units. */
  cents?: number
  /** Pad entry in display-currency minor units — the app's DEFAULT pad. */
  displayMinorUnits?: number
  displayMinorPerCent?: number
  displayCode?: string
  minSats?: number
  maxSats?: number
}) => {
  const convertMoneyAmount = makeConvert({
    centsPerSat,
    walletCurrency,
    displayMinorPerCent,
    displayCode,
  })
  const unitOfAccountAmount: MoneyAmountLike =
    displayMinorUnits === undefined
      ? {
          amount: cents ?? 0,
          currency: walletCurrency,
          currencyCode: walletCurrency,
        }
      : {
          amount: displayMinorUnits,
          currency: "DisplayCurrency",
          currencyCode: displayCode,
        }

  return {
    sendingWalletDescriptor: { id: "cash-wallet-id", currency: walletCurrency },
    paymentType: "lnurl",
    canSetAmount: true,
    canSendMax: false,
    isSendingMax: false,
    canSetMemo: false,
    lnurlParams: { min: minSats, max: maxSats },
    // Derived, never hand-written: the app computes settlementAmount from the
    // pad entry through this same converter, so a display-currency pad yields
    // a FRACTIONAL cent here exactly as it does on device.
    settlementAmount: convertMoneyAmount(unitOfAccountAmount, walletCurrency),
    unitOfAccountAmount,
    convertMoneyAmount,
    setAmount: jest.fn(),
  } as unknown as PaymentDetail<WalletCurrency>
}

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
      mockConvertMoneyAmount.mockImplementation(
        makeConvert({ centsPerSat, walletCurrency }),
      )
      return renderComponent(
        makeCashLnurlDetail({ walletCurrency, centsPerSat, cents }),
        null,
      )
    }

    beforeEach(() => {
      mockConvertMoneyAmount.mockImplementation(
        makeConvert({ centsPerSat: CENTS_PER_SAT, walletCurrency }),
      )
      mockFormatDisplayAndWalletAmount.mockImplementation(formatDisplayAndWallet)
      mockFormatMoneyAmount.mockImplementation(formatAmount)
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

    it("names the minimum in the pad's own units instead of saying NaN", async () => {
      const { setAsyncErrorMessage } = renderAt(5)

      await waitFor(() => {
        const message = setAsyncErrorMessage.mock.calls.at(-1)?.[0] as string
        expect(message).not.toMatch(/NaN/)
        expect(message).toContain("$0.07")
      })
      // Assert on the arguments, not on a string the mock fabricated: the
      // amount handed to the formatter is the quantized bound in the pad's
      // minor units (7c), NOT the raw 100-sat bound.
      expect(mockFormatMoneyAmount).toHaveBeenCalledWith(
        expect.objectContaining({
          moneyAmount: expect.objectContaining({
            amount: FLOOR_CENTS,
            currency: walletCurrency,
          }),
        }),
      )
    })

    // A USDT wallet amount renders as USD, so under a USD display currency the
    // hook's "currencies differ" test is true by name only: left to it, the
    // message printed the figure twice — "less than minimum amount $0.07
    // ($0.07 USD)".
    it("names the bound once, not twice", async () => {
      const { setAsyncErrorMessage } = renderAt(5)

      const message = await lastErrorMessage(setAsyncErrorMessage)
      expect(message.match(/\$0\.07/g)).toHaveLength(1)
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
      expect(mockFormatMoneyAmount).toHaveBeenCalledWith(
        expect.objectContaining({
          moneyAmount: expect.objectContaining({
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
        expect(mockFormatMoneyAmount).toHaveBeenCalledWith(
          expect.objectContaining({
            moneyAmount: expect.objectContaining({ amount: namedCents }),
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

// The app's DEFAULT pad. send-bitcoin-details-screen seeds the amount with
// zeroDisplayAmount, so the number pad denominates in DISPLAY currency — not
// in the wallet's cents — and use-price-conversion only rounds when the target
// is BTC. With a non-USD display currency the cash wallet's settlement amount
// is therefore a FRACTIONAL cent: the dimension every case above avoids, and
// the one where a bound quantized into whole cents refuses payments the
// receiver would have accepted.
//
// Rates: BTC $65,000 (0.065 cents per sat) and J$158.5 per US$1 (158.5
// JMD-minor per cent), so one sat is 10.3025 JMD-minor and Strike's 100-sat
// floor is J$10.3025 — quoted as J$10.31, the smallest typeable entry that
// clears it.
const JMD_CENTS_PER_SAT = 0.065
const JMD_MINOR_PER_CENT = 158.5
const JMD_FLOOR_MINOR = 1031
const JMD_CEILING_MINOR = 164_840_000

CASH_WALLETS.forEach((walletCurrency) => {
  describe(`DetailAmountNote LNURL bounds, JMD display-currency pad — ${walletCurrency} wallet`, () => {
    // Renders with `displayMinorUnits` typed into a display-currency pad.
    const renderAt = (displayMinorUnits: number) => {
      const paymentDetail = makeCashLnurlDetail({
        walletCurrency,
        centsPerSat: JMD_CENTS_PER_SAT,
        displayMinorUnits,
        displayMinorPerCent: JMD_MINOR_PER_CENT,
        displayCode: "JMD",
      })
      return { paymentDetail, ...renderComponent(paymentDetail, null) }
    }

    beforeEach(() => {
      mockConvertMoneyAmount.mockImplementation(
        makeConvert({
          centsPerSat: JMD_CENTS_PER_SAT,
          walletCurrency,
          displayMinorPerCent: JMD_MINOR_PER_CENT,
          displayCode: "JMD",
        }),
      )
      mockFormatDisplayAndWalletAmount.mockImplementation(formatDisplayAndWallet)
      mockFormatMoneyAmount.mockImplementation(formatAmount)
    })

    it("allows J$11.00, which is 107 sats against a 100-sat floor", async () => {
      const { setAsyncErrorMessage, paymentDetail } = renderAt(1100)

      // The exact shape a whole-cent bound cannot survive: the settlement
      // amount is a FRACTIONAL 6.94c, under the 7c a 100-sat floor rounds up
      // to, while the sats the request is actually built with clear that floor
      // with room to spare. Enforcing on cents refused this payment.
      expect(paymentDetail.settlementAmount.amount).toBeGreaterThan(6)
      expect(paymentDetail.settlementAmount.amount).toBeLessThan(7)

      await waitFor(() => expect(setAsyncErrorMessage).toHaveBeenCalled())
      expect(setAsyncErrorMessage).toHaveBeenLastCalledWith("")
    })

    it("still refuses an entry genuinely below the floor", async () => {
      // J$10.25 is 99 sats once rounded — one short of the 100-sat floor.
      const { setAsyncErrorMessage } = renderAt(1025)

      expect(await lastErrorMessage(setAsyncErrorMessage)).toContain(
        "less than minimum amount",
      )
    })

    it("names the floor in display units, with the wallet amount alongside", async () => {
      const { setAsyncErrorMessage } = renderAt(1025)

      expect(await lastErrorMessage(setAsyncErrorMessage)).toContain("J$10.31 ($0.07")
      expect(mockFormatDisplayAndWalletAmount).toHaveBeenCalledWith(
        expect.objectContaining({
          primaryAmount: expect.objectContaining({
            amount: JMD_FLOOR_MINOR,
            currency: "DisplayCurrency",
            currencyCode: "JMD",
          }),
        }),
      )
    })

    // The display-space twin of the awkward-rate pair above: the amount the
    // message NAMES has to be accepted when the user re-enters it, or the
    // refusal is a dead end.
    it("accepts the floor it named when the user re-enters it", async () => {
      const { setAsyncErrorMessage } = renderAt(JMD_FLOOR_MINOR)

      await waitFor(() => expect(setAsyncErrorMessage).toHaveBeenCalled())
      expect(setAsyncErrorMessage).toHaveBeenLastCalledWith("")
    })

    it("names a ceiling in display units", async () => {
      const { setAsyncErrorMessage } = renderAt(200_000_000)

      expect(await lastErrorMessage(setAsyncErrorMessage)).toContain(
        "greater than maximum amount",
      )
      expect(mockFormatDisplayAndWalletAmount).toHaveBeenCalledWith(
        expect.objectContaining({
          primaryAmount: expect.objectContaining({
            amount: JMD_CEILING_MINOR,
            currency: "DisplayCurrency",
            currencyCode: "JMD",
          }),
        }),
      )
    })

    it("accepts the ceiling it named when the user re-enters it", async () => {
      const { setAsyncErrorMessage } = renderAt(JMD_CEILING_MINOR)

      await waitFor(() => expect(setAsyncErrorMessage).toHaveBeenCalled())
      expect(setAsyncErrorMessage).toHaveBeenLastCalledWith("")
    })

    // The amount toggle (amount-input-screen) flips the pad into the wallet's
    // own minor units while the display currency stays JMD. That is the only
    // combination where describeBound hands formatDisplayAndWalletAmount a
    // WALLET-currency primaryAmount, selecting the other formatting branch —
    // and for a JMD-display Flash user, flipping the pad is routine.
    it("names a typeable floor when the pad is toggled into wallet units", async () => {
      const paymentDetail = makeCashLnurlDetail({
        walletCurrency,
        centsPerSat: JMD_CENTS_PER_SAT,
        // 6c is under the 100-sat floor (~6.5c), so this refuses and names it.
        cents: 6,
        displayMinorPerCent: JMD_MINOR_PER_CENT,
        displayCode: "JMD",
      })
      const { setAsyncErrorMessage } = renderComponent(paymentDetail, null)

      await waitFor(() =>
        expect(setAsyncErrorMessage).toHaveBeenLastCalledWith(
          expect.stringContaining("less than minimum amount"),
        ),
      )
      const message = setAsyncErrorMessage.mock.calls.at(-1)?.[0] as string
      expect(message).not.toMatch(/NaN/)
      expect(message).not.toMatch(/undefined/)
    })

    it("accepts the wallet-unit floor it named when the user re-enters it", async () => {
      // The round-trip that matters: whatever the message quotes must itself
      // be accepted, or the user is sent back and forth with no way through.
      const paymentDetail = makeCashLnurlDetail({
        walletCurrency,
        centsPerSat: JMD_CENTS_PER_SAT,
        cents: 7,
        displayMinorPerCent: JMD_MINOR_PER_CENT,
        displayCode: "JMD",
      })
      const { setAsyncErrorMessage } = renderComponent(paymentDetail, null)

      await waitFor(() => expect(setAsyncErrorMessage).toHaveBeenCalled())
      expect(setAsyncErrorMessage).toHaveBeenLastCalledWith("")
    })
  })
})
