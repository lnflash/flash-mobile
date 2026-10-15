/**
 * ENG-687: the spark.ts changes the BTC rail's reads stand on.
 *
 * - getSDKInstance() throws BreezSdkNotInitializedError with its reason:
 *   `starting` while initializeBreezSDK() is connecting, `failed` once it has
 *   given up, `off` otherwise. The rail answers `syncing`, `failed` or
 *   `disabled` from it instead of failing (or showing zero).
 * - listPaymentsBreezSDK takes an optional fromTimestamp and hands it to the
 *   SDK as the bigint it expects, and can list Bitcoin payments only; its two
 *   existing callers leave both out.
 *
 * Each case loads a fresh spark.ts, whose SDK instance is module state.
 */
type SparkModule = typeof import("@app/utils/breez-sdk/spark")
type ErrorsModule = typeof import("@app/utils/breez-sdk/sdk-errors")

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
  Seed: { Mnemonic: class {} },
  SdkBuilder: class {
    withDefaultStorage = () => Promise.resolve()
    build = () => mockBuild()
  },
}))

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

  /** Start the wallet with every connection attempt failing, until it gives up. */
  const failToStart = async (spark: SparkModule) => {
    jest.useFakeTimers()
    // initializeBreezSDK() logs its giving up; this case expects it.
    const logged = jest.spyOn(console, "error").mockImplementation(() => undefined)
    mockBuild = () => Promise.reject(new Error("offline"))
    const gaveUp = spark.initializeBreezSDK().then(
      () => "started",
      (err: Error) => err.message,
    )
    // Three attempts, five seconds apart.
    await jest.advanceTimersByTimeAsync(10_000)
    expect(await gaveUp).toBe("Failed to connect to Breez SDK: offline")
    jest.useRealTimers()
    logged.mockRestore()
  }

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

    spark.clearBreezSDKInitFailure()

    expect(() => spark.getSDKInstance()).toThrow(
      expect.objectContaining({ reason: "off" }),
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
