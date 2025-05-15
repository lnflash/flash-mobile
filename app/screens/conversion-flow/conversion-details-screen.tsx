import React, { useState } from "react"
import { ScrollView } from "react-native"
import { makeStyles } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"

// components
import {
  ConversionAmountError,
  PercentageAmount,
  SwapWallets,
} from "@app/components/swap-flow"
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"

// hooks
import {
  useBreez,
  usePriceConversion,
  useDisplayCurrency,
  useActivityIndicator,
} from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"

// types & utils
import {
  DisplayCurrency,
  MoneyAmount,
  toBtcMoneyAmount,
  toUsdMoneyAmount,
  toWalletAmount,
  WalletOrDisplayCurrency,
} from "@app/types/amounts"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { fetchBreezFee, receivePaymentBreezSDK } from "@app/utils/breez-sdk-liquid"
import { getUsdWallet } from "@app/graphql/wallets-utils"

// gql
import {
  useConversionScreenQuery,
  useLnUsdInvoiceCreateMutation,
  useLnUsdInvoiceFeeProbeMutation,
  useRealtimePriceQuery,
  WalletCurrency,
} from "@app/graphql/generated"

type Props = StackScreenProps<RootStackParamList, "conversionDetails">

export const ConversionDetailsScreen: React.FC<Props> = ({ navigation }) => {
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { btcWallet } = useBreez()
  const { zeroDisplayAmount } = useDisplayCurrency()

  const { convertMoneyAmount } = usePriceConversion()
  const { formatDisplayAndWalletAmount } = useDisplayCurrency()
  const { toggleActivityIndicator } = useActivityIndicator()

  const [errorMsg, setErrorMsg] = useState<string>()
  const [fromWalletCurrency, setFromWalletCurrency] = useState<WalletCurrency>("BTC")
  const [moneyAmount, setMoneyAmount] =
    useState<MoneyAmount<WalletOrDisplayCurrency>>(zeroDisplayAmount)

  const [lnUsdInvoiceFeeProbe] = useLnUsdInvoiceFeeProbeMutation()
  const [lnUsdInvoiceCreate] = useLnUsdInvoiceCreateMutation()

  useRealtimePriceQuery({
    fetchPolicy: "network-only",
  })
  const { data } = useConversionScreenQuery({
    fetchPolicy: "cache-first",
    returnPartialData: true,
  })

  const usdWallet = getUsdWallet(data?.me?.defaultAccount?.wallets)

  const btcBalance = toBtcMoneyAmount(btcWallet?.balance ?? NaN)
  const usdBalance = toUsdMoneyAmount(usdWallet?.balance ?? NaN)

  if (!convertMoneyAmount) return

  const convertedBTCBalance = convertMoneyAmount(btcBalance, DisplayCurrency)
  const convertedUsdBalance = convertMoneyAmount(usdBalance, DisplayCurrency)
  const settlementSendAmount = convertMoneyAmount(moneyAmount, fromWalletCurrency)

  const formattedBtcBalance = formatDisplayAndWalletAmount({
    displayAmount: convertedBTCBalance,
    walletAmount: btcBalance,
  })
  const formattedUsdBalance = formatDisplayAndWalletAmount({
    displayAmount: convertedUsdBalance,
    walletAmount: usdBalance,
  })

  const fromWalletBalance = fromWalletCurrency === "BTC" ? btcBalance : usdBalance

  const isValidAmount =
    settlementSendAmount.amount > 0 &&
    settlementSendAmount.amount <= fromWalletBalance.amount

  const canToggleWallet =
    fromWalletCurrency === "BTC" ? usdBalance.amount > 0 : btcBalance.amount > 0

  const setAmountToBalancePercentage = (percentage: number) => {
    const fromBalance =
      fromWalletCurrency === WalletCurrency.Btc ? btcBalance.amount : usdBalance.amount

    setMoneyAmount(
      toWalletAmount({
        amount: Math.round((fromBalance * percentage) / 100),
        currency: fromWalletCurrency,
      }),
    )
  }

  const moveToNextScreen = async () => {
    toggleActivityIndicator(true)
    if (fromWalletCurrency === "USD") {
      await handleUsdToBtc()
    } else {
      await handleBtcToUsd()
    }
    toggleActivityIndicator(false)
  }

  const handleUsdToBtc = async () => {
    if (usdWallet && btcWallet) {
      // fetch breez(BTC) invoice
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
            setErrorMsg(
              LL.SendBitcoinScreen.amountExceed({
                balance: formattedUsdBalance,
              }) + " (amount + fee)",
            )
          } else {
            navigation.navigate("conversionConfirmation", {
              moneyAmount: settlementSendAmount,
              sendingFee: convertMoneyAmount(toUsdMoneyAmount(sendingFee), "BTC").amount,
              receivingFee: invoiceRes.fee,
              lnInvoice: invoiceRes.bolt11,
              fromWalletCurrency,
            })
          }
        } else {
          setErrorMsg(feeRes.data?.lnUsdInvoiceFeeProbe.errors[0].message)
        }
      } else {
        setErrorMsg("Something went wrong. Please, try again later.")
      }
    }
  }

  const handleBtcToUsd = async () => {
    if (usdWallet && btcWallet) {
      // fetch ibex(USD) invoice
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
            setErrorMsg(
              LL.SendBitcoinScreen.amountExceed({
                balance: formattedBtcBalance,
              }) + " (amount + fee)",
            )
          } else {
            navigation.navigate("conversionConfirmation", {
              moneyAmount: settlementSendAmount,
              sendingFee: feeRes.fee || 0,
              receivingFee: 0,
              lnInvoice:
                invoiceRes.data?.lnUsdInvoiceCreate.invoice?.paymentRequest || "",
              fromWalletCurrency,
            })
          }
        } else {
          setErrorMsg(feeRes.err.toString() || "")
        }
      } else {
        setErrorMsg(invoiceRes.data?.lnUsdInvoiceCreate.errors[0].message)
      }
    }
  }

  return (
    <Screen preset="fixed">
      <ScrollView style={styles.scrollViewContainer}>
        <SwapWallets
          fromWalletCurrency={fromWalletCurrency}
          formattedBtcBalance={formattedBtcBalance}
          formattedUsdBalance={formattedUsdBalance}
          canToggleWallet={canToggleWallet}
          setFromWalletCurrency={setFromWalletCurrency}
        />
        <ConversionAmountError
          fromWalletCurrency={fromWalletCurrency}
          formattedBtcBalance={formattedBtcBalance}
          formattedUsdBalance={formattedUsdBalance}
          btcBalance={btcBalance}
          usdBalance={usdBalance}
          settlementSendAmount={settlementSendAmount}
          moneyAmount={moneyAmount}
          errorMsg={errorMsg}
          setMoneyAmount={setMoneyAmount}
          setErrorMsg={setErrorMsg}
        />
        <PercentageAmount
          fromWalletCurrency={fromWalletCurrency}
          setAmountToBalancePercentage={setAmountToBalancePercentage}
        />
      </ScrollView>
      <PrimaryBtn
        label={LL.common.next()}
        btnStyle={styles.btnStyle}
        disabled={!isValidAmount || !!errorMsg}
        onPress={moveToNextScreen}
      />
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  scrollViewContainer: {
    margin: 20,
  },
  btnStyle: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
}))
