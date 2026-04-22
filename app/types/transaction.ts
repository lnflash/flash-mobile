import { TransactionFragment } from "@app/graphql/generated"

export interface TransactionWithSwapDetails extends TransactionFragment {
  swapId?: string
  lockupTxId?: string
  claimTxId?: string
  swapperFeesSat?: number
  bitcoinExpirationBlockheight?: number
}

// Type guard to check if transaction has swap details
export const hasSwapDetails = (tx: TransactionFragment): tx is TransactionWithSwapDetails => {
  return 'swapId' in tx && tx.swapId !== undefined
}
