/**
 * ENG-533. These drive the REAL key module the hook calls — delete
 * `attemptKey`/`retireAttemptKey` from use-send-payment.ts and the
 * screen-level cases in __tests__/screens/send-confirmation.spec.tsx fail;
 * change the rule here and these fail.
 *
 * The rule has exactly two ways to be wrong, and both cost money:
 *
 *  - a key that does NOT survive the repeat (the original bug: a per-mount
 *    uuid, minted afresh by the back-navigation that IS the retry) makes a
 *    resent payment look like a second one, and the customer pays twice;
 *  - a key that survives a definitive FAILURE makes the backend replay the
 *    recorded failure, and the customer can never succeed.
 */
import {
  attemptFingerprint,
  attemptKey,
  MAX_TRACKED_ATTEMPTS,
  resetSendAttemptKeys,
  retireAttemptKey,
} from "@app/screens/send-bitcoin-screen/send-attempt-key"

const attempt = {
  walletId: "usd-wallet",
  paymentType: "lightning",
  destination: "lnbc1someinvoice",
  settlementAmount: 250,
  settlementCurrency: "USD",
  memo: "rent",
}

beforeEach(resetSendAttemptKeys)

describe("the key identifies the attempt, not the screen", () => {
  it("reproduces the same key for the same attempt", () => {
    // The retry a user can actually perform here unmounts the confirm screen,
    // so nothing that lives on the mount can carry the key across it. Derived
    // from the attempt, a freshly built fingerprint reproduces it exactly.
    const first = attemptKey(attemptFingerprint(attempt))
    const afterGoingBackAndForward = attemptKey(attemptFingerprint({ ...attempt }))

    expect(afterGoingBackAndForward).toBe(first)
  })

  it("is a v5 uuid", () => {
    expect(attemptKey(attemptFingerprint(attempt))).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  // Each of these is a change the user made on purpose, meaning a genuinely
  // different payment. Sharing a key would have the backend answer the new one
  // with the old one's outcome.
  const differentPayments: [string, Partial<typeof attempt>][] = [
    ["a different wallet", { walletId: "btc-wallet" }],
    ["a different destination", { destination: "lnbc1anotherinvoice" }],
    ["a different amount", { settlementAmount: 251 }],
    ["a different currency", { settlementCurrency: "BTC" }],
    ["a different memo", { memo: "not rent" }],
    ["a different payment type", { paymentType: "intraledger" }],
  ]

  differentPayments.forEach(([label, override]) => {
    it(`mints a different key for ${label}`, () => {
      expect(attemptKey(attemptFingerprint({ ...attempt, ...override }))).not.toBe(
        attemptKey(attemptFingerprint(attempt)),
      )
    })
  })

  it("cannot be fooled by fields that run together", () => {
    // Concatenating the fields with no separator would make these two the same
    // string, and two different payments would then share a key.
    const runTogether = attemptKey(
      attemptFingerprint({
        ...attempt,
        walletId: `${attempt.walletId}${attempt.paymentType}`,
        paymentType: "",
      }),
    )
    expect(runTogether).not.toBe(attemptKey(attemptFingerprint(attempt)))
  })
})

describe("retiring a key", () => {
  it("issues a fresh key after a definitive failure", () => {
    const fingerprint = attemptFingerprint(attempt)
    const failed = attemptKey(fingerprint)

    retireAttemptKey(fingerprint)

    // Reusing `failed` would make the backend replay the recorded failure and
    // the customer could never succeed.
    expect(attemptKey(fingerprint)).not.toBe(failed)
  })

  it("keeps the replacement stable so the NEXT attempt is retryable too", () => {
    const fingerprint = attemptFingerprint(attempt)
    retireAttemptKey(fingerprint)

    // The second attempt has to survive a lost response exactly as the first
    // one did, or the fix only works once.
    expect(attemptKey(fingerprint)).toBe(attemptKey(fingerprint))
  })

  it("retires only the attempt it was told about", () => {
    const other = attemptFingerprint({ ...attempt, settlementAmount: 999 })
    const before = attemptKey(other)

    retireAttemptKey(attemptFingerprint(attempt))

    expect(attemptKey(other)).toBe(before)
  })
})

describe("bounded module state", () => {
  it("evicts the oldest reading rather than growing without bound", () => {
    const oldest = attemptFingerprint({ ...attempt, destination: "invoice-0" })
    retireAttemptKey(oldest)
    const retiredKey = attemptKey(oldest)

    for (let i = 1; i <= MAX_TRACKED_ATTEMPTS; i += 1) {
      retireAttemptKey(attemptFingerprint({ ...attempt, destination: `invoice-${i}` }))
    }

    // Evicted, so the oldest attempt is back at generation 0. Harmless: the
    // only cost is that a very long session forgets a spent key, and a spent
    // key is one the server has already answered.
    expect(attemptKey(oldest)).not.toBe(retiredKey)
  })
})
