import {
  HomeAuthedDocument,
  useConversionScreenQuery,
  useLnInvoicePaymentSendMutation,
  useLnUsdInvoiceCreateMutation,
  useLnUsdInvoiceFeeProbeMutation,
  WalletCurrency,
} from "@app/graphql/generated"
import { getUsdWallet } from "@app/graphql/wallets-utils"
import { useBreez } from "./useBreez"
import { usePriceConversion } from "./use-price-conversion"
import {
  DisplayCurrency,
  MoneyAmount,
  toBtcMoneyAmount,
  toUsdMoneyAmount,
  WalletOrDisplayCurrency,
} from "@app/types/amounts"
import {
  fetchBreezFee,
  payLightningBreez,
  receivePaymentBreezSDK,
} from "@app/utils/breez-sdk-liquid"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useDisplayCurrency } from "./use-display-currency"

export const useSwap = () => {
  const { LL } = useI18nContext()
  const { btcWallet } = useBreez()

  const { convertMoneyAmount } = usePriceConversion()
  const { formatDisplayAndWalletAmount } = useDisplayCurrency()

  const [lnUsdInvoiceFeeProbe] = useLnUsdInvoiceFeeProbeMutation()
  const [lnUsdInvoiceCreate] = useLnUsdInvoiceCreateMutation()
  const [lnInvoicePaymentSend] = useLnInvoicePaymentSendMutation({
    refetchQueries: [HomeAuthedDocument],
  })

  const { data } = useConversionScreenQuery({
    fetchPolicy: "cache-first",
    returnPartialData: true,
  })

  const usdWallet = getUsdWallet(data?.me?.defaultAccount?.wallets)

  const btcBalance = toBtcMoneyAmount(btcWallet?.balance ?? NaN)
  const usdBalance = toUsdMoneyAmount(usdWallet?.balance ?? NaN)

  // @ts-ignore: Unreachable code error
  const convertedBTCBalance = convertMoneyAmount(btcBalance, DisplayCurrency) // @ts-ignore: Unreachable code error
  const convertedUsdBalance = convertMoneyAmount(usdBalance, DisplayCurrency)

  const formattedBtcBalance = formatDisplayAndWalletAmount({
    displayAmount: convertedBTCBalance,
    walletAmount: btcBalance,
  })
  const formattedUsdBalance = formatDisplayAndWalletAmount({
    displayAmount: convertedUsdBalance,
    walletAmount: usdBalance,
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
            amount: convertedAmount.amount,
            memo: "Swap BTC to USD",
          },
        },
      })
      console.log("INVOICE RES>>>>>>>>", invoiceRes.data?.lnUsdInvoiceCreate)
      if (invoiceRes.data?.lnUsdInvoiceCreate.invoice) {
        // get the sending fee probe
        const feeRes = await fetchBreezFee(
          "lightning",
          invoiceRes.data?.lnUsdInvoiceCreate.invoice?.paymentRequest,
        )
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
            err:
              LL.SendBitcoinScreen.amountExceed({
                balance: formattedBtcBalance,
              }) + " (amount + fee)",
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
      const invoiceRes = await receivePaymentBreezSDK(
        convertedAmount.amount,
        "Swap USD to BTC",
      )
      console.log("INVOICE RES>>>>>>>>", invoiceRes)
      if (invoiceRes.bolt11) {
        // get the sending fee probe
        const feeRes = await lnUsdInvoiceFeeProbe({
          variables: {
            input: {
              paymentRequest: invoiceRes.bolt11,
              walletId: usdWallet?.id,
            },
          },
        })
        console.log("FEE RES>>>>>>>>", feeRes.data?.lnUsdInvoiceFeeProbe)
        if (feeRes.data?.lnUsdInvoiceFeeProbe.errors.length === 0) {
          // check if (amount + fee) is larger than balance
          const sendingFee = feeRes.data?.lnUsdInvoiceFeeProbe.amount || 0
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
                sendingFee: convertMoneyAmount(toUsdMoneyAmount(sendingFee), "BTC")
                  .amount,
                receivingFee: invoiceRes.fee,
                lnInvoice: invoiceRes.bolt11,
              },
              err: null,
            }
          }
        } else {
          return { data: null, err: feeRes.data?.lnUsdInvoiceFeeProbe.errors[0].message }
        }
      } else {
        return { data: null, err: "Something went wrong. Please, try again later." }
      }
    } else {
      return { data: null, err: "Something went wrong. Please, try again later." }
    }
  }

  const swap = async (lnInvoice: string, fromWalletCurrency: WalletCurrency) => {
    if (lnInvoice && usdWallet) {
      if (fromWalletCurrency === "USD") {
        const res = await lnInvoicePaymentSend({
          variables: {
            input: {
              walletId: usdWallet.id,
              paymentRequest: lnInvoice,
              memo: "Swap USD to BTC",
            },
          },
        })
        console.log(">>>>>>>>>>>>>>RES???????????????", res)
        const status = res.data?.lnInvoicePaymentSend.status
        if (status === "PENDING" || status === "SUCCESS") {
          return true
        } else if (status === "ALREADY_PAID") {
          throw new Error("Invoice is already paid")
        } else {
          const error = res.data?.lnInvoicePaymentSend.errors[0].message
          throw new Error(error || "Something went wrong")
        }
      } else {
        const res = await payLightningBreez(lnInvoice)
        console.log(">>>>>>>>>?????????", res.payment)
        if (res.payment.status === "pending") {
          return true
        }
      }
    }
  }

  return { prepareBtcToUsd, prepareUsdToBtc, swap }
}
