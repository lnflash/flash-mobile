/**
 * ENG-616: the top-up's mint client reads two answers the money decisions
 * rest on, and must never guess at either: a quote's state (anything not
 * UNPAID reads as paid) and a proof's NUT-07 state (a SPENT proof is never
 * written back onto a card).
 */
import { Mint } from "@cashu/cashu-ts"

import { TopUpMintError, createTopUpMint } from "../../app/utils/cashu-card-topup"

jest.mock("@cashu/cashu-ts", () => ({
  ...jest.requireActual("@cashu/cashu-ts"),
  Mint: jest.fn(),
}))

const checkMintQuoteBolt11 = jest.fn()
const check = jest.fn()

const Y1 = "02" + "11".repeat(32)
const Y2 = "03" + "22".repeat(32)

beforeEach(() => {
  jest.clearAllMocks()
  ;(Mint as unknown as jest.Mock).mockImplementation(() => ({
    checkMintQuoteBolt11,
    check,
  }))
})

describe("createTopUpMint quoteState", () => {
  it("passes on the NUT-04 states, and Nutshell's PENDING while a mint call runs", async () => {
    const mint = createTopUpMint("https://mint.test")
    for (const state of ["UNPAID", "PAID", "PENDING", "ISSUED"]) {
      checkMintQuoteBolt11.mockResolvedValueOnce({ state })
      await expect(mint.quoteState("q")).resolves.toBe(state)
    }
  })

  it("refuses a state it does not know rather than read it as paid", async () => {
    checkMintQuoteBolt11.mockResolvedValueOnce({ state: "EXPIRED" })
    await expect(
      createTopUpMint("https://mint.test").quoteState("q"),
    ).rejects.toBeInstanceOf(TopUpMintError)
  })
})

describe("createTopUpMint proofStates", () => {
  it("asks by Y and pairs each answer by its Y, not its position", async () => {
    check.mockResolvedValueOnce({
      states: [
        { Y: Y2.toUpperCase(), state: "UNSPENT", witness: null },
        { Y: Y1, state: "SPENT", witness: "{}" },
      ],
    })

    await expect(
      createTopUpMint("https://mint.test").proofStates([Y1, Y2]),
    ).resolves.toEqual(["SPENT", "UNSPENT"])
    expect(check).toHaveBeenCalledWith({ Ys: [Y1, Y2] })
  })

  it("refuses an answer that leaves a proof out, or names a state it does not know", async () => {
    const mint = createTopUpMint("https://mint.test")
    check.mockResolvedValueOnce({ states: [{ Y: Y1, state: "SPENT", witness: null }] })
    await expect(mint.proofStates([Y1, Y2])).rejects.toBeInstanceOf(TopUpMintError)

    check.mockResolvedValueOnce({
      states: [
        { Y: Y1, state: "SPENT", witness: null },
        { Y: Y2, state: "BURNT", witness: null },
      ],
    })
    await expect(mint.proofStates([Y1, Y2])).rejects.toBeInstanceOf(TopUpMintError)
  })
})
