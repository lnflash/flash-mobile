import React, { useEffect, useRef } from "react"
import { Alert } from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { nip19 } from "nostr-tools"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useHomeAuthedQuery, useUserUpdateNpubMutation } from "@app/graphql/generated"
import { useChatContext } from "@app/screens/chat/chatContext"
import { useI18nContext } from "@app/i18n/i18n-react"
import { fetchSecretFromLocalStorage } from "@app/utils/nostr"
import { generateAndStoreKey, getSigner } from "@app/nostr/signer"
import { npubLinkState } from "@app/nostr/npub-link"

/**
 * Per-device marker: the user has already been asked whether this device
 * should replace the given backend npub. Keyed on the backend npub so a
 * later change on the account (another device relinking) asks again, while a
 * declined prompt never nags on every cold start.
 */
export const npubMismatchPromptedKey = (backendNpub: string): string =>
  `npubMismatchPrompted:${backendNpub}`

/**
 * Runs once per authenticated session and makes sure the npub the backend
 * advertises for this account (what senders encrypt DMs to) is the key this
 * device can actually decrypt with. See `npubLinkState` for the state table.
 *
 * Only `unregistered` is fixed silently — there is nothing on the account to
 * steal. `mismatch` means another install holds the registered key; two live
 * installs auto-relinking on every launch would flip the account back and
 * forth and leave both with holes in the same conversation, so that one asks
 * the user once and never rewrites a registered npub without their choice.
 */
const NostrKeyEnsurer: React.FC = () => {
  const isAuthed = useIsAuthed()
  const { data: dataAuthed } = useHomeAuthedQuery({
    skip: !isAuthed,
    fetchPolicy: "cache-first",
  })
  const [userUpdateNpub] = useUserUpdateNpubMutation()
  const { initializeChat } = useChatContext()
  const { LL } = useI18nContext()
  const hasRun = useRef(false)

  useEffect(() => {
    // Wait until both auth state and backend data are ready
    if (!isAuthed || !dataAuthed || hasRun.current) return
    hasRun.current = true

    // Register the local key with the backend. The local signer does not
    // change, and ChatContextProvider already subscribed with it on mount, so
    // nothing on-device needs re-initialising — this is backend state only.
    const relinkLocalNpub = async (state: string, localNpub: string) => {
      try {
        const { data } = await userUpdateNpub({
          variables: { input: { npub: localNpub } },
        })
        const errors = data?.userUpdateNpub?.errors ?? []
        if (errors.length > 0) {
          // Typically NPUB_NOT_AVAILABLE: another account holds this key.
          // Leave it for the settings screen; nothing safe to do here.
          console.warn(
            `[NostrKeyEnsurer] ${state}: backend refused relink`,
            errors[0]?.code,
          )
          return
        }
        console.log(`[NostrKeyEnsurer] ${state}: relinked local npub with backend`)
      } catch (e) {
        console.error(`[NostrKeyEnsurer] ${state}: relink failed:`, e)
      }
    }

    ;(async () => {
      const backendNpub = dataAuthed?.me?.npub ?? null

      const existing = await fetchSecretFromLocalStorage()
      if (existing) {
        let localNpub: string
        try {
          const signer = await getSigner()
          localNpub = nip19.npubEncode(await signer.getPublicKey())
        } catch (e) {
          console.error("[NostrKeyEnsurer] local key present but unreadable:", e)
          return
        }

        const state = npubLinkState(localNpub, backendNpub)

        if (state === "unregistered") {
          // The account advertises no key at all, so nobody can DM it. Nothing
          // to lose by registering the one this device holds.
          await relinkLocalNpub(state, localNpub)
          return
        }

        if (state === "mismatch" && backendNpub) {
          // Another install registered its own key. Ask once per backend npub
          // and let the user decide which device owns chat.
          const marker = npubMismatchPromptedKey(backendNpub)
          if (await AsyncStorage.getItem(marker)) return
          await AsyncStorage.setItem(marker, "1")
          Alert.alert(LL.Nostr.keyMismatchTitle(), LL.Nostr.keyMismatchMessage(), [
            { text: LL.common.cancel(), style: "cancel" },
            {
              text: LL.Nostr.keyMismatchUseThisDevice(),
              onPress: () => {
                relinkLocalNpub(state, localNpub)
              },
            },
          ])
        }
        return
      }

      if (backendNpub) {
        // Backend has a registered npub but no local key exists — conflict.
        // Do not auto-generate a new key; the settings screen will surface this.
        console.log(
          "[NostrKeyEnsurer] backend npub exists but no local key — conflict, skipping auto-gen",
        )
        return
      }

      try {
        const npub = await generateAndStoreKey()
        await userUpdateNpub({ variables: { input: { npub } } })
        await initializeChat()
        console.log("[NostrKeyEnsurer] auto-generated key and registered npub")
      } catch (e) {
        console.error("[NostrKeyEnsurer] failed:", e)
      }
    })()
  }, [isAuthed, dataAuthed])

  return null
}

export default NostrKeyEnsurer
