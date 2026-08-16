import React, { useEffect } from "react"
import { View } from "react-native"

import { GaloyIcon } from "@app/components/atomic/galoy-icon"
import { Screen } from "@app/components/screen"
import {
  SuccessIconAnimation,
  SuccessTextAnimation,
} from "@app/components/success-animation"
import { useI18nContext } from "@app/i18n/i18n-react"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import { Text, makeStyles } from "@rneui/themed"

const useStyles = makeStyles(() => ({
  successText: {
    marginTop: 20,
    textAlign: "center",
  },
  pendingDescription: {
    marginTop: 12,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  screen: {
    flexGrow: 1,
  },
}))

export const ConversionSuccessScreen = () => {
  const styles = useStyles()

  const navigation =
    useNavigation<StackNavigationProp<RootStackParamList, "conversionSuccess">>()
  const route = useRoute<RouteProp<RootStackParamList, "conversionSuccess">>()
  // A conversion that reached the network but has not settled must not claim
  // it completed — the funds have not moved yet, and it can still fail.
  const pending = route.params?.pending === true

  const { LL } = useI18nContext()
  // Leave an unsettled conversion on screen long enough to actually read.
  const CALLBACK_DELAY = pending ? 5000 : 3000
  useEffect(() => {
    const navigateToHomeTimeout = setTimeout(navigation.popToTop, CALLBACK_DELAY)
    return () => clearTimeout(navigateToHomeTimeout)
  }, [navigation, CALLBACK_DELAY])

  return (
    <Screen preset="scroll" style={styles.screen}>
      <View style={styles.container}>
        <SuccessIconAnimation>
          <GaloyIcon name={pending ? "payment-pending" : "payment-success"} size={128} />
        </SuccessIconAnimation>
        <SuccessTextAnimation>
          <Text type="h2" style={styles.successText}>
            {pending
              ? LL.ConversionSuccessScreen.pendingMessage()
              : LL.ConversionSuccessScreen.message()}
          </Text>
          {pending && (
            <Text type="p2" style={styles.pendingDescription}>
              {LL.ConversionSuccessScreen.pendingDescription()}
            </Text>
          )}
        </SuccessTextAnimation>
      </View>
    </Screen>
  )
}
