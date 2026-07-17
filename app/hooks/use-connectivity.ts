import { useEffect, useRef, useState } from "react"
import { useNetInfo } from "@react-native-community/netinfo"

// COUPLED to the NetInfo probe cadence configured in app/graphql/client.tsx:
// after a single failed probe, recovery (true) can arrive no earlier than
// reachabilityShortTimeout (5s) + probe round-trip. The debounce must exceed
// that full cycle, or every isolated probe failure (one 502 during a deploy,
// a socket killed while backgrounded) latches the banner before the next
// probe can clear it. 8s absorbs one failed cycle; only two consecutive
// failures (a real outage) surface.
export const OFFLINE_DEBOUNCE_MS = 8000

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
      // Only a CONFIRMED recovery (true) consumes the offline latch and
      // pulses. With useNativeReachability:false, NetInfo emits
      // false → null → true on real recoveries (null while the probe runs):
      // pulsing at null would fire the reconnect refetch before the API is
      // actually reachable AND eat the one-shot latch so the true edge never
      // pulses. null still clears the banner (treat-as-online) — it just
      // doesn't count as a reconnect.
      if (isInternetReachable === true && wasOfflineRef.current) {
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
