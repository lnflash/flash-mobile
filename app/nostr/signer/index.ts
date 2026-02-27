import { nip19, generateSecretKey, getPublicKey } from "nostr-tools"
import * as Keychain from "react-native-keychain"
import { fetchSecretFromLocalStorage } from "@app/utils/nostr"
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

export async function generateAndStoreKey(): Promise<string> {
  const secretKey = generateSecretKey()
  const nsec = nip19.nsecEncode(secretKey)
  await Keychain.setInternetCredentials(
    KEYCHAIN_NOSTRCREDS_KEY,
    KEYCHAIN_NOSTRCREDS_KEY,
    nsec,
  )
  clearSigner()
  return nip19.npubEncode(getPublicKey(secretKey))
}

export type { NostrSigner } from "./types"
