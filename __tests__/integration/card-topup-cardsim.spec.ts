/**
 * ENG-634, ENG-675: the card layer and the top-up engine against the real
 * 2.0 applet (cardsim, at the ref the e2e workflow pins) and a real mint
 * (Nutshell 0.20.3 on FakeWallet), below the UI. Opt-in: runs only with
 * CARDSIM_URL, CARD_MINT_URL and CARD_FIXTURES_URL set (the iOS e2e workflow
 * sets them; see .maestro/flashcard/README.md), and is skipped in the unit
 * suite. It needs no wallet: the dev pay stub stands in for the payment, as in
 * the e2e flows.
 *
 * The `spent` fixture's two settled slots are freed on the load tap
 * (CLEAR_SPENT after the mint's NUT-07 SPENT), and 100 sat loads beside the
 * 16 already on the card under the owner's grant, each piece with its DLEQ.
 * Then one of the new pieces is paid out with the card's one SIG_ALL
 * signature and the mint takes it: a format-4 piece the app loaded is one
 * the mint accepts.
 */
import {
  bridgeTransceiver,
  setCardBridge,
  stubbedPayOutcome,
} from "@app/utils/cashu-card-bridge"
import {
  CardError,
  getProof,
  readCashuCard,
  selectApplet,
  verifyCardPin,
} from "@app/utils/cashu-card"
import {
  feedHeader,
  refreshTipHeader,
  resetKeptHeader,
} from "@app/utils/cashu-card-headers"
import {
  allowLoad,
  changePinAsOwner,
  ownerSigner,
  refreshCard,
  setLimits,
} from "@app/utils/cashu-card-owner"
import { setUpCard } from "@app/utils/cashu-card-owner-store"
import { buildCardP2PKSecret } from "@app/utils/cashu-card-outputs"
import {
  TopUpDeps,
  TopUpError,
  createTopUpMint,
  createTopUpStore,
  loadTopUp,
  mintTopUp,
  payTopUp,
  prepareTopUp,
  proofY,
  reclaimPlan,
  reclaimSpentSlots,
  reclaimVerdicts,
} from "@app/utils/cashu-card-topup"

import {
  FIXTURE_OWNER_KEY,
  FIXTURE_PIN,
  spendAndRedeem,
} from "../../scripts/e2e/card-fixtures-lib"
import { fixtureMint } from "../../scripts/e2e/card-fixtures"
import { HEADER_VECTORS, esploraFetch, headerBytes } from "../helpers/block-headers"

const { CARDSIM_URL, CARD_MINT_URL, CARD_FIXTURES_URL } = process.env
const describeWithCardsim =
  CARDSIM_URL && CARD_MINT_URL && CARD_FIXTURES_URL ? describe : describe.skip

const loadFixture = async (name: string) => {
  const response = await fetch(`${CARD_FIXTURES_URL}/load/${name}`, { method: "POST" })
  expect(response.ok).toBe(true)
  return response.json()
}

const engineDeps = (mintUrl: string): TopUpDeps => {
  let ids = 0
  return {
    mint: createTopUpMint(mintUrl),
    store: createTopUpStore(),
    now: Date.now,
    newId: () => `cardsim-${Date.now()}-${(ids += 1)}`,
    pay: async () => stubbedPayOutcome(mintUrl) ?? { kind: "unknown" },
  }
}

describeWithCardsim("the 2.0 card against cardsim and a FakeWallet mint", () => {
  jest.setTimeout(180_000)

  const bridge = CARDSIM_URL as string
  const mintUrl = CARD_MINT_URL as string

  afterAll(() => setCardBridge(undefined))

  it("reclaims the settled spent slots and loads the top-up under the owner's grant, and the mint takes a loaded piece", async () => {
    await loadFixture("spent")
    setCardBridge({ url: bridge, mintUrl, stubPay: true })

    const transceive = bridgeTransceiver(bridge)
    const card = await readCashuCard(transceive)
    if (!card?.spentSlots) throw new Error("the spent fixture did not read")
    expect(card.version).toBe("2.0")
    expect(card.hasOwner).toBe(true)
    expect(card.sealed).toBe(true)
    expect(card.record.mint).toBe(mintUrl)
    expect(card.balance).toBe(16)
    expect(card.spentSlots).toHaveLength(2)

    const deps = engineDeps(mintUrl)
    const verdicts = await reclaimVerdicts(deps, card.pubkey, card.spentSlots)
    const plan = reclaimPlan(card.spentSlots, verdicts)
    expect(plan).toEqual({ reclaimable: 2, settling: 0 })

    const record = await prepareTopUp(deps, {
      cardPubkey: card.pubkey,
      unit: "sat",
      amount: 100,
      walletId: "stubbed",
      card: {
        hasOwner: true,
        empty: card.empty,
        unit: "sat",
        reclaimable: plan.reclaimable,
      },
    })
    expect((await payTopUp(deps, record.id)).result).toMatchObject({ status: "paid" })
    let minted = await mintTopUp(deps, record.id)
    for (let i = 0; minted.status !== "minted" && i < 20; i += 1) {
      await new Promise((resolve) => {
        setTimeout(resolve, 500)
      })
      minted = await mintTopUp(deps, record.id)
    }
    expect(minted.status).toBe("minted")

    // The load tap: a new session, the owner's grant (no PIN), the reclaim, the load.
    await selectApplet(transceive)
    await allowLoad(transceive, ownerSigner(FIXTURE_OWNER_KEY))
    const reclaim = await reclaimSpentSlots(transceive, {
      maxSlots: card.maxSlots,
      verdicts,
    })
    expect(reclaim.cleared).toBe(2)
    const loaded = await loadTopUp(deps, {
      id: record.id,
      transceive,
      card,
      inventory: reclaim.inventory,
    })
    expect(loaded.state).toBe("loaded")

    const state = await (await fetch(`${bridge}/state`)).json()
    expect(state.balance).toBe(116)
    expect(state.counts.spent).toBe(0)
    // Every piece the top-up put on the card kept the mint's DLEQ proof beside it.
    const nonces = new Set((loaded.proofs ?? []).map((proof) => proof.nonce))
    const placed = state.slots.filter((slot: { nonce?: string }) =>
      nonces.has(slot.nonce ?? ""),
    )
    expect(placed).toHaveLength(loaded.proofs?.length ?? -1)
    placed.forEach((slot: { dleq?: unknown }) => expect(slot.dleq).toBeDefined())

    // The top-up's 4-sat piece, paid out with one SIG_ALL signature: the mint takes it.
    const piece = (loaded.proofs ?? []).find((proof) => proof.amount === 4)
    if (!piece) throw new Error("the top-up has no 4-sat piece")
    const slot = state.slots.find((s: { nonce?: string }) => s.nonce === piece.nonce).slot
    const onCard = await getProof(transceive, slot)
    expect(onCard.date).toBe(0)
    await selectApplet(transceive)
    await verifyCardPin(transceive, FIXTURE_PIN, {
      sealed: true,
      cardPubkey: card.pubkey,
    })
    const keyset = await deps.mint.keyset(record.keysetId)
    await spendAndRedeem(
      { card: { reset: async () => undefined, transceive }, mint: fixtureMint(mintUrl) },
      transceive,
      {
        slots: [slot],
        proofs: [
          {
            id: keyset.id,
            amount: piece.amount,
            secret: buildCardP2PKSecret(piece.nonce, card.pubkey),
            C: piece.C,
          } as never,
        ],
      },
    )
    const [after] = await deps.mint.proofStates([proofY(piece.nonce, card.pubkey)])
    expect(after).toBe("SPENT")
  })

  it("refuses a top-up for a card with no owner before anything is quoted", async () => {
    await loadFixture("fresh")
    setCardBridge({ url: bridge, mintUrl, stubPay: true })
    const card = await readCashuCard(bridgeTransceiver(bridge))
    if (!card) throw new Error("the fresh fixture did not read")
    expect(card.hasOwner).toBe(false)
    const deps = engineDeps(mintUrl)
    const quote = jest.spyOn(deps.mint, "createQuote")
    await expect(
      prepareTopUp(deps, {
        cardPubkey: card.pubkey,
        unit: "sat",
        amount: 8,
        walletId: "stubbed",
        card: { hasOwner: card.hasOwner, empty: card.empty },
      }),
    ).rejects.toMatchObject({ reason: "owner-unset" })
    expect(quote).not.toHaveBeenCalled()
    expect(TopUpError).toBeDefined()
  })

  it("sets a fresh card up in one tap, owner last, with the PIN sealed and the tip as the clock's anchor", async () => {
    await loadFixture("fresh")
    const transceive = bridgeTransceiver(bridge)
    const card = await readCashuCard(transceive)
    if (!card) throw new Error("the fresh fixture did not read")
    const anchor = HEADER_VECTORS[2]
    const order: string[] = []
    await selectApplet(transceive)
    await setUpCard(
      transceive,
      {
        cardPubkey: card.pubkey,
        info: card,
        pin: "2468",
        mint: mintUrl,
        anchor: headerBytes(anchor),
        key: { privateKey: FIXTURE_OWNER_KEY, source: "dev", saved: false },
      },
      async () => {
        // The key is saved before SET_OWNER: the card has no owner yet.
        const now = await (await fetch(`${bridge}/state`)).json()
        order.push(now.hasOwner ? "saved after the owner" : "saved before the owner")
      },
    )
    expect(order).toEqual(["saved before the owner"])
    const state = await (await fetch(`${bridge}/state`)).json()
    expect(state).toMatchObject({
      hasOwner: true,
      recordSet: true,
      mint: mintUrl,
      pinState: 1,
      now: anchor.time,
      rolls: 0,
    })
    // The sealed PIN took: the card verifies it, sealed, in a new tap; and
    // the owner is the key this phone set, which the card grants a load to.
    await selectApplet(transceive)
    await verifyCardPin(transceive, "2468", { sealed: true, cardPubkey: card.pubkey })
    await allowLoad(transceive, ownerSigner(FIXTURE_OWNER_KEY))
  })

  it("feeds the card's clock a real header, and the owner's REFRESH takes the next", async () => {
    await loadFixture("owned")
    resetKeptHeader()
    const transceive = bridgeTransceiver(bridge)
    const [older, newer] = HEADER_VECTORS
    await refreshTipHeader({ fetcher: esploraFetch(older) as never, now: () => 0 })
    await selectApplet(transceive)
    const report = await feedHeader(transceive, 0)
    expect(report).toMatchObject({ told: true, sent: true, now: older.time })

    const now = await refreshCard(
      transceive,
      ownerSigner(FIXTURE_OWNER_KEY),
      headerBytes(newer),
    )
    expect(now).toBe(newer.time)
    const state = await (await fetch(`${bridge}/state`)).json()
    expect(state.now).toBe(newer.time)
    expect(state.rolls).toBe(0)
  })

  it("the owner's sealed CHANGE_PIN unblocks a blocked PIN, and SET_LIMIT keeps the budget the owner chose", async () => {
    await loadFixture("blocked")
    const transceive = bridgeTransceiver(bridge)
    const card = await readCashuCard(transceive)
    expect(card?.pinState).toBe("blocked")
    await selectApplet(transceive)
    await changePinAsOwner(transceive, "8642", {
      sealed: true,
      cardPubkey: card?.pubkey as string,
      sign: ownerSigner(FIXTURE_OWNER_KEY),
    })
    await setLimits(transceive, ownerSigner(FIXTURE_OWNER_KEY), {
      day: 3000,
      payment: 0,
      allowance: 100,
      rollBudget: 12,
    })
    const state = await (await fetch(`${bridge}/state`)).json()
    expect(state).toMatchObject({
      pinState: 1,
      tries: 3,
      dailyLimit: 3000,
      allowance: 100,
      rollBudget: 12,
    })
    await selectApplet(transceive)
    await verifyCardPin(transceive, "8642", {
      sealed: true,
      cardPubkey: card?.pubkey as string,
    })
  })

  it("a phone that is not the owner is refused the grant (6A91), and nothing changes", async () => {
    await loadFixture("owned")
    const transceive = bridgeTransceiver(bridge)
    await selectApplet(transceive)
    await expect(
      allowLoad(transceive, ownerSigner("11".repeat(32))),
    ).rejects.toMatchObject({
      sw: 0x6a91,
    })
    expect(CardError).toBeDefined()
  })
})
