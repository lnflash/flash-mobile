import type { Payment } from "@breeztech/breez-sdk-spark-react-native"
import {
  PaymentDetails_Tags,
  PaymentType,
  PaymentStatus,
} from "@breeztech/breez-sdk-spark-react-native"
import type { TransactionFragment } from "@app/graphql/generated"

// ============================================================================
// Unified Transaction Types
//
// This module provides a discriminated union for handling transactions from
// different sources (Breez Spark SDK and Ibex GraphQL) while preserving all
// source-specific details.
// ============================================================================

/**
 * Breez transaction wrapper - preserves all Spark SDK Payment fields
 */
export type BreezTransaction = {
  source: "breez"
  payment: Payment
  // Pre-computed display values for list view
  displayAmount: string
  displayFee: string
}

/**
 * Ibex transaction wrapper - wraps GraphQL TransactionFragment
 */
export type IbexTransaction = {
  source: "ibex"
  transaction: TransactionFragment
}

/**
 * Unified transaction type - discriminated union by 'source' field
 */
export type UnifiedTransaction = BreezTransaction | IbexTransaction

// ============================================================================
// Helper functions for working with unified transactions
// ============================================================================

/**
 * Type guard for Breez transactions
 */
export const isBreezTransaction = (tx: UnifiedTransaction): tx is BreezTransaction => {
  return tx.source === "breez"
}

/**
 * Type guard for Ibex transactions
 */
export const isIbexTransaction = (tx: UnifiedTransaction): tx is IbexTransaction => {
  return tx.source === "ibex"
}

/**
 * Get unique ID from unified transaction
 */
export const getTransactionId = (tx: UnifiedTransaction): string => {
  if (isBreezTransaction(tx)) {
    return tx.payment.id
  }
  return tx.transaction.id
}

/**
 * Get timestamp from unified transaction (for sorting)
 */
export const getTransactionTimestamp = (tx: UnifiedTransaction): number => {
  if (isBreezTransaction(tx)) {
    return Number(tx.payment.timestamp)
  }
  return tx.transaction.createdAt
}

/**
 * Get amount in satoshis from unified transaction
 */
export const getTransactionAmount = (tx: UnifiedTransaction): number => {
  if (isBreezTransaction(tx)) {
    return Number(tx.payment.amount)
  }
  return tx.transaction.settlementAmount
}

/**
 * Check if transaction is a receive
 */
export const isReceiveTransaction = (tx: UnifiedTransaction): boolean => {
  if (isBreezTransaction(tx)) {
    return tx.payment.paymentType === PaymentType.Receive
  }
  return tx.transaction.direction === "RECEIVE"
}

/**
 * Get transaction status
 */
export const getTransactionStatus = (
  tx: UnifiedTransaction,
): "SUCCESS" | "PENDING" | "FAILURE" => {
  if (isBreezTransaction(tx)) {
    switch (tx.payment.status) {
      case PaymentStatus.Completed:
        return "SUCCESS"
      case PaymentStatus.Pending:
        return "PENDING"
      case PaymentStatus.Failed:
        return "FAILURE"
      default:
        return "PENDING"
    }
  }
  return tx.transaction.status
}

/**
 * Get memo/description from unified transaction
 * For Breez: extracts from payment.details based on payment type
 * For Ibex: returns transaction.memo
 */
export const getTransactionMemo = (tx: UnifiedTransaction): string | null => {
  if (isBreezTransaction(tx)) {
    const details = tx.payment.details
    if (!details) return null

    // Lightning payments have description directly in inner
    if (details.tag === PaymentDetails_Tags.Lightning) {
      return details.inner.description ?? null
    }

    // Spark payments have description in invoiceDetails
    if (details.tag === PaymentDetails_Tags.Spark) {
      return details.inner.invoiceDetails?.description ?? null
    }

    return null
  }
  return tx.transaction.memo ?? null
}
