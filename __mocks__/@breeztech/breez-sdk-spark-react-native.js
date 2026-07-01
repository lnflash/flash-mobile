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

const PaymentStatus = {
  Pending: "Pending",
  Complete: "Complete",
  Failed: "Failed",
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
