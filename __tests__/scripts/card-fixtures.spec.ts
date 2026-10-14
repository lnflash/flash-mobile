/**
 * ENG-634, ENG-675: the card fixtures the e2e flows start from, card protocol
 * 2.0, built through the applet's own commands against the fake mint and the
 * fake 2.0 card (`__tests__/helpers/fake-cashu.ts`). The same code provisions
 * cardsim against a local Nutshell in CI (`scripts/e2e/card-fixtures.ts`).
 * These pin:
 *   - each fixture's owner, slot counts, balance, PIN state and limits
 *   - the personalisation order the applet allows (PIN, record, owner last),
 *     and that pieces go on with the owner's grant and the mint's DLEQ
 *   - `spent`: one payment's SIG_ALL signature redeems the spent slots at the
 *     mint, so its NUT-07 answer for them is SPENT and the top-up's reclaim
 *     may free them
 *   - the 0.x PUK and version mask are gone
 *   - the production mint is never a fixture mint
 */
import { CASHU_MINT_URL } from "@app/config/appinfo"
import { buildCardP2PKSecret, randomBytes } from "@app/utils/cashu-card-outputs"
import { getProof, selectApplet, toHex } from "@app/utils/cashu-card"
import { TEST_OWNER_PRIVATE_KEY, ownerPublicKey } from "@app/utils/cashu-card-owner"
import { proofY } from "@app/utils/cashu-card-topup"

import * as fixtures from "../../scripts/e2e/card-fixtures-lib"
import {
  FIXTURE_LIMITS,
  FIXTURE_NAMES,
  FIXTURE_TIP_HEADER,
  FIXTURE_OWNER_KEY,
  FIXTURE_PIN,
  FULL_SLOTS,
  FixtureDeps,
  MISSING_SMALL_AMOUNTS,
  FixtureName,
  PRODUCTION_MINT_HOST,
  SPENT_SLOTS,
  WRONG_PIN,
  exactPieces,
  isFixtureName,
  loadFixture,
  spendExactly,
} from "../../scripts/e2e/card-fixtures-lib"
import { bridgeCard, fixtureHandler } from "../../scripts/e2e/card-fixtures"
import { FakeCard, FakeMint, createFakeCard, createFakeMint } from "../helpers/fake-cashu"

/** A card that `reset` replaces with a brand-new one, same key, as cardsim does. */
const simulator = () => {
  const cardKey = toHex(randomBytes(32))
  const fresh = () => createFakeCard(128, { owner: null, sealed: true, cardKey })
  const sim = { card: fresh() as FakeCard }
  return {
    sim,
    card: {
      reset: async () => {
        sim.card = fresh()
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
const TEST_OWNER_PUB = toHex(ownerPublicKey(TEST_OWNER_PRIVATE_KEY))

describe("card fixtures", () => {
  it("names the 2.0 fixtures: no PUK, no version mask", () => {
    expect(FIXTURE_NAMES).toEqual([
      "fresh",
      "owned",
      "loaded",
      "spent",
      "full",
      "blocked",
      "limited",
      "missing-small",
    ])
    expect(isFixtureName("owned")).toBe(true)
    expect(isFixtureName("loaded-0.4")).toBe(false)
    expect(isFixtureName("other")).toBe(false)
    // The 0.x PUK and the 0.4 mask are gone with 0.x.
    expect(fixtures).not.toHaveProperty("FIXTURE_PUK")
    expect(fixtures).not.toHaveProperty("setPukApdu")
    expect(fixtures).not.toHaveProperty("unblockPinApdu")
    expect(fixtures).not.toHaveProperty("INS_SET_PUK")
    expect(fixtures).not.toHaveProperty("INS_UNBLOCK_PIN")
  })

  it("the owner every fixture but fresh has is the public TEST key the dev bridge hands the app", () => {
    expect(FIXTURE_OWNER_KEY).toBe(TEST_OWNER_PRIVATE_KEY)
  })

  it("fresh: an empty card with no owner, no record and no PIN", async () => {
    const { deps, mint, sim } = setup()
    const summary = await loadFixture("fresh", deps)
    expect(summary).toMatchObject({
      name: "fresh",
      version: "2.0",
      balance: 0,
      pinState: "unset",
      hasOwner: false,
      recordSet: false,
      unspent: 0,
      spent: 0,
      empty: 128,
    })
    expect(sim.card.owner()).toBeUndefined()
    expect(mint.createQuote).not.toHaveBeenCalled()
  })

  it("owned: set up, owner the TEST key, the record the fixture mint, no PIN, nothing on it", async () => {
    const { deps, sim, mint } = setup()
    const summary = await loadFixture("owned", deps)
    expect(summary).toMatchObject({
      hasOwner: true,
      recordSet: true,
      pinState: "unset",
      balance: 0,
    })
    expect(sim.card.owner()).toBe(TEST_OWNER_PUB)
    expect(sim.card.record()).toEqual({ set: true, mint: mint.url })
    // Owner last: SET_CARD before SET_OWNER.
    const ins = sim.card.ins()
    expect(ins.indexOf(0x32)).toBeLessThan(ins.indexOf(0x43))
  })

  it("loaded: 21 sat in three slots, each with the mint's DLEQ, the fixture PIN, owned", async () => {
    const { deps, sim } = setup()
    const summary = await loadFixture("loaded", deps)
    expect(summary).toMatchObject({
      balance: 21,
      pinState: "set",
      hasOwner: true,
      sealed: true,
      unspent: 3,
      spent: 0,
      empty: 125,
    })
    expect(sim.card.pin()).toBe(FIXTURE_PIN)
    expect([...sim.card.dleqs.keys()]).toEqual([0, 1, 2])
    // The pieces were minted to this card's key in format 4: each rebuilds.
    const { transceive } = sim.card
    await selectApplet(transceive)
    const slot = await getProof(transceive, 0)
    expect(buildCardP2PKSecret(slot.nonce, summary.pubkey)).toContain('"SIG_ALL"')
    // Personalisation: the PIN (sealed), the record, the owner; then the grant and the loads.
    expect(
      sim.card.ins().filter((ins) => [0x41, 0x40, 0x32, 0x43, 0x45, 0x30].includes(ins)),
    ).toEqual([0x41, 0x40, 0x32, 0x43, 0x45, 0x30, 0x30, 0x30])
  })

  it("loaded: ends with an unverified session and no grant, as a fresh tap finds the card", async () => {
    const { deps, sim } = setup()
    await loadFixture("loaded", deps)
    expect(sim.card.verified()).toBe(false)
    expect(sim.card.granted()).toBe(false)
  })

  it("spent: slots 1 and 2 spent on the card by one payment and SPENT at the mint, slot 0 untouched", async () => {
    const { deps, sim, mint } = setup()
    const summary = await loadFixture("spent", deps)
    expect(summary).toMatchObject({
      balance: 16,
      pinState: "set",
      unspent: 1,
      spent: 2,
      empty: 125,
    })
    expect(statuses(sim.card).slice(0, 3)).toEqual([1, 2, 2])
    // One payment, one SIG_ALL signature, one swap.
    expect(mint.swap).toHaveBeenCalledTimes(1)
    expect(sim.card.ins().filter((ins) => ins === 0x24)).toHaveLength(1)
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

  it("missing-small: 12 sat as 8 + 4, owned, no PIN: a till offline can take only 4, 8 or 12 exactly (ENG-702)", async () => {
    const { deps, sim } = setup()
    const summary = await loadFixture("missing-small", deps)
    expect(summary).toMatchObject({
      balance: 12,
      pinState: "unset",
      hasOwner: true,
      recordSet: true,
      unspent: 2,
      spent: 0,
    })
    expect(MISSING_SMALL_AMOUNTS).toEqual([8, 4])
    expect(sim.card.dleqs.size).toBe(2)
    await expect(spendExactly(deps, 3)).rejects.toThrow(
      /no pieces on the card pay exactly 3/,
    )
    // Nothing was spent by the refusal.
    expect(statuses(sim.card).slice(0, 2)).toEqual([1, 1])
  })

  it("spendExactly pays exactly the amount from the card with no change, redeemed at the mint", async () => {
    const { deps, sim, mint } = setup()
    await loadFixture("loaded", deps)
    // 21 as 16 + 4 + 1: 5 is the 4 and the 1, under the fixture PIN.
    await expect(spendExactly(deps, 5)).resolves.toEqual({ balance: 16, spent: [4, 1] })
    expect(statuses(sim.card).slice(0, 3)).toEqual([1, 2, 2])
    expect(mint.swap).toHaveBeenCalledTimes(1)
    // No change: the card made none, and no SPEND_ALL_CHANGE went to it.
    expect(sim.card.ins()).not.toContain(0x26)
  })

  it("full: all 128 slots of 1 sat, no PIN", async () => {
    const { deps, sim } = setup()
    const summary = await loadFixture("full", deps)
    expect(summary).toMatchObject({
      balance: FULL_SLOTS,
      pinState: "unset",
      unspent: 128,
      spent: 0,
      empty: 0,
    })
    expect(statuses(sim.card)).toEqual(new Array(128).fill(1))
  })

  it("blocked: loaded, then three wrong PINs block it", async () => {
    const { deps, sim } = setup()
    const summary = await loadFixture("blocked", deps)
    expect(summary).toMatchObject({ balance: 21, pinState: "blocked", unspent: 3 })
    expect(sim.card.triesLeft()).toBe(0)
  })

  it("limited: loaded, with the owner's limits, the budget at 7", async () => {
    const { deps, sim } = setup()
    const summary = await loadFixture("limited", deps)
    expect(summary).toMatchObject({ dailyLimit: 5000, allowance: 250, balance: 21 })
    expect(sim.card.limits()).toEqual(FIXTURE_LIMITS)
  })

  it("starts every fixture from a brand-new card", async () => {
    const { deps, sim } = setup()
    await loadFixture("spent", deps)
    const summary = await loadFixture("fresh", deps)
    expect(summary).toMatchObject({ balance: 0, unspent: 0, spent: 0, pinState: "unset" })
    expect(statuses(sim.card)).toEqual(new Array(128).fill(0))
    expect(sim.card.owner()).toBeUndefined()
  })

  it("stops at a quote the mint never marks paid", async () => {
    const { deps, mint } = setup()
    ;(mint.quoteState as jest.Mock).mockImplementation(async () => "UNPAID")
    await expect(
      loadFixture("loaded", { ...deps, quoteTimeoutMs: -1 } as FixtureDeps),
    ).rejects.toThrow(/not paid/)
  })

  it("stops when the mint does not hold the spent pieces SPENT", async () => {
    const { deps, mint } = setup()
    ;(mint.proofStates as jest.Mock).mockImplementation(async (Ys: string[]) =>
      Ys.map(() => "UNSPENT"),
    )
    await expect(loadFixture("spent", deps)).rejects.toThrow(/UNSPENT/)
  })

  FIXTURE_NAMES.forEach((name: FixtureName) => {
    it(`${name}: the card never refuses a fixture step`, async () => {
      const { deps, sim } = setup()
      await loadFixture(name, deps)
      const answers = await Promise.all(
        sim.card.transceive.mock.results.map((result) => result.value).filter(Boolean),
      )
      const words = answers.map((a: number[]) => toHex(a.slice(-2)))
      // Only the blocking VERIFY_PINs are refused, and only in `blocked`.
      const refused = words.filter((sw) => sw !== "9000")
      expect(refused).toEqual(name === "blocked" ? ["63c2", "63c1", "6983"] : [])
    })
  })
})

describe("exactPieces", () => {
  const pieces = (amounts: number[]) => amounts.map((amount, slot) => ({ slot, amount }))

  it("finds the fewest pieces that add up to the amount", () => {
    expect(exactPieces(pieces([1, 1, 2, 2, 2, 4]), 3)?.map((p) => p.amount)).toEqual([
      1, 2,
    ])
    expect(exactPieces(pieces([8, 4]), 12)?.map((p) => p.amount)).toEqual([8, 4])
  })

  it("finds none where no pieces add up to it", () => {
    expect(exactPieces(pieces([8, 4]), 3)).toBeUndefined()
    expect(exactPieces(pieces([]), 1)).toBeUndefined()
  })
})

describe("fixture constants", () => {
  it("the wrong PIN is not the fixture PIN", () => {
    expect(WRONG_PIN).not.toBe(FIXTURE_PIN)
  })

  it("the limited fixture's limits are on, with the default budget", () => {
    expect(FIXTURE_LIMITS).toEqual({
      day: 5000,
      payment: 1000,
      allowance: 250,
      rollBudget: 7,
    })
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
    reply(200, { hex: "02009000", sw: "9000" })
    await expect(card.transceive([0x00, 0xa4, 0x04, 0x00])).resolves.toEqual([
      0x02, 0x00, 0x90, 0x00,
    ])
    expect(fetchMock.mock.calls.map(([url, init]) => [url, init.method])).toEqual([
      ["http://127.0.0.1:9876/reset", "POST"],
      ["http://127.0.0.1:9876/apdu", "POST"],
    ])
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ hex: "00a40400" })
  })

  it("has no version mask: 2.0 cardsim refuses appletVersion by name", () => {
    expect(bridgeCard("http://127.0.0.1:9876")).not.toHaveProperty("mask")
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

describe("the fixture server", () => {
  type Reply = { status: number; body: unknown }
  const request = (
    handler: ReturnType<typeof fixtureHandler>,
    method: string,
    url: string,
  ): Promise<Reply> =>
    new Promise((resolve) => {
      let status = 0
      let type = ""
      const res = {
        writeHead: (code: number, headers: Record<string, string>) => {
          status = code
          type = headers["content-type"]
        },
        end: (text: string) =>
          resolve({ status, body: type === "text/plain" ? text : JSON.parse(text) }),
      }
      handler(
        { method, url } as Parameters<typeof handler>[0],
        res as unknown as Parameters<typeof handler>[1],
      )
    })
  const health = { bridge: "http://127.0.0.1:9876", mint: "http://127.0.0.1:3338" }
  const errorSpy = jest.spyOn(console, "error")
  beforeEach(() => errorSpy.mockImplementation(() => undefined))
  afterAll(() => errorSpy.mockRestore())

  it("loads a fixture by name", async () => {
    const { deps } = setup()
    const handler = fixtureHandler(deps, health)
    const { status, body } = await request(handler, "POST", "/load/limited")
    expect(status).toBe(200)
    expect(body).toMatchObject({ name: "limited", version: "2.0", dailyLimit: 5000 })
  })

  it("serves the tip header stub the app's dev bridge points at, in Esplora's shape: a real header the card takes", async () => {
    const { deps } = setup()
    const handler = fixtureHandler(deps, health)
    const hash = await request(handler, "GET", "/headers/blocks/tip/hash")
    expect(hash).toEqual({ status: 200, body: FIXTURE_TIP_HEADER.hash })
    const header = await request(
      handler,
      "GET",
      `/headers/block/${FIXTURE_TIP_HEADER.hash}/header`,
    )
    expect(header).toEqual({ status: 200, body: FIXTURE_TIP_HEADER.header })
    // The app's own check takes it: its work, its hash, its time.
    const { checkHeader } = jest.requireActual("@app/utils/cashu-card-headers")
    expect(
      checkHeader(
        (FIXTURE_TIP_HEADER.header.match(/../g) ?? []).map((h) => parseInt(h, 16)),
        FIXTURE_TIP_HEADER.hash,
      ),
    ).toMatchObject({ time: FIXTURE_TIP_HEADER.time })
    const other = await request(
      handler,
      "GET",
      `/headers/block/${"00".repeat(32)}/header`,
    )
    expect(other.status).toBe(404)
  })

  it("pays exactly an amount from the card, and refuses one no pieces add up to with a fixed error", async () => {
    const { deps } = setup()
    const handler = fixtureHandler(deps, health)
    await request(handler, "POST", "/load/missing-small")
    const refused = await request(handler, "POST", "/spend/3")
    expect(refused).toEqual({ status: 500, body: { error: "spend failed", amount: 3 } })
    const paid = await request(handler, "POST", "/spend/4")
    expect(paid).toEqual({ status: 200, body: { balance: 8, spent: [4] } })
  })

  it("answers 404 to a fixture it does not know, the old loaded-0.4 among them, without echoing the name", async () => {
    const { deps } = setup()
    for (const name of ["nothing", "loaded-0.4"]) {
      const { status, body } = await request(
        fixtureHandler(deps, health),
        "POST",
        `/load/${name}`,
      )
      expect(status).toBe(404)
      expect(JSON.stringify(body)).not.toContain(name)
    }
  })

  it("a failed fixture answers a fixed error and logs the detail with a constant format", async () => {
    const { deps, mint } = setup()
    ;(mint.quoteState as jest.Mock).mockRejectedValue(
      new Error("secret detail at /home/runner/stack"),
    )
    const { status, body } = await request(
      fixtureHandler(deps, health),
      "POST",
      "/load/loaded",
    )
    expect(status).toBe(500)
    expect(body).toEqual({ error: "fixture failed", fixture: "loaded" })
    expect(errorSpy).toHaveBeenCalledWith(
      "card-fixtures: %s failed:",
      "loaded",
      expect.any(Error),
    )
  })
})
