import { useMemo, useState } from "react"

// gql
import {
  HomeAuthedDocument,
  PaymentSendResult,
  useIntraLedgerPaymentSendMutation,
  useIntraLedgerUsdPaymentSendMutation,
  useLnInvoicePaymentSendMutation,
  useLnNoAmountInvoicePaymentSendMutation,
  useLnNoAmountUsdInvoicePaymentSendMutation,
  useOnChainPaymentSendMutation,
  useOnChainPaymentSendAllMutation,
  useOnChainUsdPaymentSendAsBtcDenominatedMutation,
  useOnChainUsdPaymentSendMutation,
  WalletCurrency,
} from "@app/graphql/generated"

// hooks
import { useAppConfig } from "@app/hooks"

// utils
import { getErrorMessages } from "@app/graphql/utils"

// types
import { PaymentDetail, SendPaymentMutation } from "./payment-details/index.types"

// Breez SDK
import {
  payLightningBreez,
  payOnchainBreez,
  payLnurlBreez,
} from "@app/utils/breez-sdk-liquid"

type UseSendPaymentResult = {
  loading: boolean
  hasAttemptedSend: boolean
  sendPayment:
    | (() => Promise<{
        status: PaymentSendResult | null | undefined
        errorsMessage?: string
      }>)
    | undefined
    | null
}

export const useSendPayment = (
  sendPaymentMutation?: SendPaymentMutation | null,
  paymentDetail?: PaymentDetail<WalletCurrency>,
  feeRateSatPerVbyte?: number,
): UseSendPaymentResult => {
  const { lnAddressHostname } = useAppConfig().appConfig.galoyInstance

  const [intraLedgerPaymentSend, { loading: intraLedgerPaymentSendLoading }] =
    useIntraLedgerPaymentSendMutation({ refetchQueries: [HomeAuthedDocument] })
  const [intraLedgerUsdPaymentSend, { loading: intraLedgerUsdPaymentSendLoading }] =
    useIntraLedgerUsdPaymentSendMutation({ refetchQueries: [HomeAuthedDocument] })
  const [lnInvoicePaymentSend, { loading: lnInvoicePaymentSendLoading }] =
    useLnInvoicePaymentSendMutation({ refetchQueries: [HomeAuthedDocument] })
  const [lnNoAmountInvoicePaymentSend, { loading: lnNoAmountInvoicePaymentSendLoading }] =
    useLnNoAmountInvoicePaymentSendMutation({ refetchQueries: [HomeAuthedDocument] })
  const [
    lnNoAmountUsdInvoicePaymentSend,
    { loading: lnNoAmountUsdInvoicePaymentSendLoading },
  ] = useLnNoAmountUsdInvoicePaymentSendMutation({ refetchQueries: [HomeAuthedDocument] })
  const [onChainPaymentSend, { loading: onChainPaymentSendLoading }] =
    useOnChainPaymentSendMutation({ refetchQueries: [HomeAuthedDocument] })
  const [onChainPaymentSendAll, { loading: onChainPaymentSendAllLoading }] =
    useOnChainPaymentSendAllMutation({ refetchQueries: [HomeAuthedDocument] })
  const [onChainUsdPaymentSend, { loading: onChainUsdPaymentSendLoading }] =
    useOnChainUsdPaymentSendMutation({ refetchQueries: [HomeAuthedDocument] })
  const [
    onChainUsdPaymentSendAsBtcDenominated,
    { loading: onChainUsdPaymentSendAsBtcDenominatedLoading },
  ] = useOnChainUsdPaymentSendAsBtcDenominatedMutation({
    refetchQueries: [HomeAuthedDocument],
  })

  const [hasAttemptedSend, setHasAttemptedSend] = useState(false)

  const loading =
    intraLedgerPaymentSendLoading ||
    intraLedgerUsdPaymentSendLoading ||
    lnInvoicePaymentSendLoading ||
    lnNoAmountInvoicePaymentSendLoading ||
    lnNoAmountUsdInvoicePaymentSendLoading ||
    onChainPaymentSendLoading ||
    onChainPaymentSendAllLoading ||
    onChainUsdPaymentSendLoading ||
    onChainUsdPaymentSendAsBtcDenominatedLoading

  const sendPayment = useMemo(() => {
    return sendPaymentMutation && !hasAttemptedSend
      ? async () => {
          setHasAttemptedSend(true)

          if (paymentDetail && paymentDetail.sendingWalletDescriptor.currency === "BTC") {
            const { settlementAmount, memo, isSendingMax, destination, paymentType } =
              paymentDetail

            try {
              if (paymentType === "lightning") {
                console.log("Starting payLightningBreez")
                const response = await payLightningBreez(destination)
                console.log("Response payLightningBreez: ", response)
                return {
                  status: PaymentSendResult.Success,
                  errorsMessage: undefined,
                }
              } else if (paymentType === "lnurl" || paymentType === "intraledger") {
                console.log("Starting payLnurlBreez", memo)
                const updatedDestination =
                  paymentType === "intraledger"
                    ? destination + `@${lnAddressHostname}`
                    : destination
                const response = await payLnurlBreez(
                  updatedDestination,
                  settlementAmount?.amount,
                  "",
                )
                console.log("Response payLnurlBreez: ", response)
                return {
                  status: PaymentSendResult.Success,
                  errorsMessage: undefined,
                }
              } else if (paymentType === "onchain") {
                console.log("Starting payOnchainBreez")
                const response = await payOnchainBreez(
                  destination,
                  settlementAmount.amount,
                  feeRateSatPerVbyte,
                  isSendingMax,
                )
                console.log("Response payOnchainBreez: ", response)
                return {
                  status: PaymentSendResult.Success,
                  errorsMessage: undefined,
                }
              } else {
                return {
                  status: PaymentSendResult.Failure,
                  errorsMessage: "Wrong invoice type",
                }
              }
            } catch (err: any) {
              return {
                status: PaymentSendResult.Failure,
                errorsMessage: err.message,
              }
            }
          } else {
            console.log("Starting sendPaymentMutation using GraphQL")
            const response = await sendPaymentMutation({
              intraLedgerPaymentSend,
              intraLedgerUsdPaymentSend,
              lnInvoicePaymentSend,
              lnNoAmountInvoicePaymentSend,
              lnNoAmountUsdInvoicePaymentSend,
              onChainPaymentSend,
              onChainPaymentSendAll,
              onChainUsdPaymentSend,
              onChainUsdPaymentSendAsBtcDenominated,
            })
            let errorsMessage = undefined
            if (response.errors) {
              errorsMessage = getErrorMessages(response.errors)
            }
            if (response.status === PaymentSendResult.Failure) {
              setHasAttemptedSend(false)
            }
            return { status: response.status, errorsMessage }
          }
        }
      : undefined
  }, [
    sendPaymentMutation,
    hasAttemptedSend,
    paymentDetail,
    feeRateSatPerVbyte,
    intraLedgerPaymentSend,
    intraLedgerUsdPaymentSend,
    lnInvoicePaymentSend,
    lnNoAmountInvoicePaymentSend,
    lnNoAmountUsdInvoicePaymentSend,
    onChainPaymentSend,
    onChainPaymentSendAll,
    onChainUsdPaymentSend,
    onChainUsdPaymentSendAsBtcDenominated,
  ])

  return {
    hasAttemptedSend,
    loading,
    sendPayment,
  }
}
