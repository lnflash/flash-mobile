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
  // Advance mode's switch (ENG-687): a no-op is a wallet switched on. A case
  // that switches it off makes it throw, as spark.ts does.
  assertBreezSDKSwitchedOn: jest.fn(),
  fetchBreezFee: jest.fn(),
  getInfo: jest.fn(),
  listPaymentsBreezSDK: jest.fn(),
  payLightningBreez: jest.fn(),
  payLnurlBreez: jest.fn(),
  payOnchainBreez: jest.fn(),
  receiveOnchainBreez: jest.fn(),
  receivePaymentBreez: jest.fn(),
}))

import * as breezSdk from "@app/utils/breez-sdk"
import { BreezSdkNotInitializedError } from "@app/utils/breez-sdk/sdk-errors"
import {
  BTC_BALANCE_SYNC_TIMEOUT_MS,
  BtcRail,
  breezBtcRail,
  btcRailUnavailableState,
  readBreezWallet,
} from "@app/payments/btc-rail"

const wrappers = breezSdk as unknown as Record<string, jest.Mock>
const WRAPPERS = [
  "fetchBreezFee",
  "getInfo",
  "listPaymentsBreezSDK",
  "payLightningBreez",
  "payLnurlBreez",
  "payOnchainBreez",
  "receiveOnchainBreez",
  "receivePaymentBreez",
]

// rail method → the wrapper it must delegate to, and the arguments a caller
// would pass it.
const delegates: [keyof BtcRail, string, unknown[]][] = [
  // offset, limit, filter: ENG-687's transaction search bounds the BTC
  // window with fromTimestamp (Unix seconds) and lists Bitcoin payments only.
  [
    "listPayments",
    "listPaymentsBreezSDK",
    [0, 100, { fromTimestamp: 1760000000, assets: "bitcoin" }],
  ],
  ["payInvoice", "payLightningBreez", ["lnbc1invoice", 2100]],
  ["payLnurl", "payLnurlBreez", ["alice@flashapp.me", 2100, "coffee"]],
  ["payOnchain", "payOnchainBreez", ["bc1qdestination", 2100, "slow"]],
  // ENG-688: amount in sats and a description, as payment-request.ts asks.
  ["createInvoice", "receivePaymentBreez", [2100, "Pay to Flash Wallet User"]],
  // The receive screen's on-chain request takes no arguments.
  ["getOnchainAddress", "receiveOnchainBreez", []],
  // What prepareSend and the BTC -> USD conversion probe.
  [
    "probeFee",
    "fetchBreezFee",
    [{ paymentType: "lnurl", paymentRequest: "alice@flashapp.me", amountSats: 2100 }],
  ],
]

/** Advance mode off: the rail's reads find the wallet switched off, as spark.ts reports it. */
const switchOff = () =>
  wrappers.assertBreezSDKSwitchedOn.mockImplementation(() => {
    throw new BreezSdkNotInitializedError({ reason: "off" })
  })

beforeEach(() => {
  jest.clearAllMocks()
  wrappers.assertBreezSDKSwitchedOn.mockReset()
})

afterEach(() => {
  jest.useRealTimers()
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

  it("passes a receive wrapper's rejection through unchanged", async () => {
    // receivePaymentBreez throws the typed not-running error while the SDK
    // is not up (getSDKInstance). prepareReceive reports it, so the rail
    // must hand it over as it is.
    const notRunning = new BreezSdkNotInitializedError({ reason: "starting" })
    wrappers.receivePaymentBreez.mockRejectedValue(notRunning)

    await expect(breezBtcRail.createInvoice(2100, "memo")).rejects.toBe(notRunning)
  })
})

describe("breezBtcRail.listPayments", () => {
  it("leaves fromTimestamp out when the caller does, as the two screens do", async () => {
    wrappers.listPaymentsBreezSDK.mockResolvedValue([])

    await breezBtcRail.listPayments(0, 3)

    expect(wrappers.listPaymentsBreezSDK.mock.calls[0]).toEqual([0, 3])
  })

  it("rejects with the off error, and lists nothing, while the wallet is switched off", async () => {
    // ENG-687: turning advance mode off does not stop the SDK, which would
    // still list the wallet's payments. The rail does not ask it.
    switchOff()
    wrappers.listPaymentsBreezSDK.mockResolvedValue([{ id: "p1" }])

    const listed = breezBtcRail.listPayments(0, 100, { assets: "bitcoin" })

    await expect(listed).rejects.toBeInstanceOf(BreezSdkNotInitializedError)
    await expect(listed).rejects.toMatchObject({ reason: "off" })
    expect(wrappers.listPaymentsBreezSDK).not.toHaveBeenCalled()
  })
})

describe("breezBtcRail.getBalanceSats", () => {
  it("is disabled, never a zero balance, while the SDK is not initialized", async () => {
    // getInfo() calls getSDKInstance(), which throws this before advance mode
    // has started the wallet.
    wrappers.getInfo.mockRejectedValue(new BreezSdkNotInitializedError())

    await expect(breezBtcRail.getBalanceSats()).resolves.toEqual({ state: "disabled" })
  })

  it("is syncing while initializeBreezSDK() is still connecting", async () => {
    wrappers.getInfo.mockRejectedValue(
      new BreezSdkNotInitializedError({ reason: "starting" }),
    )

    await expect(breezBtcRail.getBalanceSats()).resolves.toEqual({ state: "syncing" })
  })

  it("is disabled while the wallet is switched off, without reading the SDK that still runs", async () => {
    // ENG-687: advance mode off, the screens hide the BTC wallet, and the
    // rail shows no number for it either, though getInfo() would answer.
    switchOff()
    wrappers.getInfo.mockResolvedValue({
      balanceSats: BigInt(50_000),
      tokenBalances: new Map(),
    })

    await expect(breezBtcRail.getBalanceSats()).resolves.toEqual({ state: "disabled" })
    await expect(readBreezWallet()).resolves.toEqual({ state: "disabled" })
    expect(wrappers.getInfo).not.toHaveBeenCalled()
  })

  it("is failed, not disabled, once initializeBreezSDK() has given up", async () => {
    // Advance mode is on and the wallet could not start: `disabled` would
    // send the user to turn on a setting that is already on.
    wrappers.getInfo.mockRejectedValue(
      new BreezSdkNotInitializedError({ reason: "failed" }),
    )

    await expect(breezBtcRail.getBalanceSats()).resolves.toEqual({ state: "failed" })
  })

  it("converts the SDK's bigint balanceSats to a number, as BreezContext does", async () => {
    wrappers.getInfo.mockResolvedValue({
      identityPubkey: "02ab",
      balanceSats: BigInt(2100),
      tokenBalances: new Map(),
    })

    const balance = await breezBtcRail.getBalanceSats()

    expect(balance).toEqual({ state: "ok", sats: 2100 })
    // Only the BtcBalance answer leaves the rail: no SDK object rides along.
    expect(Object.keys(balance).sort()).toEqual(["sats", "state"])
  })

  it("reports a zero balance as ok with zero sats, since the SDK read it", async () => {
    wrappers.getInfo.mockResolvedValue({
      balanceSats: BigInt(0),
      tokenBalances: new Map(),
    })

    await expect(breezBtcRail.getBalanceSats()).resolves.toEqual({ state: "ok", sats: 0 })
  })

  it("is syncing when the synced read does not answer in time", async () => {
    jest.useFakeTimers()
    let answerLate: (info: unknown) => void = () => undefined
    wrappers.getInfo.mockReturnValue(
      new Promise((resolve) => {
        answerLate = resolve
      }),
    )

    const balance = breezBtcRail.getBalanceSats()
    jest.advanceTimersByTime(BTC_BALANCE_SYNC_TIMEOUT_MS - 1)
    await Promise.resolve()
    let settled = false
    balance.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    jest.advanceTimersByTime(1)
    await expect(balance).resolves.toEqual({ state: "syncing" })

    // The late answer changes nothing and throws nothing.
    answerLate({ balanceSats: BigInt(5), tokenBalances: new Map() })
    await Promise.resolve()
    expect(jest.getTimerCount()).toBe(0)
  })

  it("drops a late rejection after the timeout instead of leaving it unhandled", async () => {
    jest.useFakeTimers()
    let failLate: (err: Error) => void = () => undefined
    wrappers.getInfo.mockReturnValue(
      new Promise((_resolve, reject) => {
        failLate = reject
      }),
    )
    const unhandled = jest.fn()
    process.on("unhandledRejection", unhandled)

    const balance = breezBtcRail.getBalanceSats()
    jest.advanceTimersByTime(BTC_BALANCE_SYNC_TIMEOUT_MS)
    await expect(balance).resolves.toEqual({ state: "syncing" })
    failLate(new Error("connection reset"))
    // Node reports an unhandled rejection once the microtasks have drained,
    // so wait one real macrotask before looking.
    jest.useRealTimers()
    await new Promise((resolve) => {
      setImmediate(resolve)
    })

    process.off("unhandledRejection", unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })

  it("rejects on any other failure, so runTool can report it as one", async () => {
    // The spec gives the rail four states and is silent on other failures:
    // a network error is not "disabled" and not a balance.
    const failure = new Error("connection reset")
    wrappers.getInfo.mockRejectedValue(failure)

    await expect(breezBtcRail.getBalanceSats()).rejects.toBe(failure)
  })
})

describe("readBreezWallet", () => {
  it("hands back the whole getInfo() answer with the sats on a good read", async () => {
    const info = { balanceSats: BigInt(2100), tokenBalances: new Map([["t", {}]]) }
    wrappers.getInfo.mockResolvedValue(info)

    await expect(readBreezWallet()).resolves.toEqual({ state: "ok", sats: 2100, info })
  })

  it("waits as long as the read takes when no timeout is given", async () => {
    jest.useFakeTimers()
    let answer: (info: unknown) => void = () => undefined
    wrappers.getInfo.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve
      }),
    )

    const read = readBreezWallet()
    jest.advanceTimersByTime(BTC_BALANCE_SYNC_TIMEOUT_MS * 10)
    answer({ balanceSats: BigInt(7), tokenBalances: new Map() })

    await expect(read).resolves.toMatchObject({ state: "ok", sats: 7 })
  })
})

describe("btcRailUnavailableState", () => {
  it("reads only the not-initialized error as a not-running state", () => {
    expect(btcRailUnavailableState(new BreezSdkNotInitializedError())).toBe("disabled")
    expect(
      btcRailUnavailableState(new BreezSdkNotInitializedError({ reason: "off" })),
    ).toBe("disabled")
    expect(
      btcRailUnavailableState(new BreezSdkNotInitializedError({ reason: "starting" })),
    ).toBe("syncing")
    expect(
      btcRailUnavailableState(new BreezSdkNotInitializedError({ reason: "failed" })),
    ).toBe("failed")
    // Same words, wrong type: not proof the wallet is off.
    expect(
      btcRailUnavailableState(
        new Error("Breez SDK not initialized. Call initializeBreezSDK first."),
      ),
    ).toBeUndefined()
    expect(btcRailUnavailableState("disabled")).toBeUndefined()
  })
})

describe("app/payments", () => {
  it("never imports the Breez SDK itself", () => {
    // breezBtcRail reaches Breez through the @app/utils/breez-sdk wrappers
    // (spec §2.1, docs/ai-assistant-tool-registry.md), so nothing under
    // app/payments imports an @breeztech package: no .ts or .tsx file, at
    // any depth. This scan covers app/payments only; modules elsewhere
    // still import SDK enums and types until ENG-693 moves them behind the
    // rail.
    const dir = path.join(__dirname, "../../app/payments")
    // Recursive, with paths relative to `dir` (e.g. "rails/foo.ts").
    const sources = fs
      .readdirSync(dir, { encoding: "utf8", recursive: true })
      .filter((file) => /\.tsx?$/.test(file))
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
