/**
 * ENG-687: the spark.ts changes the BTC rail's reads stand on.
 *
 * - getSDKInstance() throws BreezSdkNotInitializedError with its reason:
 *   `starting` while initializeBreezSDK() is connecting, `failed` once it has
 *   given up, `off` otherwise. The rail answers `syncing`, `failed` or
 *   `disabled` from it instead of failing (or showing zero).
 * - Advance mode off switches the wallet off. Nothing stops the SDK, so the
 *   rail's two reads answer `off` from the switch, even while an instance
 *   still runs or a start is still retrying.
 * - listPaymentsBreezSDK takes an optional fromTimestamp and hands it to the
 *   SDK as the bigint it expects, and can list Bitcoin payments only; its two
 *   existing callers leave both out.
 *
 * Each case loads a fresh spark.ts, whose SDK instance is module state.
 */
import type { TransactionsPayload } from "@app/assistant/registry/projections"
import type { GraphqlRail } from "@app/assistant/rails/graphql-rail"
import { btcPayment, fakeGraphqlRail, NOW_MS } from "../assistant/fakes"

type SparkModule = typeof import("@app/utils/breez-sdk/spark")
type ErrorsModule = typeof import("@app/utils/breez-sdk/sdk-errors")
type RailModule = typeof import("@app/payments/btc-rail")
type GetTransactionsModule =
  typeof import("@app/assistant/registry/read/get-transactions")

const mockSdk = {
  getInfo: jest.fn(),
  listPayments: jest.fn(),
}
// The builder's build() resolves when a case says so, so a case can look at
// the wrapper while initializeBreezSDK() is still connecting.
let mockBuild: () => Promise<unknown> = () => Promise.resolve(mockSdk)

jest.mock("@breeztech/breez-sdk-spark-react-native", () => ({
  // The generated tagged union's shape: the SDK reads `tag`.
  AssetFilter: {
    Bitcoin: class {
      tag = "Bitcoin"
    },
  },
  defaultConfig: () => ({}),
  initLogging: jest.fn(),
  MaxFee: { NetworkRecommended: class {} },
  Network: { Mainnet: 0 },
  // generated: PaymentStatus — Completed = 0, Pending = 1, Failed = 2 (mirrors
  // __mocks__/@breeztech/breez-sdk-spark-react-native.js). spark.ts's
  // LIGHTNING_PAYMENT_SENT table (ENG-712) reads this as a value at module
  // load, ahead of any case's own mocking, so this factory — which replaces
  // that automock rather than extending it — must carry it too.
  PaymentStatus: { Completed: 0, Pending: 1, Failed: 2 },
  Seed: { Mnemonic: class {} },
  SdkBuilder: class {
    withDefaultStorage = () => Promise.resolve()
    build = () => mockBuild()
  },
}))

// The BTC rail reaches spark.ts through this barrel, which jest maps to a
// stub (__mocks__/breez-sdk.js). Here it is the real spark.ts, from the same
// module registry as the case's own, so the rail reads the wallet the case
// starts and switches.
jest.mock("@app/utils/breez-sdk", () => require("@app/utils/breez-sdk/spark"))

const load = (): { spark: SparkModule; errors: ErrorsModule } => {
  const loaded: { spark?: SparkModule; errors?: ErrorsModule } = {}
  jest.isolateModules(() => {
    /* eslint-disable @typescript-eslint/no-var-requires */
    loaded.spark = require("@app/utils/breez-sdk/spark")
    loaded.errors = require("@app/utils/breez-sdk/sdk-errors")
    /* eslint-enable @typescript-eslint/no-var-requires */
  })
  if (!loaded.spark || !loaded.errors) throw new Error("spark.ts did not load")
  return { spark: loaded.spark, errors: loaded.errors }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockBuild = () => Promise.resolve(mockSdk)
})

afterEach(() => {
  jest.useRealTimers()
})

/**
 * Start the wallet with every connection attempt failing, until it gives up:
 * three attempts, five seconds apart. `whileRetrying` runs after the first
 * two have failed, while the start is still going.
 */
const failToStart = async (
  spark: SparkModule,
  whileRetrying: () => Promise<void> | void = () => undefined,
) => {
  jest.useFakeTimers()
  // initializeBreezSDK() logs its giving up; this case expects it.
  const logged = jest.spyOn(console, "error").mockImplementation(() => undefined)
  mockBuild = () => Promise.reject(new Error("offline"))
  const gaveUp = spark.initializeBreezSDK().then(
    () => "started",
    (err: Error) => err.message,
  )
  await jest.advanceTimersByTimeAsync(5_000)
  await whileRetrying()
  await jest.advanceTimersByTimeAsync(5_000)
  expect(await gaveUp).toBe("Failed to connect to Breez SDK: offline")
  jest.useRealTimers()
  logged.mockRestore()
}

describe("getSDKInstance", () => {
  it("throws BreezSdkNotInitializedError, reason off, before the wallet starts", () => {
    const { spark, errors } = load()

    let thrown: unknown
    try {
      spark.getSDKInstance()
    } catch (err) {
      thrown = err
    }

    expect(thrown).toBeInstanceOf(errors.BreezSdkNotInitializedError)
    expect(thrown).toMatchObject({
      reason: "off",
      // The message the plain Error it replaces carried.
      message: "Breez SDK not initialized. Call initializeBreezSDK first.",
    })
  })

  it("gives the reason starting while initializeBreezSDK() is connecting", async () => {
    let finishBuild: (sdk: unknown) => void = () => undefined
    mockBuild = () =>
      new Promise((resolve) => {
        finishBuild = resolve
      })
    const { spark } = load()

    const starting = spark.initializeBreezSDK()
    // Let connectToSDK run up to the pending build().
    await new Promise((resolve) => {
      setImmediate(resolve)
    })
    expect(() => spark.getSDKInstance()).toThrow(
      expect.objectContaining({ reason: "starting" }),
    )

    finishBuild(mockSdk)
    await expect(starting).resolves.toBe(true)
    expect(spark.getSDKInstance()).toBe(mockSdk)
  })

  it("gives the reason failed once initializeBreezSDK() has given up, not off", async () => {
    // Advance mode is on and the wallet could not start (offline at launch):
    // `off` would have the assistant send the user to a setting that is
    // already on.
    const { spark } = load()

    await failToStart(spark)

    expect(() => spark.getSDKInstance()).toThrow(
      expect.objectContaining({ reason: "failed" }),
    )
  })

  it("forgets a failed start once a start succeeds", async () => {
    const { spark } = load()
    await failToStart(spark)

    mockBuild = () => Promise.resolve(mockSdk)
    await expect(spark.initializeBreezSDK()).resolves.toBe(true)

    expect(spark.getSDKInstance()).toBe(mockSdk)
  })

  it("reads as off again after a failed start once advance mode is turned off", async () => {
    const { spark } = load()
    await failToStart(spark)

    spark.markBreezSDKSwitchedOff()

    expect(() => spark.getSDKInstance()).toThrow(
      expect.objectContaining({ reason: "off" }),
    )
  })

  it("reads as failed again once advance mode is back on, until a start begins", async () => {
    const { spark } = load()
    await failToStart(spark)
    spark.markBreezSDKSwitchedOff()

    spark.markBreezSDKSwitchedOn()

    expect(() => spark.getSDKInstance()).toThrow(
      expect.objectContaining({ reason: "failed" }),
    )
  })

  it("reads as off again after a failed start once the wallet is disconnected", async () => {
    const { spark } = load()
    await failToStart(spark)

    await spark.disconnectToSDK()

    expect(() => spark.getSDKInstance()).toThrow(
      expect.objectContaining({ reason: "off" }),
    )
  })

  it("makes getInfo() reject with it while the wallet is not running", async () => {
    const { spark, errors } = load()

    await expect(spark.getInfo()).rejects.toBeInstanceOf(
      errors.BreezSdkNotInitializedError,
    )
    expect(mockSdk.getInfo).not.toHaveBeenCalled()
  })
})

describe("listPaymentsBreezSDK", () => {
  const started = async (): Promise<SparkModule> => {
    const { spark } = load()
    await spark.initializeBreezSDK()
    mockSdk.listPayments.mockResolvedValue({ payments: [{ id: "p1" }] })
    return spark
  }

  it("hands fromTimestamp to the SDK as a bigint of whole seconds", async () => {
    const spark = await started()

    const payments = await spark.listPaymentsBreezSDK(0, 100, {
      fromTimestamp: 1760000000.9,
    })

    expect(payments).toEqual([{ id: "p1" }])
    expect(mockSdk.listPayments).toHaveBeenCalledWith(
      expect.objectContaining({
        offset: 0,
        limit: 100,
        fromTimestamp: BigInt(1760000000),
        toTimestamp: undefined,
      }),
    )
  })

  it("leaves fromTimestamp and the asset filter unset for the two screens, which pass only offset and limit", async () => {
    const spark = await started()

    await spark.listPaymentsBreezSDK(0, 3)

    expect(mockSdk.listPayments).toHaveBeenCalledWith(
      expect.objectContaining({
        offset: 0,
        limit: 3,
        fromTimestamp: undefined,
        assetFilter: undefined,
      }),
    )
  })

  it("asks the SDK for Bitcoin payments only when told to, so no token amount reads as sats", async () => {
    // Payment.amount is "satoshis or token base units": 5 USDT on Spark is
    // 5,000,000, which the assistant would otherwise report as sats.
    const spark = await started()

    await spark.listPaymentsBreezSDK(0, 100, {
      fromTimestamp: 1760000000,
      assets: "bitcoin",
    })

    const [request] = mockSdk.listPayments.mock.calls[0]
    expect(request.assetFilter).toMatchObject({ tag: "Bitcoin" })
    expect(request).toMatchObject({ offset: 0, limit: 100 })
  })
})

describe("getInfo", () => {
  it("asks the SDK for a synced read", async () => {
    const { spark } = load()
    await spark.initializeBreezSDK()
    mockSdk.getInfo.mockResolvedValue({ balanceSats: BigInt(1) })

    await spark.getInfo()

    expect(mockSdk.getInfo).toHaveBeenCalledWith({ ensureSynced: true })
  })
})

describe("the BTC wallet switched off (advance mode off)", () => {
  // The real spark.ts under the real BTC rail and getTransactions, all from
  // one module registry: the error spark.ts throws must be the class the
  // rail checks for.
  const loadWithRail = (): {
    spark: SparkModule
    rail: RailModule
    getTransactions: GetTransactionsModule["getTransactions"]
  } => {
    const loaded: {
      spark?: SparkModule
      rail?: RailModule
      tool?: GetTransactionsModule
    } = {}
    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-var-requires */
      loaded.spark = require("@app/utils/breez-sdk/spark")
      loaded.rail = require("@app/payments/btc-rail")
      loaded.tool = require("@app/assistant/registry/read/get-transactions")
      /* eslint-enable @typescript-eslint/no-var-requires */
    })
    if (!loaded.spark || !loaded.rail || !loaded.tool) {
      throw new Error("spark.ts, the rail or getTransactions did not load")
    }
    return {
      spark: loaded.spark,
      rail: loaded.rail,
      getTransactions: loaded.tool.getTransactions,
    }
  }

  /** getTransactions over the real rail, with no GraphQL payments. */
  const transactions = async ({
    rail,
    getTransactions,
  }: ReturnType<typeof loadWithRail>): Promise<TransactionsPayload> => {
    const result = await getTransactions.run(
      {},
      {
        graphql: fakeGraphqlRail() as unknown as GraphqlRail,
        btcRail: rail.breezBtcRail,
        displayCurrency: "USD",
        now: () => NOW_MS,
      },
    )
    if (result.kind !== "answer") {
      throw new Error(`expected an answer, got ${result.kind}`)
    }
    return result.payload as TransactionsPayload
  }

  const DISABLED = { state: "disabled", replyKey: "Assistant.btcDisabled" }

  /** A started wallet with 50,000 sats and one payment, read while advance mode is on. */
  const started = async () => {
    const loaded = loadWithRail()
    await loaded.spark.initializeBreezSDK()
    mockSdk.getInfo.mockResolvedValue({
      balanceSats: BigInt(50_000),
      tokenBalances: new Map(),
    })
    mockSdk.listPayments.mockResolvedValue({
      payments: [btcPayment({ id: "p1", timestamp: 1_760_000_000 })],
    })
    await expect(loaded.rail.breezBtcRail.getBalanceSats()).resolves.toEqual({
      state: "ok",
      sats: 50_000,
    })
    expect((await transactions(loaded)).transactions.map(({ id }) => id)).toEqual(["p1"])
    jest.clearAllMocks()
    return loaded
  }

  it("answers disabled, with no balance and no BTC rows, though the SDK still runs", async () => {
    const loaded = await started()

    loaded.spark.markBreezSDKSwitchedOff()

    // Turning advance mode off stopped nothing: the SDK would still answer.
    expect(loaded.spark.getSDKInstance()).toBe(mockSdk)
    await expect(loaded.rail.breezBtcRail.getBalanceSats()).resolves.toEqual({
      state: "disabled",
    })
    const payload = await transactions(loaded)
    expect(payload.btc).toEqual(DISABLED)
    expect(payload.transactions).toEqual([])
    expect(payload.window.rails).toEqual(["graphql"])
    // Neither read reached the SDK.
    expect(mockSdk.getInfo).not.toHaveBeenCalled()
    expect(mockSdk.listPayments).not.toHaveBeenCalled()
  })

  it("reads the wallet again once advance mode is back on", async () => {
    const loaded = await started()
    loaded.spark.markBreezSDKSwitchedOff()

    loaded.spark.markBreezSDKSwitchedOn()

    await expect(loaded.rail.breezBtcRail.getBalanceSats()).resolves.toEqual({
      state: "ok",
      sats: 50_000,
    })
    const payload = await transactions(loaded)
    expect(payload.btc).toEqual({ state: "ok" })
    expect(payload.transactions.map(({ id }) => id)).toEqual(["p1"])
  })

  it("answers disabled, not syncing, while a start goes on after the switch", async () => {
    let finishBuild: (sdk: unknown) => void = () => undefined
    mockBuild = () =>
      new Promise((resolve) => {
        finishBuild = resolve
      })
    const loaded = loadWithRail()
    const starting = loaded.spark.initializeBreezSDK()
    await new Promise((resolve) => {
      setImmediate(resolve)
    })
    await expect(loaded.rail.breezBtcRail.getBalanceSats()).resolves.toEqual({
      state: "syncing",
    })

    loaded.spark.markBreezSDKSwitchedOff()

    await expect(loaded.rail.breezBtcRail.getBalanceSats()).resolves.toEqual({
      state: "disabled",
    })
    // The start finishes: the SDK runs, and the wallet is still off.
    finishBuild(mockSdk)
    await expect(starting).resolves.toBe(true)
    await expect(loaded.rail.breezBtcRail.getBalanceSats()).resolves.toEqual({
      state: "disabled",
    })
    expect((await transactions(loaded)).btc).toEqual(DISABLED)
    expect(mockSdk.getInfo).not.toHaveBeenCalled()
    expect(mockSdk.listPayments).not.toHaveBeenCalled()
  })

  it("answers disabled, not failed, when a start gives up after the switch", async () => {
    // The start retries for about ten seconds. Advance mode goes off in the
    // middle; "couldn't start, reopen the app" would then be wrong.
    const loaded = loadWithRail()

    await failToStart(loaded.spark, () => {
      loaded.spark.markBreezSDKSwitchedOff()
    })

    await expect(loaded.rail.breezBtcRail.getBalanceSats()).resolves.toEqual({
      state: "disabled",
    })
    expect((await transactions(loaded)).btc).toEqual(DISABLED)
    expect(() => loaded.spark.getSDKInstance()).toThrow(
      expect.objectContaining({ reason: "off" }),
    )
  })
})
