import { CashuToken, CashuTransaction, RedemptionRequest } from "@app/types/ecash"
import { generateRandomString } from "@app/utils/string"
import { loadJson, save } from "@app/utils/storage"
import { v4 as uuidv4 } from "uuid"
import { CashuMint, CashuWallet, getDecodedToken } from "@cashu/cashu-ts"
import { TokenDecoder } from "./token-decoder"
import { RedemptionQueue } from "./redemption-queue"
import { MintManagementService, MintInfo } from "./mint-management"

/**
 * Service for managing Cashu eCash wallet operations
 * This implementation uses the cashu-ts library
 */
export class CashuService {
  private static instance: CashuService
  private mintManagementService: MintManagementService
  private wallet: {
    tokens: CashuToken[]
    transactions: CashuTransaction[]
    balance: number
    pendingRedemptions: RedemptionRequest[]
    mintBalances: Record<string, number> // Maps mint URLs to their balances
  } = {
    tokens: [],
    transactions: [],
    balance: 0,
    pendingRedemptions: [],
    mintBalances: {},
  }
  private initialized = false
  private cashuMints: Map<string, CashuMint> = new Map()
  private cashuWallets: Map<string, CashuWallet> = new Map()
  private redemptionQueue: RedemptionQueue

  // Private constructor prevents direct instantiation
  // The singleton pattern ensures only one instance of the service exists
  private constructor() {
    this.mintManagementService = MintManagementService.getInstance()
    this.redemptionQueue = RedemptionQueue.getInstance()

    // Handle completed redemptions
    this.redemptionQueue.onRedemptionComplete((request) => {
      this.handleCompletedRedemption(request)
    })

    // Handle failed redemptions
    this.redemptionQueue.onRedemptionFailed((request) => {
      this.handleFailedRedemption(request)
    })
  }

  /**
   * Get the singleton instance of CashuService
   * @returns The singleton instance
   */
  public static getInstance(): CashuService {
    if (!CashuService.instance) {
      CashuService.instance = new CashuService()
    }
    return CashuService.instance
  }

  /**
   * Initialize the eCash wallet
   * Sets up mint connections and loads wallet data from storage
   * @returns Promise that resolves when initialization is complete
   */
  public async initializeWallet(): Promise<void> {
    if (this.initialized) return

    try {
      console.log("Initializing eCash wallet, loading data from storage...")

      // Load tokens and transactions from storage first
      let loadedFromCache = false

      try {
        const storedTokens = await loadJson("cashu_tokens")
        if (storedTokens) {
          console.log(`Loaded ${storedTokens.length} tokens from storage`)
          this.wallet.tokens = storedTokens
          loadedFromCache = true
        } else {
          console.log("No tokens found in storage")
        }
      } catch (tokenError) {
        console.warn("Error loading tokens from storage:", tokenError)
      }

      try {
        const storedTransactions = await loadJson("cashu_transactions")
        if (storedTransactions) {
          console.log(`Loaded ${storedTransactions.length} transactions from storage`)
          this.wallet.transactions = storedTransactions.map((t: CashuTransaction) => ({
            ...t,
            createdAt: new Date(t.createdAt),
          }))
          loadedFromCache = true
        } else {
          console.log("No transactions found in storage")
        }
      } catch (txError) {
        console.warn("Error loading transactions from storage:", txError)
      }

      // If we successfully loaded from cache, calculate balances right away
      if (loadedFromCache) {
        // Run initial balance calculation based on cached data
        this.calculateBalances()
        console.log(`Initial balance from cached data: ${this.wallet.balance}`)
      }

      // Initialize mint management service (can happen in parallel to cache loading)
      await this.mintManagementService.initialize()

      // Get active mints
      const activeMints = await this.mintManagementService.getActiveMints()
      console.log(`Found ${activeMints.length} active mints to connect to`)

      // Initialize mint connections for all active mints
      for (const mintInfo of activeMints) {
        await this.initializeMint(mintInfo.url)
      }

      // Initialize the redemption queue
      await this.redemptionQueue.initialize()

      // Update pending redemptions list
      this.wallet.pendingRedemptions = this.redemptionQueue.getPending()

      // Check for and remove any duplicate transactions
      this.removeDuplicateTransactions()

      // Recalculate balance for each mint
      this.calculateBalances()
      this.initialized = true
      console.log("eCash wallet initialized successfully")
    } catch (error) {
      console.error("Failed to initialize eCash wallet:", error)
      // Reset objects in case of initialization failure
      this.cashuMints.clear()
      this.cashuWallets.clear()
    }
  }

  /**
   * Initialize a specific mint connection
   * @param mintUrl The URL of the mint to initialize
   * @returns The CashuWallet for this mint or undefined if it fails
   */
  private async initializeMint(mintUrl: string): Promise<CashuWallet | undefined> {
    try {
      // Check if we already have this mint initialized
      if (this.cashuWallets.has(mintUrl)) {
        return this.cashuWallets.get(mintUrl)
      }

      // Create new mint connection
      const cashuMint = new CashuMint(mintUrl)
      const cashuWallet = new CashuWallet(cashuMint)

      // Initialize mint connection
      await cashuWallet.loadMint()

      // Store the mint and wallet objects
      this.cashuMints.set(mintUrl, cashuMint)
      this.cashuWallets.set(mintUrl, cashuWallet)

      return cashuWallet
    } catch (error) {
      console.error(`Failed to initialize mint ${mintUrl}:`, error)
      return undefined
    }
  }

  /**
   * Remove duplicate transactions that might cause balance inconsistencies
   * @private
   */
  private removeDuplicateTransactions(): void {
    // Track seen transaction IDs
    const seenIds = new Set<string>()
    const uniqueTransactions: CashuTransaction[] = []

    // Keep only the first occurrence of each transaction ID
    for (const tx of this.wallet.transactions) {
      if (!seenIds.has(tx.id)) {
        seenIds.add(tx.id)
        uniqueTransactions.push(tx)
      } else {
        console.log(`Removing duplicate transaction with ID: ${tx.id}`)
      }
    }

    // Update the wallet with unique transactions
    if (this.wallet.transactions.length !== uniqueTransactions.length) {
      console.log(
        `Removed ${
          this.wallet.transactions.length - uniqueTransactions.length
        } duplicate transactions`,
      )
      this.wallet.transactions = uniqueTransactions
    }
  }

  /**
   * Calculate balances for all mints and the total balance
   */
  private calculateBalances(): void {
    // Reset balances
    const previousBalance = this.wallet.balance
    this.wallet.balance = 0
    this.wallet.mintBalances = {}

    // Initialize mint balances to 0
    for (const mintUrl of this.cashuMints.keys()) {
      this.wallet.mintBalances[mintUrl] = 0
    }

    console.log(`Calculating balances. Previous balance: ${previousBalance}`)
    console.log(`Number of tokens in wallet: ${this.wallet.tokens.length}`)

    // Loop through all tokens and calculate balances
    for (const token of this.wallet.tokens) {
      for (const mintToken of token.token) {
        const mintUrl = mintToken.mint

        // Initialize this mint's balance if it's not already set
        if (!this.wallet.mintBalances[mintUrl]) {
          this.wallet.mintBalances[mintUrl] = 0
        }

        // Add up proof amounts for this mint
        for (const proof of mintToken.proofs) {
          const amount = proof.amount
          this.wallet.mintBalances[mintUrl] += amount
          this.wallet.balance += amount
          console.log(
            `Added ${amount} sats from mint ${mintUrl}, running total: ${this.wallet.balance}`,
          )
        }
      }
    }

    console.log(`Balance calculation complete. New balance: ${this.wallet.balance}`)

    // Double-check by summing mint balances
    const mintTotal = Object.values(this.wallet.mintBalances).reduce((a, b) => a + b, 0)
    if (mintTotal !== this.wallet.balance) {
      console.warn(
        `Balance mismatch! Sum of mint balances (${mintTotal}) doesn't match wallet balance (${this.wallet.balance})`,
      )
    }
  }

  /**
   * Get the total eCash wallet balance across all mints
   * @returns Promise that resolves to the total balance
   */
  public async getBalance(): Promise<number> {
    if (!this.initialized) {
      await this.initializeWallet()
    }
    return this.wallet.balance
  }

  /**
   * Get balances for each individual mint
   * @returns Promise that resolves to a map of mint URLs to balances
   */
  public async getMintBalances(): Promise<Record<string, number>> {
    if (!this.initialized) {
      await this.initializeWallet()
    }
    return { ...this.wallet.mintBalances }
  }

  /**
   * Get all transactions, including pending ones
   * @returns Promise that resolves to an array of transactions
   */
  public async getTransactions(): Promise<CashuTransaction[]> {
    if (!this.initialized) {
      await this.initializeWallet()
    }

    // Add any pending transactions from the redemption queue
    const pendingTransactions = this.redemptionQueue
      .getPending()
      .map((req) => this.redemptionQueue.getPendingTransaction(req))

    // Combine with regular transactions, with pending ones at the top
    return [...pendingTransactions, ...this.wallet.transactions]
  }

  /**
   * Get pending redemption requests
   * @returns Array of pending redemption requests
   */
  public getPendingRedemptions(): RedemptionRequest[] {
    return this.redemptionQueue.getPending()
  }

  /**
   * Check if a string is a Cashu token
   * @param data The string to check
   * @returns True if the string is a Cashu token
   */
  public isCashuToken(data: string): boolean {
    return TokenDecoder.isCashuToken(data)
  }

  /**
   * Receives a Cashu token and adds it to the wallet
   * In this implementation, we prioritize a good user experience by:
   * 1. Decoding the token to estimate the amount
   * 2. Adding it to a redemption queue for processing
   * 3. Handling redemption in the background
   *
   * @param tokenString The token to receive
   * @returns Object indicating success/failure and amount
   */
  public async receiveToken(
    tokenString: string,
  ): Promise<{ success: boolean; amount?: number; error?: string; isPending?: boolean }> {
    if (!this.initialized) {
      await this.initializeWallet()
    }

    // Get the default mint
    const defaultMint = await this.mintManagementService.getDefaultMint()
    if (!defaultMint || !this.cashuWallets.has(defaultMint.url)) {
      throw new Error("eCash wallet not initialized")
    }

    try {
      // Parse the token string
      if (!tokenString) {
        return { success: false, error: "Invalid token string" }
      }

      // First, try to decode the token
      const decodedResult = TokenDecoder.decodeToken(tokenString)
      if (!decodedResult) {
        return { success: false, error: "Could not decode token" }
      }

      // Estimate the amount if possible
      const estimatedAmount = TokenDecoder.estimateAmount(decodedResult.token)

      // For "Bo" tokens (binary format), we need special handling
      const normalizedToken = TokenDecoder.normalizeTokenString(tokenString)
      if (normalizedToken.startsWith("Bo")) {
        console.log("Detected Bo-format token, attempting direct redemption")
        try {
          // Direct redemption approach for Bo tokens
          const result = await this.redeemBinaryToken(normalizedToken)
          if (result.success) {
            return {
              success: true,
              amount: result.amount,
              isPending: false,
            }
          }
        } catch (directError) {
          console.log(
            "Direct redemption of Bo token failed, will try queue:",
            directError,
          )
          // Continue to queue-based approach as fallback
        }
      }

      // Add the token to the redemption queue for processing
      await this.redemptionQueue.addToQueue(tokenString)

      // Update our pending redemptions list
      this.wallet.pendingRedemptions = this.redemptionQueue.getPending()

      // Return info about the pending redemption
      return {
        success: true,
        amount: estimatedAmount,
        isPending: true,
      }
    } catch (error) {
      console.error("Error receiving token:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Directly redeem a binary token format (Bo)
   * @param tokenString The normalized token string
   * @returns Result of redemption
   */
  private async redeemBinaryToken(
    tokenString: string,
  ): Promise<{ success: boolean; amount?: number; error?: string }> {
    try {
      console.log("Attempting direct redemption of binary token format")

      // For Cashu "Bo" tokens, we need to use the library's special decoding
      const decodedToken = getDecodedToken(tokenString)

      if (!decodedToken) {
        throw new Error("Could not decode binary token")
      }

      console.log("Decoded token for redemption:", JSON.stringify(decodedToken))

      // Get the mint URL from the decoded token
      // Handle different token formats - some have 'token' array, others are directly structured
      const tokenMintUrl = decodedToken.mint || (decodedToken as any).token?.[0]?.mint

      if (!tokenMintUrl) {
        throw new Error("Could not determine mint URL from token")
      }

      console.log("Attempting to redeem token with mint:", tokenMintUrl)

      // Initialize the token's mint if needed
      let wallet = this.cashuWallets.get(tokenMintUrl)

      if (!wallet) {
        // Try to initialize the mint connection
        const mintWallet = await this.initializeMint(tokenMintUrl)

        if (!mintWallet) {
          // If we can't connect to the token's mint, fall back to default mint
          const defaultMint = await this.mintManagementService.getDefaultMint()
          if (!defaultMint || !this.cashuWallets.has(defaultMint.url)) {
            throw new Error(
              "Could not connect to token's mint and no default mint available",
            )
          }
          wallet = this.cashuWallets.get(defaultMint.url)
        } else {
          wallet = mintWallet
        }
      }

      if (!wallet) {
        throw new Error("No wallet available to redeem token")
      }

      // Redeem the token with the proper mint wallet
      console.log("Redeeming binary format token")
      const result = await wallet.receive(decodedToken)
      console.log("Redemption result:", result)

      if (!result || !result.length) {
        throw new Error("Token redemption failed - no proofs received")
      }

      // Calculate total amount
      const totalAmount = result.reduce((sum, proof) => sum + (proof.amount || 0), 0)

      if (totalAmount <= 0) {
        throw new Error("Token redemption returned zero amount")
      }

      // Create a proper token structure from the received proofs
      const redeemedToken: CashuToken = {
        token: [
          {
            mint: tokenMintUrl,
            proofs: result.map((proof) => ({
              id: proof.id || generateRandomString(16),
              amount: proof.amount,
              secret: proof.secret || generateRandomString(64),
              C: proof.C,
            })),
          },
        ],
      }

      console.log("Created redeemed token structure:", JSON.stringify(redeemedToken))

      // Store the redeemed token
      this.wallet.tokens.push(redeemedToken)
      console.log(`Added token to wallet. Token count now: ${this.wallet.tokens.length}`)

      // Log the previous balance
      console.log("Previous wallet balance:", this.wallet.balance)

      // Create a transaction record
      const transaction: CashuTransaction = {
        id: uuidv4(),
        amount: totalAmount.toString(),
        status: "received",
        createdAt: new Date(),
        description: "Received via QR code (binary format)",
      }

      // Add transaction record
      this.wallet.transactions.push(transaction)
      console.log(
        `Added transaction record. Transaction count: ${this.wallet.transactions.length}`,
      )

      // Save state BEFORE calculating balances to ensure tokens are persisted
      console.log("Saving wallet state...")
      await this.saveState()
      console.log("Wallet state saved")

      // Recalculate balances to ensure accuracy
      console.log("Recalculating balances...")
      this.calculateBalances()
      console.log("Balances recalculated, new balance:", this.wallet.balance)

      // Auto-add the mint
      if (tokenMintUrl) {
        await this.addMintIfNeeded(tokenMintUrl)
      }

      return {
        success: true,
        amount: totalAmount,
      }
    } catch (error) {
      console.error("Error in direct binary token redemption:", error)

      // Check for token already spent error (different error messages from different implementations)
      const errorMsg = error instanceof Error ? error.message : String(error)
      if (
        errorMsg.includes("already spent") ||
        errorMsg.includes("already redeemed") ||
        errorMsg.includes("AlreadySpent")
      ) {
        // DO NOT add to balance or create a transaction for already spent tokens
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
  }

  /**
   * Handle a completed token redemption
   * @param request The completed redemption request
   */
  private async handleCompletedRedemption(request: RedemptionRequest): Promise<void> {
    try {
      if (!request.decodedToken || !request.amount) {
        console.error("Invalid completed redemption request:", request)
        return
      }

      // Check if this token was already redeemed by looking for a transaction with the same ID
      const existingTransaction = this.wallet.transactions.find(
        (tx) => tx.id === request.id,
      )
      if (existingTransaction) {
        console.log(
          `Token with ID ${request.id} was already processed, skipping to avoid double-counting`,
        )
        return
      }

      // In a real implementation, we would create a token with the redeemed proofs
      // For now, we'll simulate it with a dummy token
      const token: CashuToken = {
        token: [
          {
            mint: request.decodedToken.mint,
            proofs: [
              {
                amount: request.amount,
                id: generateRandomString(16),
                secret: generateRandomString(64),
              },
            ],
          },
        ],
      }

      // Add token to wallet
      this.wallet.tokens.push(token)
      this.wallet.balance += request.amount

      // Record transaction
      const transaction: CashuTransaction = {
        id: request.id,
        amount: request.amount.toString(),
        status: "received",
        createdAt: new Date(),
        description: "Received via QR code",
      }

      this.wallet.transactions.push(transaction)
      await this.saveState()

      // Recalculate balances to ensure accuracy
      this.calculateBalances()

      // Auto-add the mint if it has a valid URL and we successfully redeemed tokens from it
      if (request.decodedToken.mint) {
        await this.addMintIfNeeded(request.decodedToken.mint)
      }

      // Update pending redemptions
      this.wallet.pendingRedemptions = this.redemptionQueue.getPending()
    } catch (error) {
      console.error("Error handling completed redemption:", error)
    }
  }

  /**
   * Handle a failed token redemption
   * @param request The failed redemption request
   */
  private async handleFailedRedemption(request: RedemptionRequest): Promise<void> {
    try {
      // Record a failed transaction but mark it as "failed" instead of "received"
      const transaction: CashuTransaction = {
        id: request.id,
        amount: request.amount?.toString() || "0",
        status: "failed", // Change from "received" to "failed"
        createdAt: new Date(),
        description: "Failed token redemption",
        error: request.error,
      }

      // Check if this transaction already exists to avoid duplicates
      const existingTransaction = this.wallet.transactions.find(
        (tx) => tx.id === request.id,
      )
      if (existingTransaction) {
        console.log(
          `Transaction with ID ${request.id} already exists, updating status to failed`,
        )
        // Update the existing transaction
        existingTransaction.status = "failed"
        existingTransaction.error = request.error
      } else {
        // Add the new transaction
        this.wallet.transactions.push(transaction)
      }

      await this.saveState()

      // Recalculate balances to ensure they're accurate
      this.calculateBalances()

      // Update pending redemptions
      this.wallet.pendingRedemptions = this.redemptionQueue.getPending()
    } catch (error) {
      console.error("Error handling failed redemption:", error)
    }
  }

  /**
   * Retry a failed redemption
   * @param requestId ID of the redemption request to retry
   */
  public async retryRedemption(requestId: string): Promise<void> {
    await this.redemptionQueue.retry(requestId)
    this.wallet.pendingRedemptions = this.redemptionQueue.getPending()
  }

  /**
   * Completely resets the wallet by removing all tokens and transactions
   * Useful for removing simulated tokens during development/testing
   */
  public async resetWallet(): Promise<void> {
    if (!this.initialized) {
      await this.initializeWallet()
    }

    // Clear tokens and balance
    this.wallet.tokens = []
    this.wallet.balance = 0
    this.wallet.mintBalances = {}

    // Keep only non-simulated transactions
    this.wallet.transactions = this.wallet.transactions.filter(
      (tx) =>
        !(
          tx.description?.includes("simulation") ||
          tx.description?.includes("Received via QR") ||
          // Also filter out any transactions with exactly 1000 sats (our simulated amount)
          tx.amount === "1000"
        ),
    )

    // Remove ALL redemptions from the queue
    await this.redemptionQueue.clearAll()

    // Update the pending redemptions list
    this.wallet.pendingRedemptions = []

    // Save the cleared wallet
    await this.saveState()
  }

  /**
   * Gets all available mints (active and inactive)
   * @returns Promise that resolves to an array of mint info objects
   */
  public async getAllMints(): Promise<MintInfo[]> {
    return this.mintManagementService.getAllMints()
  }

  /**
   * Gets active mints only
   * @returns Promise that resolves to an array of active mint info objects
   */
  public async getActiveMints(): Promise<MintInfo[]> {
    return this.mintManagementService.getActiveMints()
  }

  /**
   * Gets the default mint
   * @returns Promise that resolves to the default mint info or undefined
   */
  public async getDefaultMint(): Promise<MintInfo | undefined> {
    return this.mintManagementService.getDefaultMint()
  }

  /**
   * Adds a new mint
   * @param url The URL of the mint to add
   * @param name Optional name for the mint
   * @param setAsDefault Whether to set this mint as the default
   * @returns Promise that resolves to the added mint info
   */
  public async addMint(
    url: string,
    name?: string,
    setAsDefault = false,
  ): Promise<MintInfo> {
    const mintInfo = await this.mintManagementService.addMint(url, name, setAsDefault)

    // Initialize mint connection if it's active
    if (mintInfo.isActive && !this.cashuWallets.has(url)) {
      await this.initializeMint(url)
    }

    // Recalculate balances in case this affects the total
    this.calculateBalances()

    return mintInfo
  }

  /**
   * Removes a mint
   * @param url The URL of the mint to remove
   * @returns Promise that resolves when the operation is complete
   */
  public async removeMint(url: string): Promise<void> {
    await this.mintManagementService.removeMint(url)

    // Remove mint connections
    this.cashuMints.delete(url)
    this.cashuWallets.delete(url)

    // Recalculate balances
    this.calculateBalances()
  }

  /**
   * Sets a mint as the default
   * @param url The URL of the mint to set as default
   * @returns Promise that resolves when the operation is complete
   */
  public async setDefaultMint(url: string): Promise<void> {
    await this.mintManagementService.setDefaultMint(url)

    // Initialize mint connection if it's not already initialized
    if (!this.cashuWallets.has(url)) {
      await this.initializeMint(url)
    }
  }

  /**
   * Sets a mint as active or inactive
   * @param url The URL of the mint to update
   * @param isActive Whether the mint should be active
   * @returns Promise that resolves when the operation is complete
   */
  public async setMintActive(url: string, isActive: boolean): Promise<void> {
    await this.mintManagementService.setMintActive(url, isActive)

    if (isActive) {
      // Initialize mint connection if it's not already initialized
      if (!this.cashuWallets.has(url)) {
        await this.initializeMint(url)
      }
    }

    // Recalculate balances
    this.calculateBalances()
  }

  /**
   * Updates the default mint in CashuService to match the mint management service
   * @returns Promise that resolves when the operation is complete
   */
  public async syncDefaultMint(): Promise<void> {
    const defaultMint = await this.mintManagementService.getDefaultMint()

    if (defaultMint) {
      // Make sure the default mint is initialized
      if (!this.cashuWallets.has(defaultMint.url)) {
        await this.initializeMint(defaultMint.url)
      }
    }
  }

  /**
   * Persists the wallet state to storage to ensure data is available offline
   * This method saves both tokens and transactions to enable offline access
   * @private
   */
  private async saveState(): Promise<void> {
    try {
      console.log(
        `Saving wallet state: ${this.wallet.tokens.length} tokens, ${this.wallet.transactions.length} transactions`,
      )

      // Save tokens first - these are critical for maintaining the balance
      await save("cashu_tokens", this.wallet.tokens)
      console.log(`Saved ${this.wallet.tokens.length} tokens to storage`)

      // Then save transactions - these provide transaction history
      await save("cashu_transactions", this.wallet.transactions)
      console.log(`Saved ${this.wallet.transactions.length} transactions to storage`)

      console.log("Wallet state saved successfully")
    } catch (error) {
      console.error("Error saving wallet state:", error)
      throw new Error(`Failed to save wallet state: ${error}`)
    }
  }

  /**
   * Public method to recalculate balances
   * This ensures balances are up-to-date, especially after direct redemptions
   */
  public async recalculateBalances(): Promise<void> {
    this.calculateBalances()
  }

  /**
   * Public method to persist wallet state
   * This ensures all wallet data is saved to storage for offline access
   */
  public async persistState(): Promise<void> {
    await this.saveState()
  }

  /**
   * Retry a redemption with a specific mint
   * @param requestId ID of the redemption request to retry
   * @param mintUrl The mint URL to use for the retry
   * @returns Promise that resolves when the operation is complete
   */
  public async retryRedemptionWithMint(
    requestId: string,
    mintUrl: string,
  ): Promise<void> {
    // Get the redemption from the queue
    const request = this.redemptionQueue.getById(requestId)

    if (!request) {
      throw new Error("Redemption request not found")
    }

    if (!request.decodedToken) {
      throw new Error("No token data found in redemption request")
    }

    // Update the mint URL
    request.decodedToken.mint = mintUrl
    request.mintConfidence = "high" // User-specified mint has high confidence

    // Add to attempted mints if not already there
    if (!request.attemptedMints) {
      request.attemptedMints = []
    }
    if (!request.attemptedMints.includes(mintUrl)) {
      request.attemptedMints.push(mintUrl)
    }

    // Reset status for retry
    await this.redemptionQueue.resetForRetry(requestId)

    // Update our pending redemptions list
    this.wallet.pendingRedemptions = this.redemptionQueue.getPending()
  }

  /**
   * Test connection to a mint without adding it to the wallet
   * @param mintUrl The URL of the mint to test
   * @returns Promise that resolves to true if connection successful, false otherwise
   */
  public async testMintConnection(mintUrl: string): Promise<boolean> {
    try {
      // Create temporary mint connection
      const cashuMint = new CashuMint(mintUrl)
      const cashuWallet = new CashuWallet(cashuMint)

      // Try to load the mint info
      await cashuWallet.loadMint()

      // If we get here, the connection worked
      return true
    } catch (error) {
      console.error(`Failed to connect to mint ${mintUrl}:`, error)
      return false
    }
  }

  /**
   * Helper to add a mint to the user's list if not already there
   * @param mintUrl The URL of the mint to add
   */
  private async addMintIfNeeded(mintUrl: string): Promise<void> {
    try {
      // Get current mints
      const existingMints = await this.getAllMints()

      // Check if mint already exists in the list
      const mintExists = existingMints.some((mint) => mint.url === mintUrl)

      if (!mintExists) {
        console.log(`Auto-adding mint ${mintUrl} after successful token redemption`)

        // Test the connection first
        const connectionWorks = await this.testMintConnection(mintUrl)

        if (connectionWorks) {
          // Extract a name from the URL (basic implementation)
          const urlObj = new URL(mintUrl)
          const name = `${
            urlObj.hostname.split(".")[0].charAt(0).toUpperCase() +
            urlObj.hostname.split(".")[0].slice(1)
          } Mint`

          // Add the mint but don't set as default
          await this.addMint(mintUrl, name, false)
        } else {
          console.log(`Skipping auto-add of mint ${mintUrl} due to connection failure`)
        }
      }
    } catch (error) {
      console.error("Error in addMintIfNeeded:", error)
      // Don't throw as this is a non-critical operation
    }
  }
}
