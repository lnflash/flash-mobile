/**
 * ENG-787: a card at a mint of its own, against the real applet (cardsim) and
 * two real mints (Nutshell on FakeWallet): A, the app's card mint (the dev
 * bridge's, standing in for forge), and B, a second mint the card is set up
 * for. Everything the card does is done at B, through the app's own client
 * for B (`topUpMint`, `mintOfCard`): its record, its units, its top-up, its
 * tidy and its reclaim. Not one request reaches A.
 *
 * Opt-in: runs only with CARDSIM_URL, CARD_MINT_URL, CARD_MINT_B_URL and
 * CARD_FIXTURES_URL set (the iOS e2e workflow sets them, with the fixture
 * server's `--mint-b`), and is skipped in the unit suite. Each leg of the
 * workflow's matrix runs it, the 100 ppk leg included.
 */
import axios from "axios"

import { bridgeTransceiver, setCardBridge } from "@app/utils/cashu-card-bridge"
import { getInfo, readCashuCard, selectApplet } from "@app/utils/cashu-card"
import { allowLoad, ownerSigner } from "@app/utils/cashu-card-owner"
import { setUpCard } from "@app/utils/cashu-card-owner-store"
import {
  TopUpDeps,
  createTopUpStore,
  loadTopUp,
  mintKey,
  mintTopUp,
  payTopUp,
  prepareTopUp,
  reclaimPlan,
  reclaimSpentSlots,
  reclaimVerdicts,
  runTidy,
  tidyKeyset,
} from "@app/utils/cashu-card-topup"
import { mintOfCard, topUpMint } from "@app/utils/cashu-card-topup/connected"
import { totalsByUnit, unitsForKeysets } from "@app/utils/cashu-mint"

import { FIXTURE_OWNER_KEY } from "../../scripts/e2e/card-fixtures-lib"

const { CARDSIM_URL, CARD_MINT_URL, CARD_MINT_B_URL, CARD_FIXTURES_URL } = process.env
const describeWithTwoMints =
  CARDSIM_URL && CARD_MINT_URL && CARD_MINT_B_URL && CARD_FIXTURES_URL
    ? describe
    : describe.skip

/** Loads a fixture, provisioned at mint B (`--mint-b`) unless `atA`. */
const loadFixture = async (name: string, { atA = false } = {}) => {
  const response = await fetch(
    `${CARD_FIXTURES_URL}${atA ? "" : "/mint-b"}/load/${name}`,
    { method: "POST" },
  )
  expect(response.ok).toBe(true)
  return response.json()
}

describeWithTwoMints(
  "a card at a mint of its own (cardsim, two FakeWallet mints)",
  () => {
    jest.setTimeout(180_000)

    const bridge = CARDSIM_URL as string
    const mintA = CARD_MINT_URL as string
    const mintB = CARD_MINT_B_URL as string

    // Every URL this process asks, by fetch (cashu-ts, the bridge) or axios
    // (the keyset units): none may be mint A's.
    const asked: string[] = []
    const realFetch = globalThis.fetch
    let axiosGet: jest.SpyInstance
    const atA = () => asked.filter((url) => mintKey(url).startsWith(mintKey(mintA)))

    beforeAll(() => {
      globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        asked.push(
          typeof input === "string" ? input : String((input as Request).url ?? input),
        )
        return realFetch(input, init)
      }) as typeof fetch
      const realGet = axios.get.bind(axios)
      axiosGet = jest.spyOn(axios, "get").mockImplementation((url, config) => {
        asked.push(String(url))
        return realGet(url, config)
      })
    })

    afterAll(() => {
      globalThis.fetch = realFetch
      axiosGet.mockRestore()
      setCardBridge(undefined)
    })

    beforeEach(() => {
      // The app's card mint is A, as forge is in a release build.
      setCardBridge({ url: bridge, mintUrl: mintA })
    })

    it("sets a fresh card up at B, names its units at B, and tops it up at B: nothing reaches A", async () => {
      await loadFixture("fresh", { atA: true })
      asked.length = 0
      const transceive = bridgeTransceiver(bridge)
      const fresh = await readCashuCard(transceive)
      if (!fresh) throw new Error("the fresh fixture did not read")
      // Never set up: the card goes by the app's mint until its record names one.
      expect(mintOfCard(fresh.record)).toBe(mintA)

      await selectApplet(transceive)
      await setUpCard(
        transceive,
        {
          cardPubkey: fresh.pubkey,
          info: fresh,
          mint: mintB,
          key: { privateKey: FIXTURE_OWNER_KEY, source: "dev", saved: false },
        },
        async () => undefined,
      )
      const card = await readCashuCard(transceive)
      if (!card) throw new Error("the card did not read after setup")
      expect(card.record.mint).toBe(mintB)
      const mint = mintOfCard(card.record)
      expect(mint).toBe(mintB)

      let ids = 0
      const deps: TopUpDeps = {
        mint: topUpMint(mint),
        store: createTopUpStore(),
        now: Date.now,
        newId: () => `mint-b-${Date.now()}-${(ids += 1)}`,
        // FakeWallet marks its own quotes paid: nothing is paid for real.
        pay: async () => ({ kind: "paid" }),
      }
      const record = await prepareTopUp(deps, {
        cardPubkey: card.pubkey,
        unit: "sat",
        amount: 100,
        walletId: "stubbed",
        card: {
          hasOwner: true,
          empty: card.empty,
          reclaimable: 0,
          pieces: card.pieces,
        },
      })
      expect(record.mintUrl).toBe(mintB)
      expect((await payTopUp(deps, record.id)).result).toMatchObject({ status: "paid" })
      let minted = await mintTopUp(deps, record.id)
      for (let i = 0; minted.status !== "minted" && i < 20; i += 1) {
        await new Promise((resolve) => {
          setTimeout(resolve, 500)
        })
        minted = await mintTopUp(deps, record.id)
      }
      expect(minted.status).toBe("minted")

      await selectApplet(transceive)
      await allowLoad(transceive, ownerSigner(FIXTURE_OWNER_KEY))
      const loaded = await loadTopUp(deps, { id: record.id, transceive, card })
      expect(loaded.state).toBe("loaded")

      const after = await readCashuCard(transceive)
      if (!after?.keysets) throw new Error("the card did not read after the top-up")
      expect(after.balance).toBe(100)
      const units = await unitsForKeysets(
        after.keysets.map((k) => k.keysetId),
        mintOfCard(after.record),
      )
      expect(totalsByUnit(after.keysets, units)).toEqual({
        byUnit: [{ unit: "sat", amount: 100 }],
        unknown: 0,
      })

      expect(asked.some((url) => mintKey(url).startsWith(mintKey(mintB)))).toBe(true)
      expect(atA()).toEqual([])
    })

    it("tidies a card at B, and reclaims its spent slots at B: nothing reaches A", async () => {
      await loadFixture("missing-small")
      asked.length = 0
      const transceive = bridgeTransceiver(bridge)
      const card = await readCashuCard(transceive)
      if (!card?.unspentSlots) throw new Error("the missing-small fixture did not read")
      const mint = topUpMint(mintOfCard(card.record))
      expect(mint.url).toBe(mintB)

      const { id: keysetId, feePpk } = await mint.resolveCardKeyset(
        tidyKeyset(card.unspentSlots) as string,
      )
      let ids = 0
      await selectApplet(transceive)
      const result = await runTidy(
        {
          mint,
          store: createTopUpStore(),
          now: Date.now,
          newId: () => `mint-b-tidy-${(ids += 1)}`,
        },
        {
          transceive,
          card: { pubkey: card.pubkey, maxSlots: card.maxSlots },
          keysetId,
          feePpk,
          openForLoading: (t) => allowLoad(t, ownerSigner(FIXTURE_OWNER_KEY)),
          verdicts: new Map(),
        },
      )
      if (feePpk > 0) {
        // The fee leg: one input costs a whole sat, as much as the 1s the
        // card lacks, so no tidy is made (as at A).
        expect(result).toEqual({ status: "skipped", reason: "fee" })
      } else {
        expect(result.status).toBe("tidied")
        if (result.status === "tidied") expect(result.record.mintUrl).toBe(mintB)
      }

      // A till pays 4 at B, offline: the 4 is spent on the card, SPENT at B.
      const paid = await fetch(`${CARD_FIXTURES_URL}/mint-b/spend/4`, { method: "POST" })
      expect(paid.status).toBe(200)
      asked.length = 0
      const spent = await readCashuCard(transceive)
      if (!spent?.spentSlots?.length) throw new Error("the payment left no spent slot")
      const deps = { mint, store: createTopUpStore(), now: Date.now }
      const verdicts = await reclaimVerdicts(deps, spent.pubkey, spent.spentSlots)
      const plan = reclaimPlan(spent.spentSlots, verdicts, {
        mintUrl: mint.url,
        cardPubkey: spent.pubkey,
      })
      expect(plan.reclaimable).toBe(spent.spentSlots.length)
      await selectApplet(transceive)
      await allowLoad(transceive, ownerSigner(FIXTURE_OWNER_KEY))
      const reclaim = await reclaimSpentSlots(transceive, {
        mintUrl: mint.url,
        cardPubkey: spent.pubkey,
        maxSlots: spent.maxSlots,
        verdicts,
      })
      expect(reclaim.cleared).toBe(spent.spentSlots.length)
      await selectApplet(transceive)
      expect((await getInfo(transceive)).spent).toBe(0)

      expect(atA()).toEqual([])
    })
  },
)
