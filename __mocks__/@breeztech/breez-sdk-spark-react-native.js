const SdkEvent_Tags = {
  PaymentPending: "PaymentPending",
  PaymentSucceeded: "PaymentSucceeded",
  PaymentFailed: "PaymentFailed",
  Synced: "Synced",
  Optimization: "Optimization",
}

// Every enum below must mirror the real SDK's generated numbering
// (node_modules/@breeztech/breez-sdk-spark-react-native/src/generated/breez_sdk_spark.ts).
// These are numeric TypeScript enums, not string unions. Inventing string
// values here fails silently and destructively: app code compares
// `payment.status === PaymentStatus.Completed` and
// `payment.paymentType === PaymentType.Receive` against fixtures carrying the
// real numeric values, so a string mock makes every such comparison false, the
// wrong branch is taken, and the test passes green while asserting the opposite
// of production behaviour. PaymentStatus previously did exactly that (string
// values under a "Complete" key); PaymentType did too. Copy the generated
// values when adding a new enum here — do not invent readable strings.
//
// generated: PaymentType   — Send = 0, Receive = 1
const PaymentType = {
  Send: 0,
  Receive: 1,
}

// generated: PaymentStatus — Completed = 0, Pending = 1, Failed = 2
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
