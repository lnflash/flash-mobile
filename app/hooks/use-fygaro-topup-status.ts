import { useEffect, useRef, useState } from "react"
import { gql } from "@apollo/client"

import { FygaroTopupState, useFygaroTopupStatusLazyQuery } from "@app/graphql/generated"

// Isolated for the same reason as the other card-top-up operations: an older
// backend rejects the whole document over one unknown field, and losing the
// status poll must not take anything else with it.
//
// Only the fields this hook actually reads. `authorizedAmount` was selected and
// then used nowhere — the screen already has the gross amount from the route
// params, and an unused field is one more thing an older backend can reject the
// whole document over.
gql`
  query fygaroTopupStatus($checkoutId: String!) {
    fygaroTopupStatus(checkoutId: $checkoutId) {
      state
      netAmount
      reason
    }
  }
`

/**
 * How long the customer may look at a spinner before the screen owes them a
 * definite answer. A credit normally lands in a second or two; anything past
 * this and "still working" is more honest than "still loading".
 */
const FAST_POLL_MS = 1_000
const FAST_POLL_WINDOW_MS = 10_000
/**
 * After the screen has resolved, keep checking quietly — the transient webhook
 * paths deliberately 500 so Fygaro retries, which can take minutes. This only
 * upgrades what is shown; it never puts the spinner back.
 */
const SLOW_POLL_MS = 5_000
const SLOW_POLL_WINDOW_MS = 60_000

export type FygaroTopupResolution =
  // Still inside the fast window with no terminal answer. The ONLY state that
  // may show a spinner.
  | { phase: "checking" }
  | { phase: "credited"; netAmountCents?: number }
  // The provider TOLD us it has the payment; the credit has not landed yet.
  // Not an error, and emphatically not "Payment Successful".
  | { phase: "pending" }
  // No payment has been observed for this checkout — and the payment page
  // closes on a decline exactly as it does on a success, so this is NOT
  // "we've received your payment". It also covers the case where we could not
  // ask at all, because "we don't know" and "we have it" are different things
  // and only one of them is safe to assert.
  | { phase: "unconfirmed" }
  | { phase: "held"; reason?: string }
  | { phase: "failed"; reason?: string }

const isTerminal = (state: FygaroTopupState) =>
  state === "CREDITED" || state === "HELD_FOR_REVIEW" || state === "FAILED"

/**
 * Ask the backend what actually became of a card payment, instead of reading a
 * Fygaro redirect as proof of deposit.
 *
 * `checkoutId` is undefined for a legacy device-built link, which has no id to
 * ask about. That resolves straight to `pending` — we know a payment happened
 * and genuinely cannot say more, which is the truthful version of the screen
 * that used to claim "Deposited to <wallet>".
 */
export const useFygaroTopupStatus = (checkoutId: string | undefined) => {
  const [resolution, setResolution] = useState<FygaroTopupResolution>(
    checkoutId ? { phase: "checking" } : { phase: "pending" },
  )
  const [fetchStatus] = useFygaroTopupStatusLazyQuery({ fetchPolicy: "network-only" })

  const resolvedRef = useRef(false)
  // Whether the server has ever answered PROCESSING for this checkout. Held in
  // a ref because the deadline reads it from a timer, outside React's render.
  const observedProcessingRef = useRef(false)

  useEffect(() => {
    if (!checkoutId) return

    let cancelled = false
    observedProcessingRef.current = false
    resolvedRef.current = false

    let timer: ReturnType<typeof setInterval> | undefined
    let handover: ReturnType<typeof setTimeout> | undefined
    let stop: ReturnType<typeof setTimeout> | undefined

    // Every timer this effect owns, in one place, so a terminal answer and an
    // unmount can both put the polling down completely.
    const stopPolling = () => {
      if (timer) clearInterval(timer)
      if (handover) clearTimeout(handover)
      if (stop) clearTimeout(stop)
      timer = undefined
      handover = undefined
      stop = undefined
    }

    const apply = (state: FygaroTopupState, reason?: string, netAmount?: number) => {
      if (state === "CREDITED") {
        setResolution({ phase: "credited", netAmountCents: netAmount })
      } else if (state === "HELD_FOR_REVIEW") {
        setResolution({ phase: "held", reason })
      } else if (state === "FAILED") {
        setResolution({ phase: "failed", reason })
      }
    }

    const tick = async () => {
      let status
      try {
        const { data } = await fetchStatus({ variables: { checkoutId } })
        status = data?.fygaroTopupStatus
      } catch {
        // A failed poll tells us nothing about the payment, so it must not
        // change what the customer is being shown — but it must not hold the
        // spinner either. Deliberately NO early return: `status` stays
        // undefined, so the terminal branch below is skipped while the
        // fast-window branch still resolves the screen to `pending`. Returning
        // here meant that a customer on a flaky connection (or an older backend
        // that rejects the query outright) sat on "Confirming your top-up"
        // forever — every timer eventually cleared with the phase still
        // `checking`, on the screen they land on straight after being charged.
      }
      if (cancelled) return

      if (status?.state === "PROCESSING") observedProcessingRef.current = true

      if (status?.state === "PROCESSING" && resolvedRef.current) {
        // The quiet poll caught up: we now know the payment exists, so stop
        // saying we have not seen it. Only ever an upgrade — never the reverse.
        setResolution((current) =>
          current.phase === "unconfirmed" ? { phase: "pending" } : current,
        )
      }

      if (status && isTerminal(status.state)) {
        resolvedRef.current = true
        apply(status.state, status.reason ?? undefined, status.netAmount ?? undefined)
        // Terminal means terminal — there is no later answer to wait for. Left
        // running, a CREDITED at t≈1s still cost ~21 more network-only round
        // trips and ~21 re-renders over the next 70 seconds, and
        // HELD_FOR_REVIEW (which no amount of retrying changes, by definition)
        // cost exactly the same.
        stopPolling()
      }
    }

    // The deadline is its OWN timer, not a check inside tick, and that is the
    // whole point. Every path to resolving the screen used to sit behind
    // `await fetchStatus(...)`, so a request that never settles never reached
    // it — and React Native sets no default network timeout on Android, while
    // this app's HttpLink (app/graphql/client.tsx) passes no AbortController.
    // A stalled connection therefore produces a promise that hangs rather than
    // one that rejects, and the customer sat on "Confirming your top-up"
    // indefinitely, on the screen they land on immediately after being charged.
    // A deadline that depends on the thing it is a deadline FOR is not a
    // deadline.
    const resolveAtDeadline = () => {
      if (resolvedRef.current || cancelled) return
      resolvedRef.current = true
      // Only claim receipt if the server actually said PROCESSING — i.e. the
      // provider told us the payment exists. UNCONFIRMED, or no answer at all,
      // resolves to `unconfirmed`: a declined card closes the payment page
      // exactly like a successful one, so defaulting to "we've received your
      // payment" would tell someone whose card bounced that we have their
      // money. That is the same false claim this whole change removes, one
      // screen later.
      setResolution({ phase: observedProcessingRef.current ? "pending" : "unconfirmed" })
    }

    timer = setInterval(tick, FAST_POLL_MS)

    // Hand over to the quiet poll at the same moment the screen resolves, so a
    // late credit still upgrades "pending" to "credited" without the customer
    // watching a spinner for a minute.
    handover = setTimeout(() => {
      resolveAtDeadline()
      if (timer) clearInterval(timer)
      timer = setInterval(tick, SLOW_POLL_MS)
    }, FAST_POLL_WINDOW_MS)

    stop = setTimeout(stopPolling, FAST_POLL_WINDOW_MS + SLOW_POLL_WINDOW_MS)

    // Fired last, so a terminal answer arriving on this first poll can clear
    // timers that already exist.
    tick().catch(() => undefined)

    return () => {
      cancelled = true
      stopPolling()
    }
  }, [checkoutId, fetchStatus])

  return resolution
}
