/**
 * ENG-826: the wallet's setup record and the read-back, against the real
 * applet (cardsim). A tap cut after SET_PIN, then a store rebuilt from the
 * record persisted before it (an app restart), finishes the same intent with
 * SET_PIN sent once; and the real applet's GET_CARD after SET_CARD reads back
 * what setup wrote, the design (at 106 + the mint's length) as zeros, so the
 * exact compare holds on the happy path. Mismatches are the fake card's
 * (cashu-card-owner.spec.ts): the real applet keeps what it is given.
 *
 * Opt-in: runs only with CARDSIM_URL, CARD_MINT_URL and CARD_FIXTURES_URL set
 * (the iOS e2e workflow sets them), and is skipped in the unit suite. No mint
 * is asked: setup writes the mint's URL to the card and nothing else.
 */
import { configureStore } from "@reduxjs/toolkit"

import { bridgeTransceiver, setCardBridge } from "@app/utils/cashu-card-bridge"
import {
  Transceiver,
  getCardRecord,
  getInfo,
  readCashuCard,
  selectApplet,
  verifyCardPin,
} from "@app/utils/cashu-card"
import { allowLoad, ownerSigner } from "@app/utils/cashu-card-owner"
import {
  CardSetup,
  compareReadBack,
  finishHolderSetup,
  freezeSetupIntent,
  newSetupProgress,
  setUpCard,
} from "@app/utils/cashu-card-owner-store"
import rootReducer from "@app/store/redux/reducers"
import {
  FlashcardV2Slice,
  cardSetupSaved,
} from "@app/store/redux/slices/flashcardV2Slice"

import { FIXTURE_OWNER_KEY } from "../../scripts/e2e/card-fixtures-lib"

const { CARDSIM_URL, CARD_MINT_URL, CARD_FIXTURES_URL } = process.env
const describeWithCardsim =
  CARDSIM_URL && CARD_MINT_URL && CARD_FIXTURES_URL ? describe : describe.skip

const loadFixture = async (name: string) => {
  const response = await fetch(`${CARD_FIXTURES_URL}/load/${name}`, { method: "POST" })
  expect(response.ok).toBe(true)
  return response.json()
}

/** A store as the app's, unpersisted: `flashcardV2` as a restart rehydrates it. */
const newStore = (flashcardV2?: FlashcardV2Slice) =>
  configureStore({
    reducer: rootReducer,
    ...(flashcardV2
      ? { preloadedState: { flashcardV2 } as Parameters<typeof rootReducer>[0] }
      : {}),
  })

describeWithCardsim("the setup record and the read-back (cardsim)", () => {
  jest.setTimeout(120_000)

  const bridge = CARDSIM_URL as string
  const mintUrl = CARD_MINT_URL as string
  const key = { privateKey: FIXTURE_OWNER_KEY, source: "dev" as const, saved: false }
  const PIN = "2468"

  beforeEach(() => {
    setCardBridge({ url: bridge, mintUrl })
  })
  afterAll(() => {
    setCardBridge(undefined)
  })

  /** The bridge's transceiver, every INS noted in `sent`. */
  const tracing = (sent: number[], lostAfter?: number): Transceiver => {
    const transceive = bridgeTransceiver(bridge)
    return async (apdu) => {
      sent.push(apdu[1])
      const response = await transceive(apdu)
      if (apdu[1] === lostAfter) throw new Error("Tag was lost")
      return response
    }
  }

  it("a tap cut after SET_PIN, then a store rebuilt from the record: the same intent finishes with one SET_PIN", async () => {
    await loadFixture("fresh")
    const sent: number[] = []
    let store = newStore()
    let disk: FlashcardV2Slice | undefined
    const persist = async (setup: CardSetup) => {
      store.dispatch(cardSetupSaved(setup))
      disk = JSON.parse(JSON.stringify(store.getState().flashcardV2))
    }

    const cut = tracing(sent, 0x41)
    const card = await readCashuCard(bridgeTransceiver(bridge))
    if (!card) throw new Error("the fresh fixture did not read")
    const version = await selectApplet(cut)
    await expect(
      setUpCard(cut, {
        tap: { version, pubkey: card.pubkey },
        info: card,
        pin: PIN,
        intent: freezeSetupIntent({ cardPubkey: card.pubkey, mint: mintUrl, pin: PIN }),
        progress: newSetupProgress(),
        key,
        persist,
      }),
    ).rejects.toThrow("Tag was lost")

    // A restart: only what reached disk survives.
    store = newStore(disk)
    const stored = store.getState().flashcardV2.setups?.[card.pubkey]
    expect(stored).toMatchObject({ status: "started", progress: { pinSent: true } })
    if (!stored) throw new Error("no setup record")

    const transceive = tracing(sent)
    const again = await readCashuCard(bridgeTransceiver(bridge))
    if (!again) throw new Error("the card did not read after the cut")
    expect(again.pinState).toBe("set")
    const tap = { version: await selectApplet(transceive), pubkey: again.pubkey }
    await setUpCard(transceive, {
      tap,
      info: await getInfo(transceive),
      pin: PIN,
      intent: stored.intent,
      progress: { ...stored.progress },
      key,
      persist,
    })
    expect(sent.filter((ins) => ins === 0x41)).toHaveLength(1)
    expect(store.getState().flashcardV2.setups?.[card.pubkey]).toMatchObject({
      status: "set-up",
      heldByCard: { mint: mintUrl, unit: 0, refundKey: null, design: null },
    })
    const state = await (await fetch(`${bridge}/state`)).json()
    expect(state).toMatchObject({ hasOwner: true, recordSet: true, mint: mintUrl })
    await selectApplet(transceive)
    await verifyCardPin(transceive, PIN, { sealed: true, cardPubkey: card.pubkey })
    await allowLoad(transceive, ownerSigner(FIXTURE_OWNER_KEY))
  })

  it("the happy path's read-back matches the intent exactly, the design as zeros", async () => {
    await loadFixture("fresh")
    const sent: number[] = []
    const persisted: CardSetup[] = []
    const transceive = tracing(sent)
    const card = await readCashuCard(bridgeTransceiver(bridge))
    if (!card) throw new Error("the fresh fixture did not read")
    const intent = freezeSetupIntent({ cardPubkey: card.pubkey, mint: mintUrl })
    const version = await selectApplet(transceive)
    await setUpCard(transceive, {
      tap: { version, pubkey: card.pubkey },
      info: await getInfo(transceive),
      intent,
      progress: newSetupProgress(),
      key,
      persist: async (setup) => {
        persisted.push(setup)
      },
    })
    // GET_CARD before the writes and once after SET_CARD. ENG-827: then the
    // owner's SET_LIMIT, ALLOW_LOAD, and the verifying GET_INFO and GET_CARD.
    expect(sent.slice(-10)).toEqual([
      0x16, 0x32, 0x16, 0x43, 0x44, 0x34, 0x44, 0x45, 0x01, 0x16,
    ])
    const record = await getCardRecord(transceive)
    expect(record.design).toBeNull()
    expect(compareReadBack(intent, record)).toEqual([])
    expect(persisted[persisted.length - 1]).toMatchObject({
      status: "set-up",
      heldByCard: { mint: mintUrl, unit: 0, refundKey: null, design: null },
      verification: {
        held: { owner: true, day: 0, payment: 0, allowance: 0, rollBudget: 7 },
      },
    })
  })

  // ENG-827: the holder's limits, written and verified by the real applet.
  const LIMITS = { day: 5000, payment: 1000, allowance: 100, rollBudget: 10 }

  it("the real applet reaches verified: SET_LIMIT after SET_OWNER, and the payment limit under the grant", async () => {
    await loadFixture("fresh")
    const sent: number[] = []
    const persisted: CardSetup[] = []
    const transceive = tracing(sent)
    const card = await readCashuCard(bridgeTransceiver(bridge))
    if (!card) throw new Error("the fresh fixture did not read")
    const version = await selectApplet(transceive)
    await setUpCard(transceive, {
      tap: { version, pubkey: card.pubkey },
      info: await getInfo(transceive),
      pin: PIN,
      intent: freezeSetupIntent({
        cardPubkey: card.pubkey,
        mint: mintUrl,
        pin: PIN,
        limits: LIMITS,
      }),
      progress: newSetupProgress(),
      key,
      persist: async (setup) => {
        persisted.push(setup)
      },
    })
    expect(persisted[persisted.length - 1]).toMatchObject({
      status: "set-up",
      progress: { limitsSent: true, verified: true },
      verification: { held: { owner: true, ...LIMITS } },
    })
    // A new tap: the payment limit is said only under the owner's grant.
    await selectApplet(transceive)
    expect((await getInfo(transceive)).paymentLimit).toBe(0)
    await allowLoad(transceive, ownerSigner(FIXTURE_OWNER_KEY))
    expect((await getInfo(transceive)).paymentLimit).toBe(LIMITS.payment)
  })

  it("a tap cut after SET_OWNER resumes with exactly one SET_LIMIT, read under the grant", async () => {
    await loadFixture("fresh")
    const sent: number[] = []
    let store = newStore()
    let disk: FlashcardV2Slice | undefined
    const persist = async (setup: CardSetup) => {
      store.dispatch(cardSetupSaved(setup))
      disk = JSON.parse(JSON.stringify(store.getState().flashcardV2))
    }
    const cut = tracing(sent, 0x43)
    const card = await readCashuCard(bridgeTransceiver(bridge))
    if (!card) throw new Error("the fresh fixture did not read")
    const version = await selectApplet(cut)
    await expect(
      setUpCard(cut, {
        tap: { version, pubkey: card.pubkey },
        info: await getInfo(cut),
        pin: PIN,
        intent: freezeSetupIntent({
          cardPubkey: card.pubkey,
          mint: mintUrl,
          pin: PIN,
          limits: LIMITS,
        }),
        progress: newSetupProgress(),
        key,
        persist,
      }),
    ).rejects.toThrow("Tag was lost")
    expect(sent).not.toContain(0x34)

    store = newStore(disk)
    const stored = store.getState().flashcardV2.setups?.[card.pubkey]
    if (!stored) throw new Error("no setup record")
    expect(stored).toMatchObject({ status: "started", progress: { ownerSent: true } })

    const transceive = tracing(sent)
    await selectApplet(transceive)
    sent.length = 0
    const verification = await finishHolderSetup(transceive, {
      intent: stored.intent,
      progress: { ...stored.progress },
      key,
      persist,
      granted: false,
    })
    expect(sent.filter((ins) => ins === 0x34)).toHaveLength(1)
    // The GET_INFO after the last ALLOW_LOAD said the payment limit.
    expect(verification.held.payment).toBe(LIMITS.payment)
    expect(store.getState().flashcardV2.setups?.[card.pubkey]).toMatchObject({
      status: "set-up",
      verification: { held: { owner: true, ...LIMITS } },
    })
  })
})
