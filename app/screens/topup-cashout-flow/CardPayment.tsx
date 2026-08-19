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

import React, { useCallback, useState, useRef, useEffect, useLayoutEffect } from "react"
import { View, ActivityIndicator, Alert, Platform, TouchableOpacity } from "react-native"
import { StackScreenProps } from "@react-navigation/stack"
import { Text, makeStyles, useTheme } from "@rneui/themed"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { WebView } from "react-native-webview"
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useHomeAuthedQuery } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import {
  useFygaroCheckout,
  type FygaroCheckoutResult,
} from "@app/hooks/use-fygaro-checkout"

type Props = StackScreenProps<RootStackParamList, "CardPayment">

// Fygaro hosted payment-button path.
const FYGARO_PAYMENT_BUTTON_PATH = "/pb/bd4a34c1-3d24-4315-a2b8-627518f70916"

/**
 * How long the screen waits for the signed link before loading the one that has
 * always worked.
 *
 * The deadline is a SEPARATE timer, not a check inside the request, for the
 * same reason it is one in use-fygaro-topup-status.ts and TopupDetails.tsx: a
 * deadline that depends on the thing it is a deadline FOR is not a deadline.
 * Nothing under `requestCheckout` will ever time this out — React Native sets
 * no default network timeout on Android and this app's HttpLink
 * (app/graphql/client.tsx) passes no AbortController, so a stalled connection
 * produces a promise that HANGS rather than one that rejects. Apollo's RetryLink
 * only retries on an error, which a hang never produces. Without this the
 * checkout state stays `requesting` forever: a permanent "Loading…" with no
 * WebView, no error screen and no Retry — worse than the behaviour before the
 * signed link existed, where a dead network at least reached the WebView's own
 * onError and its working Retry.
 *
 * Long enough that a merely slow round trip still wins the race (the signed
 * link is worth waiting for, and giving up early wastes a reservation the
 * server may have minted), short enough that nobody is stranded.
 */
const CHECKOUT_DEADLINE_MS = 10_000

// Static style for the header Done button. Kept at module scope (not in
// makeStyles) so the header useLayoutEffect can depend on stable values only —
// makeStyles returns a fresh styles object every render, which would re-run
// the effect and rebuild the header on each render.
const headerDoneStyle = { paddingHorizontal: 16, paddingVertical: 8 }

/**
 * Where the checkout request has got to. Modelled explicitly because the states
 * that all have no URL are NOT the same thing: "the server has not answered
 * yet" is the normal first second of every card top-up, while a refusal is a
 * definite answer with its own wording and its own next step. Collapsing them
 * into `url === null` put the "Something went wrong / Retry" screen in front of
 * every customer on first paint, and later put it in front of refusals whose
 * actual reason the customer never got to read.
 */
type CheckoutState =
  | { status: "requesting" }
  | { status: "ready"; url: string; checkoutId?: string }
  /**
   * The top-up was not authorised, and nothing has been charged.
   *
   * `retryable` splits the two kinds of "not authorised", because they have
   * opposite next steps and the screen used to give both the same one:
   *
   * - `false`/absent — the SERVER refused this AMOUNT, in its own words ("you
   *   have $4.48 left of today's limit"). Changing the amount is the only
   *   action that can succeed; a retry re-requests the identical amount and is
   *   refused identically.
   * - `true` — nothing was decided about the amount at all: the backend threw,
   *   or we never heard back. Headlining that with "Can't top up this amount"
   *   over a "Change amount" button tells a customer their $50 is the problem
   *   while ERPNext is down, so they try $40, then $30, hit the identical error
   *   each time, and conclude their account is limited. Same failure, three
   *   wasted attempts and a support ticket.
   */
  | { status: "refused"; message: string; retryable?: boolean }

/**
 * Build Fygaro payment URL with critical parameters:
 * - amount: The payment amount in USD
 * - custom_reference: Flash username (CRITICAL: ties the payment to a Flash
 *   account — Fygaro's checkout reads `custom_reference`; the previously used
 *   `client_reference` is silently ignored and left every payment unattributed)
 * - client_note: target wallet, recorded on the Fygaro payment for ops/audit
 *   (informational only — the backend credits the USD cash wallet regardless)
 *
 * Only ever called with a known username: a payment without a real username
 * cannot be credited to anyone, so the WebView must never load with a
 * placeholder reference.
 *
 * NOTE: The user will enter their email directly on Fygaro's form to avoid
 * double entry. The email is only for Fygaro's records, not for Flash processing.
 */
const buildLegacyPaymentUrl = (username: string, amount: number, wallet: string) =>
  `https://fygaro.com/en${FYGARO_PAYMENT_BUTTON_PATH}?amount=${amount}&custom_reference=${encodeURIComponent(
    username,
  )}&client_note=${encodeURIComponent(`wallet:${wallet}`)}`

const CardPayment: React.FC<Props> = ({ navigation, route }) => {
  const isAuthed = useIsAuthed()
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const webViewRef = useRef<WebView>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)
  // No URL until the server has answered, so the WebView never loads the
  // editable link while a signed one is still on its way.
  const [checkout, setCheckout] = useState<CheckoutState>({ status: "requesting" })
  const checkoutRequested = useRef(false)
  const { requestCheckout } = useFygaroCheckout()

  // Get authenticated user data to extract username for webhook processing
  const {
    data,
    loading: usernameLoading,
    refetch,
  } = useHomeAuthedQuery({
    skip: !isAuthed,
    fetchPolicy: "cache-first",
  })
  const { amount, wallet } = route.params
  const username = data?.me?.username

  /**
   * Persistent header exit. The payment can complete entirely inside
   * Fygaro's page (SPA state change, PayPal modal) with no URL change for
   * onNavigationStateChange to detect — leaving the user stranded in the
   * WebView with only back-navigation through the whole top-up stack. The
   * header Done button guarantees a one-tap path straight home; leaving
   * early is safe because crediting is webhook-driven on the backend, not
   * dependent on this screen.
   */
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: LL.FygaroWebViewScreen.title(),
      headerRight: () => (
        <TouchableOpacity
          style={headerDoneStyle}
          onPress={() => navigation.navigate("Primary")}
        >
          <Text type="p1" color={colors.primary}>
            {LL.PaymentSuccessScreen.done()}
          </Text>
        </TouchableOpacity>
      ),
    })
  }, [navigation, LL, colors.primary])

  /**
   * Everything the checkout effect needs but which must NOT be able to restart
   * it. `LL` and `navigation` are only read when a refusal has to be announced,
   * and a change in either is no reason to abandon an in-flight reservation —
   * so they are read through a ref instead of sitting in the dependency array.
   *
   * This is not hypothetical tidiness. Apollo's `useMutation` calls
   * `setResult({ loading: true })` synchronously as the mutation is invoked, so
   * the screen re-renders while the request is in flight; any unstable
   * dependency at that moment runs the cleanup below, sets `cancelled = true`,
   * and the re-run bails on `checkoutRequested.current`. The answer then lands
   * on a cancelled run, `setCheckout` never fires, and the WebView never gets a
   * URL — card top-ups dead on arrival.
   */
  const checkoutDeps = useRef({ LL, navigation })
  useLayoutEffect(() => {
    checkoutDeps.current = { LL, navigation }
  })

  /**
   * Ask the server to authorise this top-up and sign the link, and fall back to
   * the device-built URL when it will not or cannot.
   *
   * The signed link is the point: its amount lives inside a JWT rather than an
   * editable query parameter, and the allowance is checked BEFORE the card is
   * charged rather than after — which is the only moment refusing costs the
   * customer nothing. A refusal here is free; the same refusal at the webhook
   * means they have already paid.
   *
   * Runs once per mount, keyed on the username being known. Re-requesting on
   * every render would mint a fresh reservation each time and eat the
   * customer's own allowance while they sit on the screen.
   */
  useEffect(() => {
    if (!username || checkoutRequested.current) return
    checkoutRequested.current = true

    const legacyPaymentUrl = buildLegacyPaymentUrl(username, amount, wallet)

    let cancelled = false
    let deadline: ReturnType<typeof setTimeout> | undefined
    const run = async () => {
      // Whichever answer arrives first wins. The deadline's answer is its OWN
      // kind, deliberately not `unavailable`.
      //
      // `unavailable` means the server has no opinion — the request never
      // reached it, the backend predates the mutation, or the feature is off —
      // and the legacy editable link is then exactly the status quo. A TIMEOUT
      // is different in the way that matters: the server may well have decided,
      // and refused, and we simply did not wait to hear it. Degrading to the
      // legacy link there would charge a customer the backend was in the middle
      // of protecting — the 2026-08-16 incident through a different door.
      //
      // A late answer landing after the deadline is deliberately ignored: by
      // then the customer may already be typing card details.
      const result = await Promise.race<FygaroCheckoutResult>([
        requestCheckout(Math.round(amount * 100)),
        new Promise<FygaroCheckoutResult>((resolve) => {
          deadline = setTimeout(() => resolve({ kind: "timedOut" }), CHECKOUT_DEADLINE_MS)
        }),
      ])
      if (deadline) clearTimeout(deadline)
      if (cancelled) return

      if (result.kind === "signed") {
        setCheckout({
          status: "ready",
          url: result.url,
          checkoutId: result.checkoutId,
        })
        return
      }

      if (result.kind === "refused") {
        // Nothing has been charged. Show the server's wording — it is the only
        // side that knows which limit was tripped and by how much — and send
        // them back to change the amount.
        //
        // The message goes into STATE, not only into the alert. An alert is
        // cancelable by default on Android, so the back button dismisses it
        // without ever firing `goBack`; when the reason lived only in the alert
        // the customer was left on a generic "Something went wrong / Retry",
        // with the one thing they needed to read already gone and a button that
        // could only re-request the same refused amount.
        setCheckout({ status: "refused", message: result.message })
        const { LL: currentLL, navigation: currentNavigation } = checkoutDeps.current
        Alert.alert(currentLL.TopupDetails.cannotTopUp(), result.message, [
          { text: currentLL.common.ok(), onPress: () => currentNavigation.goBack() },
        ])
        return
      }

      if (result.kind === "serverError") {
        // The server answered, and its answer was an exception. It did not
        // authorise this top-up, and whatever is broken behind it (ERPNext,
        // the reservation index) is the same thing the webhook has to read
        // before it can credit. Refusing costs the customer nothing here;
        // handing them the editable link costs them a capture we cannot
        // credit. No server sentence exists to render, so this is the one
        // refusal whose wording is ours.
        setCheckout({
          status: "refused",
          message: checkoutDeps.current.LL.TopupDetails.checkoutFailed(),
          // The amount was never the problem — nothing got as far as judging
          // it — so the next step is "try again", not "change amount".
          retryable: true,
        })
        return
      }

      if (result.kind === "timedOut") {
        // Refuse rather than charge. Nothing has been taken at this point, so
        // "try again" costs the customer nothing — whereas handing them an
        // editable link the server may have been about to refuse costs them a
        // capture we then cannot credit. Free to say no now, expensive later:
        // that asymmetry is the whole reason this screen asks the server first.
        setCheckout({
          status: "refused",
          message: checkoutDeps.current.LL.TopupDetails.checkoutTimedOut(),
          // Nobody judged the amount here either — we simply did not wait long
          // enough to hear. "Check your connection and try again" is the body
          // copy; the button has to agree with it.
          retryable: true,
        })
        return
      }

      // `unavailable`: signed checkout is off, the backend predates it, or the
      // request never reached a server that could have an opinion. None of
      // those are the customer's fault and none of them withhold a decision, so
      // fall back to the link that has always worked rather than blocking.
      setCheckout({ status: "ready", url: legacyPaymentUrl })
    }
    run().catch(() => {
      // Fail CLOSED. This catch sits downstream of the refusal branch: that
      // branch writes `{status:"refused"}` and only THEN calls Alert.alert, so
      // anything throwing after the state write (a stubbed-out Alert, a
      // navigation object torn down mid-flight) used to land here and replace
      // the refusal with the editable legacy link the server had just refused.
      //
      // Nothing reaching here is a known-safe degrade either: `requestCheckout`
      // converts every legitimate one to `unavailable` internally, and that is
      // handled above. So the only honest answer left is "we could not set this
      // up", which charges nobody.
      if (!cancelled) {
        setCheckout({
          status: "refused",
          message: checkoutDeps.current.LL.TopupDetails.checkoutFailed(),
          // Same wording as the `serverError` branch, so the same headline and
          // the same button: whatever went wrong here, it was not the amount.
          retryable: true,
        })
      }
    })

    return () => {
      cancelled = true
      if (deadline) clearTimeout(deadline)
    }
  }, [username, amount, wallet, requestCheckout])

  const paymentUrl = checkout.status === "ready" ? checkout.url : null
  const checkoutId = checkout.status === "ready" ? checkout.checkoutId : undefined

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
   * Outcome signals, in order of authority:
   * - `?success=1|0` query param: Fygaro's checkout returns to the
   *   payment-button URL itself with this param after external-processor
   *   flows (PayPal), so it must be read even on the /pb/ path.
   * - Keywords ("success", "error", "failed", "cancelled") matched against
   *   host+path ONLY — never the query string, which embeds the
   *   user-controlled username (custom_reference): a username like
   *   "success-story" must never fake a payment outcome.
   *
   * On success: Navigate to success screen (webhook will handle actual crediting)
   * On failure: Show error alert and allow retry
   *
   * NOTE: The actual account crediting happens via webhook on the backend.
   * This frontend handling is just for UX feedback.
   */
  const handleNavigationStateChange = ({ url }: { url: string }) => {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      // about:/blob:/data: and other non-hierarchical URLs carry no outcome
      return
    }

    const successParam = parsed.searchParams.get("success")
    const hostAndPath = `${parsed.host}${parsed.pathname}`

    if (successParam === "1" || hostAndPath.includes("success")) {
      // Payment succeeded - navigate to success screen
      // The webhook will handle the actual wallet credit
      // The Fygaro redirect proves the CARD was charged. It says nothing about
      // whether Flash credited the wallet, and those are different events —
      // this screen used to assert the second from the first, and told one
      // customer "Deposited to <wallet>" three times for two payments that were
      // never credited. Hand over the checkout id so the next screen can ask.
      navigation.navigate("paymentSuccess", {
        amount,
        wallet,
        checkoutId,
      })
    } else if (
      successParam === "0" ||
      hostAndPath.includes("error") ||
      hostAndPath.includes("failed") ||
      hostAndPath.includes("cancelled")
    ) {
      // Payment failed - show error and allow retry.
      // Localised like every other outcome message on this screen: a raw
      // English literal here fixes the failure path for English speakers only,
      // which is the exact argument that got the success path translated.
      Alert.alert(
        LL.FygaroWebViewScreen.paymentFailedTitle(),
        LL.FygaroWebViewScreen.paymentFailedMessage(),
        [{ text: LL.common.ok(), onPress: () => navigation.goBack() }],
      )
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

  const handleRetry = useCallback(() => {
    setError(false)
    setIsLoading(true)
    if (!username) {
      // The username never resolved, so there is no WebView to reload — and
      // cache-first won't re-ask the server on its own. Refetch the account
      // query; a failure lands back on the error screen.
      refetch?.().catch(() => setError(true))
      return
    }
    // Nothing else can put the customer here. The generic error screen renders
    // only on `error || usernameMissing`; the missing username is handled above,
    // and `error` is set exclusively by the WebView's `onError` — which requires
    // a mounted WebView, which requires `status === "ready"`. A branch for
    // re-requesting a failed checkout would be dead code: a request that fails
    // resolves to `unavailable` and loads the legacy URL, so it is never the
    // reason anyone is looking at this button.
    webViewRef.current?.reload()
  }, [username, refetch])

  // A refusal has an answer attached, and it is not the generic error screen's.
  // Which answer depends on WHO refused, and the headline and the button have
  // to agree with the sentence between them:
  //
  //  - Not retryable: the server judged the AMOUNT — more than the remaining
  //    allowance, below the minimum, a level that cannot card top-up — and said
  //    which, in words meant for the customer. Changing the amount is the only
  //    action that can succeed; a "Retry" re-requests the identical amount and
  //    is refused for the identical reason.
  //  - Retryable: nothing judged the amount. "We couldn't set up your payment"
  //    under "Can't top up this amount", above a button that says the fix is to
  //    change it, sends someone whose backend is down to retry $50, $40, $30
  //    into the same error and conclude their account is limited.
  if (checkout.status === "refused") {
    return (
      <Screen>
        <View style={styles.centerContainer}>
          <Text type="h2" style={[styles.noticeTitle, { color: colors.error }]}>
            {checkout.retryable
              ? LL.TopupDetails.checkoutProblemTitle()
              : LL.TopupDetails.cannotTopUp()}
          </Text>
          <Text type="p1" style={styles.bodyText}>
            {checkout.message}
          </Text>
          <PrimaryBtn
            // Both go back to the amount screen — that is where "try again"
            // starts from, since the request is made on entry to this one.
            label={
              checkout.retryable
                ? LL.FygaroWebViewScreen.retry()
                : LL.TopupDetails.changeAmount()
            }
            onPress={() => navigation.goBack()}
            btnStyle={styles.retryButton}
          />
        </View>
      </Screen>
    )
  }

  // Only two things put the customer on the GENERIC error screen, and "the
  // server has not answered yet" is neither of them:
  //  - a settled account query with no username, so the payment could never be
  //    attributed to an account (better an error than an unattributable charge)
  //  - the WebView itself failing to load
  // A refusal has its own screen above, because it has something specific to
  // say and a next step that is not "Retry".
  // While the checkout request is still in flight the screen shows the spinner
  // below. Deriving this from `!paymentUrl` alone made the FIRST paint of every
  // card top-up "Something went wrong", for as long as the round trip took.
  const usernameMissing = !usernameLoading && !username
  if (error || usernameMissing) {
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
        {(isLoading || !paymentUrl) && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text type="p1" style={styles.loadingText}>
              {LL.FygaroWebViewScreen.loading()}
            </Text>
          </View>
        )}
        {paymentUrl && (
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
            dataDetectorTypes={["none"]}
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
        )}
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
  // The refusal screen carries a headline AND a sentence, so the headline sits
  // closer to its own body than the bare error screen's does.
  noticeTitle: { textAlign: "center", marginBottom: 12 },
  bodyText: { textAlign: "center", marginBottom: 12 },
  retryButton: { marginTop: 16 },
  webView: { flex: 1 },
}))

export default CardPayment
