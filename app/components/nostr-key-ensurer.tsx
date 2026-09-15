import React, { useEffect, useRef } from "react"
import { nip19 } from "nostr-tools"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useHomeAuthedQuery, useUserUpdateNpubMutation } from "@app/graphql/generated"
import { useChatContext } from "@app/screens/chat/chatContext"
import { fetchSecretFromLocalStorage } from "@app/utils/nostr"
import { generateAndStoreKey, getSigner } from "@app/nostr/signer"
import { needsRelink, npubLinkState } from "@app/nostr/npub-link"

/**
 * Runs once per authenticated session and makes sure the npub the backend
 * advertises for this account (what senders encrypt DMs to) is the key this
 * device can actually decrypt with. See `npubLinkState` for the state table.
 */
const NostrKeyEnsurer: React.FC = () => {
  const isAuthed = useIsAuthed()
  const { data: dataAuthed } = useHomeAuthedQuery({
    skip: !isAuthed,
    fetchPolicy: "cache-first",
  })
  const [userUpdateNpub] = useUserUpdateNpubMutation()
  const { initializeChat } = useChatContext()
  const hasRun = useRef(false)

  useEffect(() => {
    // Wait until both auth state and backend data are ready
    if (!isAuthed || !dataAuthed || hasRun.current) return
    hasRun.current = true
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
        if (!needsRelink(state)) return

        // The device holds a key the backend does not advertise, so every DM
        // sent to this username is encrypted to a key we cannot decrypt (or to
        // nothing at all). Re-register the local key; the device that is
        // actually in use is the one that must be able to read its messages.
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
          await initializeChat()
          console.log(`[NostrKeyEnsurer] ${state}: relinked local npub with backend`)
        } catch (e) {
          console.error(`[NostrKeyEnsurer] ${state}: relink failed:`, e)
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
