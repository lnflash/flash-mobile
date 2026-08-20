import { readFileSync } from "fs"
import { join } from "path"

import { decodeInvoiceString } from "@galoymoney/client"

import {
  isHeldInvoiceExpired,
  isInvoiceExpired,
  networkForPaymentRequest,
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

// The guard reads paymentDetail.paymentRequest. If a detail factory does not
// expose it the check silently passes everything through — and because the
// field is optional, TypeScript says nothing. The first version of this fix
// shipped exactly that hole: only the LNURL factory set it, so scanned and
// pasted invoices (also 60-second Flash invoices) kept failing generically.
describe("every invoice-backed payment detail exposes its bolt11", () => {
  const source = readFileSync(
    join(__dirname, "../../app/screens/send-bitcoin-screen/payment-details/lightning.ts"),
    "utf8",
  )

  const factories = [
    "createNoAmountLightningPaymentDetails",
    "createAmountLightningPaymentDetails",
    "createLnurlPaymentDetails",
  ]

  it("every factory returns paymentRequest", () => {
    for (const factory of factories) {
      const start = source.indexOf(`export const ${factory}`)
      expect(start).toBeGreaterThan(-1)

      const nextExport = source.indexOf("export const ", start + 10)
      const body = source.slice(start, nextExport === -1 ? undefined : nextExport)
      const returnStart = body.lastIndexOf("return {")
      const returned = body.slice(returnStart, body.indexOf("as const", returnStart))

      // Named per factory so a failure says which one regressed.
      expect({
        factory,
        exposesPaymentRequest: /^\s{4}paymentRequest,/m.test(returned),
      }).toEqual({ factory, exposesPaymentRequest: true })
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
