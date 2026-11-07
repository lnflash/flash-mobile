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
const getKeys = jest.fn()
const swap = jest.fn()

const Y1 = "02" + "11".repeat(32)
const Y2 = "03" + "22".repeat(32)

beforeEach(() => {
  jest.clearAllMocks()
  ;(Mint as unknown as jest.Mock).mockImplementation(() => ({
    checkMintQuoteBolt11,
    check,
    getKeySets,
    getKeys,
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

describe("createTopUpMint at a mint that serves v2 keyset ids (ENG-787)", () => {
  // Shaped like Minibits' /Bitcoin (0 ppk) and Macadamia's (150 ppk) sat keysets.
  const MINIBITS = `01fc0ec0${"3e".repeat(29)}`
  const MACADAMIA = `01a13e30${"91".repeat(29)}`
  const keysOf = (id: string) => ({ id, unit: "sat", active: true, keys: { 1: "02" } })

  it("answers the cheapest active keyset under its full 33-byte id", async () => {
    getKeySets.mockResolvedValue({
      keysets: [
        // The mint API's own field name.
        // eslint-disable-next-line camelcase
        { id: MACADAMIA, unit: "sat", active: true, input_fee_ppk: 150 },
        // eslint-disable-next-line camelcase
        { id: MINIBITS, unit: "sat", active: true, input_fee_ppk: 0 },
      ],
    })
    getKeys.mockImplementation(async (id: string) => ({ keysets: [keysOf(id)] }))
    const keyset = await createTopUpMint("https://mint.test").activeKeyset("sat")
    expect(keyset.id).toBe(MINIBITS)
    expect(keyset.id).toHaveLength(66)
    expect(getKeys).toHaveBeenCalledWith(MINIBITS)
  })

  it("refuses a keyset whose first 8 bytes another listed keyset shares: a card could not tell them apart", async () => {
    const twin = `${MINIBITS.slice(0, 16)}${"d4".repeat(25)}`
    getKeySets.mockResolvedValue({
      keysets: [
        { id: MINIBITS, unit: "sat", active: true },
        { id: twin, unit: "usd", active: false },
      ],
    })
    await expect(
      createTopUpMint("https://mint.test").activeKeyset("sat"),
    ).rejects.toMatchObject({ name: "TopUpMintError", reason: "keyset-ambiguous" })
    expect(getKeys).not.toHaveBeenCalled()
  })

  it("refuses a keyset id that is neither a v1 nor a v2 id", async () => {
    getKeySets.mockResolvedValue({
      keysets: [{ id: "01abcdef", unit: "sat", active: true }],
    })
    await expect(
      createTopUpMint("https://mint.test").activeKeyset("sat"),
    ).rejects.toBeInstanceOf(TopUpMintError)
  })

  it("answers a v2 keyset's fee for the 8-byte id a card holds, and its full id", async () => {
    getKeySets.mockResolvedValue({
      keysets: [
        // eslint-disable-next-line camelcase
        { id: MACADAMIA, unit: "sat", active: true, input_fee_ppk: 150 },
        // eslint-disable-next-line camelcase
        { id: MINIBITS, unit: "sat", active: true, input_fee_ppk: 0 },
      ],
    })
    const mint = createTopUpMint("https://mint.test")
    await expect(mint.feePpk(MACADAMIA.slice(0, 16))).resolves.toBe(150)
    await expect(mint.resolveCardKeyset(MACADAMIA.slice(0, 16))).resolves.toEqual({
      id: MACADAMIA,
      feePpk: 150,
    })
  })

  it("refuses a card id two of the mint's keysets share, or none", async () => {
    const twin = `${MINIBITS.slice(0, 16)}${"d4".repeat(25)}`
    getKeySets.mockResolvedValue({
      keysets: [
        { id: MINIBITS, unit: "sat", active: true },
        { id: twin, unit: "sat", active: true },
      ],
    })
    const mint = createTopUpMint("https://mint.test")
    await expect(mint.feePpk(MINIBITS.slice(0, 16))).rejects.toMatchObject({
      name: "TopUpMintError",
      reason: "keyset-ambiguous",
    })
    await expect(mint.resolveCardKeyset("00ffffffffffffff")).rejects.toMatchObject({
      name: "TopUpMintError",
      reason: "keyset-unknown",
    })
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
