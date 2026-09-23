import { nip19, generateSecretKey, getPublicKey } from "nostr-tools"
import * as Keychain from "react-native-keychain"
import { fetchSecretFromLocalStorage } from "@app/utils/nostr"
import { setNostrKeyOwner } from "@app/nostr/key-owner"
import { LocalSigner } from "./localSigner"
import { NostrSigner } from "./types"

const KEYCHAIN_NOSTRCREDS_KEY = "nostr_creds_key"

let signer: NostrSigner | null = null
let initializing: Promise<NostrSigner> | null = null

export async function getSigner(): Promise<NostrSigner> {
  if (signer) return signer

  if (!initializing) {
    initializing = (async () => {
      const nsec = await fetchSecretFromLocalStorage()
      if (!nsec) throw new Error("No signer available")

      const { data } = nip19.decode(nsec)
      signer = new LocalSigner(data as Uint8Array)
      return signer
    })()
  }

  return initializing
}

/**
 * Creates a temporary signer from a secret key.
 * Used during key generation before the key is stored.
 */
export function createSignerFromKey(sk: Uint8Array): NostrSigner {
  return new LocalSigner(sk)
}

export function clearSigner() {
  signer = null
  initializing = null
}

/**
 * Generates a fresh key and stores it in the keychain. `ownerAccountId` is
 * recorded next to it (see `key-owner.ts`) so a later login as a different
 * account on this device cannot silently register the key as its own.
 */
export async function generateAndStoreKey(ownerAccountId?: string): Promise<string> {
  const secretKey = generateSecretKey()
  const nsec = nip19.nsecEncode(secretKey)
  await Keychain.setInternetCredentials(
    KEYCHAIN_NOSTRCREDS_KEY,
    KEYCHAIN_NOSTRCREDS_KEY,
    nsec,
  )
  clearSigner()
  const npub = nip19.npubEncode(getPublicKey(secretKey))
  if (ownerAccountId) await setNostrKeyOwner(npub, ownerAccountId)
  return npub
}

export type { NostrSigner } from "./types"
