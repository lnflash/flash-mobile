import { ApolloLink } from "@apollo/client"

// How far the phone's clock runs from the API's (ENG-688).
//
// The assistant's dispatch journal stamps a payment's dispatch on the
// phone's clock, and the transaction list stamps the payment's row on the
// server's. A phone running minutes fast would put its own payment's row
// before the dispatch, where the reconciler reads it as a row from before
// it, and could then call the payment absent and let it go a second time
// (app/assistant/engine/reconcile.ts). A server with a clock sends it in
// the Date header of its answers (RFC 9110 §6.6.1). The link below takes it
// from each GraphQL answer, and the executor writes the latest offset on
// each dispatch's record, so the reconciler can place the dispatch on the
// server's clock.
//
// Measured when the answer is read, the offset errs one way only. The
// header is the moment the server answered, cut to the second, and the
// phone reads it after the answer has crossed the network, so the phone
// seems further ahead of the server than it is. That places the dispatch
// earlier on the server's clock, and the list is read further back: the
// safe direction.
//
// The offset holds only while the phone's clock runs on from where it was
// measured (ENG-726). An NTP correction or a manual change between that
// answer and a dispatch steps the phone's clock under it: the dispatch,
// stamped on the stepped clock, would be placed minutes off on the
// server's, and a list read back from there can miss the payment's own row
// and call it absent. So each measurement keeps a monotonic reading beside
// the wall-clock one, and the offset is read only while the two have moved
// alike since. When they disagree by more than CLOCK_STEP_TOLERANCE_MS the
// offset is unknown (null), and the reconciler never calls absent a record
// that has none. A monotonic clock may stop while the phone sleeps, which
// reads as a step too: a dispatch after a long sleep with no answer since
// is journaled with no offset, the safe direction.
//
// This module is outside app/assistant, which nothing else may import
// (__tests__/assistant/module-boundary.spec.ts): client.tsx chains the link,
// and the executor reads the offset.

/**
 * How far the wall clock may move against the monotonic clock between the
 * answer that measured the offset and a read of it, in milliseconds.
 * Further than that, the phone's clock stepped and the offset no longer
 * places a dispatch on the server's clock.
 *
 * A step within it goes uncorrected, so it spends part of the reconciler's
 * RECONCILE_CLOCK_SKEW_SECONDS (120 s, app/assistant/engine/reconcile.ts,
 * which this module may not import). That margin also covers IBEX's clock
 * against the API's, the whole seconds of the Date header and of a row's
 * createdAt, and the phone's drift (spec §5.1), so a step may take only a
 * quarter of it. At 120 s, a step forward of 115 s with IBEX 10 s behind
 * put the payment's own row before the window, and the list called it
 * absent: the double payment ENG-726 closes.
 */
export const CLOCK_STEP_TOLERANCE_MS = 30_000

/**
 * Milliseconds on a clock that only runs forward, at a steady rate, whatever
 * the wall clock does; its zero means nothing. Undefined when there is none.
 */
export type MonotonicClock = () => number | undefined

/**
 * The runtime's monotonic clock: React Native's nativePerformanceNow, else
 * performance.now (Hermes, and Node under Jest). Without either there is no
 * telling a step from the passing of time, and the offset reads null.
 */
export const monotonicNow: MonotonicClock = () => {
  const { nativePerformanceNow, performance } = globalThis as {
    nativePerformanceNow?: () => number
    performance?: { now?: () => number }
  }
  if (typeof nativePerformanceNow === "function") return nativePerformanceNow()
  if (typeof performance?.now === "function") return performance.now()
  return undefined
}

export type ServerClock = {
  /**
   * The phone's clock less the server's, in milliseconds, as the latest
   * GraphQL answer with a Date header this can read showed it: positive when
   * the phone runs ahead. Null until such an answer has come, and null
   * while the phone's clock has stepped since that answer (more than
   * CLOCK_STEP_TOLERANCE_MS against the monotonic clock), until another
   * answer measures it again.
   */
  offsetMs: () => number | null
  /**
   * Afterware for the HTTP chain, just before the HttpLink: it takes the
   * Date header of every answer that came back as a GraphQL result, and
   * hands the result on untouched. An answer that failed (a status HttpLink
   * refuses, or a body that is no GraphQL result, such as a captive portal's
   * page) is not the API's clock, and changes nothing.
   */
  link: ApolloLink
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

/** IMF-fixdate (RFC 9110 §5.6.7): "Sun, 06 Nov 1994 08:49:37 GMT". */
const IMF_FIXDATE =
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/

/**
 * The epoch milliseconds a Date header names, or null when it names none
 * this can be sure of. Only IMF-fixdate is read: a sender must send its Date
 * header in that form (RFC 9110 §5.6.7). Date.parse is not used: past ISO
 * 8601, what it accepts is up to the engine (ECMA-262, Date.parse), and V8
 * reads "x 2099" as a day in 2099. Such a header would put the dispatch in
 * the future, every row before it, and the payment absent.
 */
export const parseHttpDate = (value: string): number | null => {
  const match = IMF_FIXDATE.exec(value.trim())
  if (!match) return null
  const [day, month, year, hours, minutes, seconds] = [
    Number(match[1]),
    MONTHS.indexOf(match[2]),
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  ]
  const ms = Date.UTC(year, month, day, hours, minutes, seconds)
  // Date.UTC carries a field past its range into the next (31 Nov is 1 Dec,
  // 24:00 the next day) and reads a year below 100 as 19xx: only a moment
  // that reads back field for field is the one the header names.
  const named = new Date(ms)
  const readsBack =
    named.getUTCFullYear() === year &&
    named.getUTCMonth() === month &&
    named.getUTCDate() === day &&
    named.getUTCHours() === hours &&
    named.getUTCMinutes() === minutes &&
    named.getUTCSeconds() === seconds
  return readsBack ? ms : null
}

type HeadersLike = { get: (name: string) => unknown }

const isHeadersLike = (value: unknown): value is HeadersLike =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { get?: unknown }).get === "function"

/** The Date header of the fetch Response HttpLink put on the context, if it has one. */
const dateHeaderOf = (response: unknown): string | null => {
  if (typeof response !== "object" || response === null) return null
  const { headers } = response as { headers?: unknown }
  if (!isHeadersLike(headers)) return null
  const date = headers.get("date")
  return typeof date === "string" ? date : null
}

/** One measurement: the offset, and both clocks as they read when it was taken. */
type Measurement = {
  offsetMs: number
  wallMs: number
  monotonicMs: number | undefined
}

/**
 * A clock that knows nothing until an answer shows it the server's.
 * `now` is the phone's clock, read when an answer is and when the offset
 * is; `monotonic` is the clock a step of `now` is told against.
 */
export const createServerClock = (
  now: () => number = () => Date.now(),
  monotonic: MonotonicClock = monotonicNow,
): ServerClock => {
  let measured: Measurement | null = null

  const link = new ApolloLink((operation, forward) =>
    forward(operation).map((result) => {
      // Whatever goes wrong here must not fail the answer it reads.
      try {
        const date = dateHeaderOf(operation.getContext().response)
        const serverMs = date === null ? null : parseHttpDate(date)
        const wallMs = now()
        const offset = serverMs === null ? Number.NaN : wallMs - serverMs
        if (Number.isFinite(offset)) {
          measured = { offsetMs: offset, wallMs, monotonicMs: monotonic() }
        }
      } catch {
        // An answer whose headers cannot be read leaves the clock as it was.
      }
      return result
    }),
  )

  const offsetMs = (): number | null => {
    if (measured === null) return null
    // The executor reads this as it journals a dispatch: it never throws.
    try {
      const monotonicMs = monotonic()
      if (monotonicMs === undefined || measured.monotonicMs === undefined) return null
      // Time that passed moves both clocks alike; a step moves only the wall
      // clock, either way.
      const stepMs = now() - measured.wallMs - (monotonicMs - measured.monotonicMs)
      if (!Number.isFinite(stepMs) || Math.abs(stepMs) > CLOCK_STEP_TOLERANCE_MS) {
        return null
      }
      return measured.offsetMs
    } catch {
      return null
    }
  }

  return { offsetMs, link }
}

/** The app's: client.tsx chains its link, and the assistant's executor reads it. */
export const serverClock = createServerClock()
