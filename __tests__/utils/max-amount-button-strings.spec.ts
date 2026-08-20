import type { TranslationFunctions } from "@app/i18n/i18n-types"
import { maxAmountButtonStrings } from "@app/screens/send-bitcoin-screen/max-amount-button-strings"
import { breezFeeErrorMessage } from "@app/utils/breez-sdk/fee-error-message"

const LL = {
  AmountInputScreen: {
    maxNoteIntraledger: jest.fn(() => "No fee between Flash accounts."),
    maxNoteFeeReserved: jest.fn(
      ({ fee }: { fee: string }) => `~${fee} reserved for the network fee.`,
    ),
    maxNoteRecipientCap: jest.fn(
      ({ max }: { max: string }) => `Recipient can receive at most ${max}.`,
    ),
    maxNoteFeeUnknown: jest.fn(() => "Couldn't estimate the fee."),
    maxNoteFeeTooLarge: jest.fn(() => "The fee is larger than your balance."),
  },
  SendBitcoinScreen: {
    minReceiveAmountError: jest.fn(
      ({ amount }: { amount: string }) =>
        `The minimum this recipient can receive is ${amount}`,
    ),
  },
} as unknown as TranslationFunctions

// Stands in for useFormatSats: display currency plus a separated sat count.
const formatSats = (sats: number) =>
  `$${((sats * 65) / 100_000).toFixed(2)} (${sats.toLocaleString("en-US")} sats)`

describe("maxAmountButtonStrings", () => {
  it("formats the receiver's minimum through formatSats", () => {
    // A hand-rolled `${minSats} sats` gives "1000 sats": unlocalized, no
    // thousands separator, no display-currency half.
    expect(maxAmountButtonStrings(LL, formatSats).recipientMin(1_000)).toBe(
      "The minimum this recipient can receive is $0.65 (1,000 sats)",
    )
  })

  // The chip note and the validation banner are one sentence about one limit,
  // and on the BTC LNURL path both can be on screen at once — the chip note
  // under the pad, breezFeeErrorMessage's banner two rows down. Two renderings
  // of the same number read as two different limits.
  it("renders the same sentence as the fee-error banner for the same limit", () => {
    expect(maxAmountButtonStrings(LL, formatSats).recipientMin(1_000)).toBe(
      breezFeeErrorMessage({ kind: "amount-below-min", minSats: 1_000 }, LL, formatSats),
    )
  })

  it("passes the remaining notes through to their own keys", () => {
    const strings = maxAmountButtonStrings(LL, formatSats)

    expect(strings.intraledger()).toBe("No fee between Flash accounts.")
    expect(strings.feeReserved("$0.30")).toBe("~$0.30 reserved for the network fee.")
    expect(strings.recipientCap("$40.00")).toBe("Recipient can receive at most $40.00.")
    expect(strings.feeUnknown()).toBe("Couldn't estimate the fee.")
    expect(strings.feeTooLarge()).toBe("The fee is larger than your balance.")
  })
})
