import { useEffect, useRef, useState } from "react"
import { useNetInfo } from "@react-native-community/netinfo"

const OFFLINE_DEBOUNCE_MS = 3000

/**
 * Connectivity state with hysteresis, for UI that reacts to being offline.
 *
 * `isOffline` only becomes true after reachability has been continuously
 * lost for OFFLINE_DEBOUNCE_MS. Momentary blips — app foregrounding, radio
 * handoff, a single failed reachability probe — never surface to the user.
 * Recovery is immediate: the flag clears as soon as reachability returns.
 *
 * `justReconnected` flips to true for one render cycle when connectivity
 * returns after a real offline period, so screens can trigger a refetch.
 */
export const useConnectivity = (): {
  isOffline: boolean
  justReconnected: boolean
} => {
  const { isInternetReachable } = useNetInfo()
  const [isOffline, setIsOffline] = useState(false)
  const [justReconnected, setJustReconnected] = useState(false)
  const wasOfflineRef = useRef(false)
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    // null means "not determined yet" — treat as online, never as offline
    if (isInternetReachable === false) {
      if (!debounceTimer.current) {
        debounceTimer.current = setTimeout(() => {
          debounceTimer.current = undefined
          wasOfflineRef.current = true
          setIsOffline(true)
        }, OFFLINE_DEBOUNCE_MS)
      }
    } else {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
        debounceTimer.current = undefined
      }
      if (wasOfflineRef.current) {
        wasOfflineRef.current = false
        setJustReconnected(true)
      }
      setIsOffline(false)
    }

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
        debounceTimer.current = undefined
      }
    }
  }, [isInternetReachable])

  useEffect(() => {
    if (justReconnected) {
      setJustReconnected(false)
    }
  }, [justReconnected])

  return { isOffline, justReconnected }
}
