import React, { useState, useRef } from "react"
import { View, ActivityIndicator, Alert } from "react-native"
import { StackScreenProps } from "@react-navigation/stack"
import { Text, makeStyles, useTheme } from "@rneui/themed"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { WebView } from "react-native-webview"

// components
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useHomeAuthedQuery } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"

type Props = StackScreenProps<RootStackParamList, "CardPayment">

const CardPayment: React.FC<Props> = ({ navigation, route }) => {
  const isAuthed = useIsAuthed()
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()

  const webViewRef = useRef<WebView>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)

  const { data } = useHomeAuthedQuery({
    skip: !isAuthed,
    fetchPolicy: "cache-first",
  })

  const { email, amount, wallet } = route.params

  const username = data?.me?.username || "user"
  const paymentUrl = `https://fygaro.com/en/pb/bd4a34c1-3d24-4315-a2b8-627518f70916?amount=${amount}&client_reference=${username}`

  const handleNavigationStateChange = (navState: { url: string }) => {
    const { url } = navState

    // Check for success URL pattern
    if (url.includes("success") || url.includes("payment_success")) {
      // Mock successful payment response
      const mockTransactionId = `txn_${Date.now()}`

      navigation.navigate("paymentSuccess", {
        amount,
        wallet,
        transactionId: mockTransactionId,
      })
    }

    // Check for error/failure URLs
    if (url.includes("error") || url.includes("failed") || url.includes("cancelled")) {
      Alert.alert("Payment Failed", "Your payment was not completed. Please try again.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ])
    }
  }

  const handleLoadEnd = () => {
    setIsLoading(false)
    setError(false)
  }

  const handleError = () => {
    setIsLoading(false)
    setError(true)
  }

  const handleRetry = () => {
    setError(false)
    setIsLoading(true)
    if (webViewRef.current) {
      webViewRef.current.reload()
    }
  }

  const isAllowedDomain = (url: string): boolean => {
    // Security check: only allow Fygaro domains
    const allowedDomains = [
      "fygaro.com",
      "www.fygaro.com",
      "api.fygaro.com",
      "checkout.fygaro.com",
    ]

    try {
      const domain = new URL(url).hostname
      return allowedDomains.includes(domain)
    } catch {
      return false
    }
  }

  const handleShouldStartLoadWithRequest = (request: { url: string }) => {
    return isAllowedDomain(request.url)
  }

  if (error) {
    return (
      <Screen>
        <View style={styles.centerContainer}>
          <Text type="h2" style={[styles.errorText, { color: colors.error }]}>
            {LL.FygaroWebViewScreen.error()}
          </Text>
          <PrimaryBtn
            label={LL.FygaroWebViewScreen.retry()}
            onPress={handleRetry}
            btnStyle={styles.retryButton}
          />
        </View>
      </Screen>
    )
  }

  return (
    <Screen>
      <View style={styles.container}>
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text type="p1" style={styles.loadingText}>
              {LL.FygaroWebViewScreen.loading()}
            </Text>
          </View>
        )}

        <WebView
          ref={webViewRef}
          source={{ uri: paymentUrl }}
          onNavigationStateChange={handleNavigationStateChange}
          onLoadEnd={handleLoadEnd}
          onError={handleError}
          onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
          style={styles.webView}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          scalesPageToFit={true}
          bounces={false}
          scrollEnabled={true}
          allowsBackForwardNavigationGestures={true}
          userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1"
        />
      </View>
    </Screen>
  )
}

const useStyles = makeStyles(() => ({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    zIndex: 1,
  },
  loadingText: {
    marginTop: 16,
    textAlign: "center",
  },
  errorText: {
    textAlign: "center",
    marginBottom: 24,
  },
  retryButton: {
    marginTop: 16,
  },
  webView: {
    flex: 1,
  },
}))

export default CardPayment
