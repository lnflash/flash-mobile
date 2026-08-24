import { WalletCurrency } from "../../app/graphql/generated"
import { shouldDiscloseFeeFromAmount } from "../../app/components/send-flow/fee-from-amount.logic"

const base = {
  paymentType: "lightning",
  sendingWalletCurrency: WalletCurrency.Usd,
  feeStatus: "set" as const,
  feeAmount: 0,
}

describe("shouldDiscloseFeeFromAmount", () => {
  it("discloses on the repro: external USD send, probed fee of zero", () => {
    // #694: $1.10 sent, "$0.00" fee displayed, $1.07 delivered. The probed
    // zero is the untrustworthy case — IBEX deducts the real routing fee from
    // the amount on these routes and its pre-send estimate says nothing.
    expect(shouldDiscloseFeeFromAmount(base)).toBe(true)
    expect(
      shouldDiscloseFeeFromAmount({
        ...base,
        sendingWalletCurrency: WalletCurrency.Usdt,
      }),
    ).toBe(true)
  })

  it("stays silent when the probe returned a real nonzero fee", () => {
    // A priced fee is already on screen; the caveat would dilute it.
    expect(shouldDiscloseFeeFromAmount({ ...base, feeAmount: 3 })).toBe(false)
  })

  it("stays silent on intraledger — free is TRUE there, and crying wolf teaches users to ignore the caveat", () => {
    expect(shouldDiscloseFeeFromAmount({ ...base, paymentType: "intraledger" })).toBe(
      false,
    )
  })

  it("stays silent for BTC-wallet sends — their probes price the actual route", () => {
    // A zero from the BTC fee probe means a genuinely free route (e.g. direct
    // channel), not an IBEX shrug.
    expect(
      shouldDiscloseFeeFromAmount({
        ...base,
        sendingWalletCurrency: WalletCurrency.Btc,
      }),
    ).toBe(false)
  })

  it("stays silent while loading/error/unset — those states carry their own caveats", () => {
    for (const feeStatus of ["loading", "error", "unset"] as const) {
      expect(shouldDiscloseFeeFromAmount({ ...base, feeStatus })).toBe(false)
    }
  })

  it("stays silent when the amount is undefined — that is the error path, not a probed zero", () => {
    expect(shouldDiscloseFeeFromAmount({ ...base, feeAmount: undefined })).toBe(false)
  })
})
