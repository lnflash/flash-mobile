import { useCallback, useRef } from "react"
import { Alert } from "react-native"
import {
  create,
  open,
  type LinkExit,
  type LinkSuccess,
} from "react-native-plaid-link-sdk"

import {
  useBridgeAddExternalAccountMutation,
  useBridgeExchangePlaidPublicTokenMutation,
} from "@app/graphql/generated"
import { useI18nContext } from "@app/i18n/i18n-react"

import { useActivityIndicator } from "./useActivityIndicator"

/**
 * Plaid Link flow for Bridge external accounts (ENG-524, backend flash#446).
 *
 * `linkBankAccount` is the full entry point: it requests a backend-issued
 * linkToken (bridgeAddExternalAccount), opens the native Plaid Link UI, and
 * performs the server-side public_token exchange on success — the Bridge
 * Api-Key never leaves the backend. When the backend reports
 * BRIDGE_PLAID_NOT_AVAILABLE, the caller-provided `onManualEntry` runs
 * instead (manual bank-details form). `openPlaidLink` remains available for
 * callers that already hold a linkToken.
 *
 * The linked account is provisioned asynchronously via Bridge's webhook:
 * `onLinked` refetches the caller's account list, and the success copy tells
 * the user the account will appear shortly.
 */
export const usePlaidLink = ({
  onLinked,
  onManualEntry,
}: {
  onLinked?: () => unknown
  onManualEntry?: () => void
} = {}) => {
  const { LL } = useI18nContext()
  const { toggleActivityIndicator } = useActivityIndicator()
  const [addExternalAccount] = useBridgeAddExternalAccountMutation()
  const [exchangePlaidPublicToken] = useBridgeExchangePlaidPublicTokenMutation()

  // The SDK's native module is a singleton: a second create()/open() while a
  // session is up replaces its handler and stored JS callbacks, cross-wiring
  // {linkToken, publicToken} pairs or dropping callbacks entirely. The guard
  // is held from entry (including the link-token request, so a double-tap
  // can't mint two tokens) until the session terminates (onSuccess settles or
  // onExit fires) or a pre-session step fails.
  const sessionInFlight = useRef(false)

  const acquireSession = useCallback(() => {
    if (sessionInFlight.current) return false
    sessionInFlight.current = true
    return true
  }, [])

  // Opens Plaid Link. The session guard must already be held.
  const startSession = useCallback(
    (linkToken: string) => {
      create({ token: linkToken })
      open({
        onSuccess: async (success: LinkSuccess) => {
          toggleActivityIndicator(true)
          try {
            const res = await exchangePlaidPublicToken({
              variables: { input: { linkToken, publicToken: success.publicToken } },
            })
            toggleActivityIndicator(false)

            const errors = res.data?.bridgeExchangePlaidPublicToken?.errors
            if (errors && errors.length > 0) {
              Alert.alert(LL.common.error(), errors[0].message)
              return
            }

            // The exchange succeeded — the link IS established and the webhook
            // will provision the account. The refetch is best-effort: its
            // failure (flaky network, unmounted screen) must never be reported
            // as a failed bank link, or users re-link and create duplicates.
            try {
              await onLinked?.()
            } catch {
              // best-effort — the next screen focus refetches anyway
            }
            Alert.alert(LL.PlaidLink.connectedTitle(), LL.PlaidLink.connectedBody())
          } catch (err) {
            toggleActivityIndicator(false)
            Alert.alert(LL.common.error(), LL.PlaidLink.exchangeFailed())
          } finally {
            sessionInFlight.current = false
          }
        },
        onExit: (exit: LinkExit) => {
          sessionInFlight.current = false
          // A plain user cancel must stay silent — but the iOS bridge ALWAYS
          // embeds an `error` object (with empty-string fields) in the exit
          // payload, while Android omits it. Presence is meaningless on iOS;
          // detect a real failure by content. Real Plaid errors carry a
          // non-empty errorCode on both platforms.
          const exitError = exit.error
          const isRealError = Boolean(
            exitError &&
              (exitError.errorCode || exitError.errorMessage || exitError.displayMessage),
          )
          if (isRealError && exitError) {
            Alert.alert(
              LL.common.error(),
              // displayMessage is Plaid's user-facing copy; errorMessage is
              // developer-facing and only a fallback.
              exitError.displayMessage ||
                exitError.errorMessage ||
                LL.PlaidLink.linkFailed(),
            )
          }
        },
      })
    },
    [exchangePlaidPublicToken, onLinked, toggleActivityIndicator, LL],
  )

  const openPlaidLink = useCallback(
    (linkToken: string) => {
      if (!acquireSession()) return
      startSession(linkToken)
    },
    [acquireSession, startSession],
  )

  const linkBankAccount = useCallback(async () => {
    if (!acquireSession()) return
    toggleActivityIndicator(true)
    try {
      const res = await addExternalAccount()
      toggleActivityIndicator(false)

      const errors = res.data?.bridgeAddExternalAccount?.errors
      if (errors && errors.length > 0) {
        sessionInFlight.current = false
        // Plaid unavailable for this account → manual bank-details entry
        if (errors[0].code === "BRIDGE_PLAID_NOT_AVAILABLE" && onManualEntry) {
          onManualEntry()
          return
        }
        Alert.alert(LL.common.error(), errors[0].message)
        return
      }

      const linkToken = res.data?.bridgeAddExternalAccount?.externalAccount?.linkToken
      if (linkToken) {
        // Guard stays held; released by the session's onSuccess/onExit.
        startSession(linkToken)
      } else {
        sessionInFlight.current = false
        Alert.alert(LL.common.error(), LL.PlaidLink.linkTokenFailed())
      }
    } catch (err) {
      toggleActivityIndicator(false)
      sessionInFlight.current = false
      Alert.alert(LL.common.error(), LL.PlaidLink.linkTokenFailed())
    }
  }, [
    acquireSession,
    addExternalAccount,
    onManualEntry,
    startSession,
    toggleActivityIndicator,
    LL,
  ])

  return { openPlaidLink, linkBankAccount }
}
