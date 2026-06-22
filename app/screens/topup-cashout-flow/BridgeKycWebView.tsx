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

type Props = StackScreenProps<RootStackParamList, "BridgeKycWebView">

type Step = "tos" | "kyc"

// Injected JS to detect ToS acceptance.
// The Bridge ToS page is a SPA — after clicking "Accept", the page content
// updates inline without a URL change. We intercept the Accept button click,
// then poll for the page content change that indicates acceptance.
const TOS_INJECTED_JS = `(function() {
  var accepted = false;
  var initialText = '';

  function notifyAccepted() {
    if (accepted) return;
    accepted = true;
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'tos_accepted' }));
  }

  function checkForContentChange() {
    if (accepted) return;
    var currentText = document.body ? document.body.innerText : '';
    var buttons = document.querySelectorAll('button');
    var hasAcceptButton = false;
    buttons.forEach(function(btn) {
      if (btn.innerText.trim().toLowerCase() === 'accept') hasAcceptButton = true;
    });
    if (!hasAcceptButton && initialText && currentText !== initialText) {
      notifyAccepted();
    }
  }

  setTimeout(function() {
    initialText = document.body ? document.body.innerText : '';
  }, 2000);

  document.addEventListener('click', function(e) {
    var target = e.target;
    while (target && target !== document.body) {
      if (target.tagName === 'BUTTON' || target.tagName === 'A') {
        var text = (target.innerText || '').trim().toLowerCase();
        if (text === 'accept' || text === 'i accept' || text === 'agree') {
          setTimeout(checkForContentChange, 1500);
          setTimeout(checkForContentChange, 3000);
          setTimeout(checkForContentChange, 5000);
          break;
        }
      }
      target = target.parentElement;
    }
  }, true);

  if (document.body) {
    var clickedAccept = false;
    document.addEventListener('click', function() { clickedAccept = true; }, true);
    var observer = new MutationObserver(function() {
      if (clickedAccept) checkForContentChange();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  true;
})();`

// iOS zoom prevention: force 16px font on inputs, disable text-size-adjust,
// and use MutationObserver for dynamically added inputs.
// Note: Removed touch-action manipulation to allow camera auto-capture to work properly
const KYC_ZOOM_PREVENTION_JS = `(function(){
  document.querySelectorAll('meta[name="viewport"]').forEach(m=>m.remove());
  var meta=document.createElement('meta');
  meta.name='viewport';
  meta.content='width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=5, user-scalable=yes';
  document.head.insertBefore(meta,document.head.firstChild);
  var style=document.createElement('style');
  style.innerHTML='input,textarea,select{font-size:16px!important}*{-webkit-text-size-adjust:100%!important}';
  document.head.appendChild(style);
  var preventZoom=function(e){if(e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')){e.target.style.fontSize='16px';e.target.style.transform='none'}};
  document.addEventListener('focusin',preventZoom,true);
  document.querySelectorAll('input,textarea,select').forEach(function(el){el.style.fontSize='16px'});
  var observer=new MutationObserver(function(mutations){mutations.forEach(function(m){m.addedNodes.forEach(function(n){if(n.nodeType===1){var inputs=n.querySelectorAll?n.querySelectorAll('input,textarea,select'):[];inputs.forEach(function(el){el.style.fontSize='16px'})}})})});
  if(document.body){observer.observe(document.body,{childList:true,subtree:true})}
  true})();`

// Viewport meta injection before content loads to prevent initial zoom.
// Updated to allow scaling and removed restrictive touch-action for camera functionality
const VIEWPORT_INJECTION_JS = `(function(){const forceViewport=()=>{const content='width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=5, user-scalable=yes';document.querySelectorAll('meta[name="viewport"]').forEach(m=>m.remove());const meta=document.createElement('meta');meta.name='viewport';meta.content=content;if(document.head){document.head.insertBefore(meta,document.head.firstChild)}else{document.documentElement.appendChild(meta)}};forceViewport();document.addEventListener('DOMContentLoaded',forceViewport);window.addEventListener('load',forceViewport);true})();`

const BridgeKycWebView: React.FC<Props> = ({ navigation, route }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const webViewRef = useRef<WebView>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [currentStep, setCurrentStep] = useState<Step>("tos")
  const [error, setError] = useState(false)
  const isNavigating = useRef(false)

  const { tosLink, kycLink } = route.params

  const currentUrl = currentStep === "tos" ? tosLink : kycLink

  const safeGoBack = useCallback(() => {
    if (isNavigating.current) return
    isNavigating.current = true
    navigation.goBack()
  }, [navigation])

  const handleNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      const { url } = navState

      if (currentStep === "kyc") {
        if (
          url.includes("complete") ||
          url.includes("success") ||
          url.includes("verified")
        ) {
          safeGoBack()
        }
      }
    },
    [currentStep, safeGoBack],
  )

  const handleMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const data = JSON.parse(event.nativeEvent.data)
        if (currentStep === "tos" && data.type === "tos_accepted") {
          setCurrentStep("kyc")
          setIsLoading(true)
        } else if (currentStep === "kyc" && data.status === "completed") {
          safeGoBack()
        }
      } catch {
        // Not JSON - ignore
      }
    },
    [currentStep, safeGoBack],
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
              {currentStep === "tos"
                ? "Loading Terms of Service..."
                : "Loading KYC Verification..."}
            </Text>
          </View>
        )}
        <WebView
          key={currentStep}
          ref={webViewRef}
          source={{ uri: currentUrl }}
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
          injectedJavaScript={
            currentStep === "tos" ? TOS_INJECTED_JS : KYC_ZOOM_PREVENTION_JS
          }
          style={styles.webView}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          scalesPageToFit={false}
          bounces={false}
          scrollEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo={false}
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
          onShouldStartLoadWithRequest={(request) => {
            // During ToS step, open terms/privacy links in external browser
            if (currentStep === "tos" && request.url !== tosLink) {
              const url = request.url.toLowerCase()
              if (url.includes("www.bridge.xyz/legal")) {
                Linking.openURL(request.url)
                return false
              }
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

export default BridgeKycWebView
