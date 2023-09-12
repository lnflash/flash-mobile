import * as sdk from "@breeztech/react-native-breez-sdk"
import { TransactionFragment } from "@app/graphql/generated"
import { createToDisplayAmount } from "@app/types/amounts"

export const formatPaymentsBreezSDK = (txid: unknown, payments: sdk.Payment[]) => {
  const response: sdk.Payment[] = payments
  const responseTx = response.find((tx) => tx.id === txid)
  let tx: TransactionFragment | undefined
  if (responseTx) {
    const moneyAmount = createToDisplayAmount("JMD")(
      responseTx.amountMsat / 1000,
    ).amount.toString() // TODO: placeholder, need to get dynamic price from API
    const transformedData: TransactionFragment = {
      // Map fields from response to fields of TransactionFragment, e.g.,
      id: responseTx.id,
      direction: responseTx.paymentType === "received" ? "RECEIVE" : "SEND",
      status: (responseTx.pending ? "PENDING" : "SUCCESS") || "FAILURE",
      memo: responseTx.description,
      settlementAmount: responseTx.amountMsat / 1000,
      settlementCurrency: "BTC",
      settlementDisplayAmount: "0.00" || moneyAmount,
      settlementDisplayCurrency: "JMD$",
      settlementVia: {
        __typename: "SettlementViaLn",
        paymentSecret:
          "details" in responseTx && "paymentPreimage" in responseTx.details
            ? responseTx.details.paymentPreimage
            : undefined,
      },
      createdAt: Date.now(),
      settlementFee: responseTx.feeMsat / 1000,
      settlementDisplayFee: "BTC",
      settlementPrice: {
        base: responseTx.amountMsat / 1000,
        offset: 0,
        currencyUnit: "SAT",
        formattedAmount: "SAT",
        __typename: "PriceOfOneSettlementMinorUnitInDisplayMinorUnit",
      },
      initiationVia: {
        __typename: "InitiationViaLn",
        paymentHash:
          "details" in responseTx && "paymentHash" in responseTx.details
            ? responseTx.details.paymentHash
            : "",
      },
      __typename: "Transaction",
    }
    tx = transformedData
  }

  return tx
}
