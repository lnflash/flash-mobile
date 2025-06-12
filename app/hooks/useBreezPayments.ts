import { Payment, PaymentDetailsVariant } from "@breeztech/react-native-breez-sdk-liquid"
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
  const settlementDisplayAmount = convertMoneyAmount(
    toBtcMoneyAmount(txDetails.amountSat),
    WalletCurrency.Usd,
  ).amount
  const settlementDisplayFee = convertMoneyAmount(
    toBtcMoneyAmount(txDetails.feesSat),
    WalletCurrency.Usd,
  ).amount

  return {
    id: txDetails.txId || "",
    direction: txDetails.paymentType === "receive" ? "RECEIVE" : "SEND",
    status: txDetails.status.toUpperCase(),
    memo: txDetails.details.description,
    settlementAmount: txDetails.amountSat,
    settlementCurrency: "BTC",
    settlementDisplayAmount: (settlementDisplayAmount / 100).toString(),
    settlementDisplayCurrency: "USD",
    settlementVia: {
      __typename: "SettlementViaLn",
      paymentSecret:
        txDetails.details.type === PaymentDetailsVariant.LIGHTNING
          ? txDetails.details.preimage
          : "",
    },
    createdAt: txDetails.timestamp,
    settlementFee: txDetails.feesSat,
    settlementDisplayFee: (settlementDisplayFee / 100).toString(),
    settlementPrice: {
      base: txDetails.amountSat,
      offset: 0,
      currencyUnit: "SAT",
      formattedAmount: "SAT",
      __typename: "PriceOfOneSettlementMinorUnitInDisplayMinorUnit",
    },
    initiationVia: {
      __typename: "InitiationViaLn",
      paymentHash:
        txDetails.details.type === PaymentDetailsVariant.LIGHTNING
          ? txDetails.details.paymentHash || ""
          : "",
    },
    __typename: "Transaction",
  } as any
}
