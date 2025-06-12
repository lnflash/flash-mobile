import React, { useState } from "react"
import { ScrollView, Text } from "react-native"
import crashlytics from "@react-native-firebase/crashlytics"
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
import { getUsdWallet } from "@app/graphql/wallets-utils"

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

  const usdWallet = getUsdWallet(data?.me?.defaultAccount?.wallets)

  const convertHandler = async () => {
    if (lnInvoice) {
      try {
        toggleActivityIndicator(true)
        const res = await swap(lnInvoice, fromWalletCurrency)
        if (res) {
          handlePaymentSuccess()
        }
      } catch (err) {
        if (err instanceof Error) {
          crashlytics().recordError(err)
          handlePaymentError(err)
        }
      }
    }
  }

  const handlePaymentError = (error: Error) => {
    toggleActivityIndicator(false)
    setErrorMessage(error.message)
    toastShow({ message: error.message })
  }

  const handlePaymentSuccess = () => {
    toggleActivityIndicator(false)
    navigation.dispatch((state) => {
      const routes = [{ name: "Primary" }, { name: "conversionSuccess" }]
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
