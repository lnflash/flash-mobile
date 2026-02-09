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

  const { details } = txDetails

  // Extract Bitcoin-specific details with proper type narrowing
  const isBitcoinVariant = details.type === PaymentDetailsVariant.BITCOIN
  const bitcoinDetails = isBitcoinVariant ? details : null
  const swapId = bitcoinDetails?.swapId
  const bitcoinAddress = bitcoinDetails?.bitcoinAddress
  const lockupTxId = bitcoinDetails?.lockupTxId
  const claimTxId = bitcoinDetails?.claimTxId
  const bitcoinExpirationBlockheight = bitcoinDetails?.bitcoinExpirationBlockheight
  const swapperFeesSat = isBitcoinVariant ? txDetails.swapperFeesSat : undefined

  // Extract Lightning-specific details with proper type narrowing
  const isLightningVariant = details.type === PaymentDetailsVariant.LIGHTNING
  const lightningDetails = isLightningVariant ? details : null
  const preimage = lightningDetails?.preimage ?? ""
  const paymentHash = lightningDetails?.paymentHash ?? ""

  const baseTransaction = {
    id: txDetails.txId || "",
    direction: txDetails.paymentType === "receive" ? "RECEIVE" : "SEND",
    status: txDetails.status.toUpperCase(),
    memo: details.description,
    settlementAmount: txDetails.amountSat,
    settlementCurrency: "BTC",
    settlementDisplayAmount: (settlementDisplayAmount / 100).toString(),
    settlementDisplayCurrency: "USD",
    settlementVia: isBitcoinVariant
      ? {
          __typename: "SettlementViaOnChain",
          transactionHash: claimTxId || "",
        }
      : {
          __typename: "SettlementViaLn",
          paymentSecret: preimage,
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
    initiationVia: isBitcoinVariant
      ? {
          __typename: "InitiationViaOnChain",
          address: bitcoinAddress || "",
        }
      : {
          __typename: "InitiationViaLn",
          paymentHash: paymentHash,
        },
    __typename: "Transaction",
  }

  // Add swap details if Bitcoin variant
  if (isBitcoinVariant) {
    return {
      ...baseTransaction,
      id: claimTxId || txDetails.txId || "",
      swapId,
      lockupTxId,
      claimTxId,
      swapperFeesSat,
      bitcoinExpirationBlockheight,
    } as any
  }

  return baseTransaction as any
}
