/**
 * Featured Profile Utilities
 *
 * Detection helpers for matching the featured Nostr profile in chat
 * search and profile lookups.
 */

import { FEATURED_PROFILE } from '@app/constants/featured-profile'

/**
 * Check if a profile matches the featured profile by pubkey or NIP-05.
 */
export const isFeaturedNostrProfile = (
  pubkey: string,
  nip05?: string | null,
): boolean => {
  if (pubkey.toLowerCase() === FEATURED_PROFILE.PUBKEY.toLowerCase()) {
    return true
  }

  if (nip05 && nip05.toLowerCase() === FEATURED_PROFILE.NIP05.toLowerCase()) {
    return true
  }

  return false
}

/**
 * Check if a NIP-05 search query matches the featured profile.
 */
export const isFeaturedNip05 = (identifier: string): boolean => {
  const lower = identifier.toLowerCase().trim()

  if (lower === FEATURED_PROFILE.NIP05.toLowerCase()) {
    return true
  }

  for (const alias of FEATURED_PROFILE.NIP05_ALIASES) {
    if (lower === alias.toLowerCase()) {
      return true
    }
    if (lower === `${alias.toLowerCase()}@flashapp.me`) {
      return true
    }
  }

  return false
}

/**
 * Check if a pubkey matches the featured profile.
 */
export const isFeaturedPubkey = (pubkey: string): boolean => {
  return pubkey.toLowerCase() === FEATURED_PROFILE.PUBKEY.toLowerCase()
}
