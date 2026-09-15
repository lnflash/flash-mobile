import { nip19 } from "nostr-tools"
import { getSigner } from "@app/nostr/signer"
import {
  getNostrKeyOwner,
  keyOwnerState,
  KeyOwnerState,
  setNostrKeyOwner,
} from "@app/nostr/key-owner"

export type ReconnectNpubResult =
  | { status: "ok"; npub: string }
  | {
      status: "refused"
      npub: string
      code: string | null
      // Whether this account, another account on this phone, or nobody on
      // record owns the key. Only `self` may be told to delete it; `unknown`
      // must not be told another account on this phone holds it.
      keyOwner: KeyOwnerState
    }
  | { status: "no-key" }

type UpdateNpub = (npub: string) => Promise<{
  data?: {
    userUpdateNpub?: { errors?: ReadonlyArray<{ code?: string | null }> } | null
  } | null
}>

/**
 * Registers this device's local key as the account's npub (Settings › Nostr ›
 * Advanced › Reconnect profile). The backend can refuse with
 * `NPUB_NOT_AVAILABLE` when another account already holds the key; that is
 * reported as `refused`, never as success — reporting success there would
 * leave the account undeliverable while telling the user it is fixed.
 *
 * With `accountId`, a successful registration records the account as the
 * key's owner, and a refusal reports who owns the key on record.
 */
export const reconnectLocalNpub = async (
  updateNpub: UpdateNpub,
  accountId?: string | null,
): Promise<ReconnectNpubResult> => {
  let signer
  try {
    signer = await getSigner()
  } catch {
    return { status: "no-key" }
  }
  const npub = nip19.npubEncode(await signer.getPublicKey())
  const { data } = await updateNpub(npub)
  const errors = data?.userUpdateNpub?.errors ?? []
  if (errors.length > 0) {
    let owner: string | null = null
    try {
      owner = await getNostrKeyOwner(npub)
    } catch (e) {
      console.warn("[reconnectLocalNpub] could not read key owner:", e)
    }
    return {
      status: "refused",
      npub,
      code: errors[0]?.code ?? null,
      keyOwner: keyOwnerState(owner, accountId),
    }
  }
  if (accountId) {
    try {
      await setNostrKeyOwner(npub, accountId)
    } catch (e) {
      console.warn("[reconnectLocalNpub] could not record key owner:", e)
    }
  }
  return { status: "ok", npub }
}
