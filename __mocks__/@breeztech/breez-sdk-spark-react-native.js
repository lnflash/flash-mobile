/* eslint-disable camelcase */
// The *_Tags identifiers mirror the SDK's generated enum names verbatim.
// Full member set verified against the 0.22.3 generated d.ts
// (breez_sdk_spark.d.ts, `export declare enum SdkEvent_Tags`). Keep this
// complete: a missing member reads as `undefined`, every tag comparison goes
// silently false, and a test passes green while asserting the wrong branch.
const SdkEvent_Tags = {
  Synced: "Synced",
  UnclaimedDeposits: "UnclaimedDeposits",
  ClaimedDeposits: "ClaimedDeposits",
  PaymentSucceeded: "PaymentSucceeded",
  PaymentPending: "PaymentPending",
  PaymentFailed: "PaymentFailed",
  // 0.17.0 renamed the variant (OptimizationEvent -> AutoOptimizationEvent);
  // verified against the 0.22.3 generated d.ts.
  AutoOptimization: "AutoOptimization",
  LightningAddressChanged: "LightningAddressChanged",
  NewDeposits: "NewDeposits",
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
// 0.22.x: prepareSendPayment takes a tagged-union PaymentRequest; app code
// constructs `new PaymentRequest.Input({ input })`. Mirror of the generated
// class shape — tests only ever read `.tag` and `.inner.input`.
const PaymentRequest_Tags = {
  Input: "Input",
  CrossChain: "CrossChain",
}
const PaymentRequest = {
  Input: class {
    constructor(inner) {
      this.tag = PaymentRequest_Tags.Input
      this.inner = Object.freeze({ ...inner })
    }
  },
  instanceOf: (obj) => Boolean(obj && obj.tag && obj.inner),
}

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
  PaymentRequest,
  PaymentRequest_Tags,
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
