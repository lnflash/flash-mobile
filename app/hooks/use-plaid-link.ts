import { useCallback } from "react"
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

  const openPlaidLink = useCallback(
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

            await onLinked?.()
            Alert.alert(LL.PlaidLink.connectedTitle(), LL.PlaidLink.connectedBody())
          } catch (err) {
            toggleActivityIndicator(false)
            Alert.alert(LL.common.error(), LL.PlaidLink.exchangeFailed())
          }
        },
        onExit: (exit: LinkExit) => {
          // Plaid reports a real failure here — a plain user cancel carries no
          // error and stays silent.
          if (exit.error) {
            Alert.alert(
              LL.common.error(),
              exit.error.errorMessage || LL.PlaidLink.linkFailed(),
            )
          }
        },
      })
    },
    [exchangePlaidPublicToken, onLinked, toggleActivityIndicator, LL],
  )

  return { openPlaidLink }
}
