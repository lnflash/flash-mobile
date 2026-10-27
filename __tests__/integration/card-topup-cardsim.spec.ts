/**
 * ENG-634, ENG-675: the card layer and the top-up engine against the real
 * 2.1 applet (cardsim, at the ref the e2e workflow pins) and a real mint
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
 *
 * ENG-700: the 100 fills the gaps around the 16, so the whole card is the
 * covering shape of 116; and a 1,000,000-sat top-up, the largest, is one
 * NUT-04 mint and one NUT-09 restore of 31 outputs and 31 LOAD_PROOFs. The
 * APDUs each load tap sends are logged, for the tap-cost figures.
 */
import { Amount } from "@cashu/cashu-ts"

import {
  bridgeTransceiver,
  setCardBridge,
  stubbedPayOutcome,
} from "@app/utils/cashu-card-bridge"
import {
  CardError,
  Transceiver,
  getInfo,
  getProof,
  readCashuCard,
  selectApplet,
  setHeader,
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
import { coversEveryAmount, targetPieces } from "@app/utils/cashu-card-shape"
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
  TidyDeps,
  runTidy,
  tidyKeyset,
} from "@app/utils/cashu-card-topup"
import { CardSpendError } from "@app/utils/cashu-card-spend"

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

/** A transceiver that counts the APDUs it sends, by INS. */
const counting = (transceive: Transceiver) => {
  const byIns = new Map<number, number>()
  const counted: Transceiver = (apdu) => {
    byIns.set(apdu[1], (byIns.get(apdu[1]) ?? 0) + 1)
    return transceive(apdu)
  }
  return {
    transceive: counted,
    count: (ins: number) => byIns.get(ins) ?? 0,
    total: () => [...byIns.values()].reduce((a, b) => a + b, 0),
  }
}
const INS_LOAD_PROOF = 0x30
const INS_GET_PIECES = 0x17

/** The unspent pieces' amounts in cardsim's GET /state, sorted ascending. */
const unspentAmounts = (state: { slots: { status: string; amount?: number }[] }) =>
  state.slots
    .filter((slot) => slot.status === "unspent")
    .map((slot) => slot.amount as number)
    .sort((a, b) => a - b)

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

describeWithCardsim("the 2.1 card against cardsim and a FakeWallet mint", () => {
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
    expect(card.version).toBe("2.1")
    expect(card.hasOwner).toBe(true)
    expect(card.sealed).toBe(true)
    expect(card.record.mint).toBe(mintUrl)
    expect(card.balance).toBe(16)
    expect(card.spentSlots).toHaveLength(2)
    expect(card.pieces).toEqual([16])

    const deps = engineDeps(mintUrl)
    const verdicts = await reclaimVerdicts(deps, card.pubkey, card.spentSlots)
    const plan = reclaimPlan(card.spentSlots, verdicts, {
      mintUrl,
      cardPubkey: card.pubkey,
    })
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
        pieces: card.pieces,
      },
    })
    // The pieces the 16 lacks of the covering shape of 116: 100 in twelve.
    expect([16, ...record.outputs.map((o) => o.amount)].sort((a, b) => a - b)).toEqual(
      targetPieces(116),
    )
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
    const tap = counting(transceive)
    await selectApplet(tap.transceive)
    await allowLoad(tap.transceive, ownerSigner(FIXTURE_OWNER_KEY))
    const reclaim = await reclaimSpentSlots(tap.transceive, {
      mintUrl,
      cardPubkey: card.pubkey,
      maxSlots: card.maxSlots,
      verdicts,
    })
    expect(reclaim.cleared).toBe(2)
    const loaded = await loadTopUp(deps, {
      id: record.id,
      transceive: tap.transceive,
      card,
      inventory: reclaim.inventory,
    })
    expect(loaded.state).toBe("loaded")
    expect(tap.count(INS_LOAD_PROOF)).toBe(record.outputs.length)
    console.log(
      `ENG-700 tap cost, 100 sat beside a 16: ${tap.count(
        INS_LOAD_PROOF,
      )} LOAD_PROOF, ${tap.total()} APDUs in the load tap`,
    )

    const state = await (await fetch(`${bridge}/state`)).json()
    expect(state.balance).toBe(116)
    expect(state.counts.spent).toBe(0)
    // The whole card is the covering shape: every amount 1..116 pays exactly.
    expect(unspentAmounts(state)).toEqual(targetPieces(116))
    expect(coversEveryAmount(unspentAmounts(state))).toBe(true)
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

  it("tops up 1,000,000 sat as 31 outputs: one NUT-04 mint, one NUT-09 restore and 31 LOAD_PROOFs (ENG-700)", async () => {
    await loadFixture("owned")
    setCardBridge({ url: bridge, mintUrl, stubPay: true })
    const transceive = bridgeTransceiver(bridge)
    const card = await readCashuCard(transceive)
    if (!card) throw new Error("the owned fixture did not read")
    expect(card.pieces).toEqual([])

    const deps = engineDeps(mintUrl)
    const mintCall = jest.spyOn(deps.mint, "mint")
    const record = await prepareTopUp(deps, {
      cardPubkey: card.pubkey,
      unit: "sat",
      amount: 1_000_000,
      walletId: "stubbed",
      card: { hasOwner: true, empty: card.empty, pieces: card.pieces },
    })
    expect(record.outputs.map((o) => o.amount).sort((a, b) => a - b)).toEqual(
      targetPieces(1_000_000),
    )
    expect(record.outputs).toHaveLength(31)

    expect((await payTopUp(deps, record.id)).result).toMatchObject({ status: "paid" })
    let minted = await mintTopUp(deps, record.id)
    for (let i = 0; minted.status !== "minted" && i < 20; i += 1) {
      await new Promise((resolve) => {
        setTimeout(resolve, 500)
      })
      minted = await mintTopUp(deps, record.id)
    }
    expect(minted.status).toBe("minted")
    // One NUT-04 request carried all 31 outputs.
    expect(mintCall).toHaveBeenCalledTimes(1)
    expect(mintCall.mock.calls[0][0].outputs).toHaveLength(31)
    expect(minted.record.proofs).toHaveLength(31)

    // One NUT-09 restore request of the same 31 outputs: the mint signed them all.
    const restored = await deps.mint.restore(
      record.outputs.map((o) => ({
        id: record.keysetId,
        amount: Amount.from(o.amount),
        B_: o.B_,
      })),
    )
    expect(restored.outputs).toHaveLength(31)
    expect(restored.signatures).toHaveLength(31)

    const tap = counting(transceive)
    await selectApplet(tap.transceive)
    await allowLoad(tap.transceive, ownerSigner(FIXTURE_OWNER_KEY))
    const loaded = await loadTopUp(deps, {
      id: record.id,
      transceive: tap.transceive,
      card,
    })
    expect(loaded.state).toBe("loaded")
    expect(tap.count(INS_LOAD_PROOF)).toBe(31)
    console.log(
      `ENG-700 tap cost, 1,000,000 sat on an empty card: ${tap.count(
        INS_LOAD_PROOF,
      )} LOAD_PROOF, ${tap.total()} APDUs in the load tap`,
    )

    const state = await (await fetch(`${bridge}/state`)).json()
    expect(state.balance).toBe(1_000_000)
    expect(unspentAmounts(state)).toEqual(targetPieces(1_000_000))
    expect(coversEveryAmount(unspentAmounts(state))).toBe(true)

    // Reading the shaped card back: GET_PIECES, three pieces to a page.
    const reader = counting(transceive)
    const reread = await readCashuCard(reader.transceive)
    expect(reread?.pieces?.slice().sort((a, b) => a - b)).toEqual(targetPieces(1_000_000))
    console.log(
      `ENG-700 read cost, 31 pieces: ${reader.count(
        INS_GET_PIECES,
      )} GET_PIECES pages, ${reader.total()} APDUs in the read tap`,
    )
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

  it("tidies a card short of small pieces in one owner's tap: the card's own change, its witness taken, only the fee counted (ENG-702)", async () => {
    await loadFixture("missing-small")
    const transceive = bridgeTransceiver(bridge)
    // A daily limit, and a clock, so the card counts what leaves it.
    await selectApplet(transceive)
    await setHeader(transceive, headerBytes(HEADER_VECTORS[2]))
    await setLimits(transceive, ownerSigner(FIXTURE_OWNER_KEY), {
      day: 5000,
      payment: 0,
      allowance: 0,
      rollBudget: 7,
    })
    const card = await readCashuCard(transceive)
    if (!card?.unspentSlots) throw new Error("the missing-small fixture did not read")
    expect([...(card.pieces ?? [])].sort((a, b) => a - b)).toEqual([4, 8])
    // A till offline cannot take 3 exactly from 8 + 4.
    const refused = await fetch(`${CARD_FIXTURES_URL}/spend/3`, { method: "POST" })
    expect(refused.status).toBe(500)

    const mint = createTopUpMint(mintUrl)
    const keysetId = tidyKeyset(card.unspentSlots) as string
    const feePpk = await mint.feePpk(keysetId)
    const spentBefore = card.spentToday
    let ids = 0
    const tap = counting(transceive)
    await selectApplet(tap.transceive)
    const result = await runTidy(
      {
        mint,
        store: createTopUpStore(),
        now: Date.now,
        newId: () => `tidy-${(ids += 1)}`,
      },
      {
        transceive: tap.transceive,
        card: { pubkey: card.pubkey, maxSlots: card.maxSlots },
        keysetId,
        feePpk,
        openForLoading: (t) => allowLoad(t, ownerSigner(FIXTURE_OWNER_KEY)),
        verdicts: new Map(),
      },
    )
    if (result.status !== "tidied") throw new Error(`the tidy ended ${result.status}`)
    // The 8 alone, as 2 + 2 + 2 + 1 + 1 beside the 4. Every output was the
    // card's own change: no SPEND_ALL_OUTPUTS, and SIGN took a payment with none.
    expect(result.record.inputs.map((input) => input.amount)).toEqual([8])
    expect(tap.count(0x23)).toBe(0)
    expect(tap.count(0x26)).toBe(5)
    console.log(`ENG-702 tidy tap cost: ${tap.total()} APDUs, swap included`)

    const state = await (await fetch(`${bridge}/state`)).json()
    expect(state.balance).toBe(12)
    expect(state.counts.spent).toBe(0)
    expect(unspentAmounts(state)).toEqual(targetPieces(12))
    // The day's count rose by the fee alone.
    await selectApplet(transceive)
    expect((await getInfo(transceive)).spentToday).toBe(
      spentBefore + (result.record.fee ?? 0),
    )

    // The card made each new piece's secret as buildCardP2PKSecret rebuilds
    // it: a till now takes exactly 3 from them, and the mint takes the card's
    // SIG_ALL witness for them.
    const paid = await fetch(`${CARD_FIXTURES_URL}/spend/3`, { method: "POST" })
    expect(paid.status).toBe(200)
    expect(await paid.json()).toMatchObject({ balance: 9 })
    await selectApplet(transceive)
    expect((await getInfo(transceive)).spentToday).toBe(spentBefore + 3)
  })

  it("a PIN card with no no-PIN allowance refuses a tidy without its PIN, burning nothing, and takes one after VERIFY_PIN (ENG-702, decision 1)", async () => {
    // 21 as 16 + 4 + 1, PIN set, no allowance: short of its 1s and 2s.
    await loadFixture("loaded")
    const transceive = bridgeTransceiver(bridge)
    const card = await readCashuCard(transceive)
    if (!card?.unspentSlots) throw new Error("the loaded fixture did not read")
    const mint = createTopUpMint(mintUrl)
    const keysetId = tidyKeyset(card.unspentSlots) as string
    const feePpk = await mint.feePpk(keysetId)
    let ids = 0
    const deps: TidyDeps = {
      mint,
      store: createTopUpStore(),
      now: Date.now,
      newId: () => `tidy-pin-${(ids += 1)}`,
    }
    const args = {
      transceive,
      card: { pubkey: card.pubkey, maxSlots: card.maxSlots },
      keysetId,
      feePpk,
      openForLoading: (t: Transceiver) => allowLoad(t, ownerSigner(FIXTURE_OWNER_KEY)),
      verdicts: new Map(),
    }

    await selectApplet(transceive)
    const refused = runTidy(deps, args)
    await expect(refused).rejects.toBeInstanceOf(CardSpendError)
    await expect(refused).rejects.toMatchObject({ reason: "pin-needed", sw: 0x6a94 })
    let state = await (await fetch(`${bridge}/state`)).json()
    expect(state.counts.spent).toBe(0)
    expect(state.balance).toBe(21)

    await selectApplet(transceive)
    const result = await runTidy(deps, {
      ...args,
      verifyPin: (t: Transceiver) =>
        verifyCardPin(t, FIXTURE_PIN, { sealed: card.sealed, cardPubkey: card.pubkey }),
    })
    expect(result.status).toBe("tidied")
    state = await (await fetch(`${bridge}/state`)).json()
    expect(state.balance).toBe(21)
    expect(state.counts.spent).toBe(0)
    expect(unspentAmounts(state)).toEqual(targetPieces(21))
  })
})
