import { createRegistry, RegisteredTool } from "./define"
import { decodePaymentRequest } from "./read/decode-payment-request"
import { getAccountLimits } from "./read/get-account-limits"
import { getBalances } from "./read/get-balances"
import { getPrice } from "./read/get-price"
import { getTransactionDetails } from "./read/get-transaction-details"
import { getTransactions } from "./read/get-transactions"
import { resolveContact } from "./read/resolve-contact"
import { searchMerchants } from "./read/search-merchants"

// The registered tools. A new intent is a new file under read/ or actions/
// and one entry here; the router, the executor and runTool are generic over
// this list and are not edited (spec §7.2).

export const READ_TOOLS: readonly RegisteredTool[] = [
  getBalances,
  getTransactions,
  getTransactionDetails,
  resolveContact,
  getPrice,
  searchMerchants,
  getAccountLimits,
  decodePaymentRequest,
]

export const assistantRegistry = createRegistry(READ_TOOLS)
