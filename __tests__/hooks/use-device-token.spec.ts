/**
 * getAppCheckToken — App Check singleton semantics.
 *
 * Contract under test:
 *  - initializeAppCheck runs once; later calls reuse the instance and read
 *    the cached token (getToken(false)), never force-refresh.
 *  - A failed initialization clears the memo so the next call retries.
 *  - A failed getToken returns undefined but keeps the instance (transient
 *    token errors must not re-trigger attestation).
 */

const mockInitializeAppCheck = jest.fn()
const mockConfigure = jest.fn()

jest.mock("@react-native-firebase/app-check", () => ({
  __esModule: true,
  default: () => ({
    newReactNativeFirebaseAppCheckProvider: () => ({ configure: mockConfigure }),
  }),
  initializeAppCheck: (...args: unknown[]) => mockInitializeAppCheck(...args),
}))

jest.mock("react-native-config", () => ({
  APP_CHECK_ANDROID_DEBUG_TOKEN: "android-debug",
  APP_CHECK_IOS_DEBUG_TOKEN: "ios-debug",
}))

const instanceWithToken = (token: string, getTokenImpl?: jest.Mock) => ({
  getToken: getTokenImpl ?? jest.fn().mockResolvedValue({ token }),
})

describe("getAppCheckToken", () => {
  // The module memoizes its App Check instance at module scope, so each test
  // reloads the module for a fresh singleton.
  let getAppCheckToken: () => Promise<string | undefined>

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    getAppCheckToken =
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require("@app/screens/get-started-screen/use-device-token").getAppCheckToken
  })

  it("initializes once and serves later calls from the same instance", async () => {
    const instance = instanceWithToken("token-1")
    mockInitializeAppCheck.mockResolvedValue(instance)

    expect(await getAppCheckToken()).toBe("token-1")
    expect(await getAppCheckToken()).toBe("token-1")

    expect(mockInitializeAppCheck).toHaveBeenCalledTimes(1)
    // Auto-refresh must stay on: getToken(false) is only safe because the SDK
    // refreshes the cached token before expiry — without it, every token
    // lifetime ends in a full attestation on the request path.
    expect(mockInitializeAppCheck).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ isTokenAutoRefreshEnabled: true }),
    )
    // Cached token (false), never force refresh
    expect(instance.getToken).toHaveBeenCalledTimes(2)
    expect(instance.getToken).toHaveBeenCalledWith(false)
  })

  it("initializes once even when calls overlap during init", async () => {
    // The singleton memoizes the init PROMISE synchronously — refactoring to
    // memoize-after-await would fire one attestation per concurrent caller
    // (cold start runs several GraphQL ops + the WS connect in parallel).
    let resolveInit!: (v: unknown) => void
    mockInitializeAppCheck.mockReturnValue(
      new Promise((resolve) => {
        resolveInit = resolve
      }),
    )

    const first = getAppCheckToken()
    const second = getAppCheckToken()
    resolveInit(instanceWithToken("token-c"))

    expect(await first).toBe("token-c")
    expect(await second).toBe("token-c")
    expect(mockInitializeAppCheck).toHaveBeenCalledTimes(1)
  })

  it("returns undefined on init failure and retries initialization next call", async () => {
    mockInitializeAppCheck.mockRejectedValueOnce(new Error("attestation down"))
    expect(await getAppCheckToken()).toBeUndefined()

    mockInitializeAppCheck.mockResolvedValueOnce(instanceWithToken("token-2"))
    expect(await getAppCheckToken()).toBe("token-2")

    expect(mockInitializeAppCheck).toHaveBeenCalledTimes(2)
  })

  it("keeps the instance when only getToken fails (transient token error)", async () => {
    const getToken = jest
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({ token: "token-3" })
    mockInitializeAppCheck.mockResolvedValue(instanceWithToken("", getToken))

    expect(await getAppCheckToken()).toBeUndefined()
    expect(await getAppCheckToken()).toBe("token-3")

    // Token failure must not tear down the singleton and re-attest
    expect(mockInitializeAppCheck).toHaveBeenCalledTimes(1)
  })
})
