import { nip19 } from "nostr-tools"
import { getSigner } from "@app/nostr/signer"

export type ReconnectNpubResult =
  | { status: "ok"; npub: string }
  | { status: "refused"; npub: string; code: string | null }
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
 */
export const reconnectLocalNpub = async (
  updateNpub: UpdateNpub,
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
    return { status: "refused", npub, code: errors[0]?.code ?? null }
  }
  return { status: "ok", npub }
}
