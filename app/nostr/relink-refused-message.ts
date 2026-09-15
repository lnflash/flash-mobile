import { TranslationFunctions } from "@app/i18n/i18n-types"
import { KeyOwnerState } from "@app/nostr/key-owner"

/**
 * What to tell the user when the backend refuses to register the local key
 * (`NPUB_NOT_AVAILABLE`), by who owns that key on record:
 *  - `self`: safe to advise deleting the chat keys.
 *  - `other`: another account on this phone generated it; back it up first.
 *  - `unknown`: no record, so the holder may be on another phone. Back-up
 *    advice without claiming a second account on this phone.
 */
export const relinkRefusedMessage = (
  LL: TranslationFunctions,
  keyOwner: KeyOwnerState,
): string => {
  switch (keyOwner) {
    case "self":
      return LL.Nostr.keyMismatchRelinkRefused()
    case "other":
      return LL.Nostr.keyForeignRelinkRefused()
    default:
      return LL.Nostr.keyUnownedRelinkRefused()
  }
}
