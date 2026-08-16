const SdkEvent_Tags = {
  PaymentPending: "PaymentPending",
  PaymentSucceeded: "PaymentSucceeded",
  PaymentFailed: "PaymentFailed",
  Synced: "Synced",
  Optimization: "Optimization",
}

const PaymentType = {
  Send: "Send",
  Receive: "Receive",
}

// Mirrors the real SDK enum (generated/breez_sdk_spark: Completed = 0,
// Pending = 1, Failed = 2). It previously exported string values under a
// "Complete" key, so app code comparing against PaymentStatus.Completed —
// app/types/transactions.ts and useSwap — silently compared against undefined
// under test and took the wrong branch.
const PaymentStatus = {
  Completed: 0,
  Pending: 1,
  Failed: 2,
}

class Bolt11Invoice {
  constructor(args) {
    Object.assign(this, args)
  }
}

class BitcoinAddress {
  constructor(args) {
    Object.assign(this, args)
  }
}

module.exports = {
  __esModule: true,
  BitcoinAddress,
  Bolt11Invoice,
  PaymentStatus,
  PaymentType,
  ReceivePaymentMethod: {
    BitcoinAddress,
    Bolt11Invoice,
  },
  SdkEvent_Tags,
  connect: jest.fn(),
  defaultConfig: jest.fn(),
  disconnect: jest.fn(),
}
