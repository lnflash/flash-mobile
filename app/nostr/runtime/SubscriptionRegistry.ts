import { Filter, Event } from "nostr-tools"
import { RelayManager } from "./RelayManager"
import { SubCloser } from "nostr-tools/abstract-pool"

type SubscriptionEntry = {
  filter: Filter
  closer: SubCloser
  refCount: number
  onEvent: (event: Event) => void
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

    const closer = this.relayManager.subscribe(
      filter,
      {
        onevent: onEvent,
        onclose: () => {
          this.subs.delete(key)
        },
        oneose: () => {
          onEose?.()
        },
      },
      relays,
    )

    this.subs.set(key, {
      filter,
      closer,
      refCount: 1,
      onEvent,
    })
  }

  release(key: string) {
    const sub = this.subs.get(key)
    if (!sub) return

    sub.refCount--
    if (sub.refCount <= 0) {
      sub.closer.close()
      this.subs.delete(key)
    }
  }

  restore() {
    for (const [key, sub] of this.subs.entries()) {
      const closer = this.relayManager.subscribe(sub.filter, {
        onevent: sub.onEvent,
      })

      sub.closer = closer
    }
  }

  clear() {
    this.subs.forEach((s) => s.closer.close())
    this.subs.clear()
  }
}
