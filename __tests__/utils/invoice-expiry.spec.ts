import { decodeInvoiceString } from "@galoymoney/client"

import {
  CLOCK_SKEW_GRACE_SECONDS,
  isHeldInvoiceExpired,
  isInvoiceExpired,
  networkForPaymentRequest,
  noteInvoiceFirstSight,
  resetInvoiceFirstSight,
  willTransmitHeldInvoice,
} from "../../app/screens/send-bitcoin-screen/invoice-expiry"

// The real invoice from the ENG-555 report, decoded:
//   issued  1787243982 (2026-08-20T16:39:42Z)
//   expires 1787244042 (2026-08-20T16:40:42Z)  -> a 60-second window
const ISSUED = 1787243982
const EXPIRES = 1787244042

describe("isInvoiceExpired", () => {
  it("accepts an invoice inside its window", () => {
    // The user's first attempt: 16:40:04Z, 38s before expiry. This one was
    // NOT an expiry failure, and the guard must not claim it was.
    expect(
      isInvoiceExpired({
        timeExpireDate: EXPIRES,
        timestamp: ISSUED,
        nowSeconds: 1787244004,
      }),
    ).toBe(false)
  })

  it("rejects the 19-minute-old retry from the report", () => {
    // Second attempt: 16:58:52Z, ~18 minutes past expiry. Same invoice,
    // resubmitted, which is what produced a second identical error. Well
    // clear of the skew grace, so it is still caught.
    expect(
      isInvoiceExpired({
        timeExpireDate: EXPIRES,
        timestamp: ISSUED,
        nowSeconds: 1787245132,
      }),
    ).toBe(true)
  })

  it("only refuses once the reading is past plausible clock drift", () => {
    // `nowSeconds` is the device wall clock, not the issuer's, so the stated
    // expiry second on its own is not evidence of a dead invoice. The refusal
    // starts one second past the grace window.
    expect(
      isInvoiceExpired({
        timeExpireDate: EXPIRES,
        timestamp: ISSUED,
        nowSeconds: EXPIRES,
      }),
    ).toBe(false)
    expect(
      isInvoiceExpired({
        timeExpireDate: EXPIRES,
        timestamp: ISSUED,
        nowSeconds: EXPIRES + CLOCK_SKEW_GRACE_SECONDS,
      }),
    ).toBe(false)
    expect(
      isInvoiceExpired({
        timeExpireDate: EXPIRES,
        timestamp: ISSUED,
        nowSeconds: EXPIRES + CLOCK_SKEW_GRACE_SECONDS + 1,
      }),
    ).toBe(true)
  })

  it("is live for the whole 60-second window", () => {
    for (let offset = 0; offset < 60; offset += 1) {
      expect(
        isInvoiceExpired({
          timeExpireDate: EXPIRES,
          timestamp: ISSUED,
          nowSeconds: ISSUED + offset,
        }),
      ).toBe(false)
    }
  })

  it("does not kill a fresh invoice on a device whose clock runs fast", () => {
    // Regression: a handset two minutes ahead of the issuer reads every
    // freshly minted 60-second Flash invoice as already dead. Failing closed
    // there would leave that user permanently unable to send — a state the
    // backend, validating against server time, would never have produced.
    for (let skew = 1; skew <= CLOCK_SKEW_GRACE_SECONDS; skew += 1) {
      expect(
        isInvoiceExpired({
          timeExpireDate: EXPIRES,
          timestamp: ISSUED,
          // Mint instant, as misread by a clock `skew` seconds fast.
          nowSeconds: ISSUED + skew,
        }),
      ).toBe(false)
    }
  })

  it("fails open when the device clock is behind the invoice's issue time", () => {
    // An invoice cannot have been issued in the future: a "now" that precedes
    // its timestamp proves the local clock is wrong, so nothing derived from
    // it may block a send.
    expect(
      isInvoiceExpired({
        timeExpireDate: EXPIRES,
        timestamp: ISSUED,
        nowSeconds: ISSUED - 1,
      }),
    ).toBe(false)
    // Even a reading long past the expiry is discarded when the same clock
    // also claims the invoice has not been issued yet.
    expect(
      isInvoiceExpired({
        timeExpireDate: EXPIRES,
        timestamp: EXPIRES + 10_000,
        nowSeconds: 1787245132,
      }),
    ).toBe(false)
  })

  it("still decides without a timestamp", () => {
    // The skew detector is an extra safeguard, not a precondition.
    expect(isInvoiceExpired({ timeExpireDate: EXPIRES, nowSeconds: 1787245132 })).toBe(
      true,
    )
    expect(isInvoiceExpired({ timeExpireDate: EXPIRES, nowSeconds: ISSUED })).toBe(false)
    for (const timestamp of [undefined, null, Number.NaN, Infinity]) {
      expect(
        isInvoiceExpired({ timeExpireDate: EXPIRES, timestamp, nowSeconds: 1787245132 }),
      ).toBe(true)
    }
  })

  it("does not block the send when the expiry is unknown", () => {
    // A decode quirk must never turn into a blocked payment — the backend
    // still rejects a genuinely dead invoice, so a false negative costs
    // nothing beyond the status quo while a false positive costs a payment.
    for (const timeExpireDate of [undefined, null, Number.NaN, Infinity]) {
      expect(
        isInvoiceExpired({ timeExpireDate, timestamp: ISSUED, nowSeconds: 1787245132 }),
      ).toBe(false)
    }
  })

  it("does not block the send when the clock is unusable", () => {
    expect(
      isInvoiceExpired({
        timeExpireDate: EXPIRES,
        timestamp: ISSUED,
        nowSeconds: Number.NaN,
      }),
    ).toBe(false)
  })
})

// `firstSeenSeconds` is the device clock as it read when the confirm screen
// mounted. Subtracting it from `nowSeconds` compares that clock against
// *itself*, so the result is an elapsed duration and any constant offset
// cancels. That is what makes it the primary signal: the absolute comparison
// against the issuer's stated expiry is off by however wrong the handset is.
describe("isInvoiceExpired with a first-seen reading", () => {
  const LIFETIME = EXPIRES - ISSUED // 60s, per IBEX's cap on Flash invoices

  it("blocks an ordinary confirm-screen pause the absolute check cannot see", () => {
    // The case this module exists for: the user opens confirm on a live
    // 60-second invoice and taps Send 90 seconds later. The invoice is 30s
    // dead, but only 90s old — inside expiry + 120s grace, so the absolute
    // comparison alone still waves it through and spends the doomed round
    // trip. Elapsed-since-mount catches it.
    const args = {
      timeExpireDate: EXPIRES,
      timestamp: ISSUED,
      firstSeenSeconds: ISSUED,
      nowSeconds: ISSUED + 90,
    }
    expect(isInvoiceExpired(args)).toBe(true)
    // Proof the absolute term is not what fired: drop the elapsed reading and
    // the very same moment is allowed through.
    expect(isInvoiceExpired({ ...args, firstSeenSeconds: undefined })).toBe(false)
  })

  it("does not fire before the invoice's whole lifetime has elapsed", () => {
    for (let elapsed = 0; elapsed <= LIFETIME; elapsed += 1) {
      expect(
        isInvoiceExpired({
          timeExpireDate: EXPIRES,
          timestamp: ISSUED,
          firstSeenSeconds: ISSUED,
          nowSeconds: ISSUED + elapsed,
        }),
      ).toBe(false)
    }
    expect(
      isInvoiceExpired({
        timeExpireDate: EXPIRES,
        timestamp: ISSUED,
        firstSeenSeconds: ISSUED,
        nowSeconds: ISSUED + LIFETIME + 1,
      }),
    ).toBe(true)
  })

  it("lets a badly wrong-but-fast handset pay a freshly minted invoice", () => {
    // Regression: a handset ten minutes fast reads every 60-second invoice as
    // 600s dead the instant it is minted, so the absolute comparison refuses
    // an LNURL send that works today — and tells the user to fetch another
    // invoice, which will read expired too. Unpayable, forever.
    //
    // Elapsed-since-mount reads 0 on that handset exactly as it does on a
    // correct one, and the absolute term is muted because the first sighting
    // was already impossible (see invoice-expiry.ts).
    for (const skew of [CLOCK_SKEW_GRACE_SECONDS + 61, 10 * 60, 60 * 60, 26 * 60 * 60]) {
      // Mount and tap at the mint instant, as misread by the fast clock.
      expect(
        isInvoiceExpired({
          timeExpireDate: EXPIRES,
          timestamp: ISSUED,
          firstSeenSeconds: ISSUED + skew,
          nowSeconds: ISSUED + skew,
        }),
      ).toBe(false)
    }
  })

  it("still blocks that handset once it has genuinely sat on the invoice", () => {
    // Fail-open on skew must not become fail-open forever: the same
    // ten-minutes-fast handset, paused 90 seconds on the confirm screen, is
    // still refused — the elapsed reading does not care about the offset.
    expect(
      isInvoiceExpired({
        timeExpireDate: EXPIRES,
        timestamp: ISSUED,
        firstSeenSeconds: ISSUED + 10 * 60,
        nowSeconds: ISSUED + 10 * 60 + 90,
      }),
    ).toBe(true)
  })

  it("trusts elapsed time over the absolute clock once both are known", () => {
    // A long-lived invoice (1h) first seen 59 minutes in. The absolute
    // comparison would call this expired; the elapsed one would not, and
    // they cannot both be right — a reading that far past issue is equally
    // the signature of a handset running fast.
    //
    // Elapsed wins deliberately: it is measured against one clock and cannot
    // be inflated by skew. The cost is that an invoice already stale when we
    // first saw it is allowed through to the backend, which rejects it; the
    // alternative is blocking sends that would have worked, which is the one
    // failure this guard must not introduce.
    const longIssued = ISSUED
    const longExpires = ISSUED + 3600
    const firstSeenSeconds = longIssued + 59 * 60

    expect(
      isInvoiceExpired({
        timeExpireDate: longExpires,
        timestamp: longIssued,
        firstSeenSeconds,
        nowSeconds: longExpires + CLOCK_SKEW_GRACE_SECONDS + 1,
      }),
    ).toBe(false)

    // Once a full lifetime has genuinely passed under the user, it fires.
    expect(
      isInvoiceExpired({
        timeExpireDate: longExpires,
        timestamp: longIssued,
        firstSeenSeconds,
        nowSeconds: firstSeenSeconds + 3601,
      }),
    ).toBe(true)
  })

  it("ignores the elapsed reading when the invoice states no lifetime", () => {
    // Without a timestamp there is no lifetime to compare elapsed time
    // against, and a non-positive one is malformed. Either way the elapsed
    // term must stay silent rather than fire on a zero-length window.
    expect(
      isInvoiceExpired({
        timeExpireDate: EXPIRES,
        firstSeenSeconds: ISSUED,
        nowSeconds: ISSUED + 90,
      }),
    ).toBe(false)
    expect(
      isInvoiceExpired({
        timeExpireDate: ISSUED,
        timestamp: ISSUED,
        firstSeenSeconds: ISSUED,
        nowSeconds: ISSUED + 90,
      }),
    ).toBe(false)
  })

  it("ignores an unusable first-seen reading", () => {
    for (const firstSeenSeconds of [undefined, null, Number.NaN, Infinity]) {
      expect(
        isInvoiceExpired({
          timeExpireDate: EXPIRES,
          timestamp: ISSUED,
          firstSeenSeconds,
          nowSeconds: 1787245132,
        }),
      ).toBe(true)
    }
  })
})

// The BTC (Breez/Spark) wallet does not transmit the held bolt11 on every
// path: `useSendPayment` routes BTC + lnurl/intraledger to `payLnurlBreez`,
// which mints a fresh invoice at send time. Checking the held invoice's
// expiry there would refuse a payment that would have succeeded.
describe("willTransmitHeldInvoice", () => {
  it("is true for every non-BTC wallet, whatever the payment type", () => {
    for (const sendingWalletCurrency of ["USD", "USDT"] as const) {
      for (const paymentType of ["lightning", "lnurl", "intraledger"] as const) {
        expect(willTransmitHeldInvoice({ sendingWalletCurrency, paymentType })).toBe(true)
      }
    }
  })

  it("is true for BTC + lightning — payLightningBreez sends the held bolt11", () => {
    expect(
      willTransmitHeldInvoice({
        sendingWalletCurrency: "BTC",
        paymentType: "lightning",
      }),
    ).toBe(true)
  })

  it("is false for the BTC paths that re-mint at send time", () => {
    for (const paymentType of ["lnurl", "intraledger"] as const) {
      expect(willTransmitHeldInvoice({ sendingWalletCurrency: "BTC", paymentType })).toBe(
        false,
      )
    }
  })
})

// The real invoice from the incident, decoded with the real decoder — the
// guard's whole job is to reach a correct verdict on strings like this one.
const INCIDENT_INVOICE =
  "lnbc1p4gwtwwpp5wwulk8jw0llvgjadwzuen6nxh7hgmddplj3evpgjc7n8l5kzqvmqdph2pshjgr5dusyvmrpwd5zq4mpd3kx2apq24ek2u36ypj8yetpv3kkz7qcqzzsxqzpusp5wane88x5twmdlpnu4cqrk4wd6g3tks7xgq798nt9zt68vmcnnp6q9qxpqysgqnszg0ycjk4255es2hdd3ajep3yquuvra6jn4k8shskhpzg80mrl9m9pgylahzq80aw9ekz6e47ycpcf558080xrxn6uljn54lc447rqpn9u06u"

describe("networkForPaymentRequest", () => {
  it("reads the network off the prefix", () => {
    expect(networkForPaymentRequest(INCIDENT_INVOICE)).toBe("mainnet")
    expect(networkForPaymentRequest("lnbc1abc")).toBe("mainnet")
    expect(networkForPaymentRequest("lntbs1abc")).toBe("signet")
    // "lnbcrt" also starts with "lnbc" — the longer prefix has to win, or
    // every regtest invoice decodes as mainnet and throws.
    expect(networkForPaymentRequest("lnbcrt1abc")).toBe("regtest")
  })

  it("returns undefined for anything it does not recognise", () => {
    expect(networkForPaymentRequest("not-an-invoice")).toBeUndefined()
    expect(networkForPaymentRequest("")).toBeUndefined()
  })
})

describe("isHeldInvoiceExpired (the decision the confirm screen makes)", () => {
  // Exercised through the real decoder, not a stub: a hand-rolled fake would
  // agree with whatever the guard does and prove nothing.
  const decode = (paymentRequest: string, network: "mainnet" | "signet" | "regtest") =>
    decodeInvoiceString(paymentRequest, network as never)

  it("lets the send through 38s into the window (the first attempt)", () => {
    expect(
      isHeldInvoiceExpired({
        paymentRequest: INCIDENT_INVOICE,
        nowSeconds: 1787244004,
        decode,
      }),
    ).toBe(false)
  })

  it("refuses the 19-minute-old retry (the second attempt)", () => {
    expect(
      isHeldInvoiceExpired({
        paymentRequest: INCIDENT_INVOICE,
        nowSeconds: 1787245132,
        decode,
      }),
    ).toBe(true)
  })

  it("reads the issue time off the real invoice and tolerates a fast clock", () => {
    // Sanity-check the fixture: the decoder really does hand back both
    // timestamps, so the skew detector below is exercising real data.
    const decoded = decode(INCIDENT_INVOICE, "mainnet")
    expect(decoded.timestamp).toBe(ISSUED)
    expect(decoded.timeExpireDate).toBe(EXPIRES)

    // Confirm tapped at the mint instant on a clock two minutes fast. The
    // screen registers first sight on mount, so seed it the same way.
    resetInvoiceFirstSight()
    noteInvoiceFirstSight(INCIDENT_INVOICE, ISSUED + CLOCK_SKEW_GRACE_SECONDS)
    expect(
      isHeldInvoiceExpired({
        paymentRequest: INCIDENT_INVOICE,
        nowSeconds: ISSUED + CLOCK_SKEW_GRACE_SECONDS,
        decode,
      }),
    ).toBe(false)

    // Same tap on a clock two minutes slow — "now" predates the issue time.
    expect(
      isHeldInvoiceExpired({
        paymentRequest: INCIDENT_INVOICE,
        nowSeconds: ISSUED - CLOCK_SKEW_GRACE_SECONDS,
        decode,
      }),
    ).toBe(false)
  })

  it("refuses a 90-second pause on the real invoice, on any clock", () => {
    // End to end through the real decoder: the lifetime is read off the
    // bolt11 (60s) and compared against time actually spent on the confirm
    // screen, so the same 90-second pause is caught whether the handset is
    // right or ten minutes fast.
    for (const skew of [0, 10 * 60]) {
      resetInvoiceFirstSight()
      noteInvoiceFirstSight(INCIDENT_INVOICE, ISSUED + skew)
      expect(
        isHeldInvoiceExpired({
          paymentRequest: INCIDENT_INVOICE,
          nowSeconds: ISSUED + skew + 90,
          decode,
        }),
      ).toBe(true)
      // ...and the same handset, tapping straight away, is not.
      resetInvoiceFirstSight()
      noteInvoiceFirstSight(INCIDENT_INVOICE, ISSUED + skew)
      expect(
        isHeldInvoiceExpired({
          paymentRequest: INCIDENT_INVOICE,
          nowSeconds: ISSUED + skew,
          decode,
        }),
      ).toBe(false)
    }
  })

  it("fails open with no invoice, a bad prefix, or a decode failure", () => {
    const now = 1787245132
    expect(
      isHeldInvoiceExpired({ paymentRequest: undefined, nowSeconds: now, decode }),
    ).toBe(false)
    expect(
      isHeldInvoiceExpired({ paymentRequest: "not-an-invoice", nowSeconds: now, decode }),
    ).toBe(false)
    expect(
      isHeldInvoiceExpired({ paymentRequest: "lnbc1garbage", nowSeconds: now, decode }),
    ).toBe(false)
  })
})
