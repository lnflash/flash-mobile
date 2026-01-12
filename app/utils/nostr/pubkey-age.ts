import { SimplePool, Event } from "nostr-tools"
import AsyncStorage from "@react-native-async-storage/async-storage"

// Minimum age in days before a pubkey can post
export const PUBKEY_MIN_AGE_DAYS = 3

// Developer override flag - set to true to bypass age check
export const BYPASS_PUBKEY_AGE_CHECK = false

// Cache key prefix for storing pubkey ages
const PUBKEY_AGE_CACHE_PREFIX = "pubkey_age_"

// Relays to check for pubkey age
const AGE_CHECK_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://relay.snort.social",
  "wss://relay.islandbitcoin.com",
  "wss://relay.nostr.band",
  "wss://purplepag.es",
]

/**
 * Fetches the age of a pubkey by finding the oldest kind-0 event
 * @param pubkey - The pubkey to check
 * @param pool - SimplePool instance for relay connections
 * @returns The timestamp of the oldest profile event, or null if not found
 */
export async function fetchPubkeyAge(
  pubkey: string,
  pool: SimplePool
): Promise<number | null> {
  try {
    // Check cache first
    const cacheKey = `${PUBKEY_AGE_CACHE_PREFIX}${pubkey}`
    const cached = await AsyncStorage.getItem(cacheKey)
    if (cached) {
      const { timestamp, checkedAt } = JSON.parse(cached)
      // Re-check if cache is older than 24 hours
      const dayInMs = 24 * 60 * 60 * 1000
      if (Date.now() - checkedAt < dayInMs) {
        console.log(`Using cached pubkey age for ${pubkey}: ${timestamp}`)
        return timestamp
      }
    }

    console.log(`Fetching pubkey age for ${pubkey} from relays...`)

    // Query multiple relays for kind-0 events
    const events: Event[] = []
    const promises = AGE_CHECK_RELAYS.map(async (relay) => {
      try {
        const relayEvents = await pool.querySync([relay], {
          kinds: [0],
          authors: [pubkey],
        })
        return relayEvents
      } catch (error) {
        console.log(`Failed to fetch from ${relay}:`, error)
        return []
      }
    })

    const results = await Promise.allSettled(promises)
    results.forEach((result) => {
      if (result.status === "fulfilled" && result.value) {
        events.push(...result.value)
      }
    })

    if (events.length === 0) {
      console.log(`No profile events found for ${pubkey}`)
      return null
    }

    // Find the oldest event
    const oldestEvent = events.reduce((oldest, current) => {
      return current.created_at < oldest.created_at ? current : oldest
    })

    const timestamp = oldestEvent.created_at

    // Cache the result
    await AsyncStorage.setItem(
      cacheKey,
      JSON.stringify({
        timestamp,
        checkedAt: Date.now(),
      })
    )

    console.log(`Oldest profile event for ${pubkey}: ${new Date(timestamp * 1000).toISOString()}`)
    return timestamp
  } catch (error) {
    console.error("Error fetching pubkey age:", error)
    return null
  }
}

/**
 * Checks if a pubkey is old enough to post
 * @param pubkeyTimestamp - The timestamp of the pubkey's oldest event
 * @param bypassCheck - Developer override flag
 * @returns Whether the pubkey is old enough
 */
export function isPubkeyOldEnough(
  pubkeyTimestamp: number | null,
  bypassCheck: boolean = false
): boolean {
  // Developer override
  if (bypassCheck || BYPASS_PUBKEY_AGE_CHECK) {
    console.log("Bypassing pubkey age check (developer mode)")
    return true
  }

  if (!pubkeyTimestamp) {
    // If we can't determine age, default to not allowing
    return false
  }

  const ageInMs = Date.now() - pubkeyTimestamp * 1000
  const ageInDays = ageInMs / (1000 * 60 * 60 * 24)

  console.log(`Pubkey age: ${ageInDays.toFixed(2)} days`)
  return ageInDays >= PUBKEY_MIN_AGE_DAYS
}

/**
 * Gets the age of a pubkey in days
 * @param pubkeyTimestamp - The timestamp of the pubkey's oldest event
 * @returns Age in days, or null if timestamp is invalid
 */
export function getPubkeyAgeInDays(pubkeyTimestamp: number | null): number | null {
  if (!pubkeyTimestamp) return null

  const ageInMs = Date.now() - pubkeyTimestamp * 1000
  const ageInDays = ageInMs / (1000 * 60 * 60 * 24)

  return ageInDays
}

/**
 * Gets the number of days until a pubkey is old enough
 * @param pubkeyTimestamp - The timestamp of the pubkey's oldest event
 * @returns Days until old enough, or null if already old enough or invalid
 */
export function getDaysUntilOldEnough(pubkeyTimestamp: number | null): number | null {
  const ageInDays = getPubkeyAgeInDays(pubkeyTimestamp)
  if (ageInDays === null) return null

  if (ageInDays >= PUBKEY_MIN_AGE_DAYS) return null

  return PUBKEY_MIN_AGE_DAYS - ageInDays
}

/**
 * Clears the cached age for a pubkey
 * @param pubkey - The pubkey to clear cache for
 */
export async function clearPubkeyAgeCache(pubkey: string): Promise<void> {
  const cacheKey = `${PUBKEY_AGE_CACHE_PREFIX}${pubkey}`
  await AsyncStorage.removeItem(cacheKey)
}