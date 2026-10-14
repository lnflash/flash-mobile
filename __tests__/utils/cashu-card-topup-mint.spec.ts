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
const getKeySets = jest.fn()
const swap = jest.fn()

const Y1 = "02" + "11".repeat(32)
const Y2 = "03" + "22".repeat(32)

beforeEach(() => {
  jest.clearAllMocks()
  ;(Mint as unknown as jest.Mock).mockImplementation(() => ({
    checkMintQuoteBolt11,
    check,
    getKeySets,
    swap,
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

describe("createTopUpMint feePpk (ENG-702)", () => {
  const keysets = [
    // The mint API's own field name.
    // eslint-disable-next-line camelcase
    { id: "00aa", unit: "sat", active: true, input_fee_ppk: 100 },
    { id: "00bb", unit: "sat", active: true },
    // eslint-disable-next-line camelcase
    { id: "00cc", unit: "sat", active: false, input_fee_ppk: 0 },
  ]

  it("answers the keyset's input_fee_ppk, 0 where the mint states none", async () => {
    getKeySets.mockResolvedValue({ keysets })
    const mint = createTopUpMint("https://mint.test")
    await expect(mint.feePpk("00aa")).resolves.toBe(100)
    await expect(mint.feePpk("00bb")).resolves.toBe(0)
  })

  it("refuses a keyset the mint does not list as active: a swap's outputs must be in one", async () => {
    getKeySets.mockResolvedValue({ keysets })
    const mint = createTopUpMint("https://mint.test")
    await expect(mint.feePpk("00cc")).rejects.toBeInstanceOf(TopUpMintError)
    await expect(mint.feePpk("00dd")).rejects.toBeInstanceOf(TopUpMintError)
  })
})

describe("createTopUpMint swap (ENG-702)", () => {
  it("sends the inputs and outputs as given and answers the signatures in order", async () => {
    const signatures = [{ id: "00aa", amount: 8, C_: "02" + "11".repeat(32) }]
    swap.mockResolvedValueOnce({ signatures })
    const inputs = [{ id: "00aa", amount: 8, secret: "s", C: "02", witness: "{}" }]
    const outputs = [{ id: "00aa", amount: 8, B_: "03" + "22".repeat(32) }]
    await expect(
      createTopUpMint("https://mint.test").swap(inputs as never, outputs as never),
    ).resolves.toBe(signatures)
    expect(swap).toHaveBeenCalledWith({ inputs, outputs })
  })
})
