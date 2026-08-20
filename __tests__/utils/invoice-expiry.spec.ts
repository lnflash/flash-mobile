import { decodeInvoiceString } from "@galoymoney/client"

import {
  CLOCK_SKEW_GRACE_SECONDS,
  isHeldInvoiceExpired,
  isInvoiceExpired,
  networkForPaymentRequest,
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

    // Confirm tapped at the mint instant on a clock two minutes fast.
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
