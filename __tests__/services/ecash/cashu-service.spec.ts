import { CashuService } from "../../../app/services/ecash/cashu-service"
import { MintManagementService } from "../../../app/services/ecash/mint-management"
import { RedemptionQueue } from "../../../app/services/ecash/redemption-queue"
import { TokenDecoder } from "../../../app/services/ecash/token-decoder"
import { CashuTransaction, RedemptionRequest } from "../../../app/types/ecash"
import * as cashuTs from "@cashu/cashu-ts"
import * as storage from "@app/utils/storage"

// Mock dependencies
jest.mock("../../../app/services/ecash/mint-management")
jest.mock("../../../app/services/ecash/redemption-queue")
jest.mock("../../../app/services/ecash/token-decoder")
jest.mock("@cashu/cashu-ts", () => {
  return {
    CashuMint: jest.fn().mockImplementation(() => ({
      loadMint: jest.fn().mockResolvedValue(true),
    })),
    CashuWallet: jest.fn().mockImplementation(() => ({
      loadMint: jest.fn().mockResolvedValue(true),
      receive: jest
        .fn()
        .mockResolvedValue([{ amount: 100, id: "test-id", secret: "test-secret" }]),
    })),
    getDecodedToken: jest.fn().mockReturnValue({
      token: [
        {
          mint: "https://test.mint",
          proofs: [{ amount: 100, id: "test-id", secret: "test-secret" }],
        },
      ],
    }),
  }
})
jest.mock("@app/utils/storage", () => ({
  loadJson: jest.fn().mockResolvedValue([]),
  save: jest.fn().mockResolvedValue(true),
}))

describe("CashuService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset the singleton instance
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - accessing private property for testing
    CashuService.instance = undefined

    // Setup default mocks for MintManagementService
    MintManagementService.getInstance = jest.fn().mockReturnValue({
      initialize: jest.fn().mockResolvedValue(undefined),
      getActiveMints: jest.fn().mockResolvedValue([
        {
          url: "https://test.mint",
          name: "Test Mint",
          isActive: true,
          isDefault: true,
        },
      ]),
      getAllMints: jest.fn().mockResolvedValue([
        {
          url: "https://test.mint",
          name: "Test Mint",
          isActive: true,
          isDefault: true,
        },
      ]),
      getDefaultMint: jest.fn().mockResolvedValue({
        url: "https://test.mint",
        name: "Test Mint",
        isActive: true,
        isDefault: true,
      }),
      addMint: jest.fn().mockResolvedValue({
        url: "https://new.mint",
        name: "New Mint",
        isActive: true,
        isDefault: false,
      }),
    })

    // Setup default mocks for RedemptionQueue
    RedemptionQueue.getInstance = jest.fn().mockReturnValue({
      initialize: jest.fn().mockResolvedValue(undefined),
      getPending: jest.fn().mockReturnValue([]),
      onRedemptionComplete: jest.fn(),
      onRedemptionFailed: jest.fn(),
    })

    // Setup default mocks for TokenDecoder
    TokenDecoder.isCashuToken = jest.fn().mockReturnValue(true)
    TokenDecoder.decodeToken = jest.fn().mockReturnValue({
      token: [
        {
          mint: "https://test.mint",
          proofs: [{ amount: 100, id: "test-id", secret: "test-secret" }],
        },
      ],
    })
    TokenDecoder.estimateAmount = jest.fn().mockReturnValue(100)
    TokenDecoder.normalizeTokenString = jest.fn().mockReturnValue("cashu:token123")
  })

  describe("getInstance", () => {
    it("should return a singleton instance", () => {
      const instance1 = CashuService.getInstance()
      const instance2 = CashuService.getInstance()
      expect(instance1).toBe(instance2)
    })
  })

  describe("testMintConnection", () => {
    it("should return true when connection to mint succeeds", async () => {
      const cashuService = CashuService.getInstance()
      const result = await cashuService.testMintConnection("https://valid.mint")
      expect(result).toBe(true)
    })

    it("should return false when connection to mint fails", async () => {
      // Mock implementation to simulate connection failure
      jest.spyOn(cashuTs, "CashuWallet").mockImplementationOnce(
        () =>
          ({
            loadMint: jest.fn().mockRejectedValue(new Error("Connection failed")),
          } as unknown as cashuTs.CashuWallet),
      )

      const cashuService = CashuService.getInstance()
      const result = await cashuService.testMintConnection("https://invalid.mint")
      expect(result).toBe(false)
    })
  })

  describe("addMint", () => {
    it("should add a new mint", async () => {
      const cashuService = CashuService.getInstance()
      await cashuService.initializeWallet() // Initialize first
      await cashuService.addMint("https://new.mint", "New Mint")

      // Verify addMint was called on MintManagementService
      expect(MintManagementService.getInstance().addMint).toHaveBeenCalledWith(
        "https://new.mint",
        "New Mint",
        false, // default value for setAsDefault
      )
    })

    it("should set a mint as default when specified", async () => {
      const cashuService = CashuService.getInstance()
      await cashuService.initializeWallet()
      await cashuService.addMint("https://new.mint", "New Mint", true)

      expect(MintManagementService.getInstance().addMint).toHaveBeenCalledWith(
        "https://new.mint",
        "New Mint",
        true,
      )
    })
  })

  describe("isCashuToken", () => {
    it("should correctly identify a Cashu token", async () => {
      const cashuService = CashuService.getInstance()
      const result = cashuService.isCashuToken("cashu:token123")
      expect(result).toBeTruthy()
      expect(TokenDecoder.isCashuToken).toHaveBeenCalledWith("cashu:token123")
    })
  })

  describe("getBalance", () => {
    it("should return the correct wallet balance", async () => {
      // Setup mocks with predefined balance
      const cashuService = CashuService.getInstance()

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - accessing private property for testing
      cashuService.wallet = {
        tokens: [],
        transactions: [],
        balance: 500,
        pendingRedemptions: [],
        mintBalances: { "https://test.mint": 500 },
      }

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - accessing private property for testing
      cashuService.initialized = true

      const balance = await cashuService.getBalance()
      expect(balance).toBe(500)
    })

    it("should initialize wallet if not initialized when getting balance", async () => {
      const cashuService = CashuService.getInstance()
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - accessing private property for testing
      const initializeWalletSpy = jest.spyOn(cashuService, "initializeWallet")

      // Force initialized state to false
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - accessing private property for testing
      cashuService.initialized = false

      await cashuService.getBalance()
      expect(initializeWalletSpy).toHaveBeenCalled()
    })
  })

  describe("getMintBalances", () => {
    it("should return individual mint balances", async () => {
      const cashuService = CashuService.getInstance()

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - accessing private property for testing
      cashuService.wallet = {
        tokens: [],
        transactions: [],
        balance: 800,
        pendingRedemptions: [],
        mintBalances: {
          "https://test.mint": 500,
          "https://other.mint": 300,
        },
      }

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - accessing private property for testing
      cashuService.initialized = true

      const balances = await cashuService.getMintBalances()
      expect(balances).toEqual({
        "https://test.mint": 500,
        "https://other.mint": 300,
      })
    })
  })

  describe("mint management operations", () => {
    it("should set a mint as default", async () => {
      const cashuService = CashuService.getInstance()
      await cashuService.initializeWallet()
      await cashuService.setDefaultMint("https://test.mint")

      expect(MintManagementService.getInstance().setDefaultMint).toHaveBeenCalledWith(
        "https://test.mint",
      )
    })

    it("should toggle mint active state", async () => {
      const cashuService = CashuService.getInstance()
      await cashuService.initializeWallet()
      await cashuService.setMintActive("https://test.mint", false)

      expect(MintManagementService.getInstance().setMintActive).toHaveBeenCalledWith(
        "https://test.mint",
        false,
      )
    })

    it("should remove a mint", async () => {
      const cashuService = CashuService.getInstance()
      await cashuService.initializeWallet()
      await cashuService.removeMint("https://test.mint")

      expect(MintManagementService.getInstance().removeMint).toHaveBeenCalledWith(
        "https://test.mint",
      )
    })
  })

  describe("receiveToken", () => {
    it("should add token to redemption queue for processing", async () => {
      // Setup specific mocks for this test
      const pendingRequest: RedemptionRequest = {
        id: "123",
        tokenString: "cashu:token123",
        status: "pending",
        createdAt: new Date(),
        attemptCount: 1,
        mintConfidence: "high",
        decodedToken: { mint: "https://test.mint" },
      }

      RedemptionQueue.getInstance = jest.fn().mockReturnValue({
        initialize: jest.fn().mockResolvedValue(undefined),
        addToQueue: jest.fn().mockResolvedValue(undefined),
        getPending: jest.fn().mockReturnValue([pendingRequest]),
        onRedemptionComplete: jest.fn(),
        onRedemptionFailed: jest.fn(),
      })

      const cashuService = CashuService.getInstance()
      await cashuService.initializeWallet()

      const result = await cashuService.receiveToken("cashu:token123")

      expect(result).toEqual({
        success: true,
        amount: 100,
        isPending: true,
      })

      expect(RedemptionQueue.getInstance().addToQueue).toHaveBeenCalledWith(
        "cashu:token123",
      )
    })

    it("should handle binary token format directly", async () => {
      // Mock for binary token detection
      TokenDecoder.normalizeTokenString = jest.fn().mockReturnValue("BoToken123")

      const cashuService = CashuService.getInstance()
      await cashuService.initializeWallet()

      // Force wallet ready for this test
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - accessing private property for testing
      cashuService.cashuWallets = new Map()
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - accessing private property for testing
      cashuService.cashuWallets.set("https://test.mint", {
        receive: jest
          .fn()
          .mockResolvedValue([{ amount: 100, id: "test-id", secret: "test-secret" }]),
      })

      const result = await cashuService.receiveToken("BoToken123")

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          amount: expect.any(Number),
        }),
      )
    })

    it("should handle invalid tokens", async () => {
      // Mock for invalid token
      TokenDecoder.decodeToken = jest.fn().mockReturnValue(null)

      const cashuService = CashuService.getInstance()
      await cashuService.initializeWallet()

      const result = await cashuService.receiveToken("invalid:token")

      expect(result).toEqual({
        success: false,
        error: "Could not decode token",
      })
    })
  })

  describe("retryRedemption", () => {
    it("should retry a failed redemption", async () => {
      const pendingRequest: RedemptionRequest = {
        id: "123",
        tokenString: "cashu:token123",
        status: "failed",
        error: "Test error",
        createdAt: new Date(),
        attemptCount: 1,
        mintConfidence: "high",
        decodedToken: { mint: "https://test.mint" },
      }

      RedemptionQueue.getInstance = jest.fn().mockReturnValue({
        initialize: jest.fn().mockResolvedValue(undefined),
        getPending: jest.fn().mockReturnValue([pendingRequest]),
        retry: jest.fn().mockResolvedValue(undefined),
        onRedemptionComplete: jest.fn(),
        onRedemptionFailed: jest.fn(),
      })

      const cashuService = CashuService.getInstance()
      await cashuService.initializeWallet()

      await cashuService.retryRedemption("123")

      expect(RedemptionQueue.getInstance().retry).toHaveBeenCalledWith("123")
    })
  })

  describe("resetWallet", () => {
    it("should clear tokens and reset balances", async () => {
      RedemptionQueue.getInstance = jest.fn().mockReturnValue({
        initialize: jest.fn().mockResolvedValue(undefined),
        getPending: jest.fn().mockReturnValue([]),
        clearAll: jest.fn().mockResolvedValue(undefined),
        onRedemptionComplete: jest.fn(),
        onRedemptionFailed: jest.fn(),
      })

      const mockSave = jest.spyOn(storage, "save")

      const cashuService = CashuService.getInstance()
      await cashuService.initializeWallet()

      // Setup some initial state
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - accessing private property for testing
      cashuService.wallet = {
        tokens: [
          {
            token: [
              {
                mint: "https://test.mint",
                proofs: [{ amount: 100, id: "test-id", secret: "test-secret" }],
              },
            ],
          },
        ],
        transactions: [
          {
            id: "123",
            amount: "100",
            status: "received",
            createdAt: new Date(),
            description: "Test",
          },
        ] as CashuTransaction[],
        balance: 100,
        pendingRedemptions: [] as RedemptionRequest[],
        mintBalances: { "https://test.mint": 100 },
      }

      await cashuService.resetWallet()

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - accessing private property for testing
      expect(cashuService.wallet.tokens).toEqual([])
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - accessing private property for testing
      expect(cashuService.wallet.balance).toBe(0)
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - accessing private property for testing
      expect(cashuService.wallet.mintBalances).toEqual({})
      expect(RedemptionQueue.getInstance().clearAll).toHaveBeenCalled()
      expect(mockSave).toHaveBeenCalled()
    })
  })
})
