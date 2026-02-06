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

  const isBitcoinVariant = txDetails.details.type === PaymentDetailsVariant.BITCOIN
  const isLightningVariant = txDetails.details.type === PaymentDetailsVariant.LIGHTNING

  const bitcoinDetails = isBitcoinVariant ? txDetails.details : null
  const swapId = bitcoinDetails?.swapId
  const bitcoinAddress = bitcoinDetails?.bitcoinAddress
  const lockupTxId = bitcoinDetails?.lockupTxId
  const claimTxId = bitcoinDetails?.claimTxId
  const bitcoinExpirationBlockheight = bitcoinDetails?.bitcoinExpirationBlockheight
  const swapperFeesSat = isBitcoinVariant ? txDetails.swapperFeesSat : undefined

   const baseTransaction = {
     id: txDetails.txId || "",
     direction: txDetails.paymentType === "receive" ? "RECEIVE" : "SEND",
     status: txDetails.status.toUpperCase(),
     memo: txDetails.details.description,
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
           paymentSecret: isLightningVariant ? txDetails.details.preimage : "",
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
          paymentHash: isLightningVariant ? txDetails.details.paymentHash || "" : "",
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
