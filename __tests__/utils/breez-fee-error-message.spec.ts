import { breezFeeErrorMessage } from "@app/utils/breez-sdk/fee-error-message"
import { BreezFeeError } from "@app/utils/breez-sdk/fee-errors"
import type { TranslationFunctions } from "@app/i18n/i18n-types"

const LL = {
  SendBitcoinScreen: {
    minReceiveAmountError: jest.fn(
      ({ amount }: { amount: string }) => `min is ${amount}`,
    ),
    maxReceiveAmountError: jest.fn(
      ({ amount }: { amount: string }) => `max is ${amount}`,
    ),
    insufficientBalanceForFee: jest.fn(() => "insufficient balance"),
    feeFetchNetworkError: jest.fn(() => "network problem"),
    feeFetchFailed: jest.fn(() => "fee fetch failed"),
  },
} as unknown as TranslationFunctions

const formatSats = (sats: number) => `${sats} sats`

describe("breezFeeErrorMessage", () => {
  it("formats the receiver max limit into the message", () => {
    const err: BreezFeeError = { kind: "amount-above-max", maxSats: 150_000 }
    expect(breezFeeErrorMessage(err, LL, formatSats)).toBe("max is 150000 sats")
  })

  it("formats the receiver min limit into the message", () => {
    const err: BreezFeeError = { kind: "amount-below-min", minSats: 10 }
    expect(breezFeeErrorMessage(err, LL, formatSats)).toBe("min is 10 sats")
  })

  it("mentions balance only for insufficient-funds errors", () => {
    const err: BreezFeeError = { kind: "insufficient-funds", message: "raw" }
    expect(breezFeeErrorMessage(err, LL, formatSats)).toBe("insufficient balance")
  })

  it("maps network errors to the connectivity message", () => {
    const err: BreezFeeError = { kind: "network", message: "raw" }
    expect(breezFeeErrorMessage(err, LL, formatSats)).toBe("network problem")
  })

  it("maps sdk and unsupported errors to the generic failure message", () => {
    expect(breezFeeErrorMessage({ kind: "sdk", message: "raw" }, LL, formatSats)).toBe(
      "fee fetch failed",
    )
    expect(
      breezFeeErrorMessage({ kind: "unsupported", message: "raw" }, LL, formatSats),
    ).toBe("fee fetch failed")
  })
})
