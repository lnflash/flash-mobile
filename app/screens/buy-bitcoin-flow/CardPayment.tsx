/**
 * CardPayment Component
 *
 * This component handles the web-based card payment flow for topping up Flash wallets.
 * It embeds external payment provider forms (Fygaro, PayPal, Stripe) in a WebView
 * and manages the entire payment lifecycle.
 *
 * Key features:
 * - Embeds Fygaro payment form (and other providers) in WebView
 * - Prevents iOS zoom issues when users tap input fields
 * - Domain whitelisting for security
 * - Handles payment success/failure callbacks
 * - Desktop user agent spoofing on iOS to prevent mobile-specific issues
 */

import React, { useState, useRef } from "react"
import { View, ActivityIndicator, Alert, Platform } from "react-native"
import { StackScreenProps } from "@react-navigation/stack"
import { Text, makeStyles, useTheme } from "@rneui/themed"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { WebView } from "react-native-webview"
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"
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

  // Get authenticated user data to extract username for webhook processing
  const { data } = useHomeAuthedQuery({ skip: !isAuthed, fetchPolicy: "cache-first" })
  const { amount, wallet } = route.params
  const username = data?.me?.username || "user"

  /**
   * Build Fygaro payment URL with critical parameters:
   * - amount: The payment amount in USD
   * - client_reference: Flash username (CRITICAL: used by webhook to identify user)
   *
   * NOTE: The user will enter their email directly on Fygaro's form to avoid
   * double entry. The email is only for Fygaro's records, not for Flash processing.
   */
  const paymentUrl = `https://fygaro.com/en/pb/bd4a34c1-3d24-4315-a2b8-627518f70916?amount=${amount}&client_reference=${username}`

  /**
   * Domain whitelist for security.
   *
   * Only allows navigation to trusted payment provider domains.
   * This prevents:
   * - Phishing attacks via redirect
   * - Malicious JavaScript injection
   * - Data exfiltration to unauthorized domains
   *
   * Includes all necessary domains for:
   * - Fygaro (primary provider)
   * - PayPal (Fygaro uses PayPal for processing)
   * - Stripe (future provider support)
   */
  const allowedDomains = [
    "fygaro.com",
    "www.fygaro.com",
    "api.fygaro.com",
    "checkout.fygaro.com",
    // PayPal domains (required for Fygaro's PayPal integration)
    "www.paypal.com",
    "checkout.paypal.com",
    "paypalobjects.com",
    "paypal-activation.com",
    "paypal.com",
    "paypal-cdn.com",
    "paypal-experience.com",
    "paypal-dynamic-assets.com",
    "paypalcorp.com",
    // Stripe domains (for future integration)
    "stripe.com",
    "checkout.stripe.com",
    "js.stripe.com",
    "m.stripe.com",
  ]

  /**
   * Monitors URL changes to detect payment completion.
   *
   * Payment providers redirect to specific URLs on success/failure:
   * - Success: URL contains "success" or "payment_success"
   * - Failure: URL contains "error", "failed", or "cancelled"
   *
   * On success: Navigate to success screen (webhook will handle actual crediting)
   * On failure: Show error alert and allow retry
   *
   * NOTE: The actual account crediting happens via webhook on the backend.
   * This frontend handling is just for UX feedback.
   */
  const handleNavigationStateChange = ({ url }: { url: string }) => {
    if (url.includes("success") || url.includes("payment_success")) {
      // Payment succeeded - navigate to success screen
      // The webhook will handle the actual wallet credit
      navigation.navigate("paymentSuccess", {
        amount,
        wallet,
        transactionId: `txn_${Date.now()}`, // Temporary ID for UI
      })
    } else if (
      url.includes("error") ||
      url.includes("failed") ||
      url.includes("cancelled")
    ) {
      // Payment failed - show error and allow retry
      Alert.alert("Payment Failed", "Your payment was not completed. Please try again.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ])
    }
  }

  /**
   * Validates if a URL is from an allowed domain.
   *
   * Security function that checks URLs against our whitelist.
   * Handles:
   * - Exact domain matches (paypal.com)
   * - Subdomain matches (checkout.paypal.com)
   * - Invalid URLs (returns false)
   *
   * This prevents navigation to untrusted domains.
   */
  const isAllowedDomain = (url: string): boolean => {
    try {
      const domain = new URL(url).hostname
      return allowedDomains.some(
        (allowed) =>
          domain === allowed || // Exact match
          domain.endsWith(`.${allowed}`) || // Subdomain match
          allowed.endsWith(`.${domain}`), // Parent domain match
      )
    } catch {
      // Invalid URL - deny by default
      return false
    }
  }

  const handleRetry = () => {
    setError(false)
    setIsLoading(true)
    webViewRef.current?.reload()
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
          onLoadEnd={() => {
            setIsLoading(false)
            setError(false)
          }}
          onError={() => {
            setIsLoading(false)
            setError(true)
          }}
          /**
           * URL navigation filter for security and iOS compatibility.
           *
           * This callback determines which URLs the WebView can navigate to.
           * Platform-specific logic:
           *
           * iOS:
           * - Allows about:, blob:, data: schemes (prevents warnings)
           * - Allows all HTTPS URLs (PayPal requires many domains)
           * - Blocks HTTP to enforce encryption
           *
           * Android:
           * - Uses strict domain whitelist
           * - More restrictive but more secure
           *
           * The iOS approach is less restrictive due to PayPal's complex
           * redirect flow that uses many subdomains not in our whitelist.
           */
          onShouldStartLoadWithRequest={({ url }) => {
            // Allow about: URLs (used for iframes) to prevent iOS warnings
            if (url.startsWith("about:")) {
              return true
            }

            // Allow blob: and data: URLs for embedded content
            if (url.startsWith("blob:") || url.startsWith("data:")) {
              return true
            }

            // iOS: Allow HTTPS and internal URLs
            // Less restrictive due to PayPal's complex domain requirements
            if (Platform.OS === "ios") {
              return url.startsWith("https://") || !url.startsWith("http")
            }

            // Android: Use domain whitelist for stricter security
            return isAllowedDomain(url)
          }}
          style={styles.webView}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          scalesPageToFit={false}
          bounces={false}
          scrollEnabled
          allowsBackForwardNavigationGestures
          allowsInlineMediaPlayback
          allowsFullscreenVideo={false}
          allowFileAccess={false}
          allowUniversalAccessFromFileURLs={false}
          mixedContentMode="never"
          originWhitelist={["https://*", "http://*", "about:*", "data:*", "blob:*"]}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          cacheEnabled
          incognito={false}
          webviewDebuggingEnabled={__DEV__}
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
          allowsLinkPreview={false}
          injectedJavaScriptForMainFrameOnly
          /**
           * Custom User Agent for iOS to prevent zoom issues.
           *
           * CRITICAL: This desktop user agent prevents iOS WebView from:
           * - Auto-zooming when users tap input fields
           * - Showing mobile-specific layouts that break
           * - Triggering viewport zoom on focus
           *
           * Without this, iOS WebView zooms in when users tap the
           * payment form fields, creating a poor user experience.
           *
           * Android doesn't need this workaround.
           */
          userAgent={
            Platform.OS === "ios"
              ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
              : undefined
          }
          dataDetectorTypes="none"
          /**
           * Pre-content JavaScript injection for early zoom prevention.
           *
           * Executes BEFORE the page content loads to:
           * - Force viewport meta tag with no zoom
           * - Set touch-action CSS to prevent pinch zoom
           * - Run on multiple events to catch dynamic content
           *
           * This is the first line of defense against iOS zoom issues.
           */
          injectedJavaScriptBeforeContentLoaded={`(function(){const forceViewport=()=>{const content='width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';document.querySelectorAll('meta[name="viewport"]').forEach(m=>m.remove());const meta=document.createElement('meta');meta.name='viewport';meta.content=content;if(document.head){document.head.insertBefore(meta,document.head.firstChild)}else{document.documentElement.appendChild(meta)}};forceViewport();document.addEventListener('DOMContentLoaded',forceViewport);window.addEventListener('load',forceViewport);if(document.documentElement){document.documentElement.style.touchAction='pan-x pan-y'}true})();`}
          /**
           * Post-content JavaScript injection for comprehensive zoom prevention.
           *
           * This aggressive approach handles:
           * 1. Viewport meta tag enforcement
           * 2. CSS styles to prevent zoom (16px font size is key)
           * 3. Focus event handlers to reset zoom on input focus
           * 4. MutationObserver to handle dynamically added inputs
           * 5. Double-tap prevention
           *
           * The 16px font size is critical - iOS auto-zooms on inputs
           * with font size less than 16px.
           *
           * Combined with desktop user agent, this completely prevents
           * the iOS zoom issue that occurs when users tap payment form fields.
           */
          injectedJavaScript={`(function(){
            // Zoom prevention code only
            document.querySelectorAll('meta[name="viewport"]').forEach(m=>m.remove());
            const meta=document.createElement('meta');
            meta.name='viewport';
            meta.content='width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';
            document.head.insertBefore(meta,document.head.firstChild);

            const style=document.createElement('style');
            style.innerHTML='*{-webkit-text-size-adjust:100%!important;text-size-adjust:100%!important;-webkit-user-select:none!important;user-select:none!important;touch-action:manipulation!important}html,body{touch-action:pan-x pan-y!important;overflow-x:hidden!important}input,textarea,select,button{font-size:16px!important;transform:none!important;zoom:reset!important;-webkit-appearance:none!important}input:focus,textarea:focus,select:focus{font-size:16px!important;zoom:1!important}';
            document.head.appendChild(style);

            const preventZoom=e=>{if(e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')){e.target.style.fontSize='16px';e.target.style.transform='scale(1)';e.target.style.zoom='1';const oldMeta=document.querySelector('meta[name="viewport"]');if(oldMeta){oldMeta.content='width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'}}};
            document.addEventListener('focusin',preventZoom,true);
            document.addEventListener('focus',preventZoom,true);

            // Watch for dynamically added inputs and apply zoom prevention
            const observer=new MutationObserver(mutations=>{
              mutations.forEach(mutation=>{
                mutation.addedNodes.forEach(node=>{
                  if(node.nodeType===1){
                    const inputs=node.querySelectorAll?node.querySelectorAll('input, textarea, select'):[];
                    inputs.forEach(input=>{
                      input.style.fontSize='16px';
                      input.addEventListener('focus',preventZoom,true);
                    });
                  }
                })
              })
            });

            if(document.body){observer.observe(document.body,{childList:true,subtree:true})}

            document.querySelectorAll('input, textarea, select').forEach(el=>{el.style.fontSize='16px';el.addEventListener('focus',preventZoom,true)});

            let lastTouchEnd=0;
            document.addEventListener('touchend',e=>{const now=Date.now();if(now-lastTouchEnd<=300){e.preventDefault()}lastTouchEnd=now},{passive:false});

            true
          })();`}
        />
      </View>
    </Screen>
  )
}

const useStyles = makeStyles(() => ({
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

export default CardPayment
