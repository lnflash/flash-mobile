import { ApolloClient, gql } from "@apollo/client"
import { isPlainObject } from "../engine/schema-validator"
import type { ToolCall } from "../engine/intent-router"
import type { NewEntry } from "./thread-store"

// A bounded snapshot of read projections in the app's existing persisted Apollo
// cache. No transcript, payee, memo, raw payment rows, invoice, or action is saved.
const QUERY = gql`
  query AssistantSavedReads {
    assistantSavedReads @client
  }
`
type Snapshot = { fetchedAt: number; entries: NewEntry[] }
type Envelope = { version: 1; scope: string; reads: Record<string, Snapshot> }
export type SavedReads = {
  read: (call: ToolCall) => Snapshot | undefined
  write: (call: ToolCall, entries: NewEntry[], fetchedAt: number) => void
}
const keyOf = (call: ToolCall): string | undefined => {
  if (call.intent === "getBalances" || call.intent === "getAccountLimits")
    return call.intent
  // Keep the common first-use history views only; never persist search text.
  if (call.intent === "getTransactions" && !call.args?.query)
    return `${call.intent}:${call.args?.direction ?? "all"}:${
      call.args?.first ?? "default"
    }`
  return undefined
}
const money = (value: unknown): boolean =>
  isPlainObject(value) &&
  Number.isSafeInteger(value.amount) &&
  ["USD", "USDT", "BTC"].includes(String(value.currency))
const validEntry = (entry: unknown): entry is NewEntry => {
  if (!isPlainObject(entry) || !isPlainObject(entry.payload)) return false
  const payload = entry.payload
  if (entry.kind === "balances")
    return (
      Array.isArray(payload.balances) &&
      payload.balances.every(
        (row: unknown) =>
          isPlainObject(row) &&
          ["USD", "USDT", "BTC"].includes(String(row.wallet)) &&
          (row.state === "ok"
            ? money(row.balance)
            : [
                "Assistant.balanceUnavailable",
                "Assistant.btcSyncing",
                "Assistant.btcDisabled",
                "Assistant.btcFailed",
              ].includes(String(row.replyKey))),
      )
    )
  if (entry.kind === "limits")
    return ["withdrawal", "internalSend", "convert"].every((kind) => {
      const rows = payload[kind]
      return (
        Array.isArray(rows) &&
        rows.every(
          (row: unknown) =>
            isPlainObject(row) &&
            money(row.total) &&
            (row.remaining === null || money(row.remaining)) &&
            (row.intervalSeconds === null || Number.isFinite(row.intervalSeconds)),
        )
      )
    })
  if (entry.kind === "transactions")
    return (
      Array.isArray(payload.transactions) &&
      payload.transactions.length <= 20 &&
      isPlainObject(payload.window) &&
      Number.isFinite(payload.window.searchedCount) &&
      isPlainObject(payload.btc) &&
      (payload.btc.state === "ok" ||
        ["Assistant.btcSyncing", "Assistant.btcDisabled", "Assistant.btcFailed"].includes(
          String(payload.btc.replyKey),
        )) &&
      payload.transactions.every(
        (row: unknown) =>
          isPlainObject(row) &&
          typeof row.id === "string" &&
          ["btc", "graphql"].includes(String(row.rail)) &&
          ["SEND", "RECEIVE"].includes(String(row.direction)) &&
          ["SUCCESS", "PENDING", "FAILURE"].includes(String(row.status)) &&
          Number.isFinite(row.timestamp) &&
          money(row.amount) &&
          money(row.fee),
      )
    )
  return false
}

export const createSavedReads = (
  client: ApolloClient<unknown>,
  scope?: string,
): SavedReads => {
  // Only the current session's snapshot survives an account/instance switch.
  // Logout's existing cache reset also removes this field from persistence.
  if (typeof client.readQuery === "function") {
    try {
      const raw = client.readQuery<{ assistantSavedReads: string }>({
        query: QUERY,
      })?.assistantSavedReads
      if (raw && (!scope || JSON.parse(raw).scope !== scope))
        client.cache.evict({ id: "ROOT_QUERY", fieldName: "assistantSavedReads" })
    } catch {
      /* A malformed saved value is treated as missing below. */
    }
  }
  const load = (): Envelope | undefined => {
    if (!scope || typeof client.readQuery !== "function") return undefined
    try {
      const raw = client.readQuery<{ assistantSavedReads: string }>({
        query: QUERY,
      })?.assistantSavedReads
      if (typeof raw !== "string" || raw.length > 100_000) return undefined
      const value = JSON.parse(raw) as Envelope
      if (value?.version !== 1 || value.scope !== scope || !isPlainObject(value.reads))
        return undefined
      const reads = Object.fromEntries(
        Object.entries(value.reads).filter(
          ([, snapshot]) =>
            isPlainObject(snapshot) &&
            Number.isFinite(snapshot.fetchedAt) &&
            Number(snapshot.fetchedAt) > 0 &&
            Array.isArray(snapshot.entries) &&
            snapshot.entries.length > 0 &&
            snapshot.entries.every(validEntry),
        ),
      ) as Record<string, Snapshot>
      return { version: 1, scope, reads }
    } catch {
      return undefined
    }
  }
  return {
    read: (call) => {
      const key = keyOf(call)
      const reads = load()?.reads
      if (!key || !reads) return undefined
      if (reads[key]) return reads[key]
      // A saved general history view can answer a narrower question. Keep
      // its original fetch time and never claim the saved subset is complete.
      if (call.intent !== "getTransactions" || call.args?.query) return undefined
      const direction = call.args?.direction
      const first = typeof call.args?.first === "number" ? call.args.first : 10
      for (const [savedKey, snapshot] of Object.entries(reads).sort(
        (a, b) => b[1].fetchedAt - a[1].fetchedAt,
      )) {
        const entry = snapshot.entries[0]
        const compatible =
          savedKey.startsWith(`getTransactions:${direction ?? "all"}:`) ||
          (direction && savedKey.startsWith("getTransactions:all:"))
        if (compatible && entry?.kind === "transactions") {
          const transactions = entry.payload.transactions
            .filter((row) => !direction || row.direction === direction)
            .slice(0, first)
          if (transactions.length)
            return {
              fetchedAt: snapshot.fetchedAt,
              entries: [{ ...entry, payload: { ...entry.payload, transactions } }],
            }
        }
      }
      return undefined
    },
    write: (call, entries, fetchedAt) => {
      const key = keyOf(call)
      if (!scope || !key || typeof client.writeQuery !== "function" || !entries.length)
        return
      const safe = entries.flatMap((entry): NewEntry[] => {
        if (entry.kind === "balances" || entry.kind === "limits")
          return [{ ...entry, stale: true }]
        if (entry.kind === "transactions")
          return [
            {
              kind: "transactions",
              stale: true,
              payload: {
                ...entry.payload,
                transactions: entry.payload.transactions.map(
                  ({ memo: _memo, counterparty: _counterparty, ...row }) => row,
                ),
              },
            },
          ]
        return []
      })
      if (!safe.length || !safe.every(validEntry)) return
      const reads = { ...(load()?.reads ?? {}), [key]: { fetchedAt, entries: safe } }
      // At most ten bounded views, newest first.
      const bounded = Object.fromEntries(
        Object.entries(reads)
          .sort((a, b) => b[1].fetchedAt - a[1].fetchedAt)
          .slice(0, 10),
      )
      try {
        client.writeQuery({
          query: QUERY,
          data: {
            assistantSavedReads: JSON.stringify({ version: 1, scope, reads: bounded }),
          },
        })
      } catch {
        /* A cache write must never fail an otherwise successful read. */
      }
    },
  }
}
