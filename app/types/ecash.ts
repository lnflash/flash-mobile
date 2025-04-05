export type CashuMint = {
  url: string
  keysets: Record<string, Array<string>>
}

export type CashuToken = {
  token: Array<{
    mint: string
    proofs: Array<{
      secret: string
      amount: number
      id: string
    }>
  }>
}

export type CashuTransaction = {
  id: string
  amount: string
  status: "sent" | "received" | "converted" | "pending" | "failed"
  createdAt: Date
  description?: string
  convertedFrom?: string
  convertedTo?: string
  tokenData?: string // Original token data for pending transactions
  error?: string // Error message if redemption failed
}

// New types for redemption queue
export type RedemptionStatus = "pending" | "processing" | "completed" | "failed"

export type RedemptionRequest = {
  id: string
  tokenData: string // The original token data
  status: RedemptionStatus
  amount?: number // Estimated amount if known
  createdAt: Date
  lastAttempt?: Date
  attemptCount: number
  error?: string
  decodedToken?: DecodedToken
  mintConfidence: "high" | "low" | "unknown" // Confidence in the mint URL
  attemptedMints?: string[] // List of mints already attempted
}

export type DecodedToken = {
  mint: string
  encodedProofs: string
  // For P2PK tokens, we need to store additional data
  memo?: string
  unit?: string
  v?: number // Protocol version
}

// Network status tracking
export type NetworkStatus = "online" | "offline" | "unknown"

// Queue manager configuration
export type QueueConfig = {
  maxRetries: number
  retryIntervalMs: number
}

// Types that will be used for interacting with the cashu-ts library
export interface EcashWallet {
  balance: number
  tokens: CashuToken[]
  transactions: CashuTransaction[]
  mint: CashuMint
  pendingRedemptions: RedemptionRequest[]
}

export const ECASH_MINT_DEFAULT_URL = "https://forge.flashapp.me"
