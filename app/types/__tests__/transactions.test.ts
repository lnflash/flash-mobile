import type {
  Payment,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from "@breeztech/breez-sdk-spark-react-native"

import {
  BreezTransaction,
  IbexTransaction,
  getTransactionStatus,
  isReceiveTransaction,
} from "../transactions"

// Deliberately built from the raw numeric values the SDK actually hands back —
// `PaymentType`/`PaymentStatus` are numeric enums (Send = 0/Receive = 1,
// Completed = 0/Pending = 1/Failed = 2). Importing the enums here instead would
// make these tests agree with whatever `__mocks__/@breeztech/...` invented,
// which is exactly how a string-valued mock let `paymentType === Receive`
// evaluate false and still pass green.
const breezPayment = (payment: Partial<Payment>): BreezTransaction => ({
  source: "breez",
  displayAmount: "J$0.00",
  displayFee: "J$0.00",
  payment: {
    id: "payment-id",
    paymentType: 1 as PaymentType,
    status: 0 as PaymentStatus,
    amount: BigInt(8453),
    fees: BigInt(0),
    timestamp: BigInt(1755000000),
    method: 0 as PaymentMethod,
    details: undefined,
    conversionDetails: undefined,
    ...payment,
  },
})

const ibexTransaction = (
  transaction: Partial<IbexTransaction["transaction"]>,
): IbexTransaction =>
  ({
    source: "ibex",
    transaction: {
      id: "ibex-id",
      direction: "RECEIVE",
      status: "SUCCESS",
      createdAt: 1755000000,
      settlementAmount: 8453,
      memo: null,
      ...transaction,
    },
  } as IbexTransaction)

describe("isReceiveTransaction", () => {
  it("reads a Breez receive from the numeric paymentType the SDK emits", () => {
    expect(isReceiveTransaction(breezPayment({ paymentType: 1 as PaymentType }))).toBe(
      true,
    )
  })

  it("reads a Breez send from the numeric paymentType the SDK emits", () => {
    expect(isReceiveTransaction(breezPayment({ paymentType: 0 as PaymentType }))).toBe(
      false,
    )
  })

  it("falls back to the Ibex direction field", () => {
    expect(isReceiveTransaction(ibexTransaction({ direction: "RECEIVE" }))).toBe(true)
    expect(isReceiveTransaction(ibexTransaction({ direction: "SEND" }))).toBe(false)
  })
})

describe("getTransactionStatus", () => {
  it("maps the numeric Breez statuses the SDK emits", () => {
    expect(getTransactionStatus(breezPayment({ status: 0 as PaymentStatus }))).toBe(
      "SUCCESS",
    )
    expect(getTransactionStatus(breezPayment({ status: 1 as PaymentStatus }))).toBe(
      "PENDING",
    )
    expect(getTransactionStatus(breezPayment({ status: 2 as PaymentStatus }))).toBe(
      "FAILURE",
    )
  })

  it("passes the Ibex status straight through", () => {
    expect(getTransactionStatus(ibexTransaction({ status: "PENDING" }))).toBe("PENDING")
  })
})
