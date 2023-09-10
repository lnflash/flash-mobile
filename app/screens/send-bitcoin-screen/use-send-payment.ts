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
  GraphQlApplicationError,
} from "@app/graphql/generated"
import { useMemo, useState } from "react"
import { SendPaymentMutation } from "./payment-details/index.types"
import { gql } from "@apollo/client"
import { getErrorMessages } from "@app/graphql/utils"

// Breez SDK
import {
  sendPaymentBreezSDK,
  parseInvoiceBreezSDK,
  sendOnchainBreezSDK,
  recommendedFeesBreezSDK,
  fetchReverseSwapFeesBreezSDK,
  payLnurlBreezSDK,
} from "@app/utils/breez-sdk"
import { LnInvoice, ReverseSwapPairInfo } from "@breeztech/react-native-breez-sdk"

type UseSendPaymentResult = {
  loading: boolean
  sendPayment:
    | (() => Promise<{
        status: PaymentSendResult | null | undefined
        errorsMessage?: string
      }>)
    | undefined
    | null
  hasAttemptedSend: boolean
}

gql`
  mutation intraLedgerPaymentSend($input: IntraLedgerPaymentSendInput!) {
    intraLedgerPaymentSend(input: $input) {
      errors {
        message
      }
      status
    }
  }

  mutation intraLedgerUsdPaymentSend($input: IntraLedgerUsdPaymentSendInput!) {
    intraLedgerUsdPaymentSend(input: $input) {
      errors {
        message
      }
      status
    }
  }

  mutation lnNoAmountInvoicePaymentSend($input: LnNoAmountInvoicePaymentInput!) {
    lnNoAmountInvoicePaymentSend(input: $input) {
      errors {
        message
      }
      status
    }
  }

  mutation lnInvoicePaymentSend($input: LnInvoicePaymentInput!) {
    lnInvoicePaymentSend(input: $input) {
      errors {
        message
      }
      status
    }
  }

  mutation lnNoAmountUsdInvoicePaymentSend($input: LnNoAmountUsdInvoicePaymentInput!) {
    lnNoAmountUsdInvoicePaymentSend(input: $input) {
      errors {
        message
      }
      status
    }
  }

  mutation onChainPaymentSend($input: OnChainPaymentSendInput!) {
    onChainPaymentSend(input: $input) {
      errors {
        message
      }
      status
    }
  }

  mutation onChainPaymentSendAll($input: OnChainPaymentSendAllInput!) {
    onChainPaymentSendAll(input: $input) {
      errors {
        message
      }
      status
    }
  }

  mutation onChainUsdPaymentSend($input: OnChainUsdPaymentSendInput!) {
    onChainUsdPaymentSend(input: $input) {
      errors {
        message
      }
      status
    }
  }

  mutation onChainUsdPaymentSendAsBtcDenominated(
    $input: OnChainUsdPaymentSendAsBtcDenominatedInput!
  ) {
    onChainUsdPaymentSendAsBtcDenominated(input: $input) {
      errors {
        message
      }
      status
    }
  }
`

export const useSendPayment = (
  sendPaymentMutation?: SendPaymentMutation | null,
  paymentRequest?: string,
  amountMsats?: number,
  // eslint-disable-next-line max-params
): UseSendPaymentResult => {
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
    let invoice: LnInvoice
    let currentFees: ReverseSwapPairInfo
    console.log("debugging 1")
    console.log("hasAttemptedSend:", hasAttemptedSend)
    return sendPaymentMutation && !hasAttemptedSend
      ? async () => {
          setHasAttemptedSend(true)

          console.log("debugging 2")
          if (
            paymentRequest &&
            paymentRequest?.length > 110 &&
            !paymentRequest.toLowerCase().startsWith("lnurl")
          ) {
            invoice = await parseInvoiceBreezSDK(paymentRequest || "")
          } else if (paymentRequest && paymentRequest?.length < 64) {
            currentFees = await fetchReverseSwapFeesBreezSDK({
              sendAmountSat: amountMsats || 50000,
            })
          }
          let status: PaymentSendResult | null | undefined = null
          let errors: readonly GraphQlApplicationError[] | undefined
          // Try using Breez SDK for lnNoAmountInvoicePaymentSend
          if (
            sendPaymentMutation?.name === "sendPaymentMutation" &&
            paymentRequest &&
            paymentRequest.length > 110 &&
            !paymentRequest.toLowerCase().startsWith("lnurl") &&
            invoice.amountMsat !== null
          ) {
            console.log("Starting sendPaymentBreezSDK Option 1")
            try {
              const payment = await sendPaymentBreezSDK(paymentRequest)
              return {
                status: payment.paymentTime
                  ? PaymentSendResult.Success
                  : PaymentSendResult.Failure,
                errors: [],
              }
            } catch (err) {
              console.error("Failed to send payment using Breez SDK:", err)
            }
          } else if (
            sendPaymentMutation?.name === "sendPaymentMutation" &&
            paymentRequest &&
            paymentRequest.length > 110 &&
            !paymentRequest.toLowerCase().startsWith("lnurl") &&
            invoice.amountMsat === null &&
            amountMsats
          ) {
            console.log("Starting sendPaymentBreezSDK Option 2")
            try {
              const payment = await sendPaymentBreezSDK(paymentRequest, amountMsats)
              return {
                status: payment.paymentTime
                  ? PaymentSendResult.Success
                  : PaymentSendResult.Failure,
                errors: [],
              }
            } catch (err) {
              console.error("Failed to send payment using Breez SDK:", err)
            }
          } else if (
            sendPaymentMutation?.name === "sendPaymentMutation" &&
            paymentRequest &&
            (paymentRequest.toLowerCase().startsWith("lnurl") ||
              paymentRequest.includes("@"))
          ) {
            console.log("Starting payLnurlBreezSDK")
            try {
              console.log("paymentRequest:", paymentRequest)
              const payment = await payLnurlBreezSDK(paymentRequest, amountMsats || 1000)
              console.log("payment:", JSON.stringify(payment, null, 2))
              return {
                status:
                  "reason" in (payment.data || {})
                    ? PaymentSendResult.Failure
                    : PaymentSendResult.Success,
                errors: [],
              }
            } catch (err) {
              console.error("Failed to send payment using Breez SDK:", err)
            }
          } else if (
            sendPaymentMutation?.name === "_sendPaymentMutation" &&
            paymentRequest &&
            paymentRequest.length < 64
          ) {
            console.log("Starting sendOnchainBreezSDK")
            if (currentFees) {
              try {
                const recommendedFees = await recommendedFeesBreezSDK()
                const reverseSwapInfo = await sendOnchainBreezSDK(
                  currentFees,
                  paymentRequest,
                  recommendedFees.hourFee,
                )
                return {
                  status: reverseSwapInfo.status
                    ? PaymentSendResult.Success
                    : PaymentSendResult.Failure,
                  errors: [],
                }
              } catch (err) {
                console.error("Failed to send On-Chain payment using Breez SDK:", err)
              }
            } else {
              console.error("currentFees is null")
              return {
                status: PaymentSendResult.Failure,
                errors: [],
              }
            }
          } else {
            console.log("Starting Galoy Option")
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
            status = response.status
            errors = response.errors
          }
          let errorsMessage = undefined
          if (errors) {
            errorsMessage = getErrorMessages(errors)
          }
          if (status === PaymentSendResult.Failure) {
            setHasAttemptedSend(false)
          }
          return { status, errorsMessage }
        }
      : undefined
  }, [
    sendPaymentMutation,
    hasAttemptedSend,
    paymentRequest,
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
