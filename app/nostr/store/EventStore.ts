import { Event } from "nostr-tools"

type Listener = () => void

export class EventStore {
  // key = canonical key, value = all physical events for that canonical object
  private events = new Map<string, Event[]>()
  private listeners = new Set<Listener>()

  // Compute canonical key based on event type
  private getCanonicalKey(event: Event): string {
    // Parameterized replaceables (30000s)
    if (event.kind >= 30000 && event.kind < 40000) {
      const dTag = event.tags.find((t) => t[0] === "d")?.[1]
      if (!dTag) return `${event.kind}:${event.pubkey}:<unknown>` // fallback
      return `${event.kind}:${event.pubkey}:${dTag}`
    }

    // Replaceable events (10000s)
    if (
      (event.kind >= 10000 && event.kind < 20000) ||
      event.kind === 0 ||
      event.kind === 3
    ) {
      return `${event.kind}:${event.pubkey}`
    }

    // Immutable events
    return event.id
  }

  // Add a new event to the store
  add(event: Event): boolean {
    const key = this.getCanonicalKey(event)
    const arr = this.events.get(key) || []

    // Skip if we already have this exact physical event
    if (arr.find((e) => e.id === event.id)) return false

    arr.push(event)

    // Sort by created_at descending — newest first
    arr.sort((a, b) => b.created_at - a.created_at)

    // Save back
    this.events.set(key, arr)

    // Notify listeners
    this.emit()
    return true
  }

  getById(id: string): Event | undefined {
    for (const arr of this.events.values()) {
      const e = arr.find((ev) => ev.id === id)
      if (e) return e
    }
    return undefined
  }

  // Get all events (latest canonical event per key)
  getAllCanonical(): Event[] {
    return Array.from(this.events.values()).map((arr) => arr[0])
  }

  // Get latest event for a canonical key
  getLatest(key: string): Event | undefined {
    return this.events.get(key)?.[0]
  }

  // Optional: get all versions of a canonical event
  getAllVersions(key: string): Event[] {
    return this.events.get(key) || []
  }

  // Subscribe for updates
  subscribe(listener: Listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // Clear all events
  clear() {
    this.events.clear()
    this.emit()
  }

  private emit() {
    this.listeners.forEach((l) => l())
  }
}
