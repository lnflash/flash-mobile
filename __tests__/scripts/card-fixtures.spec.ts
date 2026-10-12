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
  MaskedVersion,
  PRODUCTION_MINT_HOST,
  SPENT_SLOTS,
  WRONG_PIN,
  isFixtureName,
  loadFixture,
  setPukApdu,
  unblockPinApdu,
} from "../../scripts/e2e/card-fixtures-lib"
import { bridgeCard, fixtureHandler } from "../../scripts/e2e/card-fixtures"
import { FakeCard, FakeMint, createFakeCard, createFakeMint } from "../helpers/fake-cashu"

/**
 * cardsim's version mask (VersionMask.java), over the fake card: the
 * instructions the build lacked answer 6D00 (CLA B0 only), and a 9000 SELECT
 * or GET_INFO carries the build's version and capability bits.
 */
const MASKS: Record<MaskedVersion, { minor: number; caps: number; refused: number[] }> = {
  "0.4": { minor: 4, caps: 0x07, refused: [0x43, 0x44, 0x45] },
  "0.5": { minor: 5, caps: 0x0f, refused: [0x44, 0x45] },
}
const masked = async (
  version: MaskedVersion | undefined,
  card: FakeCard,
  apdu: number[],
): Promise<number[]> => {
  const mask = version && MASKS[version]
  if (mask && apdu[0] === 0xb0 && mask.refused.includes(apdu[1])) return [0x6d, 0x00]
  const answer = await card.transceive(apdu)
  if (!mask || toHex(answer.slice(-2)) !== "9000") return answer
  if (apdu[0] === 0x00 && apdu[1] === 0xa4) return [0, mask.minor, 0x90, 0x00]
  if (apdu[0] === 0xb0 && apdu[1] === 0x01) {
    const info = answer.slice(0, 8)
    info[0] = 0
    info[1] = mask.minor
    // eslint-disable-next-line no-bitwise
    info[6] &= mask.caps
    return [...info, 0x90, 0x00]
  }
  return answer
}

/** A card that `reset` replaces with a brand-new one, same key, as cardsim does. */
const simulator = () => {
  const privateKey = randomBytes(32)
  const sim = {
    card: createFakeCard(32, { applet: { privateKey } }) as FakeCard,
    version: undefined as MaskedVersion | undefined,
    /** Every APDU the fixture sent, and whether a mask was on when it did. */
    sent: [] as { apdu: number[]; version: MaskedVersion | undefined }[],
  }
  return {
    sim,
    card: {
      reset: async () => {
        sim.card = createFakeCard(32, { applet: { privateKey } })
        sim.version = undefined
      },
      mask: async (version: MaskedVersion) => {
        sim.version = version
      },
      transceive: (apdu: number[]) => {
        sim.sent.push({ apdu, version: sim.version })
        return masked(sim.version, sim.card, apdu)
      },
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
  it("names six fixtures", () => {
    expect(FIXTURE_NAMES).toEqual([
      "fresh",
      "loaded",
      "spent",
      "full",
      "blocked",
      "loaded-0.4",
    ])
    expect(isFixtureName("loaded")).toBe(true)
    expect(isFixtureName("loaded-0.4")).toBe(true)
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

  it("loaded-0.4: an applet 0.4 card with the loaded proofs and PIN, no PUK and no Remove PIN", async () => {
    const { deps, sim } = setup()
    const summary = await loadFixture("loaded-0.4", deps)
    expect(summary).toMatchObject({
      name: "loaded-0.4",
      version: "0.4",
      clearPin: false,
      balance: 21,
      pinState: "set",
      unspent: 3,
      spent: 0,
      empty: 29,
    })
    expect(sim.card.pin()).toBe(FIXTURE_PIN)
    // Masked before its first APDU: every one of them saw the 0.4 build.
    expect(sim.sent.length).toBeGreaterThan(0)
    expect(sim.sent.every(({ version }) => version === "0.4")).toBe(true)
    // No SET_PUK was sent (a 0.4 card answers it 6D00), and none reached the card.
    expect(sim.sent.map(({ apdu }) => apdu[1])).not.toContain(0x44)
    expect(sim.card.ins()).not.toContain(0x44)
    // The card the app taps refuses CLEAR_PIN as a 0.4 build does.
    const { transceive } = deps.card
    await selectApplet(transceive)
    await verifyCardPin(transceive, FIXTURE_PIN)
    expect(
      await transceive([0xb0, 0x43, 0x00, 0x00, 0x05, 0x04, 0x31, 0x32, 0x33, 0x34]),
    ).toEqual([0x6d, 0x00])
  })

  it("a fixture after loaded-0.4 is the real build again: reset drops the mask", async () => {
    const { deps } = setup()
    await loadFixture("loaded-0.4", deps)
    const summary = await loadFixture("loaded", deps)
    expect(summary).toMatchObject({ version: "0.6", clearPin: true })
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
      // Nor 6D00: no fixture sends an instruction its build lacks.
      expect(answers.map((a: number[]) => toHex(a.slice(-2)))).not.toContain("6d00")
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

  it("masks the card's version with POST /fixture carrying only appletVersion", async () => {
    const card = bridgeCard("http://127.0.0.1:9876")
    reply(200, { appletVersion: "0.4" })
    await card.mask("0.4")
    expect(fetchMock.mock.calls.map(([url, init]) => [url, init.method])).toEqual([
      ["http://127.0.0.1:9876/fixture", "POST"],
    ])
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ appletVersion: "0.4" })
    reply(400, { error: "appletVersion 0.9 is not one of [0.4, 0.5, 0.6]" })
    await expect(card.mask("0.5")).rejects.toThrow(/400/)
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
      const res = {
        writeHead: (code: number) => {
          status = code
        },
        end: (text: string) => resolve({ status, body: JSON.parse(text) }),
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

  it("loads a fixture by name, loaded-0.4 included", async () => {
    const { deps } = setup()
    const handler = fixtureHandler(deps, health)
    const { status, body } = await request(handler, "POST", "/load/loaded-0.4")
    expect(status).toBe(200)
    expect(body).toMatchObject({ name: "loaded-0.4", version: "0.4", clearPin: false })
  })

  it("answers 404 to a fixture it does not know, without echoing the name", async () => {
    const { deps } = setup()
    const { status, body } = await request(
      fixtureHandler(deps, health),
      "POST",
      "/load/nothing",
    )
    expect(status).toBe(404)
    expect(JSON.stringify(body)).not.toContain("nothing")
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
