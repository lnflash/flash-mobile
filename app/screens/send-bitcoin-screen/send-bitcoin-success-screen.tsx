import React, { useCallback, useEffect, useState } from "react"
import Rate from "react-native-rate"
import { View, Alert } from "react-native"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { getCrashlytics } from "@react-native-firebase/crashlytics"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// hooks
import { useApolloClient } from "@apollo/client"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useDisplayCurrency, usePriceConversion } from "@app/hooks"
import { useFeedbackModalShownQuery, WalletCurrency } from "@app/graphql/generated"

// components
import {
  SuccessIconAnimation,
  SuccessTextAnimation,
} from "@app/components/success-animation"
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { SuggestionModal } from "./suggestion-modal"
import { GaloyIcon } from "@app/components/atomic/galoy-icon"

// utils
import { ratingOptions } from "@app/config"
import { testProps } from "../../utils/testProps"
import { logAppFeedback } from "@app/utils/analytics"
import { setFeedbackModalShown } from "@app/graphql/client-only-query"
import { DisplayCurrency, isNonZeroMoneyAmount } from "@app/types/amounts"

type Props = StackScreenProps<RootStackParamList, "sendBitcoinSuccess">

const SendBitcoinSuccessScreen: React.FC<Props> = ({ navigation, route }) => {
  const client = useApolloClient()
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { bottom } = useSafeAreaInsets()
  const { LL } = useI18nContext()
  const { convertMoneyAmount } = usePriceConversion()
  const { formatMoneyAmount, getSecondaryAmountIfCurrencyIsDifferent } =
    useDisplayCurrency()

  const [showSuggestionModal, setShowSuggestionModal] = useState(false)

  const feedbackShownData = useFeedbackModalShownQuery()
  const feedbackModalShown = feedbackShownData?.data?.feedbackModalShown

  if (!convertMoneyAmount) return

  // useEffect(() => {
  // if (!feedbackModalShown) {
  //   const feedbackTimeout = setTimeout(() => {
  //     requestFeedback()
  //   }, 3000)
  //   return () => {
  //     clearTimeout(feedbackTimeout)
  //   }
  // }
  // }, [client, feedbackModalShown, LL])

  // const dismiss = () => {
  //   logAppFeedback({
  //     isEnjoingApp: false,
  //   })
  //   setShowSuggestionModal(true)
  // }

  // const rateUs = () => {
  //   logAppFeedback({
  //     isEnjoingApp: true,
  //   })
  //   Rate.rate(ratingOptions, (success, errorMessage) => {
  //     if (success) {
  //       getCrashlytics().log("User went to the review page")
  //     }
  //     if (errorMessage) {
  //       getCrashlytics().recordError(new Error(errorMessage))
  //     }
  //   })
  // }

  // const requestFeedback = useCallback(() => {
  //   Alert.alert(
  //     "",
  //     LL.support.enjoyingApp(),
  //     [
  //       {
  //         text: LL.common.No(),
  //         onPress: () => dismiss(),
  //       },
  //       {
  //         text: LL.common.yes(),
  //         onPress: () => rateUs(),
  //       },
  //     ],
  //     {
  //       cancelable: true,
  //       onDismiss: () => dismiss(),
  //     },
  //   )
  //   setFeedbackModalShown(client, true)
  // }, [LL, client])

  let formattedPrimaryAmount = undefined
  let formattedSecondaryAmount = undefined
  const { walletCurrency, unitOfAccountAmount } = route.params

  if (isNonZeroMoneyAmount(unitOfAccountAmount)) {
    const isBtcDenominatedUsdWalletAmount =
      walletCurrency === WalletCurrency.Usd &&
      unitOfAccountAmount.currency === WalletCurrency.Btc

    const primaryAmount = convertMoneyAmount(unitOfAccountAmount, DisplayCurrency)

    formattedPrimaryAmount = formatMoneyAmount({
      moneyAmount: primaryAmount,
    })

    const secondaryAmount = getSecondaryAmountIfCurrencyIsDifferent({
      primaryAmount,
      walletAmount: convertMoneyAmount(unitOfAccountAmount, walletCurrency),
      displayAmount: convertMoneyAmount(unitOfAccountAmount, DisplayCurrency),
    })

    formattedPrimaryAmount = formatMoneyAmount({
      moneyAmount: primaryAmount,
      isApproximate: isBtcDenominatedUsdWalletAmount && !secondaryAmount,
    })

    formattedSecondaryAmount =
      secondaryAmount &&
      formatMoneyAmount({
        moneyAmount: secondaryAmount,
        isApproximate:
          isBtcDenominatedUsdWalletAmount &&
          secondaryAmount.currency === WalletCurrency.Usd,
      })
  }

  const onPressDone = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: "Primary" }],
    })
  }

  return (
    <Screen unsafe backgroundColor={colors.accent02}>
      <View style={styles.container}>
        <SuccessIconAnimation>
          <GaloyIcon name={"send-success"} size={128} />
        </SuccessIconAnimation>
        <SuccessTextAnimation>
          <Text
            {...testProps("Success Text")}
            type="h01"
            style={[styles.successText, { marginTop: 32 }]}
          >
            {LL.SendBitcoinScreen.success()}
          </Text>
          <Text {...testProps("Success Text")} type="h03" style={styles.successText}>
            {formattedPrimaryAmount}
          </Text>
          <Text
            {...testProps("Success Text")}
            type="h01"
            style={[styles.successText, { color: "rgba(255,255,255,.7)" }]}
          >
            {formattedSecondaryAmount}
          </Text>
        </SuccessTextAnimation>
      </View>
      <PrimaryBtn
        label="Done"
        onPress={onPressDone}
        btnStyle={{
          backgroundColor: "#fff",
          marginHorizontal: 20,
          marginBottom: bottom || 20,
        }}
        txtStyle={{ color: "#002118" }}
      />
      <SuggestionModal
        navigation={navigation}
        showSuggestionModal={showSuggestionModal}
        setShowSuggestionModal={setShowSuggestionModal}
      />
    </Screen>
  )
}

const useStyles = makeStyles(() => ({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  successText: {
    textAlign: "center",
    color: "#fff",
    marginBottom: 8,
  },
}))

export default SendBitcoinSuccessScreen
