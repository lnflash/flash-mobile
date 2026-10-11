/**
 * ENG-634: the card fixtures the e2e flows start from, built through the
 * applet's own commands against the fake mint and an applet 0.6 fake card
 * (`__tests__/helpers/fake-cashu.ts`). The same code provisions cardsim
 * against a local Nutshell in CI (`scripts/e2e/card-fixtures.ts`). These pin:
 *   - each fixture's slot counts, balance and PIN state
 *   - the personalisation order the applet's PIN gate allows (proofs and PUK
 *     before the PIN), so no fixture step is refused on the device
 *   - `spent`: the card's own signature redeems each spent slot at the mint,
 *     so the mint's NUT-07 answer for it is SPENT and the top-up's reclaim
 *     may free it
 *   - the production mint is never a fixture mint
 */
import { CASHU_MINT_URL } from "@app/config/appinfo"
import { buildCardP2PKSecret, randomBytes } from "@app/utils/cashu-card-outputs"
import { getProof, selectApplet, toHex, verifyCardPin } from "@app/utils/cashu-card"
import { proofY } from "@app/utils/cashu-card-topup"

import {
  FIXTURE_NAMES,
  FIXTURE_PIN,
  FIXTURE_PUK,
  FixtureDeps,
  FixtureName,
  PRODUCTION_MINT_HOST,
  SPENT_SLOTS,
  WRONG_PIN,
  isFixtureName,
  loadFixture,
  setPukApdu,
  unblockPinApdu,
} from "../../scripts/e2e/card-fixtures-lib"
import { bridgeCard } from "../../scripts/e2e/card-fixtures"
import { FakeCard, FakeMint, createFakeCard, createFakeMint } from "../helpers/fake-cashu"

/** A card that `reset` replaces with a brand-new one, same key, as cardsim does. */
const simulator = () => {
  const privateKey = randomBytes(32)
  const sim = { card: createFakeCard(32, { applet: { privateKey } }) as FakeCard }
  return {
    sim,
    card: {
      reset: async () => {
        sim.card = createFakeCard(32, { applet: { privateKey } })
      },
      transceive: (apdu: number[]) => sim.card.transceive(apdu),
    },
  }
}

const setup = () => {
  const mint: FakeMint = createFakeMint()
  // FakeWallet settles its own invoices: so does this one, on the first ask.
  ;(mint.quoteState as jest.Mock).mockImplementation(async (id: string) => {
    const quote = mint.quotes.get(id)
    if (!quote) throw new Error(`unknown quote ${id}`)
    if (quote.state === "UNPAID") quote.state = "PAID"
    return quote.state
  })
  const { sim, card } = simulator()
  const deps: FixtureDeps = { card, mint, sleep: async () => undefined }
  return { mint, sim, deps }
}

const statuses = (card: FakeCard) => card.slots.map((slot) => slot[0])

describe("card fixtures", () => {
  it("names five fixtures", () => {
    expect(FIXTURE_NAMES).toEqual(["fresh", "loaded", "spent", "full", "blocked"])
    expect(isFixtureName("loaded")).toBe(true)
    expect(isFixtureName("other")).toBe(false)
  })

  it("fresh: an empty card with no PIN", async () => {
    const { deps, mint } = setup()
    const summary = await loadFixture("fresh", deps)
    expect(summary).toMatchObject({
      name: "fresh",
      balance: 0,
      pinState: "unset",
      unspent: 0,
      spent: 0,
      empty: 32,
    })
    expect(mint.createQuote).not.toHaveBeenCalled()
  })

  it("loaded: 21 sat in three slots, with a PUK and the fixture PIN", async () => {
    const { deps, sim } = setup()
    const summary = await loadFixture("loaded", deps)
    expect(summary).toMatchObject({
      balance: 21,
      pinState: "set",
      unspent: 3,
      spent: 0,
      empty: 29,
    })
    expect(sim.card.pin()).toBe(FIXTURE_PIN)
    // The proofs were minted to this card's key: each slot rebuilds its secret.
    const { transceive } = sim.card
    await selectApplet(transceive)
    const slot = await getProof(transceive, 0)
    expect(buildCardP2PKSecret(slot.nonce, summary.pubkey)).toContain(summary.pubkey)
    // The PUK is set: a second SET_PUK is refused (6A89), even verified.
    await verifyCardPin(transceive, FIXTURE_PIN)
    expect(await transceive(setPukApdu("87654321"))).toEqual([0x6a, 0x89])
  })

  it("loaded: ends with an unverified session, as a fresh tap finds the card", async () => {
    const { deps, sim } = setup()
    await loadFixture("loaded", deps)
    expect(sim.card.verified()).toBe(false)
  })

  it("spent: slots 1 and 2 spent on the card and SPENT at the mint, slot 0 untouched", async () => {
    const { deps, sim, mint } = setup()
    const summary = await loadFixture("spent", deps)
    expect(summary).toMatchObject({
      balance: 16,
      pinState: "set",
      unspent: 1,
      spent: 2,
      empty: 29,
    })
    expect(statuses(sim.card).slice(0, 3)).toEqual([1, 2, 2])
    expect(mint.swap).toHaveBeenCalledTimes(SPENT_SLOTS.length)
    // What the top-up's reclaim asks (reclaimVerdicts): each spent slot's Y.
    const { transceive } = sim.card
    await selectApplet(transceive)
    const verdicts = await Promise.all(
      [0, ...SPENT_SLOTS].map(async (slot) => {
        const proof = await getProof(transceive, slot)
        return mint.proofStatesByY.get(proofY(proof.nonce, summary.pubkey)) ?? "UNSPENT"
      }),
    )
    expect(verdicts).toEqual(["UNSPENT", "SPENT", "SPENT"])
  })

  it("full: 32 slots of 1 sat, no PIN", async () => {
    const { deps, sim } = setup()
    const summary = await loadFixture("full", deps)
    expect(summary).toMatchObject({
      balance: 32,
      pinState: "unset",
      unspent: 32,
      spent: 0,
      empty: 0,
    })
    expect(statuses(sim.card)).toEqual(new Array(32).fill(1))
  })

  it("blocked: loaded, then three wrong PINs block it", async () => {
    const { deps, sim } = setup()
    const summary = await loadFixture("blocked", deps)
    expect(summary).toMatchObject({ balance: 21, pinState: "blocked", unspent: 3 })
    expect(sim.card.triesLeft()).toBe(0)
  })

  it("starts every fixture from a brand-new card", async () => {
    const { deps, sim } = setup()
    await loadFixture("spent", deps)
    const summary = await loadFixture("fresh", deps)
    expect(summary).toMatchObject({ balance: 0, unspent: 0, spent: 0, pinState: "unset" })
    expect(statuses(sim.card)).toEqual(new Array(32).fill(0))
  })

  it("stops at a quote the mint never marks paid", async () => {
    const { deps, mint } = setup()
    ;(mint.quoteState as jest.Mock).mockImplementation(async () => "UNPAID")
    await expect(
      loadFixture("loaded", { ...deps, quoteTimeoutMs: -1 } as FixtureDeps),
    ).rejects.toThrow(/not paid/)
  })

  it("stops when the mint does not hold a redeemed slot SPENT", async () => {
    const { deps, mint } = setup()
    ;(mint.proofStates as jest.Mock).mockImplementation(async (Ys: string[]) =>
      Ys.map(() => "UNSPENT"),
    )
    await expect(loadFixture("spent", deps)).rejects.toThrow(/UNSPENT at the mint/)
  })

  FIXTURE_NAMES.forEach((name: FixtureName) => {
    it(`${name}: the card's PIN gate never refuses a fixture step`, async () => {
      const { deps, sim } = setup()
      await loadFixture(name, deps)
      const refusals = sim.card.transceive.mock.results
        .map((result) => result.value)
        .filter(Boolean)
      const answers = await Promise.all(refusals)
      // 6982 (PIN required) and 6A89 (PUK set) never come back to a fixture.
      expect(answers.map((a: number[]) => toHex(a.slice(-2)))).not.toContain("6982")
      expect(answers.map((a: number[]) => toHex(a.slice(-2)))).not.toContain("6a89")
    })
  })
})

describe("fixture APDUs the app never sends", () => {
  it("SET_PUK is len ‖ PUK", () => {
    expect(setPukApdu(FIXTURE_PUK)).toEqual([
      0xb0, 0x44, 0x00, 0x00, 0x09, 0x08, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38,
    ])
  })

  it("UNBLOCK_PIN is len ‖ PUK ‖ len ‖ new PIN, as the pin-blocked flow sends it", () => {
    expect(toHex(unblockPinApdu(FIXTURE_PUK, FIXTURE_PIN))).toBe(
      "b04500000e0831323334353637380431323334",
    )
  })

  it("the wrong PIN is not the fixture PIN", () => {
    expect(WRONG_PIN).not.toBe(FIXTURE_PIN)
  })
})

describe("the fixture loader's production guard", () => {
  it("names the host CASHU_MINT_URL points at", () => {
    expect(new URL(CASHU_MINT_URL).hostname).toBe(PRODUCTION_MINT_HOST)
  })
})

describe("the fixture loader's cardsim client", () => {
  const fetchMock = jest.fn()
  const realFetch = globalThis.fetch
  beforeEach(() => {
    fetchMock.mockReset()
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })
  afterAll(() => {
    globalThis.fetch = realFetch
  })
  const reply = (status: number, body: unknown) =>
    fetchMock.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
    })

  it("resets with POST /reset and sends each APDU once to POST /apdu", async () => {
    const card = bridgeCard("http://127.0.0.1:9876")
    reply(200, { generation: 1 })
    await card.reset()
    reply(200, { hex: "00069000", sw: "9000" })
    await expect(card.transceive([0x00, 0xa4, 0x04, 0x00])).resolves.toEqual([
      0x00, 0x06, 0x90, 0x00,
    ])
    expect(fetchMock.mock.calls.map(([url, init]) => [url, init.method])).toEqual([
      ["http://127.0.0.1:9876/reset", "POST"],
      ["http://127.0.0.1:9876/apdu", "POST"],
    ])
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ hex: "00a40400" })
  })

  it("throws on a non-2xx or an answer with no status word, and never retries", async () => {
    const card = bridgeCard("http://127.0.0.1:9876")
    reply(409, { error: "LOAD_PROOF", sw: "6982" })
    await expect(card.transceive([0xb0, 0x30, 0, 0])).rejects.toThrow(/409/)
    reply(200, { hex: "90" })
    await expect(card.transceive([0xb0, 0x30, 0, 0])).rejects.toThrow(/status word/)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
