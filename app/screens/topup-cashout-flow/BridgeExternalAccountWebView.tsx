import React, { useState, useRef, useCallback } from "react"
import {
  View,
  ActivityIndicator,
  Linking,
  Platform,
  TouchableOpacity,
} from "react-native"
import { StackScreenProps } from "@react-navigation/stack"
import { Text, makeStyles, useTheme } from "@rneui/themed"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { WebView, WebViewNavigation } from "react-native-webview"
import Icon from "react-native-vector-icons/Ionicons"
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"

type Props = StackScreenProps<RootStackParamList, "BridgeExternalAccountWebView">

// Viewport meta injection before content loads to prevent initial zoom.
const VIEWPORT_INJECTION_JS = `(function(){const forceViewport=()=>{const content='width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';document.querySelectorAll('meta[name="viewport"]').forEach(m=>m.remove());const meta=document.createElement('meta');meta.name='viewport';meta.content=content;if(document.head){document.head.insertBefore(meta,document.head.firstChild)}else{document.documentElement.appendChild(meta)}};forceViewport();document.addEventListener('DOMContentLoaded',forceViewport);window.addEventListener('load',forceViewport);if(document.documentElement){document.documentElement.style.touchAction='pan-x pan-y'}true})();`

// iOS zoom prevention
const ZOOM_PREVENTION_JS = `(function(){
  document.querySelectorAll('meta[name="viewport"]').forEach(m=>m.remove());
  var meta=document.createElement('meta');
  meta.name='viewport';
  meta.content='width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';
  document.head.insertBefore(meta,document.head.firstChild);
  var style=document.createElement('style');
  style.innerHTML='input,textarea,select{font-size:16px!important}*{-webkit-text-size-adjust:100%!important;touch-action:manipulation!important}';
  document.head.appendChild(style);
  var preventZoom=function(e){if(e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')){e.target.style.fontSize='16px';e.target.style.transform='none'}};
  document.addEventListener('focusin',preventZoom,true);
  document.querySelectorAll('input,textarea,select').forEach(function(el){el.style.fontSize='16px'});
  var observer=new MutationObserver(function(mutations){mutations.forEach(function(m){m.addedNodes.forEach(function(n){if(n.nodeType===1){var inputs=n.querySelectorAll?n.querySelectorAll('input,textarea,select'):[];inputs.forEach(function(el){el.style.fontSize='16px'})}})})});
  if(document.body){observer.observe(document.body,{childList:true,subtree:true})}
  true})();`

const BridgeExternalAccountWebView: React.FC<Props> = ({ navigation, route }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const webViewRef = useRef<WebView>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)
  const isNavigating = useRef(false)

  const { linkUrl } = route.params

  const safeGoBack = useCallback(() => {
    if (isNavigating.current) return
    isNavigating.current = true
    navigation.goBack()
  }, [navigation])

  const handleNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      const { url } = navState

      // Check if the external account linking is complete
      if (
        url.includes("complete") ||
        url.includes("success") ||
        url.includes("connected")
      ) {
        safeGoBack()
      }
    },
    [safeGoBack],
  )

  const handleMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const data = JSON.parse(event.nativeEvent.data)
        if (data.status === "completed" || data.type === "account_linked") {
          safeGoBack()
        }
      } catch {
        // Not JSON - ignore
      }
    },
    [safeGoBack],
  )

  const handleRetry = () => {
    setError(false)
    setIsLoading(true)
    webViewRef.current?.reload()
  }

  const closeButton = (
    <View style={styles.closeButtonWrapper}>
      <TouchableOpacity
        style={styles.closeButton}
        onPress={safeGoBack}
        activeOpacity={0.7}
      >
        <Icon name="close" size={24} color={colors.black} />
      </TouchableOpacity>
    </View>
  )

  if (error) {
    return (
      <Screen unsafe preset="fixed">
        {closeButton}
        <View style={styles.centerContainer}>
          <Text type="h2" style={[styles.errorText, { color: colors.error }]}>
            Failed to load
          </Text>
          <PrimaryBtn label="Retry" onPress={handleRetry} btnStyle={styles.retryButton} />
        </View>
      </Screen>
    )
  }

  return (
    <Screen unsafe preset="fixed">
      {closeButton}
      <View style={styles.container}>
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text type="p1" style={styles.loadingText}>
              Loading External Account Setup...
            </Text>
          </View>
        )}
        <WebView
          ref={webViewRef}
          source={{ uri: linkUrl }}
          onNavigationStateChange={handleNavigationStateChange}
          onMessage={handleMessage}
          onLoadEnd={() => {
            setIsLoading(false)
            setError(false)
          }}
          onError={() => {
            setIsLoading(false)
            setError(true)
          }}
          injectedJavaScriptBeforeContentLoaded={VIEWPORT_INJECTION_JS}
          injectedJavaScript={ZOOM_PREVENTION_JS}
          style={styles.webView}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          scalesPageToFit={false}
          bounces={false}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          onShouldStartLoadWithRequest={(request) => {
            const url = request.url.toLowerCase()
            // Open external links in browser if needed
            if (url.includes("www.bridge.xyz/legal")) {
              Linking.openURL(request.url)
              return false
            }
            return true
          }}
          originWhitelist={["https://*", "http://*"]}
          userAgent={
            Platform.OS === "ios"
              ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
              : undefined
          }
        />
      </View>
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  closeButtonWrapper: {
    position: "absolute",
    zIndex: 1,
    top: 15,
    right: 15,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
  },
  container: { flex: 1 },
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
  loadingText: { marginTop: 16, textAlign: "center" },
  errorText: { textAlign: "center", marginBottom: 24 },
  retryButton: { marginTop: 16 },
  webView: { flex: 1 },
}))

export default BridgeExternalAccountWebView
