import { useCallback, useRef } from "react"
import { Alert } from "react-native"
import {
  create,
  open,
  type LinkExit,
  type LinkSuccess,
} from "react-native-plaid-link-sdk"

import { useBridgeExchangePlaidPublicTokenMutation } from "@app/graphql/generated"
import { useI18nContext } from "@app/i18n/i18n-react"

import { useActivityIndicator } from "./useActivityIndicator"

/**
 * Plaid Link flow for Bridge external accounts (ENG-524, backend flash#446).
 *
 * Opens the native Plaid Link UI with a backend-issued linkToken and performs
 * the server-side public_token exchange on success — the Bridge Api-Key never
 * leaves the backend. The linked account is provisioned asynchronously via
 * Bridge's webhook: callers pass `onLinked` to refetch their account list,
 * and the success copy tells the user the account will appear shortly.
 */
export const usePlaidLink = ({ onLinked }: { onLinked?: () => unknown } = {}) => {
  const { LL } = useI18nContext()
  const { toggleActivityIndicator } = useActivityIndicator()
  const [exchangePlaidPublicToken] = useBridgeExchangePlaidPublicTokenMutation()

  // The SDK's native module is a singleton: a second create()/open() while a
  // session is up replaces its handler and stored JS callbacks, cross-wiring
  // {linkToken, publicToken} pairs or dropping callbacks entirely. Guard from
  // openPlaidLink until the session terminates (onSuccess settles or onExit).
  const sessionInFlight = useRef(false)

  const openPlaidLink = useCallback(
    (linkToken: string) => {
      if (sessionInFlight.current) return
      sessionInFlight.current = true

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

  return { openPlaidLink }
}
