import AsyncStorage from "@react-native-async-storage/async-storage"

/**
 * Which account a local Nostr key belongs to.
 *
 * The keychain entry holding the nsec survives logout (`use-logout.ts` never
 * clears it), so on a shared phone account B can start with the key account A
 * generated. Registering that key on B's account silently would strand A: the
 * backend refuses a second owner (`NPUB_NOT_AVAILABLE`) and A's DMs go to a
 * key B now advertises. The owner is therefore recorded next to the key and
 * consulted before any silent backend write — a key owned by another account
 * is prompt-class, never auto-registered.
 *
 * Keyed on the local npub so a key that changes underneath (nsec import, the
 * nsec handed back at phone login) never inherits the previous key's owner.
 * Keys that pre-date this record have no owner: they are adopted by the first
 * account that either matches them (`linked`) or registers them.
 */
const PREFIX = "nostrKeyOwner:"

export const nostrKeyOwnerKey = (localNpub: string): string => `${PREFIX}${localNpub}`

export const getNostrKeyOwner = async (localNpub: string): Promise<string | null> =>
  AsyncStorage.getItem(nostrKeyOwnerKey(localNpub))

export const setNostrKeyOwner = async (
  localNpub: string,
  accountId: string,
): Promise<void> => AsyncStorage.setItem(nostrKeyOwnerKey(localNpub), accountId)

/** Drop the owner record of one key — used when that key leaves the keychain. */
export const clearNostrKeyOwner = async (localNpub: string): Promise<void> =>
  AsyncStorage.removeItem(nostrKeyOwnerKey(localNpub))

/**
 * Whether a backend refusal (`NPUB_NOT_AVAILABLE`) of this key may be answered
 * with "delete the chat keys". Only when this account is the recorded owner:
 * with another owner, or no record at all (every key from before the record
 * existed), the refusal itself says some other account holds the key, and the
 * local copy may be that account's only one.
 */
export const mayAdviseDeletingKey = (
  owner: string | null,
  accountId: string | null | undefined,
): boolean => Boolean(owner && accountId && owner === accountId)

/** Drop every owner record — used when the local key material is deleted. */
export const clearNostrKeyOwners = async (): Promise<void> => {
  const keys = await AsyncStorage.getAllKeys()
  const ownerKeys = keys.filter((key) => key.startsWith(PREFIX))
  if (ownerKeys.length > 0) await AsyncStorage.multiRemove(ownerKeys)
}
