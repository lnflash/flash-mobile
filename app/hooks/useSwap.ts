import {
  HomeAuthedDocument,
  useConversionScreenQuery,
  useLnInvoicePaymentSendMutation,
  useLnUsdInvoiceCreateMutation,
  useLnUsdInvoiceFeeProbeMutation,
  WalletCurrency,
} from "@app/graphql/generated"
import { getCashWallet } from "@app/graphql/wallets-utils"
import { useBreez } from "./useBreez"
import { usePriceConversion } from "./use-price-conversion"
import {
  DisplayCurrency,
  MoneyAmount,
  toBtcMoneyAmount,
  toSpendableBalance,
  toUsdMoneyAmount,
  WalletOrDisplayCurrency,
} from "@app/types/amounts"
import {
  fetchBreezFee,
  payLightningBreez,
  receivePaymentBreez,
} from "@app/utils/breez-sdk"
import { breezFeeErrorMessage } from "@app/utils/breez-sdk/fee-error-message"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useDisplayCurrency } from "./use-display-currency"
import { useFormatSats } from "./use-format-sats"
import { PaymentType } from "@galoymoney/client"
import { PaymentStatus } from "@breeztech/breez-sdk-spark-react-native"

// A swap that reached the network but has not settled is NOT a success — the
// screens render the two differently.
export type SwapResult = { status: "success" | "pending" }

export const useSwap = () => {
  const { LL } = useI18nContext()
  const { btcWallet } = useBreez()

  const { convertMoneyAmount } = usePriceConversion()
  const { formatDisplayAndWalletAmount } = useDisplayCurrency()
  const formatSats = useFormatSats()

  const [lnUsdInvoiceFeeProbe] = useLnUsdInvoiceFeeProbeMutation()
  const [lnUsdInvoiceCreate] = useLnUsdInvoiceCreateMutation()
  const [lnInvoicePaymentSend] = useLnInvoicePaymentSendMutation({
    refetchQueries: [HomeAuthedDocument],
  })

  const { data } = useConversionScreenQuery({
    fetchPolicy: "cache-first",
    returnPartialData: true,
  })

  const usdWallet = getCashWallet(data?.me?.defaultAccount?.wallets)

  const btcBalance = toBtcMoneyAmount(btcWallet?.balance ?? NaN)
  const usdBalance = toUsdMoneyAmount(usdWallet?.balance ?? NaN)

  // Display-only floored balances — the fee/balance checks below keep the raw
  // amounts (#690)
  const spendableBtcBalance = toSpendableBalance(btcBalance)
  const spendableUsdBalance = toSpendableBalance(usdBalance)

  // @ts-expect-error: convertMoneyAmount is undefined until the realtime price loads
  const convertedBTCBalance = convertMoneyAmount(spendableBtcBalance, DisplayCurrency)
  // @ts-expect-error: convertMoneyAmount is undefined until the realtime price loads
  const convertedUsdBalance = convertMoneyAmount(spendableUsdBalance, DisplayCurrency)

  const formattedBtcBalance = formatDisplayAndWalletAmount({
    displayAmount: convertedBTCBalance,
    walletAmount: spendableBtcBalance,
  })
  const formattedUsdBalance = formatDisplayAndWalletAmount({
    displayAmount: convertedUsdBalance,
    walletAmount: spendableUsdBalance,
  })

  const prepareBtcToUsd = async (
    settlementSendAmount: MoneyAmount<WalletOrDisplayCurrency>,
  ) => {
    if (usdWallet && btcWallet) {
      // fetch ibex(USD) invoice
      // @ts-ignore: Unreachable code error
      const convertedAmount = convertMoneyAmount(settlementSendAmount, "USD")
      const invoiceRes = await lnUsdInvoiceCreate({
        variables: {
          input: {
            walletId: usdWallet.id,
            amount: 0,
            memo: "Swap BTC to USD",
          },
        },
      })
      console.log("INVOICE RES>>>>>>>>", invoiceRes.data?.lnUsdInvoiceCreate)

      if (invoiceRes.data?.lnUsdInvoiceCreate.invoice) {
        // get the sending fee probe
        const feeRes = await fetchBreezFee({
          paymentType: PaymentType.Lightning,
          paymentRequest: invoiceRes.data?.lnUsdInvoiceCreate.invoice?.paymentRequest,
          amountSats: settlementSendAmount.amount,
        })
        console.log("FEE RES>>>>>>>>", feeRes)
        if (!feeRes.err) {
          // check if (amount + fee) is larger than balance
          if ((feeRes.fee || 0) + settlementSendAmount.amount > btcBalance.amount) {
            return {
              data: null,
              err:
                LL.SendBitcoinScreen.amountExceed({
                  balance: formattedBtcBalance,
                }) + " (amount + fee)",
            }
          } else {
            return {
              data: {
                moneyAmount: settlementSendAmount,
                sendingFee: feeRes.fee || 0,
                receivingFee: 0,
                lnInvoice:
                  invoiceRes.data?.lnUsdInvoiceCreate.invoice?.paymentRequest || "",
              },
              err: null,
            }
          }
        } else {
          return {
            data: null,
            err: breezFeeErrorMessage(feeRes.err, LL, formatSats),
          }
        }
      } else {
        return { data: null, err: invoiceRes.data?.lnUsdInvoiceCreate.errors[0].message }
      }
    } else {
      return { data: null, err: "Something went wrong. Please, try again later." }
    }
  }

  const prepareUsdToBtc = async (
    settlementSendAmount: MoneyAmount<WalletOrDisplayCurrency>,
  ): Promise<{ data: any; err: any }> => {
    if (usdWallet && btcWallet) {
      // fetch breez(BTC) invoice
      // @ts-ignore: Unreachable code error
      const convertedAmount = convertMoneyAmount(settlementSendAmount, "BTC")
      const invoiceRes = await receivePaymentBreez(
        convertedAmount.amount,
        "Swap USD to BTC",
      )
      console.log("INVOICE RES>>>>>>>>", invoiceRes)
      if (invoiceRes.paymentRequest) {
        // get the sending fee probe
        const feeRes = await lnUsdInvoiceFeeProbe({
          variables: {
            input: {
              paymentRequest: invoiceRes.paymentRequest,
              walletId: usdWallet?.id,
            },
          },
        })
        // A probe that failed used to fall through as fee 0, so the user
        // continued to confirmation on a fee we never obtained and met a
        // generic error at send time instead of the real reason here.
        const probeError = feeRes.data?.lnUsdInvoiceFeeProbe.errors?.[0]?.message
        if (probeError) {
          return { data: null, err: probeError }
        }

        const probedFee = feeRes.data?.lnUsdInvoiceFeeProbe.amount
        if (probedFee === null || probedFee === undefined) {
          return { data: null, err: LL.common.somethingWentWrong() }
        }
        const sendingFee = probedFee
        if (sendingFee + settlementSendAmount.amount > usdBalance.amount) {
          return {
            data: null,
            err:
              LL.SendBitcoinScreen.amountExceed({
                balance: formattedUsdBalance,
              }) + " (amount + fee)",
          }
        } else {
          return {
            data: {
              moneyAmount: settlementSendAmount, // @ts-ignore: Unreachable code error
              sendingFee: convertMoneyAmount(toUsdMoneyAmount(sendingFee), "BTC").amount,
              receivingFee: Number(invoiceRes.fee),
              lnInvoice: invoiceRes.paymentRequest,
            },
            err: null,
          }
        }
      } else {
        return { data: null, err: "Something went wrong. Please, try again later." }
      }
    } else {
      return { data: null, err: "Something went wrong. Please, try again later." }
    }
  }

  const swap = async (
    lnInvoice: string,
    fromWalletCurrency: WalletCurrency,
    amount: number,
  ): Promise<SwapResult> => {
    if (!lnInvoice || !usdWallet) {
      throw new Error(LL.common.somethingWentWrong())
    }

    if (fromWalletCurrency === "USD" || fromWalletCurrency === "USDT") {
      const res = await lnInvoicePaymentSend({
        variables: {
          input: {
            walletId: usdWallet.id,
            paymentRequest: lnInvoice,
            memo: "Swap USD to BTC",
          },
        },
      })

      const payload = res.data?.lnInvoicePaymentSend
      // Errors outrank status: a payment the server could not confirm comes
      // back as PENDING *carrying* an error, so reading status first would
      // render it as an ordinary in-flight conversion.
      const errorMessage = payload?.errors?.[0]?.message
      if (errorMessage) throw new Error(errorMessage)

      switch (payload?.status) {
        case "SUCCESS":
          return { status: "success" }
        case "PENDING":
          // NOT success: the payment may still fail. Reporting pending as
          // settled is how a conversion that moved no funds showed a success
          // screen.
          return { status: "pending" }
        case "ALREADY_PAID":
          throw new Error("Invoice is already paid")
        default:
          throw new Error(LL.common.somethingWentWrong())
      }
    }

    const res = await payLightningBreez(lnInvoice, amount)
    // Previously a failed Breez send returned undefined here, which the
    // confirmation screen read as "no result" and silently ignored.
    if (!res.success) {
      throw new Error(res.error || LL.common.somethingWentWrong())
    }
    if (res.payment?.payment?.status === PaymentStatus.Failed) {
      throw new Error(LL.common.somethingWentWrong())
    }
    // Anything not explicitly Completed is reported as still in flight rather
    // than assumed settled.
    const settled = res.payment?.payment?.status === PaymentStatus.Completed
    return { status: settled ? "success" : "pending" }
  }

  return { prepareBtcToUsd, prepareUsdToBtc, swap }
}
