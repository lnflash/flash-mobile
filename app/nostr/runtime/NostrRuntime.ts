import { Filter, Event } from "nostr-tools"
import { RelayManager } from "./RelayManager"
import { SubscriptionRegistry } from "./SubscriptionRegistry"
import { EventStore } from "../store/EventStore"

export class NostrRuntime {
  private relayManager = new RelayManager()
  private subscriptions = new SubscriptionRegistry(this.relayManager)
  private events = new EventStore()

  start() {
    this.relayManager.start()
  }

  stop() {
    this.subscriptions.clear()
    this.relayManager.stop()
  }

  onForeground() {
    this.relayManager.reconnectAll()
    this.subscriptions.restore()
  }

  onBackground() {
    this.relayManager.disconnectAll()
  }

  /** 🔑 Public API */

  getEventStore() {
    return this.events
  }

  ensureSubscription(
    key: string,
    filters: Filter[],
    onEvent?: (event: Event) => void,
    onEose?: () => void,
    relays?: string[],
  ) {
<<<<<<< HEAD
=======
    console.log("Got relays ensureSubscription", relays, filters)
>>>>>>> be69122f (Use NostrRuntime throughout app)
    return this.subscriptions.ensure(
      key,
      filters,
      (event: Event) => {
        if (this.events.add(event)) {
          onEvent?.(event)
        }
      },
      onEose,
      relays,
    )
  }

  releaseSubscription(key: string) {
    this.subscriptions.release(key)
  }

  // get latest canonical event by key
  getEvent(canonicalKey: string) {
    return this.events.getLatest(canonicalKey)
  }

  // get all latest canonical events
  getAllEvents() {
    return this.events.getAllCanonical()
  }

  // optional: physical id lookup
  getEventById(id: string) {
    return this.events.getById(id)
  }
}

export const nostrRuntime = new NostrRuntime()
