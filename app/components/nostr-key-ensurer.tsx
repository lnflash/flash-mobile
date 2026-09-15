import React, { useEffect, useRef, useState } from "react"
import { Alert } from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { nip19 } from "nostr-tools"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useHomeAuthedQuery, useUserUpdateNpubMutation } from "@app/graphql/generated"
import { useAuthenticationContext } from "@app/navigation/navigation-container-wrapper"
import { useChatContext } from "@app/screens/chat/chatContext"
import { useI18nContext } from "@app/i18n/i18n-react"
import { fetchSecretFromLocalStorage } from "@app/utils/nostr"
import { generateAndStoreKey, getSigner } from "@app/nostr/signer"
import { npubLinkState } from "@app/nostr/npub-link"
import { getNostrKeyOwner, setNostrKeyOwner } from "@app/nostr/key-owner"

/**
 * Per-device marker: the user has already been asked whether this device
 * should replace the given backend npub. Keyed on the backend npub so a
 * later change on the account (another device relinking) asks again, while a
 * declined prompt never nags on every cold start. Written only once a button
 * is pressed: a prompt dismissed without an answer is asked again.
 */
export const npubMismatchPromptedKey = (backendNpub: string): string =>
  `npubMismatchPrompted:${backendNpub}`

/**
 * Per-device marker: this account has already been asked whether it should
 * take over the given local key, which another account on the device
 * generated. The account has no backend npub in that state, so the marker is
 * keyed on the account and on the key it was asked about: a different key
 * turning up later (an nsec handed back at another account's phone login,
 * an import) is a new question, not a remembered decline. Same write rule as
 * above: only once a button is pressed.
 */
export const foreignKeyPromptedKey = (accountId: string, localNpub: string): string =>
  `npubForeignKeyPrompted:${accountId}:${localNpub}`

/** A user-facing alert decided by the check, shown once the lock screen is gone. */
type PendingPrompt = { show: () => void }

/**
 * Runs once per authenticated session and makes sure the npub the backend
 * advertises for this account (what senders encrypt DMs to) is the key this
 * device can actually decrypt with. See `npubLinkState` for the state table.
 *
 * Only `unregistered` is fixed silently — there is nothing on the account to
 * steal — and only when the local key is not known to belong to another
 * account on this device (the keychain survives logout, see `key-owner.ts`).
 * `mismatch` means another install holds the registered key; two live
 * installs auto-relinking on every launch would flip the account back and
 * forth and leave both with holes in the same conversation, so that one asks
 * the user once and never rewrites a registered npub without their choice.
 *
 * The check itself runs as soon as the live account data arrives, which is
 * before the PIN/biometric gate has been passed (`authenticationCheck` is the
 * initial route while `isAuthed` is already true). Anything that asks the
 * user a question is therefore held until `isAppLocked` drops: an alert over
 * the lock screen would let one tap rewrite the account's npub without
 * unlocking. This component must be mounted inside `NavigationContainerWrapper`
 * to see that state.
 */
const NostrKeyEnsurer: React.FC = () => {
  const isAuthed = useIsAuthed()
  const { isAppLocked } = useAuthenticationContext()
  // network-only: the Apollo cache is persisted across launches, so a
  // cache-first read hands us last session's npub synchronously on cold start
  // and `hasRun` would lock that stale snapshot in. Deciding a backend write
  // off a stale null would register this device's key over one another
  // install registered since — the silent overwrite this component exists to
  // avoid. With network-only, `data` stays undefined until the live answer
  // arrives; an offline cold start simply does nothing.
  const { data: dataAuthed } = useHomeAuthedQuery({
    skip: !isAuthed,
    fetchPolicy: "network-only",
  })
  const [userUpdateNpub] = useUserUpdateNpubMutation()
  const { initializeChat } = useChatContext()
  const { LL } = useI18nContext()
  const hasRun = useRef(false)
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null)

  useEffect(() => {
    if (isAppLocked || !pendingPrompt) return
    setPendingPrompt(null)
    pendingPrompt.show()
  }, [isAppLocked, pendingPrompt])

  useEffect(() => {
    // Wait until both auth state and backend data are ready
    if (!isAuthed || !dataAuthed || hasRun.current) return
    hasRun.current = true

    const accountId = dataAuthed.me?.id
    const backendNpub = dataAuthed.me?.npub ?? null

    const rememberOwner = async (localNpub: string) => {
      if (!accountId) return
      try {
        await setNostrKeyOwner(localNpub, accountId)
      } catch (e) {
        console.warn("[NostrKeyEnsurer] could not record key owner:", e)
      }
    }

    // Register the local key with the backend. The local signer does not
    // change, and ChatContextProvider already subscribed with it on mount, so
    // nothing on-device needs re-initialising — this is backend state only.
    type RelinkResult = "ok" | "refused" | "failed"
    const relinkLocalNpub = async (
      state: string,
      localNpub: string,
    ): Promise<RelinkResult> => {
      try {
        const { data } = await userUpdateNpub({
          variables: { input: { npub: localNpub } },
        })
        const errors = data?.userUpdateNpub?.errors ?? []
        if (errors.length > 0) {
          // Typically NPUB_NOT_AVAILABLE: another account holds this key.
          // Nothing safe to do here; the caller tells the user.
          console.warn(
            `[NostrKeyEnsurer] ${state}: backend refused relink`,
            errors[0]?.code,
          )
          return "refused"
        }
        console.log(`[NostrKeyEnsurer] ${state}: relinked local npub with backend`)
        await rememberOwner(localNpub)
        return "ok"
      } catch (e) {
        console.error(`[NostrKeyEnsurer] ${state}: relink failed:`, e)
        return "failed"
      }
    }

    // A transient failure and a deterministic refusal need different advice:
    // retrying a refused key from Reconnect gives the same answer, so that
    // one points at deleting the keys instead.
    const showRelinkFailed = (result: Exclude<RelinkResult, "ok">) =>
      Alert.alert(
        LL.Nostr.keyMismatchTitle(),
        result === "refused"
          ? LL.Nostr.keyMismatchRelinkRefused()
          : LL.Nostr.keyMismatchRelinkFailed(),
      )

    // Ask once (per `marker`) and let the user decide which device owns chat.
    // The marker is written only from a button handler. An alert that is
    // dismissed without an answer (Android replaces it with any later alert,
    // or the back button closes it) leaves no marker, so the question is
    // asked again on the next launch instead of the device silently staying
    // undeliverable.
    type Prompt = { marker: string; state: string; localNpub: string; message: string }
    const askToUseThisDevice = ({ marker, state, localNpub, message }: Prompt) => {
      const remember = () => {
        AsyncStorage.setItem(marker, "1").catch((e) => {
          console.warn("[NostrKeyEnsurer] could not persist prompt marker:", e)
        })
      }
      Alert.alert(LL.Nostr.keyMismatchTitle(), message, [
        { text: LL.common.cancel(), style: "cancel", onPress: remember },
        {
          text: LL.Nostr.keyMismatchUseThisDevice(),
          onPress: async () => {
            const result = await relinkLocalNpub(state, localNpub)
            // A transient failure leaves no marker so the question is
            // asked again next launch; a deterministic refusal (another
            // account holds this key) is remembered. Either way the user
            // chose and nothing happened, so say so.
            if (result !== "failed") remember()
            if (result !== "ok") showRelinkFailed(result)
          },
        },
      ])
    }

    ;(async () => {
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

        if (state === "linked") {
          // The account advertises this key, so it owns it whoever generated
          // it (keys from before the owner record, imported nsecs, the nsec
          // handed back at phone login).
          await rememberOwner(localNpub)
          return
        }

        if (state === "unregistered") {
          const owner = await getNostrKeyOwner(localNpub)
          if (owner && accountId && owner !== accountId) {
            // Another account on this device generated the key and may still
            // depend on it. Taking it over is the user's call, not a silent
            // default.
            const marker = foreignKeyPromptedKey(accountId, localNpub)
            if (await AsyncStorage.getItem(marker)) return
            setPendingPrompt({
              show: () =>
                askToUseThisDevice({
                  marker,
                  state,
                  localNpub,
                  message: LL.Nostr.keyForeignMessage(),
                }),
            })
            return
          }
          // The account advertises no key at all, so nobody can DM it. Nothing
          // to lose by registering the one this device holds. A refusal means
          // another account already registered it, which the user can only
          // resolve by hand — so say so rather than staying silent.
          const result = await relinkLocalNpub(state, localNpub)
          if (result === "refused") {
            setPendingPrompt({ show: () => showRelinkFailed(result) })
          }
          return
        }

        if (state === "mismatch" && backendNpub) {
          // Another install registered its own key. Ask once per backend npub
          // and let the user decide which device owns chat.
          const marker = npubMismatchPromptedKey(backendNpub)
          if (await AsyncStorage.getItem(marker)) return
          setPendingPrompt({
            show: () =>
              askToUseThisDevice({
                marker,
                state,
                localNpub,
                message: LL.Nostr.keyMismatchMessage(),
              }),
          })
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
        const npub = await generateAndStoreKey(accountId)
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
