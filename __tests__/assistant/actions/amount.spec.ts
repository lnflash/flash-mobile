import {
  isRateDependent,
  requestedAmount,
} from "@app/assistant/registry/actions/shared/amount"
import { ToolReplyError } from "@app/assistant/registry/actions/shared/errors"
import { WalletCurrency } from "@app/graphql/generated"
import { DisplayCurrency, toBtcMoneyAmount, toUsdMoneyAmount } from "@app/types/amounts"
import { fakeDisplay } from "../fakes"

const JMD = { displayCurrency: "JMD", display: fakeDisplay(2) }
const USD = { displayCurrency: "USD", display: fakeDisplay(2) }

const replyOf = (run: () => unknown): string | undefined => {
  try {
    run()
  } catch (err) {
    if (err instanceof ToolReplyError) return err.replyKey
    throw err
  }
  return undefined
}

describe("requestedAmount (the bare-amount rule, tool side)", () => {
  it("reads an amount in the wallet currency the call names", () => {
    expect(requestedAmount({ amount: "5", currency: "USD" }, JMD)).toEqual(
      toUsdMoneyAmount(500),
    )
    expect(requestedAmount({ amount: "0.00021", currency: "BTC" }, JMD)).toEqual(
      toBtcMoneyAmount(21_000),
    )
  })

  it("reads an amount with no unit in the display currency, with its places", () => {
    expect(requestedAmount({ amount: "500" }, JMD)).toEqual({
      amount: 50_000,
      currency: DisplayCurrency,
      currencyCode: "JMD",
    })
    expect(
      requestedAmount(
        { amount: "500" },
        { displayCurrency: "XAF", display: fakeDisplay(0) },
      ),
    ).toEqual({ amount: 500, currency: DisplayCurrency, currencyCode: "XAF" })
  })

  it("reads a bare amount in a USD display currency as USD itself, with no rate", () => {
    expect(requestedAmount({ amount: "5" }, USD)).toEqual(toUsdMoneyAmount(500))
  })

  it("has no amount when the call has none", () => {
    expect(requestedAmount({}, JMD)).toBeUndefined()
  })

  it("refuses a unit with no amount, an amount it cannot read exactly, and zero", () => {
    expect(replyOf(() => requestedAmount({ currency: "USD" }, JMD))).toBe(
      "Assistant.invalidArguments",
    )
    expect(
      replyOf(() => requestedAmount({ amount: "5.001", currency: "USD" }, JMD)),
    ).toBe("Assistant.invalidArguments")
    expect(replyOf(() => requestedAmount({ amount: "12.345" }, JMD))).toBe(
      "Assistant.invalidArguments",
    )
    expect(replyOf(() => requestedAmount({ amount: "0" }, JMD))).toBe(
      "Assistant.amountTooSmall",
    )
  })
})

describe("isRateDependent", () => {
  it("is false when the amount is in the settlement currency, or USD and USDT", () => {
    expect(isRateDependent(toUsdMoneyAmount(500), WalletCurrency.Usd)).toBe(false)
    expect(isRateDependent(toUsdMoneyAmount(500), WalletCurrency.Usdt)).toBe(false)
    expect(isRateDependent(toBtcMoneyAmount(1), WalletCurrency.Btc)).toBe(false)
  })

  it("is true across BTC and cash, and from a display currency", () => {
    expect(isRateDependent(toUsdMoneyAmount(500), WalletCurrency.Btc)).toBe(true)
    expect(isRateDependent(toBtcMoneyAmount(1), WalletCurrency.Usd)).toBe(true)
    expect(
      isRateDependent(
        { amount: 1, currency: DisplayCurrency, currencyCode: "JMD" },
        WalletCurrency.Usd,
      ),
    ).toBe(true)
  })
})
