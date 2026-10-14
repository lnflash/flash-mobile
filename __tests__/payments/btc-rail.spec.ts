import * as fs from "fs"
import * as path from "path"

/**
 * ENG-686: `breezBtcRail` is one-line delegates over `@app/utils/breez-sdk`.
 *
 * Each method has to reach its own wrapper with the caller's arguments as
 * given and hand back the wrapper's answer untouched. A swapped pair
 * (payInvoice and payLnurl, say) would type-check whenever the signatures
 * line up, and would send money down the wrong rail.
 */
jest.mock("@app/utils/breez-sdk", () => ({
  payLightningBreez: jest.fn(),
  payLnurlBreez: jest.fn(),
  payOnchainBreez: jest.fn(),
  fetchBreezFee: jest.fn(),
  receivePaymentBreez: jest.fn(),
  receiveOnchainBreez: jest.fn(),
  getInfo: jest.fn(),
  listPaymentsBreezSDK: jest.fn(),
}))

import * as breezSdk from "@app/utils/breez-sdk"
import { BtcRail, breezBtcRail } from "@app/payments/btc-rail"

const wrappers = breezSdk as unknown as Record<string, jest.Mock>
const WRAPPERS = [
  "payLightningBreez",
  "payLnurlBreez",
  "payOnchainBreez",
  "fetchBreezFee",
  "receivePaymentBreez",
  "receiveOnchainBreez",
  "getInfo",
  "listPaymentsBreezSDK",
]

// rail method → the wrapper it must delegate to, and the arguments a caller
// would pass it.
const delegates: [keyof BtcRail, string, unknown[]][] = [
  ["payInvoice", "payLightningBreez", ["lnbc1invoice", 2100]],
  ["payLnurl", "payLnurlBreez", ["alice@flashapp.me", 2100, "coffee"]],
  ["payOnchain", "payOnchainBreez", ["bc1qdestination", 2100, "slow"]],
  [
    "probeFee",
    "fetchBreezFee",
    [
      {
        paymentType: "lightning",
        paymentRequest: "lnbc1invoice",
        amountSats: 2100,
        selectedFeeType: "medium",
      },
    ],
  ],
  ["createInvoice", "receivePaymentBreez", [2100, "dinner"]],
  ["getOnchainAddress", "receiveOnchainBreez", []],
  ["listPayments", "listPaymentsBreezSDK", [20, 10]],
]

beforeEach(() => {
  jest.clearAllMocks()
})

describe("breezBtcRail", () => {
  delegates.forEach(([method, wrapper, args]) => {
    it(`${method} forwards its arguments to ${wrapper} and returns its answer`, async () => {
      const answer = { from: wrapper }
      wrappers[wrapper].mockResolvedValue(answer)

      const call = breezBtcRail[method] as (...a: unknown[]) => Promise<unknown>
      const result = await call(...args)

      expect(result).toBe(answer)
      expect(wrappers[wrapper]).toHaveBeenCalledTimes(1)
      expect(wrappers[wrapper].mock.calls[0]).toEqual(args)
      // ...and no other wrapper was touched.
      WRAPPERS.filter((name) => name !== wrapper).forEach((name) =>
        expect(wrappers[name]).not.toHaveBeenCalled(),
      )
    })
  })

  it("passes a wrapper's rejection through unchanged", async () => {
    // payLnurlBreez reports a failure by throwing. sendPayment's catch turns
    // that into a Failure, so the rail must not swallow it.
    const refusal = new Error("Unsupported input type")
    wrappers.payLnurlBreez.mockRejectedValue(refusal)

    await expect(breezBtcRail.payLnurl("not-an-lnurl", 2100, "")).rejects.toBe(refusal)
  })

  it("getBalanceSats reads getInfo's bigint balanceSats as a number", async () => {
    // The same call and conversion BreezContext uses for btcWallet.balance.
    wrappers.getInfo.mockResolvedValue({
      identityPubkey: "02abc",
      balanceSats: BigInt(123456),
      tokenBalances: new Map(),
    })

    const balance = await breezBtcRail.getBalanceSats()

    expect(balance).toBe(123456)
    expect(typeof balance).toBe("number")
    expect(wrappers.getInfo).toHaveBeenCalledTimes(1)
  })
})

describe("app/payments", () => {
  it("never imports the Breez SDK itself", () => {
    // ENG-684 decision: app/utils/breez-sdk/spark.ts stays the only runtime
    // importer of the SDK, and the rail reaches it through that module.
    const dir = path.join(__dirname, "../../app/payments")
    const sources = fs.readdirSync(dir).filter((file) => file.endsWith(".ts"))
    expect(sources).toContain("btc-rail.ts")
    // An import or require of any @breeztech package; a comment naming one
    // does not count.
    const sdkImport = /(?:\bfrom|\bimport\(?|\brequire\()\s*["']@breeztech\//
    sources.forEach((file) => {
      const source = fs.readFileSync(path.join(dir, file), "utf8")
      expect({ file, importsSdk: sdkImport.test(source) }).toEqual({
        file,
        importsSdk: false,
      })
    })
  })
})
