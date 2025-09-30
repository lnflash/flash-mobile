import { useEffect, useState } from "react"
import { getPublicKey } from "nostr-tools"
import { usePersistentStateContext } from "@app/store/persistent-state"
import { getSecretKey } from "@app/utils/nostr"
import { pool } from "@app/utils/nostr/pool"
import {
  fetchPubkeyAge,
  isPubkeyOldEnough,
  getPubkeyAgeInDays,
  getDaysUntilOldEnough,
  PUBKEY_MIN_AGE_DAYS
} from "@app/utils/nostr/pubkey-age"

interface PubkeyAge {
  isOldEnough: boolean
  ageInDays: number | null
  daysUntilOldEnough: number | null
  isLoading: boolean
  error: string | null
  timestamp: number | null
}

/**
 * Hook to check if the current user's pubkey is old enough to post
 */
export function usePubkeyAge(): PubkeyAge {
  const { persistentState, updateState } = usePersistentStateContext()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pubkeyTimestamp, setPubkeyTimestamp] = useState<number | null>(null)

  useEffect(() => {
    checkPubkeyAge()
  }, [])

  const checkPubkeyAge = async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Get the user's pubkey
      const secretKey = await getSecretKey()
      if (!secretKey) {
        setError("No Nostr key found")
        setIsLoading(false)
        return
      }

      const pubkey = getPublicKey(secretKey)

      // Check if we have a cached timestamp that's recent
      if (persistentState.pubkeyCreatedAt && persistentState.pubkeyAgeCheckTime) {
        const hoursSinceLastCheck = (Date.now() - persistentState.pubkeyAgeCheckTime) / (1000 * 60 * 60)

        // If we checked less than 24 hours ago and the pubkey is old enough, use cached value
        if (hoursSinceLastCheck < 24) {
          const isOld = isPubkeyOldEnough(persistentState.pubkeyCreatedAt, persistentState.bypassPubkeyAgeCheck)
          if (isOld) {
            setPubkeyTimestamp(persistentState.pubkeyCreatedAt)
            setIsLoading(false)
            return
          }
        }
      }

      // Fetch the pubkey age from relays
      console.log("Fetching pubkey age from relays...")
      const timestamp = await fetchPubkeyAge(pubkey, pool)

      if (timestamp) {
        setPubkeyTimestamp(timestamp)

        // Update persistent state with the timestamp
        updateState((state: any) => {
          if (state) {
            return {
              ...state,
              pubkeyCreatedAt: timestamp,
              pubkeyAgeCheckTime: Date.now(),
            }
          }
          return undefined
        })
      } else {
        setError("Could not determine pubkey age")
      }
    } catch (err) {
      console.error("Error checking pubkey age:", err)
      setError("Failed to check pubkey age")
    } finally {
      setIsLoading(false)
    }
  }

  // Calculate derived values
  const isOldEnough = isPubkeyOldEnough(pubkeyTimestamp, persistentState.bypassPubkeyAgeCheck)
  const ageInDays = getPubkeyAgeInDays(pubkeyTimestamp)
  const daysUntilOldEnough = getDaysUntilOldEnough(pubkeyTimestamp)

  return {
    isOldEnough,
    ageInDays,
    daysUntilOldEnough,
    isLoading,
    error,
    timestamp: pubkeyTimestamp,
  }
}

/**
 * Get a user-friendly message about pubkey age requirements
 */
export function getPubkeyAgeMessage(pubkeyAge: PubkeyAge): string | null {
  if (pubkeyAge.isLoading) {
    return "Checking profile age..."
  }

  if (pubkeyAge.error) {
    return "Could not verify profile age"
  }

  if (!pubkeyAge.isOldEnough && pubkeyAge.daysUntilOldEnough) {
    const days = Math.ceil(pubkeyAge.daysUntilOldEnough)
    if (days === 1) {
      return `Your Nostr profile needs to be ${PUBKEY_MIN_AGE_DAYS} days old before you can post. Please check back tomorrow.`
    }
    return `Your Nostr profile needs to be ${PUBKEY_MIN_AGE_DAYS} days old before you can post. Please check back in ${days} days.`
  }

  return null
}