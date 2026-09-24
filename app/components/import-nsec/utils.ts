import * as Keychain from "react-native-keychain"
import { getPublicKey, nip19 } from "nostr-tools"
import { clearNostrKeyOwner, setNostrKeyOwner } from "@app/nostr/key-owner"

export const KEYCHAIN_NOSTRCREDS_KEY = "nostr_creds_key"

export const validateNsec = (nsec: string) => {
  const bech32Pattern = /^nsec1[a-z0-9]{58}$/
  return bech32Pattern.test(nsec)
}

const npubOfNsec = (nsec: string): string =>
  nip19.npubEncode(getPublicKey(nip19.decode(nsec).data as Uint8Array))

export const NSEC_REGISTERED_ELSEWHERE_ERROR = "This key is registered to another account"

export type ImportNsecOptions = {
  onError: (msg: string) => void
  /**
   * Registers the key on the account. Resolves `true` when the backend
   * accepted it, `false` when it refused (another account holds it).
   */
  updateFlashBackend: () => Promise<boolean>
  accountId?: string | null
}

/**
 * Registers an imported nsec on the account and, only once the backend has
 * accepted it, stores it as this device's key. The backend runs first because
 * the write is destructive: it overwrites the account's own key, which is the
 * only copy that can decrypt DMs sent to the npub the account advertises. A
 * refused key (another account holds it) is reported as an error, not a
 * success, and leaves the keychain and the previous key's owner record
 * untouched. With `accountId`, a registered key is recorded as that account's
 * (see `key-owner.ts`), and the owner record of the key it replaced is dropped.
 */
export const importNsec = async (
  nsec: string,
  { onError, updateFlashBackend, accountId }: ImportNsecOptions,
) => {
  if (!nsec) {
    onError("nsec cannot be empty")
    return false
  }

  if (!validateNsec(nsec)) {
    onError("Invalid nsec format. Please check the key and try again.")
    return false
  }

  try {
    let previousNpub: string | null = null
    try {
      const previous = await Keychain.getInternetCredentials(KEYCHAIN_NOSTRCREDS_KEY)
      if (previous && previous.password) previousNpub = npubOfNsec(previous.password)
    } catch {
      previousNpub = null
    }
    const npub = npubOfNsec(nsec)
    const registered = await updateFlashBackend()
    if (!registered) {
      onError(NSEC_REGISTERED_ELSEWHERE_ERROR)
      return false
    }
    // Only a key the account can advertise replaces the one in the keychain.
    await Keychain.setInternetCredentials(
      KEYCHAIN_NOSTRCREDS_KEY,
      KEYCHAIN_NOSTRCREDS_KEY,
      nsec,
    )
    if (previousNpub && previousNpub !== npub) {
      await clearNostrKeyOwner(previousNpub).catch((e) =>
        console.warn("[importNsec] could not clear replaced key owner:", e),
      )
    }
    if (accountId) {
      await setNostrKeyOwner(npub, accountId).catch((e) =>
        console.warn("[importNsec] could not record key owner:", e),
      )
    }
    return true
  } catch (error) {
    console.error("Failed to save nsec to keychain", error)
    onError("Failed to import nsec. Please try again.")
    return false
  }
}
