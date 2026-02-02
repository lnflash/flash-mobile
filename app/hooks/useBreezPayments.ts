import { Payment, PaymentDetails_Tags, PaymentType } from "@app/utils/breez-sdk-spark"
import { ConvertMoneyAmount } from "@app/screens/send-bitcoin-screen/payment-details"
import { WalletCurrency } from "@app/graphql/generated"
import { toBtcMoneyAmount } from "@app/types/amounts"

export const formatPaymentsBreezSDK = ({
  txDetails,
  convertMoneyAmount,
}: {
  txDetails: Payment
  convertMoneyAmount: ConvertMoneyAmount
}) => {
  // Convert U128 (bigint) to number for amounts
  const amountSat = Number(txDetails.amount)
  const feesSat = Number(txDetails.fees)

  const settlementDisplayAmount = convertMoneyAmount(
    toBtcMoneyAmount(amountSat),
    WalletCurrency.Usd,
  ).amount
  const settlementDisplayFee = convertMoneyAmount(
    toBtcMoneyAmount(feesSat),
    WalletCurrency.Usd,
  ).amount

  // Extract description from payment details
  let description = ""
  let preimage = ""
  let paymentHash = ""

  if (txDetails.details?.tag === PaymentDetails_Tags.Lightning) {
    description = txDetails.details.inner.description || ""
    preimage = txDetails.details.inner.preimage || ""
    paymentHash = txDetails.details.inner.paymentHash || ""
  }

  return {
    id: txDetails.id || "",
    direction: txDetails.paymentType === PaymentType.Receive ? "RECEIVE" : "SEND",
    status: PaymentType[txDetails.status].toUpperCase(),
    memo: description,
    settlementAmount: amountSat,
    settlementCurrency: "BTC",
    settlementDisplayAmount: (settlementDisplayAmount / 100).toString(),
    settlementDisplayCurrency: "USD",
    settlementVia: {
      __typename: "SettlementViaLn",
      paymentSecret: preimage,
    },
    createdAt: Number(txDetails.timestamp),
    settlementFee: feesSat,
    settlementDisplayFee: (settlementDisplayFee / 100).toString(),
    settlementPrice: {
      base: amountSat,
      offset: 0,
      currencyUnit: "SAT",
      formattedAmount: "SAT",
      __typename: "PriceOfOneSettlementMinorUnitInDisplayMinorUnit",
    },
    initiationVia: {
      __typename: "InitiationViaLn",
      paymentHash: paymentHash,
    },
    __typename: "Transaction",
  } as any
}
