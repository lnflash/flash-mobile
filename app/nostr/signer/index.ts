import { nip19 } from "nostr-tools"
import { fetchSecretFromLocalStorage } from "@app/utils/nostr"
import { LocalSigner } from "./localSigner"
import { NostrSigner } from "./types"

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

export type { NostrSigner } from "./types"
