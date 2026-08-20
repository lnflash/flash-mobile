import { isInvoiceExpired } from "../../app/screens/send-bitcoin-screen/invoice-expiry"

// The real invoice from the ENG-555 report, decoded:
//   issued  1787243982 (2026-08-20T16:39:42Z)
//   expires 1787244042 (2026-08-20T16:40:42Z)  -> a 60-second window
const ISSUED = 1787243982
const EXPIRES = 1787244042

describe("isInvoiceExpired", () => {
  it("accepts an invoice inside its window", () => {
    // The user's first attempt: 16:40:04Z, 38s before expiry. This one was
    // NOT an expiry failure, and the guard must not claim it was.
    expect(isInvoiceExpired({ timeExpireDate: EXPIRES, nowSeconds: 1787244004 })).toBe(
      false,
    )
  })

  it("rejects the 19-minute-old retry from the report", () => {
    // Second attempt: 16:58:52Z, ~18 minutes past expiry. Same invoice,
    // resubmitted, which is what produced a second identical error.
    expect(isInvoiceExpired({ timeExpireDate: EXPIRES, nowSeconds: 1787245132 })).toBe(
      true,
    )
  })

  it("treats the expiry second itself as expired", () => {
    // Boundary: bolt11 expiry is inclusive of the deadline, and sending on
    // the exact second is a race the backend would win anyway.
    expect(isInvoiceExpired({ timeExpireDate: EXPIRES, nowSeconds: EXPIRES })).toBe(true)
    expect(isInvoiceExpired({ timeExpireDate: EXPIRES, nowSeconds: EXPIRES - 1 })).toBe(
      false,
    )
  })

  it("is live for the whole 60-second window and dead after it", () => {
    for (let offset = 0; offset < 60; offset += 1) {
      expect(
        isInvoiceExpired({ timeExpireDate: EXPIRES, nowSeconds: ISSUED + offset }),
      ).toBe(false)
    }
    expect(isInvoiceExpired({ timeExpireDate: EXPIRES, nowSeconds: ISSUED + 60 })).toBe(
      true,
    )
  })

  it("does not block the send when the expiry is unknown", () => {
    // A decode quirk must never turn into a blocked payment — the backend
    // still rejects a genuinely dead invoice, so a false negative costs
    // nothing beyond the status quo while a false positive costs a payment.
    for (const timeExpireDate of [undefined, null, Number.NaN, Infinity]) {
      expect(isInvoiceExpired({ timeExpireDate, nowSeconds: 1787245132 })).toBe(false)
    }
  })

  it("does not block the send when the clock is unusable", () => {
    expect(isInvoiceExpired({ timeExpireDate: EXPIRES, nowSeconds: Number.NaN })).toBe(
      false,
    )
  })
})
