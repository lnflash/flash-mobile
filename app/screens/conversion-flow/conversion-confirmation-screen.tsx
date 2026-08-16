import React, { useState } from "react"
import { ScrollView, Text } from "react-native"
import { getCrashlytics } from "@react-native-firebase/crashlytics"
import { StackScreenProps } from "@react-navigation/stack"
import { CommonActions } from "@react-navigation/native"
import { makeStyles } from "@rneui/themed"

// components
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { ConfirmationDetails } from "@app/components/swap-flow"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useConversionScreenQuery } from "@app/graphql/generated"
import { useActivityIndicator, useBreez, useSwap } from "@app/hooks"

// utils
import { toastShow } from "@app/utils/toast"
import { getCashWallet } from "@app/graphql/wallets-utils"

// types
import { RootStackParamList } from "@app/navigation/stack-param-lists"

type Props = StackScreenProps<RootStackParamList, "conversionConfirmation">

export const ConversionConfirmationScreen: React.FC<Props> = ({ navigation, route }) => {
  const { moneyAmount, sendingFee, receivingFee, lnInvoice, fromWalletCurrency } =
    route.params

  const styles = useStyles()
  const { LL } = useI18nContext()
  const { btcWallet } = useBreez()

  const { toggleActivityIndicator } = useActivityIndicator()
  const { swap } = useSwap()

  const [errorMessage, setErrorMessage] = useState<string | undefined>()

  const { data } = useConversionScreenQuery({
    fetchPolicy: "cache-first",
    returnPartialData: true,
  })

  const usdWallet = getCashWallet(data?.me?.defaultAccount?.wallets)

  const convertHandler = async () => {
    // No `if (lnInvoice)` guard: an empty invoice used to make this button a
    // silent dead tap. `swap()` throws on a missing invoice and the catch below
    // surfaces it.
    try {
      toggleActivityIndicator(true)
      const res = await swap(lnInvoice, fromWalletCurrency, moneyAmount.amount)
      handlePaymentComplete(res.status === "pending")
    } catch (err) {
      // A non-Error rejection (an Apollo link or a Breez binding throwing a
      // string) used to leave the spinner up forever with no message. Wrap it
      // rather than branching: the least diagnosable failure is the one that
      // most needs a Crashlytics record, and it carries the raw value so the
      // report is not just the generic copy.
      const error =
        err instanceof Error ? err : new Error(`Non-Error thrown: ${String(err)}`)
      getCrashlytics().recordError(error)
      handlePaymentError(
        err instanceof Error ? error : new Error(LL.errors.generic()),
      )
    }
  }

  const handlePaymentError = (error: Error) => {
    toggleActivityIndicator(false)
    setErrorMessage(error.message)
    toastShow({ message: error.message })
  }

  const handlePaymentComplete = (pending: boolean) => {
    toggleActivityIndicator(false)
    navigation.dispatch((state) => {
      const routes = [
        { name: "Primary" },
        { name: "conversionSuccess", params: { pending } },
      ]
      return CommonActions.reset({
        ...state,
        routes,
        index: routes.length - 1,
      })
    })
  }

  return (
    <Screen>
      <ScrollView>
        <ConfirmationDetails
          fromWallet={fromWalletCurrency === "BTC" ? btcWallet : usdWallet}
          toWallet={fromWalletCurrency === "BTC" ? usdWallet : btcWallet}
          moneyAmount={moneyAmount}
          totalFee={sendingFee + receivingFee}
        />
        {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
      </ScrollView>
      <PrimaryBtn
        label={LL.common.convert()}
        btnStyle={styles.btnStyls}
        onPress={convertHandler}
      />
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  btnStyls: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
  errorText: {
    color: colors.error,
    textAlign: "center",
  },
}))
