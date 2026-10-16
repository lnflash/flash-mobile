import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import { Invoice } from "@app/screens/receive-bitcoin-screen/payment/index.types"
import {
  getPaymentRequestFullUri,
  lightningInvoiceValidity,
  satsToBTC,
} from "../../app/screens/receive-bitcoin-screen/payment/helpers"

describe("getInvoiceFullUri", () => {
  it("returns a prefixed bitcoin uri", () => {
    const uri = getPaymentRequestFullUri({
      input: "btc1234567890address",
      type: Invoice.OnChain,
    })

    expect(uri).toBe("bitcoin:btc1234567890address")
  })

  it("returns a non-prefixed bitcoin uri", () => {
    const uri = getPaymentRequestFullUri({
      input: "btc1234567890address",
      type: Invoice.OnChain,
      prefix: false,
    })

    expect(uri).toBe("btc1234567890address")
  })

  it("contains amount in the uri", () => {
    const uri = getPaymentRequestFullUri({
      input: "btc1234567890address",
      type: Invoice.OnChain,
      amount: 100,
    })

    expect(uri).toBe(`bitcoin:btc1234567890address?amount=${100 / 10 ** 8}`)
  })

  it("contains memo in the uri", () => {
    const uri = getPaymentRequestFullUri({
      input: "btc1234567890address",
      type: Invoice.OnChain,
      memo: "will not forget",
    })

    expect(uri).toBe(`bitcoin:btc1234567890address?message=will%2520not%2520forget`)
  })

  it("contains memo and amount in the uri", () => {
    const uri = getPaymentRequestFullUri({
      input: "btc1234567890address",
      type: Invoice.OnChain,
      amount: 100,
      memo: "will not forget",
    })

    expect(uri).toBe(
      `bitcoin:btc1234567890address?amount=${
        100 / 10 ** 8
      }&message=will%2520not%2520forget`,
    )
  })

  it("returns a non-prefixed lightning uri", () => {
    const uri = getPaymentRequestFullUri({
      input: "lnurl12567890",
      type: Invoice.Lightning,
    })

    expect(uri).toBe("lnurl12567890")
  })

  it("returns return an uppercase string", () => {
    const uri = getPaymentRequestFullUri({
      input: "lnurl12567890",
      uppercase: true,
      type: Invoice.Lightning,
    })

    expect(uri).toMatch(/^[^a-z]*$/g)
  })
})

describe("satsToBTC", () => {
  it("returns the correct BTC number", () => {
    expect(satsToBTC(1000)).toBe(0.00001)
    expect(satsToBTC(0)).toBe(0)
    expect(satsToBTC(-1000)).toBe(-0.00001)
  })
})

describe("lightningInvoiceValidity (shared by the receive screen and the assistant's invoice card)", () => {
  loadLocale("en")
  const LL = i18nObject("en")

  afterEach(() => {
    jest.useRealTimers()
  })

  it("says a day for a day-long invoice", () => {
    expect(lightningInvoiceValidity(LL, 24 * 60 * 60)).toBe("Valid for 1 day")
  })

  it("says the next hours for one that has hours left", () => {
    expect(lightningInvoiceValidity(LL, 7 * 60 * 60)).toBe("Valid for next 7h")
  })

  it("says a time of day for one that has minutes left", () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 15, 9, 0, 0))

    expect(lightningInvoiceValidity(LL, 5 * 60)).toBe("Valid before 9:05AM")
  })

  it("counts down the last two minutes, then says now", () => {
    expect(lightningInvoiceValidity(LL, 90)).toBe("Expires in 1m30s")
    expect(lightningInvoiceValidity(LL, 0)).toBe("Expires now")
  })
})
