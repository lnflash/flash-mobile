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

/**
 * Stores an imported nsec as this device's key and registers it on the
 * account. `updateFlashBackend` resolves `false` when the backend refused the
 * key (another account holds it); anything else counts as registered. With
 * `accountId`, a registered key is recorded as that account's (see
 * `key-owner.ts`), and the owner record of the key it replaced is dropped.
 */
export const importNsec = async (
  nsec: string,
  onError: (msg: string) => void,
  updateFlashBackend: () => Promise<unknown>,
  { accountId }: { accountId?: string | null } = {},
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
    if (accountId && registered !== false) {
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
