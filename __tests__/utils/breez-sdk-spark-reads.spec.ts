/**
 * ENG-687: the two spark.ts changes the BTC rail's reads stand on.
 *
 * - getSDKInstance() throws BreezSdkNotInitializedError, flagged while
 *   initializeBreezSDK() is connecting, so the rail can answer `disabled` or
 *   `syncing` instead of failing (or showing zero).
 * - listPaymentsBreezSDK takes an optional fromTimestamp and hands it to the
 *   SDK as the bigint it expects; its two existing callers leave it out.
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

describe("getSDKInstance", () => {
  it("throws BreezSdkNotInitializedError, not flagged initializing, before the wallet starts", () => {
    const { spark, errors } = load()

    let thrown: unknown
    try {
      spark.getSDKInstance()
    } catch (err) {
      thrown = err
    }

    expect(thrown).toBeInstanceOf(errors.BreezSdkNotInitializedError)
    expect(thrown).toMatchObject({
      initializing: false,
      // The message the plain Error it replaces carried.
      message: "Breez SDK not initialized. Call initializeBreezSDK first.",
    })
  })

  it("flags the error initializing while initializeBreezSDK() is connecting", async () => {
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
      expect.objectContaining({ initializing: true }),
    )

    finishBuild(mockSdk)
    await expect(starting).resolves.toBe(true)
    expect(spark.getSDKInstance()).toBe(mockSdk)
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

    const payments = await spark.listPaymentsBreezSDK(0, 100, 1760000000.9)

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

  it("leaves fromTimestamp unset for the two screens, which pass only offset and limit", async () => {
    const spark = await started()

    await spark.listPaymentsBreezSDK(0, 3)

    expect(mockSdk.listPayments).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 0, limit: 3, fromTimestamp: undefined }),
    )
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
