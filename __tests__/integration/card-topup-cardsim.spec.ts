/**
 * ENG-634: the top-up engine and the dev card transport against the real
 * applet (cardsim) and a real mint (Nutshell on FakeWallet), below the UI.
 * Opt-in: runs only with CARDSIM_URL, CARD_MINT_URL and CARD_FIXTURES_URL set
 * (the iOS e2e workflow sets them; see .maestro/flashcard/README.md), and is
 * skipped in the unit suite. It needs no wallet: the dev pay stub stands in
 * for the payment, as in the e2e flows.
 *
 * The `spent` fixture's two settled slots are freed on the load tap
 * (CLEAR_SPENT after the mint's NUT-07 SPENT), and 100 sat loads beside the
 * 16 already on the card.
 */
import {
  bridgeTransceiver,
  setCardBridge,
  stubbedPayOutcome,
} from "@app/utils/cashu-card-bridge"
import { readCashuCard, selectApplet, verifyCardPin } from "@app/utils/cashu-card"
import {
  TopUpDeps,
  createTopUpMint,
  createTopUpStore,
  loadTopUp,
  mintTopUp,
  payTopUp,
  prepareTopUp,
  reclaimPlan,
  reclaimSpentSlots,
  reclaimVerdicts,
} from "@app/utils/cashu-card-topup"

const { CARDSIM_URL, CARD_MINT_URL, CARD_FIXTURES_URL } = process.env
const describeWithCardsim =
  CARDSIM_URL && CARD_MINT_URL && CARD_FIXTURES_URL ? describe : describe.skip

describeWithCardsim("top-up against cardsim and a FakeWallet mint", () => {
  jest.setTimeout(120_000)

  afterAll(() => setCardBridge(undefined))

  it("reclaims the settled spent slots and loads the top-up in one tap", async () => {
    const bridge = CARDSIM_URL as string
    const mintUrl = CARD_MINT_URL as string
    const fixture = await fetch(`${CARD_FIXTURES_URL}/load/spent`, { method: "POST" })
    expect(fixture.ok).toBe(true)
    setCardBridge({ url: bridge, mintUrl, stubPay: true })

    const transceive = bridgeTransceiver(bridge)
    const card = await readCashuCard(transceive)
    if (!card?.spentSlots) throw new Error("the spent fixture did not read")
    expect(card.balance).toBe(16)
    expect(card.spentSlots).toHaveLength(2)

    let ids = 0
    const deps: TopUpDeps = {
      mint: createTopUpMint(mintUrl),
      store: createTopUpStore(),
      now: Date.now,
      newId: () => `cardsim-${Date.now()}-${(ids += 1)}`,
      pay: async () => stubbedPayOutcome(mintUrl) ?? { kind: "unknown" },
    }
    const verdicts = await reclaimVerdicts(deps, card.pubkey, card.spentSlots)
    const plan = reclaimPlan(card.spentSlots, verdicts)
    expect(plan).toEqual({ reclaimable: 2, settling: 0 })

    const record = await prepareTopUp(deps, {
      cardPubkey: card.pubkey,
      unit: "sat",
      amount: 100,
      walletId: "stubbed",
      card: { empty: card.empty, unit: "sat", reclaimable: plan.reclaimable },
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

    // The load tap: a new session, the PIN, the reclaim, the load.
    await selectApplet(transceive)
    await verifyCardPin(transceive, "1234")
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
  })
})
