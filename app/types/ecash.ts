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
  status: "sent" | "received" | "converted"
  createdAt: Date
  description?: string
  convertedFrom?: string
  convertedTo?: string
}

// Types that will be used for interacting with the cashu-ts library
export interface EcashWallet {
  balance: number
  tokens: CashuToken[]
  transactions: CashuTransaction[]
  mint: CashuMint
}

export const ECASH_MINT_DEFAULT_URL = "https://forge.flashapp.me"
