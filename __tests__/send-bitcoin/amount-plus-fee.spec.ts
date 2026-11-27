// Contract test for work order 04 (flash-onchain-send). Written by Claude; the
// worker makes it pass without changing it.
//
// The confirm screen's last check before a send: the amount plus its fee
// against the balance of the wallet that pays. Sats for the Bitcoin Account;
// cents for the Cash Account, in USD and in USDT alike (it never ran for USDT).
import { WalletCurrency } from "@app/graphql/generated"
import { checkAmountPlusFee } from "@app/screens/send-bitcoin-screen/amount-plus-fee"
import { toBtcMoneyAmount, toUsdMoneyAmount, toWalletAmount } from "@app/types/amounts"

const usdt = (cents: number | undefined) =>
  toWalletAmount({ amount: cents, currency: WalletCurrency.Usdt })

describe("checkAmountPlusFee", () => {
  it("checks a USDT Cash Account send: one cent over the balance does not fit", () => {
    expect(
      checkAmountPlusFee({
        settlementAmount: usdt(1_000),
        feeAmount: usdt(120),
        cashBalanceCents: 1_119,
      }),
    ).toBe("overCashBalance")
    expect(
      checkAmountPlusFee({
        settlementAmount: usdt(1_000),
        feeAmount: usdt(120),
        cashBalanceCents: 1_120,
      }),
    ).toBe("fits")
  })

  it("checks a USD Cash Account send the same way", () => {
    expect(
      checkAmountPlusFee({
        settlementAmount: toUsdMoneyAmount(1_000),
        feeAmount: toUsdMoneyAmount(120),
        cashBalanceCents: 1_119,
      }),
    ).toBe("overCashBalance")
    expect(
      checkAmountPlusFee({
        settlementAmount: toUsdMoneyAmount(1_000),
        feeAmount: toUsdMoneyAmount(120),
        cashBalanceCents: 1_120,
      }),
    ).toBe("fits")
  })

  it("checks a Bitcoin Account send in sats against the Bitcoin balance only", () => {
    expect(
      checkAmountPlusFee({
        settlementAmount: toBtcMoneyAmount(6_000),
        feeAmount: toBtcMoneyAmount(810),
        btcBalanceSats: 6_809,
        cashBalanceCents: 1_000_000,
      }),
    ).toBe("overBtcBalance")
    expect(
      checkAmountPlusFee({
        settlementAmount: toBtcMoneyAmount(6_000),
        feeAmount: toBtcMoneyAmount(810),
        btcBalanceSats: 6_810,
      }),
    ).toBe("fits")
  })

  it("checks a USDT send against the Cash balance, never the Bitcoin one", () => {
    expect(
      checkAmountPlusFee({
        settlementAmount: usdt(1_000),
        feeAmount: usdt(120),
        btcBalanceSats: 1_000_000,
        cashBalanceCents: 1_000,
      }),
    ).toBe("overCashBalance")
  })

  it("counts a fee that is not there as nothing", () => {
    expect(
      checkAmountPlusFee({ settlementAmount: usdt(1_000), cashBalanceCents: 1_000 }),
    ).toBe("fits")
    expect(
      checkAmountPlusFee({
        settlementAmount: usdt(1_000),
        feeAmount: null,
        cashBalanceCents: 1_000,
      }),
    ).toBe("fits")
  })

  it("does not fit a fee that could not be read", () => {
    expect(
      checkAmountPlusFee({
        settlementAmount: usdt(1_000),
        feeAmount: usdt(undefined),
        cashBalanceCents: 1_000_000,
      }),
    ).toBe("overCashBalance")
  })

  it("does not fit while the balance has not been read", () => {
    expect(checkAmountPlusFee({ settlementAmount: usdt(1) })).toBe("overCashBalance")
    expect(
      checkAmountPlusFee({ settlementAmount: usdt(1), cashBalanceCents: null }),
    ).toBe("overCashBalance")
    expect(checkAmountPlusFee({ settlementAmount: toBtcMoneyAmount(1) })).toBe(
      "overBtcBalance",
    )
  })

  it("leaves a send of the whole balance unchecked", () => {
    expect(
      checkAmountPlusFee({
        settlementAmount: usdt(1_000),
        feeAmount: usdt(120),
        cashBalanceCents: 1,
        isSendingMax: true,
      }),
    ).toBe("unchecked")
  })
})
