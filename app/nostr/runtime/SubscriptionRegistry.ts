import { Filter, Event, SubCloser } from "nostr-tools"
import { RelayManager } from "./RelayManager"

type SubscriptionEntry = {
  filters: Filter[]
  closer: SubCloser
  refCount: number
}

export class SubscriptionRegistry {
  private subs = new Map<string, SubscriptionEntry>()

  constructor(private relayManager: RelayManager) {}

  ensure(key: string, filters: Filter[], onEvent: (event: Event) => void) {
    const existing = this.subs.get(key)

    if (existing) {
      existing.refCount++
      return
    }

    const closer = this.relayManager.subscribe(filters, {
      onevent: onEvent,
      onclose: () => {
        this.subs.delete(key)
      },
    })

    this.subs.set(key, {
      filters,
      closer,
      refCount: 1,
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
      const closer = this.relayManager.subscribe(sub.filters, {
        onevent: () => {},
      })

      sub.closer = closer
    }
  }

  clear() {
    this.subs.forEach((s) => s.closer.close())
    this.subs.clear()
  }
}
