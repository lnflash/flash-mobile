/**
 * Featured Profile Utilities
 *
 * Detection helper for matching the featured Nostr profile by pubkey.
 */

import { FEATURED_PROFILE } from '@app/constants/featured-profile'

/**
 * Check if a pubkey matches the featured profile.
 */
export const isFeaturedPubkey = (pubkey: string): boolean => {
  return pubkey.toLowerCase() === FEATURED_PROFILE.PUBKEY.toLowerCase()
}
