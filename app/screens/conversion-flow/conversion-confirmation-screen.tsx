import { GraphQLError } from "graphql"
import React, { useEffect, useState } from "react"
import { ScrollView, Text, View } from "react-native"

import { Screen } from "@app/components/screen"
import {
  HomeAuthedDocument,
  PaymentSendResult,
  useConversionScreenQuery,
  useIntraLedgerPaymentSendMutation,
  useIntraLedgerUsdPaymentSendMutation,
  WalletCurrency,
} from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { getErrorMessages } from "@app/graphql/utils"
import { SATS_PER_BTC, usePriceConversion } from "@app/hooks"
import { useDisplayCurrency } from "@app/hooks/use-display-currency"
import { useI18nContext } from "@app/i18n/i18n-react"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { DisplayCurrency, toBtcMoneyAmount } from "@app/types/amounts"
import { WalletDescriptor } from "@app/types/wallets"
import { logConversionAttempt, logConversionResult } from "@app/utils/analytics"
import { toastShow } from "@app/utils/toast"
import crashlytics from "@react-native-firebase/crashlytics"
import {
  CommonActions,
  NavigationProp,
  RouteProp,
  useNavigation,
} from "@react-navigation/native"
import { makeStyles } from "@rneui/themed"
import ReactNativeHapticFeedback from "react-native-haptic-feedback"
import { GaloyPrimaryButton } from "@app/components/atomic/galoy-primary-button"
import { getBtcWallet, getUsdWallet } from "@app/graphql/wallets-utils"
import { useReceiveBitcoin } from "../receive-bitcoin-screen/use-receive-bitcoin"

type Props = {
  route: RouteProp<RootStackParamList, "conversionConfirmation">
}

export const ConversionConfirmationScreen: React.FC<Props> = ({ route }) => {
  const styles = useStyles()
  const navigation =
    useNavigation<NavigationProp<RootStackParamList, "conversionConfirmation">>()

  const { formatMoneyAmount, displayCurrency } = useDisplayCurrency()
  const { convertMoneyAmount } = usePriceConversion()

  const { toWallet, fromWallet, moneyAmount } = route.params
  const [errorMessage, setErrorMessage] = useState<string | undefined>()
  const isAuthed = useIsAuthed()

  const [intraLedgerPaymentSend, { loading: intraLedgerPaymentSendLoading }] =
    useIntraLedgerPaymentSendMutation()
  const [intraLedgerUsdPaymentSend, { loading: intraLedgerUsdPaymentSendLoading }] =
    useIntraLedgerUsdPaymentSendMutation()
  const isLoading = intraLedgerPaymentSendLoading || intraLedgerUsdPaymentSendLoading
  const { LL } = useI18nContext()

  const { data } = useConversionScreenQuery({
    fetchPolicy: "cache-first",
    skip: !isAuthed,
  })

  const btcWallet = getBtcWallet(data?.me?.defaultAccount?.wallets)
  const usdWallet = getUsdWallet(data?.me?.defaultAccount?.wallets)

  const initPRParams = {
    defaultWalletDescriptor: {
      currency: toWallet?.walletCurrency,
      id: toWallet?.id,
    },
    unitOfAccountAmount: moneyAmount,
  }

  const request = useReceiveBitcoin(false, initPRParams)

  useEffect(() => {
    console.log("INVOICE STATE>>>>>>>>>>>>>>>>>>", request?.state)
    if (request?.state === "Created")
      console.log(
        "INVOICE LN URL>>>>>>>>>>>>>>>>>>>",
        request?.info?.data?.getFullUriFn({}),
      )
  }, [request?.state])

  if (!data?.me || !usdWallet || !btcWallet || !convertMoneyAmount) {
    // TODO: handle errors and or provide some loading state
    return null
  }

  const fromAmount = convertMoneyAmount(moneyAmount, fromWallet.walletCurrency)
  const toAmount = convertMoneyAmount(moneyAmount, toWallet.walletCurrency)

  const handlePaymentReturn = (
    status: PaymentSendResult,
    errorsMessage: readonly GraphQLError[] | string | undefined,
  ) => {
    if (status === "SUCCESS") {
      // navigate to next screen
      navigation.dispatch((state) => {
        const routes = [{ name: "Primary" }, { name: "conversionSuccess" }]
        return CommonActions.reset({
          ...state,
          routes,
          index: routes.length - 1,
        })
      })
      ReactNativeHapticFeedback.trigger("notificationSuccess", {
        ignoreAndroidSystemSettings: true,
      })
    }

    if (typeof errorsMessage === "string") {
      setErrorMessage(errorsMessage)
      ReactNativeHapticFeedback.trigger("notificationError", {
        ignoreAndroidSystemSettings: true,
      })
    } else if (errorsMessage?.length) {
      setErrorMessage(getErrorMessages(errorsMessage))
      ReactNativeHapticFeedback.trigger("notificationError", {
        ignoreAndroidSystemSettings: true,
      })
    }
  }

  const handlePaymentError = (error: Error) => {
    toastShow({ message: error.message })
  }

  const payWallet = async () => {
    if (fromWallet.walletCurrency === WalletCurrency.Btc) {
      try {
        logConversionAttempt({
          sendingWallet: fromWallet.walletCurrency,
          receivingWallet: toWallet.walletCurrency,
        })
        const { data, errors } = await intraLedgerPaymentSend({
          variables: {
            input: {
              walletId: fromWallet?.id,
              recipientWalletId: toWallet?.id,
              amount: fromAmount.amount,
            },
          },
          refetchQueries: [HomeAuthedDocument],
        })

        const status = data?.intraLedgerPaymentSend.status

        if (!status) {
          throw new Error("Conversion failed")
        }

        logConversionResult({
          sendingWallet: fromWallet.walletCurrency,
          receivingWallet: toWallet.walletCurrency,
          paymentStatus: status,
        })
        handlePaymentReturn(
          status,
          errors || data?.intraLedgerPaymentSend.errors[0]?.message,
        )
      } catch (err) {
        if (err instanceof Error) {
          crashlytics().recordError(err)
          handlePaymentError(err)
        }
      }
    }
    if (fromWallet.walletCurrency === WalletCurrency.Usd) {
      try {
        logConversionAttempt({
          sendingWallet: fromWallet.walletCurrency,
          receivingWallet: toWallet.walletCurrency,
        })
        const { data, errors } = await intraLedgerUsdPaymentSend({
          variables: {
            input: {
              walletId: fromWallet?.id,
              recipientWalletId: toWallet?.id,
              amount: fromAmount.amount,
            },
          },
          refetchQueries: [HomeAuthedDocument],
        })

        const status = data?.intraLedgerUsdPaymentSend.status

        if (!status) {
          throw new Error("Conversion failed")
        }

        logConversionResult({
          sendingWallet: fromWallet.walletCurrency,
          receivingWallet: toWallet.walletCurrency,
          paymentStatus: status,
        })
        handlePaymentReturn(
          status,
          errors || data?.intraLedgerUsdPaymentSend.errors[0]?.message,
        )
      } catch (err) {
        if (err instanceof Error) {
          crashlytics().recordError(err)
          handlePaymentError(err)
        }
      }
    }
  }

  return (
    <Screen>
      <ScrollView style={styles.scrollViewContainer}>
        <View style={styles.conversionInfoCard}>
          <View style={styles.conversionInfoField}>
            <Text style={styles.conversionInfoFieldTitle}>
              {LL.ConversionConfirmationScreen.youreConverting()}
            </Text>
            <Text style={styles.conversionInfoFieldValue}>
              {formatMoneyAmount({ moneyAmount: fromAmount })}
              {displayCurrency !== fromWallet.walletCurrency &&
              displayCurrency !== toWallet.walletCurrency
                ? ` - ${formatMoneyAmount({
                    moneyAmount: convertMoneyAmount(moneyAmount, DisplayCurrency),
                  })}`
                : ""}
            </Text>
          </View>
          <View style={styles.conversionInfoField}>
            <Text style={styles.conversionInfoFieldTitle}>{LL.common.to()}</Text>
            <Text style={styles.conversionInfoFieldValue}>
              {formatMoneyAmount({ moneyAmount: toAmount, isApproximate: true })}
            </Text>
          </View>
          <View style={styles.conversionInfoField}>
            <Text style={styles.conversionInfoFieldTitle}>
              {LL.ConversionConfirmationScreen.receivingAccount()}
            </Text>
            <Text style={styles.conversionInfoFieldValue}>
              {toWallet.walletCurrency === WalletCurrency.Btc
                ? LL.common.btcAccount()
                : LL.common.usdAccount()}
            </Text>
          </View>
          <View style={styles.conversionInfoField}>
            <Text style={styles.conversionInfoFieldTitle}>{LL.common.rate()}</Text>
            <Text style={styles.conversionInfoFieldValue}>
              {formatMoneyAmount({
                moneyAmount: convertMoneyAmount(
                  toBtcMoneyAmount(Number(SATS_PER_BTC)),
                  DisplayCurrency,
                ),
                isApproximate: true,
              })}{" "}
              / 1 BTC
            </Text>
          </View>
        </View>
        {errorMessage && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}
      </ScrollView>
      <GaloyPrimaryButton
        title={LL.common.convert()}
        containerStyle={styles.buttonContainer}
        disabled={isLoading}
        onPress={payWallet}
        loading={isLoading}
      />
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  scrollViewContainer: {
    flexDirection: "column",
  },
  conversionInfoCard: {
    margin: 20,
    backgroundColor: colors.grey5,
    borderRadius: 10,
    padding: 20,
  },
  conversionInfoField: {
    marginBottom: 20,
  },
  conversionInfoFieldTitle: { color: colors.grey1 },
  conversionInfoFieldValue: {
    color: colors.grey0,
    fontWeight: "bold",
    fontSize: 18,
  },
  buttonContainer: { marginHorizontal: 20, marginBottom: 20 },
  errorContainer: {
    marginBottom: 10,
  },
  errorText: {
    color: colors.error,
    textAlign: "center",
  },
}))
