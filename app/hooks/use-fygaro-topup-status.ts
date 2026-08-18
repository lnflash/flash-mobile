import { useEffect, useRef, useState } from "react"
import { gql } from "@apollo/client"

import { FygaroTopupState, useFygaroTopupStatusLazyQuery } from "@app/graphql/generated"

// Isolated for the same reason as the other card-top-up operations: an older
// backend rejects the whole document over one unknown field, and losing the
// status poll must not take anything else with it.
gql`
  query fygaroTopupStatus($checkoutId: String!) {
    fygaroTopupStatus(checkoutId: $checkoutId) {
      state
      authorizedAmount
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
  // We have the payment; the credit has not landed (or we cannot tell). Not an
  // error, and emphatically not "Payment Successful".
  | { phase: "pending" }
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

  // Read inside the interval without making it a dependency — re-creating the
  // timer on every tick would restart the window and the screen would never
  // leave "checking".
  const startedAtRef = useRef(Date.now())
  const resolvedRef = useRef(false)

  useEffect(() => {
    if (!checkoutId) return

    let cancelled = false
    startedAtRef.current = Date.now()
    resolvedRef.current = false

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
        // change what the customer is being shown.
        return
      }
      if (cancelled) return

      if (status && isTerminal(status.state)) {
        resolvedRef.current = true
        apply(status.state, status.reason ?? undefined, status.netAmount ?? undefined)
        return
      }

      // No terminal answer. Once the fast window closes the screen stops
      // waiting and says what it knows — the customer has been charged, and a
      // spinner past this point reads as "something is broken".
      if (
        !resolvedRef.current &&
        Date.now() - startedAtRef.current >= FAST_POLL_WINDOW_MS
      ) {
        resolvedRef.current = true
        setResolution({ phase: "pending" })
      }
    }

    tick().catch(() => undefined)
    let timer = setInterval(tick, FAST_POLL_MS)

    // Hand over to the quiet poll at the same moment the screen resolves, so a
    // late credit still upgrades "pending" to "credited" without the customer
    // watching a spinner for a minute.
    const handover = setTimeout(() => {
      clearInterval(timer)
      timer = setInterval(tick, SLOW_POLL_MS)
    }, FAST_POLL_WINDOW_MS)

    const stop = setTimeout(
      () => clearInterval(timer),
      FAST_POLL_WINDOW_MS + SLOW_POLL_WINDOW_MS,
    )

    return () => {
      cancelled = true
      clearInterval(timer)
      clearTimeout(handover)
      clearTimeout(stop)
    }
  }, [checkoutId, fetchStatus])

  return resolution
}
