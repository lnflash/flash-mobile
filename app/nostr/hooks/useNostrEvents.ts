import { useSyncExternalStore } from "react"
import { nostrRuntime } from "../runtime/NostrRuntime"

/**
 * Hook to get nostr events from the runtime.
 * If canonicalKey is provided, returns only events for that key.
 * Otherwise returns all latest canonical events (backward-compatible).
 */
export function useNostrEvents(canonicalKey?: string) {
  const store = nostrRuntime.getEventStore()

  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => (canonicalKey ? store.getAllVersions(canonicalKey) : store.getAllCanonical()),
  )
}
