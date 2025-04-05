import {
  CashuTransaction,
  DecodedToken as _DecodedToken,
  NetworkStatus,
  QueueConfig,
  RedemptionRequest,
  RedemptionStatus as _RedemptionStatus,
} from "@app/types/ecash"
import { loadJson, save } from "@app/utils/storage"
import { v4 as uuidv4 } from "uuid"
import { TokenDecoder } from "./token-decoder"
import { CashuMint, CashuWallet, Proof, Token, getDecodedToken } from "@cashu/cashu-ts"

// Optional NetInfo import with error handling
let NetInfo = null
try {
  // We attempt to import NetInfo, but if it's not available, we'll handle that gracefully
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  NetInfo = require("@react-native-community/netinfo").default
} catch (error) {
  console.warn("NetInfo module not available, offline features will be limited")
}

const REDEMPTION_QUEUE_STORAGE_KEY = "cashu_redemption_queue"

/**
 * Manages the queue of pending token redemptions, supporting offline operation
 */
export class RedemptionQueue {
  private static instance: RedemptionQueue
  private queue: RedemptionRequest[] = []
  private networkStatus: NetworkStatus = "unknown"
  private processingActive = false
  private config: QueueConfig = {
    maxRetries: 5,
    retryIntervalMs: 60000, // 1 minute
  }

  // Event handlers
  private onRedemptionCompleteHandlers: ((request: RedemptionRequest) => void)[] = []
  private onRedemptionFailedHandlers: ((request: RedemptionRequest) => void)[] = []

  private constructor() {
    // Initialize network status - assume online if NetInfo is not available
    this.networkStatus = "online"

    // Initialize network status monitoring if NetInfo is available
    if (NetInfo) {
      try {
        NetInfo.addEventListener((state: any) => {
          const newStatus = state.isConnected ? "online" : "offline"
          const wasOffline = this.networkStatus === "offline"
          this.networkStatus = newStatus

          // If we just went from offline to online, try processing the queue
          if (wasOffline && newStatus === "online") {
            this.processQueue()
          }
        })
      } catch (error) {
        console.warn("Failed to setup network monitoring:", error)
      }
    }
  }

  /**
   * Get the singleton instance of the RedemptionQueue
   */
  public static getInstance(): RedemptionQueue {
    if (!RedemptionQueue.instance) {
      RedemptionQueue.instance = new RedemptionQueue()
    }
    return RedemptionQueue.instance
  }

  /**
   * Initialize the queue from storage
   */
  public async initialize(): Promise<void> {
    try {
      const storedQueue = await loadJson(REDEMPTION_QUEUE_STORAGE_KEY)
      if (storedQueue && Array.isArray(storedQueue)) {
        this.queue = storedQueue.map((item) => ({
          ...item,
          createdAt: new Date(item.createdAt),
          lastAttempt: item.lastAttempt ? new Date(item.lastAttempt) : undefined,
        }))
        console.log(`Loaded ${this.queue.length} pending redemptions from storage`)
      }

      // Check network status if NetInfo is available
      if (NetInfo) {
        try {
          const netInfo = await NetInfo.fetch()
          this.networkStatus = netInfo.isConnected ? "online" : "offline"
        } catch (error) {
          console.warn("Failed to fetch network status:", error)
          // Assume online if we can't check
          this.networkStatus = "online"
        }
      }

      // Start processing queue if we're online
      if (this.networkStatus === "online" && this.queue.length > 0) {
        this.processQueue()
      }
    } catch (error) {
      console.error("Error initializing redemption queue:", error)
    }
  }

  /**
   * Add a token to the redemption queue
   * @param tokenString The original token string
   * @param knownMint Optional known mint URL if provided by user
   * @param customId Optional custom ID for coordination with direct redemption
   * @returns A RedemptionRequest object
   */
  public async addToQueue(
    tokenString: string,
    knownMint?: string,
    customId?: string,
  ): Promise<RedemptionRequest> {
    // Decode the token
    const decodedResult = TokenDecoder.decodeToken(tokenString)

    if (!decodedResult) {
      throw new Error("Could not decode token")
    }

    // If user specified a mint, override the detected one
    if (knownMint) {
      decodedResult.token.mint = knownMint
      decodedResult.mintConfidence = "high" // User-provided mint is high confidence
    }

    // Estimate amount if possible
    const estimatedAmount = TokenDecoder.estimateAmount(decodedResult.token)

    // Create a new redemption request
    const request: RedemptionRequest = {
      id: customId || uuidv4(),
      tokenData: tokenString,
      status: "pending",
      amount: estimatedAmount,
      createdAt: new Date(),
      attemptCount: 0,
      decodedToken: decodedResult.token,
      mintConfidence: decodedResult.mintConfidence,
      attemptedMints: [],
    }

    // Check if there's already a request with this ID in the queue
    const existingRequest = this.queue.find((item) => item.id === request.id)
    if (existingRequest) {
      console.log(
        `Request with ID ${request.id} already exists in queue, not adding duplicate`,
      )
      return existingRequest
    }

    // Add to queue
    this.queue.push(request)

    // Save queue to storage
    await this.saveQueue()

    // If we're online, start processing the queue
    if (this.networkStatus === "online" && !this.processingActive) {
      this.processQueue()
    }

    return request
  }

  /**
   * Handle redemption of a token with unknown mint
   * @param request The redemption request
   */
  private async handleUnknownMintRedemption(
    request: RedemptionRequest,
  ): Promise<boolean> {
    if (!request.decodedToken) return false

    let success = false

    // Initialize attempted mints array if not exists
    if (!request.attemptedMints) {
      request.attemptedMints = []
    }

    // Add current mint to attempted mints if not already there
    if (
      request.decodedToken.mint &&
      !request.attemptedMints.includes(request.decodedToken.mint)
    ) {
      request.attemptedMints.push(request.decodedToken.mint)
    }

    // Try to redeem with the current mint
    try {
      const result = await this.redeemWithMint(
        request.tokenData,
        request.decodedToken.mint,
      )

      if (result.success) {
        const updatedRequest = { ...request }
        updatedRequest.status = "completed"
        updatedRequest.amount = result.amount

        // Update the request object
        Object.assign(request, updatedRequest)

        this.notifyRedemptionComplete(request)
        success = true
      }
    } catch (error) {
      console.log(`Failed redemption with mint ${request.decodedToken.mint}:`, error)
      // Continue to try next mint
    }

    return success
  }

  /**
   * Handle known mint redemption
   * @param request The redemption request
   */
  private async handleKnownMintRedemption(request: RedemptionRequest): Promise<void> {
    if (!request.decodedToken?.mint) {
      throw new Error("No mint URL found in token")
    }

    // Make the actual redemption call to the mint
    const result = await this.redeemWithMint(request.tokenData, request.decodedToken.mint)

    if (result.success) {
      const updatedRequest = { ...request }
      updatedRequest.status = "completed"
      updatedRequest.amount = result.amount

      // Update the request object
      Object.assign(request, updatedRequest)

      // Notify listeners
      this.notifyRedemptionComplete(request)
    } else {
      throw new Error(result.error || "Unknown error redeeming token")
    }
  }

  /**
   * Process the redemption queue
   * @returns Promise that resolves when queue processing completes or pauses
   */
  public async processQueue(): Promise<void> {
    // Don't process if already processing or offline
    if (this.processingActive || this.networkStatus !== "online") {
      return
    }

    this.processingActive = true

    try {
      // Find pending redemptions
      const pendingRedemptions = this.queue.filter(
        (req) =>
          req.status === "pending" ||
          (req.status === "failed" && req.attemptCount < this.config.maxRetries),
      )

      if (pendingRedemptions.length === 0) {
        this.processingActive = false
        return
      }

      // Process each redemption
      for (const request of pendingRedemptions) {
        // Skip if we went offline during processing
        if (this.networkStatus !== "online") {
          break
        }

        // Mark as processing
        request.status = "processing"
        request.lastAttempt = new Date()
        request.attemptCount += 1
        await this.saveQueue()

        try {
          // For tokens with unknown mint confidence, we'll need to try multiple mints
          if (request.mintConfidence === "unknown" && request.decodedToken) {
            const success = await this.handleUnknownMintRedemption(request)

            if (!success) {
              // Try next mint if available
              const knownMints = TokenDecoder.getKnownMints()
              const nextMint = knownMints.find(
                (mint) => !request.attemptedMints?.includes(mint),
              )

              if (nextMint && request.decodedToken) {
                // Try another mint next time
                request.decodedToken.mint = nextMint
                if (!request.attemptedMints) {
                  request.attemptedMints = []
                }
                request.attemptedMints.push(nextMint)
                request.status = "pending" // Reset to pending for next attempt
                request.error = `Failed with mint ${
                  request.attemptedMints[request.attemptedMints.length - 2]
                }, trying ${nextMint}`
              } else {
                // All mints tried, mark as failed
                request.status = "failed"
                request.error =
                  "Failed with all known mints. Please specify the correct mint."
                this.notifyRedemptionFailed(request)
              }
            }
          } else {
            // For tokens with high mint confidence, just try once
            await this.handleKnownMintRedemption(request)
          }
        } catch (error) {
          console.error("Error redeeming token:", error)

          // Check for already redeemed token error
          const errorMsg = error instanceof Error ? error.message : String(error)
          if (
            errorMsg.includes("already spent") ||
            errorMsg.includes("already redeemed") ||
            errorMsg.includes("AlreadySpent")
          ) {
            // Mark as failed with specific error and notify to clean up the UI
            request.status = "failed"
            request.error =
              "This token has already been redeemed and cannot be used again."
            this.notifyRedemptionFailed(request)

            // Increase attempt count to max to prevent further retries
            request.attemptCount = this.config.maxRetries
          } else {
            // Mark as failed with standard error
            request.status = "failed"
            request.error = error instanceof Error ? error.message : "Unknown error"

            // If we've reached max retries, notify listeners
            if (request.attemptCount >= this.config.maxRetries) {
              this.notifyRedemptionFailed(request)
            }
          }
        }

        // Save updated status
        await this.saveQueue()
      }
    } finally {
      this.processingActive = false
    }
  }

  /**
   * Redeem a token with a specific mint
   * @param tokenString The token string to redeem
   * @param mintUrl The mint URL to use
   * @returns Result of the redemption
   */
  private async redeemWithMint(
    tokenString: string,
    mintUrl: string,
  ): Promise<{ success: boolean; amount?: number; error?: string }> {
    try {
      console.log(`Attempting to redeem token with mint: ${mintUrl}`)

      // Create a CashuMint instance for this redemption
      const mint = new CashuMint(mintUrl)
      const wallet = new CashuWallet(mint)

      // Ensure the mint is loaded
      await wallet.loadMint()

      // For "cashu" protocol tokens (including "Bo" format), we need special handling
      const normalizedToken = TokenDecoder.normalizeTokenString(tokenString)

      if (normalizedToken.startsWith("B")) {
        // For binary format tokens, we need special handling similar to cashu.me
        console.log("Redeeming binary format token")

        try {
          // Format according to the mint's expected format
          // This converts the binary token to a JSON structure the mint expects
          const decodedResult = getDecodedToken(normalizedToken)

          if (!decodedResult) {
            throw new Error("Could not decode binary token")
          }

          // Use decodedResult directly since it's already the right format
          console.log("Decoded token for redemption:", decodedResult)

          // Modify token to use our mint URL
          // Need to use type assertion since the cashu-ts typings can be inconsistent
          const tokenToRedeem = decodedResult as unknown as {
            token: Array<{ mint: string }>
          }

          if (Array.isArray(tokenToRedeem.token)) {
            tokenToRedeem.token.forEach((t) => {
              t.mint = mintUrl
            })
          }

          // Perform the redemption
          const receiveResult = await wallet.receive(decodedResult as Token)
          console.log("Redemption result:", receiveResult)

          if (
            !receiveResult ||
            !Array.isArray(receiveResult) ||
            receiveResult.length === 0
          ) {
            throw new Error("No proofs were redeemed")
          }

          // Calculate total amount from redeemed proofs
          const totalAmount = receiveResult.reduce((sum: number, proof: Proof) => {
            return sum + (proof.amount || 0)
          }, 0)

          return {
            success: true,
            amount: totalAmount,
          }
        } catch (error) {
          console.error("Error redeeming binary token:", error)

          // Check for token already spent error
          const errorMsg = error instanceof Error ? error.message : String(error)
          if (
            errorMsg.includes("already spent") ||
            errorMsg.includes("already redeemed") ||
            errorMsg.includes("AlreadySpent")
          ) {
            return {
              success: false,
              error: "This token has already been redeemed and cannot be used again.",
            }
          }

          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          }
        }
      } else {
        // For JSON format tokens
        console.log("Redeeming JSON format token")

        // Parse the token if it's a string
        let token
        try {
          token = JSON.parse(normalizedToken)
        } catch (e) {
          throw new Error("Invalid token format")
        }

        // Ensure mint URLs match our target
        if (token.token && Array.isArray(token.token)) {
          token.token.forEach((t: { mint: string }) => {
            t.mint = mintUrl
          })
        }

        try {
          // Perform the redemption
          const receiveResult = await wallet.receive(token as Token)
          console.log("Redemption result:", receiveResult)

          if (
            !receiveResult ||
            !Array.isArray(receiveResult) ||
            receiveResult.length === 0
          ) {
            throw new Error("No proofs were redeemed")
          }

          // Calculate total amount
          const totalAmount = receiveResult.reduce((sum: number, proof: Proof) => {
            return sum + (proof.amount || 0)
          }, 0)

          return {
            success: true,
            amount: totalAmount,
          }
        } catch (error) {
          console.error("Error redeeming JSON token:", error)

          // Check for token already spent error
          const errorMsg = error instanceof Error ? error.message : String(error)
          if (
            errorMsg.includes("already spent") ||
            errorMsg.includes("already redeemed") ||
            errorMsg.includes("AlreadySpent")
          ) {
            return {
              success: false,
              error: "This token has already been redeemed and cannot be used again.",
            }
          }

          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error in redemption",
          }
        }
      }
    } catch (error) {
      console.error("Error in redeemWithMint:", error)

      // Check for token already spent error
      const errorMsg = error instanceof Error ? error.message : String(error)
      if (
        errorMsg.includes("already spent") ||
        errorMsg.includes("already redeemed") ||
        errorMsg.includes("AlreadySpent")
      ) {
        return {
          success: false,
          error: "This token has already been redeemed and cannot be used again.",
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error in redemption",
      }
    }
  }

  /**
   * Get a pending transaction object for a redemption request
   * @param request The redemption request
   * @returns A CashuTransaction object
   */
  public getPendingTransaction(request: RedemptionRequest): CashuTransaction {
    return {
      id: request.id,
      amount: request.amount?.toString() || "unknown",
      status: "pending" as const,
      createdAt: request.createdAt,
      description: "Pending token redemption",
      tokenData: request.tokenData,
      error: request.error,
    }
  }

  /**
   * Register a handler for completed redemptions
   * @param handler Function to call when a redemption completes
   */
  public onRedemptionComplete(handler: (request: RedemptionRequest) => void): void {
    this.onRedemptionCompleteHandlers.push(handler)
  }

  /**
   * Register a handler for failed redemptions
   * @param handler Function to call when a redemption fails
   */
  public onRedemptionFailed(handler: (request: RedemptionRequest) => void): void {
    this.onRedemptionFailedHandlers.push(handler)
  }

  /**
   * Get all redemption requests
   * @returns Array of redemption requests
   */
  public getAll(): RedemptionRequest[] {
    return [...this.queue]
  }

  /**
   * Get pending redemption requests (pending or processing)
   * @returns Array of pending redemption requests
   */
  public getPending(): RedemptionRequest[] {
    return this.queue.filter(
      (req) => req.status === "pending" || req.status === "processing",
    )
  }

  /**
   * Get completed redemption requests
   * @returns Array of completed redemption requests
   */
  public getCompleted(): RedemptionRequest[] {
    return this.queue.filter((req) => req.status === "completed")
  }

  /**
   * Get failed redemption requests
   * @returns Array of failed redemption requests
   */
  public getFailed(): RedemptionRequest[] {
    return this.queue.filter(
      (req) => req.status === "failed" && req.attemptCount >= this.config.maxRetries,
    )
  }

  /**
   * Clear completed redemptions from the queue
   * @returns Promise that resolves when the operation completes
   */
  public async clearCompleted(): Promise<void> {
    this.queue = this.queue.filter((req) => req.status !== "completed")
    await this.saveQueue()
  }

  /**
   * Retry a failed redemption
   * @param requestId ID of the redemption request to retry
   * @returns Promise that resolves when the operation completes
   */
  public async retry(requestId: string): Promise<void> {
    const request = this.queue.find((req) => req.id === requestId)
    if (request && request.status === "failed") {
      request.status = "pending"
      request.attemptCount = 0
      request.error = undefined
      await this.saveQueue()

      if (this.networkStatus === "online" && !this.processingActive) {
        this.processQueue()
      }
    }
  }

  /**
   * Remove a redemption request from the queue
   * @param requestId ID of the redemption request to remove
   * @returns Promise that resolves when the operation completes
   */
  public async remove(requestId: string): Promise<void> {
    this.queue = this.queue.filter((req) => req.id !== requestId)
    await this.saveQueue()
  }

  /**
   * Save the queue to storage
   * @returns Promise that resolves when the save completes
   */
  private async saveQueue(): Promise<void> {
    try {
      await save(REDEMPTION_QUEUE_STORAGE_KEY, this.queue)
    } catch (error) {
      console.error("Error saving redemption queue:", error)
    }
  }

  /**
   * Notify listeners of a completed redemption
   * @param request The completed redemption request
   */
  private notifyRedemptionComplete(request: RedemptionRequest): void {
    for (const handler of this.onRedemptionCompleteHandlers) {
      try {
        handler(request)
      } catch (error) {
        console.error("Error in redemption complete handler:", error)
      }
    }
  }

  /**
   * Notify listeners of a failed redemption
   * @param request The failed redemption request
   */
  private notifyRedemptionFailed(request: RedemptionRequest): void {
    for (const handler of this.onRedemptionFailedHandlers) {
      try {
        handler(request)
      } catch (error) {
        console.error("Error in redemption failed handler:", error)
      }
    }
  }

  /**
   * Get a redemption request by ID
   * @param requestId The ID of the request to find
   * @returns The request object or undefined if not found
   */
  public getById(requestId: string): RedemptionRequest | undefined {
    return this.queue.find((req) => req.id === requestId)
  }

  /**
   * Reset a redemption request for retry
   * @param requestId The ID of the request to reset
   */
  public async resetForRetry(requestId: string): Promise<void> {
    const request = this.getById(requestId)
    if (request) {
      request.status = "pending"
      request.attemptCount = 0
      request.error = undefined
      await this.saveQueue()

      if (this.networkStatus === "online" && !this.processingActive) {
        this.processQueue()
      }
    }
  }

  /**
   * Clear all redemptions from the queue
   * @returns Promise that resolves when the operation completes
   */
  public async clearAll(): Promise<void> {
    this.queue = []
    await this.saveQueue()
  }

  /**
   * Clear all pending redemptions that have "already redeemed" errors
   * @returns Promise that resolves when the operation completes
   */
  public async clearAlreadyRedeemed(): Promise<void> {
    const beforeCount = this.queue.length

    // Remove any requests with "already redeemed" errors
    this.queue = this.queue.filter((req) => {
      return !(
        req.error &&
        (req.error.includes("already redeemed") ||
          req.error.includes("already spent") ||
          req.error.includes("AlreadySpent"))
      )
    })

    const removedCount = beforeCount - this.queue.length
    if (removedCount > 0) {
      console.log(`Removed ${removedCount} already redeemed tokens from queue`)
      await this.saveQueue()
    }
  }
}
