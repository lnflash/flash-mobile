/**
 * ENG-634: why the top-up screen refuses an amount. The development pay stub
 * skips the payment, so it lifts the Cash-balance check and nothing else; a
 * release build has no stub (`stubbedPayOutcome` is undefined when __DEV__ is
 * false), so it always checks the balance.
 */
import {
  MAX_TOPUP_AMOUNT,
  TopUpAmountCheck,
  topUpAmountProblem,
} from "@app/utils/cashu-card-topup"
import { setCardBridge, stubbedPayOutcome } from "@app/utils/cashu-card-bridge"

type Dev = { __DEV__: boolean }
const setDev = (value: boolean) => {
  ;(globalThis as unknown as Dev).__DEV__ = value
}

const check = (over: Partial<TopUpAmountCheck> = {}): TopUpAmountCheck => ({
  amount: 1000,
  needed: 6,
  freeSlots: 32,
  cost: 1000,
  balance: 50_000,
  payStubbed: false,
  ...over,
})

afterEach(() => {
  setDev(true)
  setCardBridge(undefined)
})

describe("topUpAmountProblem", () => {
  it("lets an amount the card has room for and the Cash wallet covers through", () => {
    expect(topUpAmountProblem(check())).toBeUndefined()
  })

  it("names each reason on its own", () => {
    expect(topUpAmountProblem(check({ amount: MAX_TOPUP_AMOUNT + 1 }))).toBe("too-much")
    expect(topUpAmountProblem(check({ needed: 6, freeSlots: 5 }))).toBe("no-room")
    expect(topUpAmountProblem(check({ cost: 60_000 }))).toBe("over-balance")
  })

  it("says the limit first, then the room, then the balance", () => {
    expect(
      topUpAmountProblem(
        check({ amount: MAX_TOPUP_AMOUNT + 1, freeSlots: 0, cost: 2_000_000 }),
      ),
    ).toBe("too-much")
    expect(topUpAmountProblem(check({ freeSlots: 0, cost: 60_000 }))).toBe("no-room")
  })

  it("does not refuse on a balance or a price it does not know", () => {
    expect(
      topUpAmountProblem(check({ cost: 60_000, balance: undefined })),
    ).toBeUndefined()
    expect(topUpAmountProblem(check({ cost: 60_000, balance: null }))).toBeUndefined()
    expect(topUpAmountProblem(check({ cost: undefined }))).toBeUndefined()
  })

  it("with the pay stub on, lifts the balance check and nothing else", () => {
    expect(topUpAmountProblem(check({ cost: 60_000, payStubbed: true }))).toBeUndefined()
    expect(
      topUpAmountProblem(check({ freeSlots: 0, cost: 60_000, payStubbed: true })),
    ).toBe("no-room")
    expect(
      topUpAmountProblem(check({ amount: MAX_TOPUP_AMOUNT + 1, payStubbed: true })),
    ).toBe("too-much")
  })

  it("a release build (__DEV__ false) has no stub, so the balance is checked", () => {
    setDev(true)
    setCardBridge({
      url: "http://localhost:9876",
      mintUrl: "http://localhost:3338",
      stubPay: true,
    })
    const payStubbed = () => stubbedPayOutcome("http://localhost:3338") !== undefined
    expect(topUpAmountProblem(check({ cost: 60_000, payStubbed: payStubbed() }))).toBe(
      undefined,
    )

    setDev(false)
    expect(payStubbed()).toBe(false)
    expect(topUpAmountProblem(check({ cost: 60_000, payStubbed: payStubbed() }))).toBe(
      "over-balance",
    )
  })
})
