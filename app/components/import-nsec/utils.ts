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
   * Registers the key on the account. Resolves `false` when the backend
   * refused it (another account holds it); anything else counts as registered.
   */
  updateFlashBackend: () => Promise<unknown>
  accountId?: string | null
}

/**
 * Stores an imported nsec as this device's key and registers it on the
 * account. A key the backend refuses is reported as an error, not a success:
 * the keychain would otherwise hold a key the account cannot advertise, and
 * the next launch would surface an unexplained refusal. With `accountId`, a
 * registered key is recorded as that account's (see `key-owner.ts`), and the
 * owner record of the key it replaced is dropped.
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
    // Save the nsec key to the keychain
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
    const registered = await updateFlashBackend()
    if (registered === false) {
      onError(NSEC_REGISTERED_ELSEWHERE_ERROR)
      return false
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
