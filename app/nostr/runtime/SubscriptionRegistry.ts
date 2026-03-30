import { Filter, Event } from "nostr-tools"
import { RelayManager } from "./RelayManager"
import { SubCloser } from "nostr-tools/abstract-pool"

// NIP-17 allows gift wrap created_at to be randomized up to 2 days in the past,
// so on reconnect we backfill this full window to avoid missing any events.
const RECONNECT_SINCE_WINDOW = 2 * 24 * 60 * 60

type SubscriptionEntry = {
  filter: Filter
  closer: SubCloser
  refCount: number
  onEvent: (event: Event) => void
  onEose?: () => void
  relays?: string[]
}

export class SubscriptionRegistry {
  private subs = new Map<string, SubscriptionEntry>()

  constructor(private relayManager: RelayManager) {}

  ensure(
    key: string,
    filter: Filter,
    onEvent: (event: Event) => void,
    onEose?: () => void,
    relays?: string[],
  ) {
    const existing = this.subs.get(key)

    if (existing) {
      existing.refCount++
      return
    }

    const entry: SubscriptionEntry = {
      filter,
      closer: null as unknown as SubCloser, // set immediately by _subscribe below
      refCount: 1,
      onEvent,
      onEose,
      relays,
    }
    this.subs.set(key, entry)
    this._subscribe(key, entry)
  }

  release(key: string) {
    const sub = this.subs.get(key)
    if (!sub) return

    sub.refCount--
    if (sub.refCount <= 0) {
      // Delete before close so the onclose handler does not trigger a reconnect
      this.subs.delete(key)
      sub.closer.close()
    }
  }

  restore() {
    for (const [key, entry] of this.subs.entries()) {
      this._subscribe(key, entry, true)
    }
  }

  clear() {
    // Clear map before closing so onclose handlers do not trigger reconnects
    const entries = Array.from(this.subs.values())
    this.subs.clear()
    entries.forEach((s) => s.closer.close())
  }

  private _subscribe(key: string, entry: SubscriptionEntry, isReconnect = false) {
    // On reconnect, backfill the past 2 days to cover NIP-17's created_at randomization window
    const filter: Filter = isReconnect
      ? { ...entry.filter, since: Math.floor(Date.now() / 1000) - RECONNECT_SINCE_WINDOW }
      : entry.filter

    const closer = this.relayManager.subscribe(
      filter,
      {
        onevent: entry.onEvent,
        onclose: () => {
          // Only reconnect if this was an unexpected drop, not an intentional release/clear
          if (this.subs.has(key)) {
            this._subscribe(key, entry, true)
          }
        },
        oneose: () => {
          entry.onEose?.()
        },
      },
      entry.relays,
    )

    entry.closer = closer
  }
}
