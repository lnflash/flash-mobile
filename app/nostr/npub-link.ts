/**
 * Relationship between the Nostr key held in this device's keychain and the
 * npub the backend has on the user's account.
 *
 * Senders resolve a recipient's npub through `npubByUsername`, so the backend
 * npub is the key every gift-wrap addressed to this user is encrypted to. The
 * device can only decrypt wraps addressed to its own local key. Any state
 * other than `linked` therefore means DMs are silently undeliverable:
 *
 *  - `unregistered`  local key, backend has none → nobody can address us.
 *  - `mismatch`      local key ≠ backend npub → wraps go to a key we do not hold.
 *  - `conflict`      backend npub, no local key → we cannot decrypt anything;
 *                    generating a fresh key would orphan the registered one, so
 *                    this is surfaced in settings rather than auto-fixed.
 *  - `fresh`         nothing anywhere → safe to generate and register.
 */
export type NpubLinkState = "linked" | "unregistered" | "mismatch" | "conflict" | "fresh"

export const npubLinkState = (
  localNpub: string | null | undefined,
  backendNpub: string | null | undefined,
): NpubLinkState => {
  if (localNpub) {
    if (!backendNpub) return "unregistered"
    return backendNpub === localNpub ? "linked" : "mismatch"
  }
  return backendNpub ? "conflict" : "fresh"
}

/** States where the fix is simply registering the local key with the backend. */
export const needsRelink = (state: NpubLinkState): boolean =>
  state === "unregistered" || state === "mismatch"
