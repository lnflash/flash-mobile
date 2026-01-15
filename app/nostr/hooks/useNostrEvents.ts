import { useSyncExternalStore } from "react"
import { nostrRuntime } from "../runtime/NostrRuntime"

export function useNostrEvents() {
  const store = nostrRuntime.getEventStore()

  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getAllCanonical(),
  )
}
