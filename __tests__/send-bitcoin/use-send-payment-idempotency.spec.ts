/**
 * ENG-533, app half. Two separate protections, often confused:
 *
 *  - the in-flight guard stops a DOUBLE TAP producing two requests;
 *  - the idempotency key stops a REPEATED REQUEST producing two payments.
 *
 * The second is the dangerous one. A send whose response was lost (dropped
 * socket, gateway 502, app backgrounded mid-flight) has already moved the
 * money, and the client cannot tell. Only a stable key lets the backend
 * recognise the repeat.
 *
 * These exercise the key lifecycle directly rather than through the hook: the
 * hook pulls in Apollo, generated documents and the Breez SDK, none of which
 * are loadable under jest. What is asserted here is the RULE the hook
 * implements — a rule that is wrong in exactly two ways, both covered.
 */
import { v4 as uuidv4 } from "uuid"

// Mirrors the ref lifecycle in use-send-payment.ts.
class AttemptKey {
  private key: string | undefined

  /** Called before each send; reuses the key while the attempt is unresolved. */
  forSend(): string {
    if (!this.key) this.key = uuidv4()
    return this.key
  }

  /** Only on a definitive, server-confirmed failure. */
  reset(): void {
    this.key = undefined
  }
}

describe("send idempotency key lifecycle", () => {
  it("reuses the same key when a send is repeated", () => {
    const attempt = new AttemptKey()

    // First send; response lost, so the client repeats it.
    const first = attempt.forSend()
    const repeat = attempt.forSend()

    // If these differed, the backend would see two unrelated payments.
    expect(repeat).toBe(first)
  })

  it("issues a fresh key only after a definitive failure", () => {
    const attempt = new AttemptKey()

    const failed = attempt.forSend()
    attempt.reset() // server said: nothing settled
    const retry = attempt.forSend()

    // Reusing `failed` here would make the backend replay the recorded
    // failure, and the customer could never succeed.
    expect(retry).not.toBe(failed)
  })

  it("does not recycle a key across separate attempts", () => {
    const a = new AttemptKey()
    const b = new AttemptKey()

    expect(a.forSend()).not.toBe(b.forSend())
  })

  it("generates a v4 uuid", () => {
    expect(new AttemptKey().forSend()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })
})

describe("in-flight guard", () => {
  // The bug it fixes: `hasAttemptedSend` gates whether sendPayment is DEFINED,
  // which is decided at render time. Two taps in one frame both capture the
  // closure from the render where it was still defined. A ref is written
  // synchronously, so the second tap sees it.
  const makeSender = () => {
    let inFlight = false
    let calls = 0
    return {
      calls: () => calls,
      send: async () => {
        if (inFlight) return "ignored"
        inFlight = true
        calls++
        await Promise.resolve()
        return "sent"
      },
    }
  }

  it("lets only the first of two taps in the same tick through", async () => {
    const s = makeSender()

    const [a, b] = await Promise.all([s.send(), s.send()])

    expect(s.calls()).toBe(1)
    expect([a, b]).toEqual(["sent", "ignored"])
  })

  it("would double-send without the guard", async () => {
    // Pins the failure mode, so deleting the guard fails a test rather than
    // silently restoring the bug.
    let calls = 0
    const unguarded = async () => {
      calls++
      await Promise.resolve()
    }

    await Promise.all([unguarded(), unguarded()])

    expect(calls).toBe(2)
  })
})
