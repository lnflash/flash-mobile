import { SimplePool, AbstractRelay } from "nostr-tools"

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://relay.snort.social",
]

export class RelayManager {
  private pool = new SimplePool()
  private relays = new Map<string, AbstractRelay>()

  start() {
    // intentionally empty – connect lazily
  }

  stop() {
    this.pool.close(Array.from(this.relays.keys()))
    this.relays.clear()
  }

  async getRelay(url: string): Promise<AbstractRelay> {
    if (this.relays.has(url)) {
      return this.relays.get(url)!
    }

    const relay = await this.pool.ensureRelay(url)
    this.relays.set(url, relay)
    return relay
  }

  getReadRelays() {
    return DEFAULT_RELAYS
  }

  reconnectAll() {
    // nostr-tools handles reconnect internally
  }

  disconnectAll() {
    this.pool.close(DEFAULT_RELAYS)
  }

  subscribe(filters: any[], handlers: any, relays?: string[]) {
    let relaysToUse: string[] = this.getReadRelays()
    if ((relays || []).length !== 0) relaysToUse = relays!
    return this.pool.subscribeMany(relaysToUse, filters, handlers)
  }

  publish(event: any) {
    return this.pool.publish(this.getReadRelays(), event)
  }
}
