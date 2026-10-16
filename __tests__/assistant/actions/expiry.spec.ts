import {
  decodeBolt11,
  FEE_PROBE_TTL_MS,
  FIXED_CENT_INTRALEDGER_TTL_MS,
  MAX_ACTION_TTL_MS,
  minExpiry,
  RATE_TTL_MS,
  timestampToMs,
} from "@app/assistant/registry/actions/shared/expiry"
import { bolt11, NOW_MS, paymentHashOf } from "../fakes"

describe("expiry", () => {
  it("has the spec's TTLs", () => {
    expect(FEE_PROBE_TTL_MS).toBe(60_000)
    expect(RATE_TTL_MS).toBe(60_000)
    expect(FIXED_CENT_INTRALEDGER_TTL_MS).toBe(10 * 60_000)
    expect(MAX_ACTION_TTL_MS).toBe(FIXED_CENT_INTRALEDGER_TTL_MS)
  })

  it("takes the earliest of the inputs that have an expiry", () => {
    expect(minExpiry([NOW_MS + 600_000, NOW_MS + 60_000, null, undefined])).toBe(
      NOW_MS + 60_000,
    )
    expect(minExpiry([NOW_MS + 5, NaN])).toBe(NOW_MS + 5)
  })

  it("refuses to make up an expiry when no input has one", () => {
    expect(() => minExpiry([null, undefined])).toThrow()
  })

  it("reads a bolt11's own expiry, payment hash and amount", () => {
    const invoice = bolt11({
      id: "x",
      sats: 2100,
      timestampMs: NOW_MS,
      expirySeconds: 300,
    })

    expect(decodeBolt11(invoice)).toEqual({
      expiresAt: NOW_MS + 300_000,
      paymentHash: paymentHashOf("x"),
      sats: 2100,
    })
  })

  it("reads a no-amount bolt11 as one with no amount", () => {
    expect(decodeBolt11(bolt11({ id: "y" }))?.sats).toBeNull()
  })

  it("answers null for what is not a bolt11", () => {
    expect(decodeBolt11("lnbc1garbage")).toBeNull()
    expect(decodeBolt11("bc1qnotaninvoice")).toBeNull()
  })

  it("reads an API timestamp in ms, whether it came in seconds or in ms", () => {
    // CashoutOffer.expiresAt arrives in ms today; the scalar says seconds.
    expect(timestampToMs(1_760_000_600_000)).toBe(1_760_000_600_000)
    expect(timestampToMs(1_760_000_600)).toBe(1_760_000_600_000)
  })
})
