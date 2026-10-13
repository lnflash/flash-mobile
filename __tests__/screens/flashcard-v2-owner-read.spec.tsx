/**
 * ENG-675: whose card it is, as the card itself says it in the read tap.
 * Holding a key is not owning the card: every phone with a seed derives a key
 * for every card (`deriveOwnerKey`), so the read asks the card (ALLOW_LOAD,
 * as Foxy's `cardGrant` does) before the screen calls it this phone's. And a
 * card this phone owns is refreshed in the same tap, so the screen never
 * asks for the refresh the tap just did.
 *
 * Real provider, real store, real screen, real owner-key store (over the
 * Keychain mock); only the NFC manager, the network and navigation are
 * stand-ins.
 */
import * as React from "react"
import { act, screen, waitFor } from "@testing-library/react-native"
import NfcManager, { NfcTech } from "react-native-nfc-manager"
import * as Keychain from "react-native-keychain"
import * as bip39 from "bip39"

import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import { store } from "@app/store/redux"
import { resetFlashcardV2 } from "@app/store/redux/slices/flashcardV2Slice"
import { unitsForKeysets } from "@app/utils/cashu-mint"
import { INS, selectApplet, verifyCardPin } from "@app/utils/cashu-card"
import { deriveOwnerKey } from "@app/utils/cashu-card-owner"
import {
  OwnerKeyStoreError,
  SEED_SERVER,
  ownerKeyStore,
  resetSeedCache,
} from "@app/utils/cashu-card-owner-store"
import { FlashcardV2Screen } from "../../app/screens/card-screen/flashcard-v2"
import {
  asksForPinBeforePaying,
  topUpEligibility,
} from "../../app/screens/card-screen/flashcard-v2-topup"
import {
  FAKE_OWNER_KEY,
  FakeCard,
  FakeCardOptions,
  createFakeCard,
} from "../helpers/fake-cashu"
import { HEADER_VECTORS, esploraFetch } from "../helpers/block-headers"
import {
  FlashcardSnapshot,
  PROVIDER_RENDER_TIMEOUT_MS,
  renderProvider,
} from "../contexts/flashcard-harness"

loadLocale("en")
const LL = i18nObject("en")

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  isFocused: () => true,
  addListener: () => () => undefined,
}

jest.mock("js-lnurl", () => ({ getParams: jest.fn() }))
jest.mock("axios", () => ({ get: jest.fn() }))
jest.mock("@app/utils/toast", () => ({ toastShow: jest.fn() }))
jest.mock("@app/utils/cashu-mint", () => ({
  ...jest.requireActual("@app/utils/cashu-mint"),
  unitsForKeysets: jest.fn(),
}))
// The tip header is fetched off the tap; no spec reaches the network for it.
jest.mock("@app/utils/cashu-card-headers", () => ({
  ...jest.requireActual("@app/utils/cashu-card-headers"),
  refreshTipHeader: jest.fn(async () => undefined),
}))
jest.mock("@app/i18n/i18n-react", () => ({
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useI18nContext: () => ({ LL: require("../../app/i18n/i18n-util").i18nObject("en") }),
}))
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => mockNavigation,
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}))
jest.mock("react-native-safe-area-context", () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("../helpers/safe-area-context-mock").build(),
)
jest.mock("@app/graphql/generated", () => ({
  ...jest.requireActual("@app/graphql/generated"),
  useHideBalanceQuery: () => ({ data: { hideBalance: false } }),
}))

/** BIP-39's own test phrase: a valid wallet seed for this phone. */
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
const SEED = Uint8Array.from(bip39.mnemonicToSeedSync(MNEMONIC))
/** The fake card's key, whatever its owner. */
const PUBKEY_HEX = createFakeCard(1).pubkey
/** What this phone's seed derives for the card: the owner's key on a card it set up. */
const SEED_KEY = deriveOwnerKey(SEED, PUBKEY_HEX)
/** A random owner key this phone saved when it set the card up. */
const DEVICE_KEY = "5a".repeat(32)
const OWNER_STORE = "flashcard-v2-owner"

const requestTechnology = NfcManager.requestTechnology as jest.Mock
const transceive = NfcManager.isoDepHandler.transceive as jest.Mock
const getTag = NfcManager.getTag as jest.Mock

let latest: FlashcardSnapshot | undefined
let card: FakeCard
const knownCards = () => store.getState().flashcardV2.cards

const mountScreen = async () => {
  renderProvider(
    (snapshot) => {
      latest = snapshot
    },
    { isAuthed: true, children: <FlashcardV2Screen /> },
  )
  await waitFor(() => expect(latest?.readFlashcard).toBeDefined())
}

/** Reads `options`' card: a PIN, and another phone's owner key unless named. */
const tapCard = async (options: FakeCardOptions = {}) => {
  card = createFakeCard(128, { pin: "1234", ...options })
  requestTechnology.mockResolvedValue(NfcTech.IsoDep)
  getTag.mockResolvedValue({ id: "08AABBCC" })
  transceive.mockImplementation((bytes: number[]) => card.transceive(bytes))
  await act(async () => {
    await latest?.readFlashcard()
  })
  await waitFor(() => expect(latest?.cashuCard?.pubkey).toBe(PUBKEY_HEX))
}

const owner = () => screen.getByTestId("flashcard-v2-owner").props.children
/** The card the last read left in context. */
const readCard = () => {
  const read = latest?.cashuCard
  if (!read) throw new Error("no card was read")
  return read
}

describe("whose card it is, as the card says in the read tap (ENG-675)", () => {
  jest.setTimeout(PROVIDER_RENDER_TIMEOUT_MS)

  beforeEach(async () => {
    latest = undefined
    store.dispatch(resetFlashcardV2())
    await Keychain.resetInternetCredentials({ server: SEED_SERVER })
    await Keychain.resetInternetCredentials({ server: OWNER_STORE })
    resetSeedCache()
    jest.spyOn(console, "warn").mockImplementation(() => {})
    ;(unitsForKeysets as jest.Mock).mockResolvedValue({})
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  const giveThisPhoneASeed = () =>
    Keychain.setInternetCredentials(SEED_SERVER, SEED_SERVER, MNEMONIC)

  it("a phone with a seed reading a card another phone owns: the card refuses its key, so the Owner row says another phone and the PIN is still asked for", async () => {
    await giveThisPhoneASeed()
    await mountScreen()

    await tapCard({ owner: FAKE_OWNER_KEY })

    // The card was asked, and said no (6A91): one GET_NONCE, one ALLOW_LOAD.
    expect(card.ins().filter((ins) => ins === INS.ALLOW_LOAD)).toHaveLength(1)
    expect(card.granted()).toBe(false)
    expect(latest?.cashuCard?.ownerKeySource).toBeUndefined()
    expect(owner()).toBe(LL.FlashcardV2.ownerOther())
    // Nothing saved for a card that refused the key.
    await expect(ownerKeyStore.get(PUBKEY_HEX)).resolves.toBeUndefined()
    // The top-up screen asks a card with a PIN for it before paying unless
    // this phone owns the card (`asksForPin`): it is not this phone's.
    expect(latest?.cashuCard).toMatchObject({ pinState: "set", hasOwner: true })
    expect(topUpEligibility(readCard(), { usdEnabled: false })).toMatchObject({
      ok: true,
    })
    expect(asksForPinBeforePaying(readCard())).toBe(true)
  })

  it("a Keychain that cannot be read in the read tap leaves the owner unconfirmed, never 'Another phone': the PIN is not asked before paying, and the owner's actions wait for a tap that settles it", async () => {
    await ownerKeyStore.put(PUBKEY_HEX, {
      privateKey: DEVICE_KEY,
      source: "device",
      createdAt: 1,
    })
    jest
      .spyOn(ownerKeyStore, "get")
      .mockRejectedValue(new OwnerKeyStoreError("the saved owner keys cannot be read"))
    await mountScreen()

    await tapCard({ owner: DEVICE_KEY })

    // Nothing was offered: the key could not be read.
    expect(card.ins()).not.toContain(INS.ALLOW_LOAD)
    expect(latest?.cashuCard?.ownerKeySource).toBeUndefined()
    expect(latest?.cashuCard?.ownerUnsettled).toBe("failed")
    // Another tap can settle a failed question, so it is asked for.
    expect(owner()).toBe(LL.FlashcardV2.ownerUnconfirmed())
    expect(owner()).not.toBe(LL.FlashcardV2.ownerOther())
    // The load tap offers the grant first, and asks for the PIN only on a refusal.
    expect(asksForPinBeforePaying(readCard())).toBe(false)
    expect(topUpEligibility(readCard(), { usdEnabled: false })).toMatchObject({
      ok: true,
    })
    expect(screen.queryByTestId("flashcard-v2-action-limits")).toBeNull()

    // The next tap, with the Keychain back, settles it as this phone's.
    jest.restoreAllMocks()
    jest.spyOn(console, "warn").mockImplementation(() => {})
    await tapCard({ owner: DEVICE_KEY })
    expect(latest?.cashuCard?.ownerKeySource).toBe("device")
    expect(latest?.cashuCard?.ownerUnsettled).toBeUndefined()
    expect(owner()).toBe(LL.FlashcardV2.ownerThisPhone())
  })

  it("a locked card with no refresh due is not asked whose it is: the owner is unconfirmed, not 'Another phone'", async () => {
    await ownerKeyStore.put(PUBKEY_HEX, {
      privateKey: DEVICE_KEY,
      source: "device",
      createdAt: 1,
    })
    await mountScreen()

    await tapCard({ owner: DEVICE_KEY, locked: true, rolls: 0 })

    expect(card.ins()).not.toContain(INS.ALLOW_LOAD)
    expect(card.ins()).not.toContain(INS.REFRESH)
    expect(latest?.cashuCard?.ownerUnsettled).toBe("locked")
    // Locked for good (spec/APDU.md, LOCK_CARD), the card is asked nothing
    // until a REFRESH is due: another tap settles nothing, so none is asked for.
    expect(owner()).toBe(LL.FlashcardV2.ownerUnconfirmedLocked())
    expect(owner()).not.toBe(LL.FlashcardV2.ownerUnconfirmed())
    expect(owner()).not.toBe(LL.FlashcardV2.ownerOther())

    // Tapped again, it says the same.
    await tapCard({ owner: DEVICE_KEY, locked: true, rolls: 0 })
    expect(card.ins()).not.toContain(INS.REFRESH)
    expect(owner()).toBe(LL.FlashcardV2.ownerUnconfirmedLocked())
  })

  it("a locked card out of rolls, read by its owner's phone with no tip header (offline): the owner is unconfirmed, and the refresh notice is the owner's (decision 16), not the other phone's", async () => {
    await ownerKeyStore.put(PUBKEY_HEX, {
      privateKey: DEVICE_KEY,
      source: "device",
      createdAt: 1,
    })
    await mountScreen()

    await tapCard({
      owner: DEVICE_KEY,
      locked: true,
      rolls: 7,
      limits: { rollBudget: 7 },
    })

    // No header, so no REFRESH: the card was not asked whose it is.
    expect(card.ins()).not.toContain(INS.ALLOW_LOAD)
    expect(card.ins()).not.toContain(INS.REFRESH)
    expect(latest?.cashuCard?.ownerUnsettled).toBe("locked")
    expect(owner()).toBe(LL.FlashcardV2.ownerUnconfirmedLocked())
    expect(screen.getByTestId("flashcard-v2-refresh-needed")).toBeTruthy()
    expect(screen.getByText(LL.FlashcardV2.refreshNeededBody())).toBeTruthy()
    expect(screen.queryByText(LL.FlashcardV2.refreshNeededOtherBody())).toBeNull()
  })

  it("a blocked card read by its owner's phone while the Keychain cannot be read: the blocked notice never says another phone owns it", async () => {
    await ownerKeyStore.put(PUBKEY_HEX, {
      privateKey: DEVICE_KEY,
      source: "device",
      createdAt: 1,
    })
    jest
      .spyOn(ownerKeyStore, "get")
      .mockRejectedValue(new OwnerKeyStoreError("the saved owner keys cannot be read"))
    await mountScreen()
    const blocked = createFakeCard(128, { pin: "1234", owner: DEVICE_KEY })
    await selectApplet(blocked.transceive)
    for (let i = 0; i < 3; i += 1) {
      await verifyCardPin(blocked.transceive, "0000", {
        sealed: false,
        cardPubkey: PUBKEY_HEX,
      }).catch(() => undefined)
    }
    requestTechnology.mockResolvedValue(NfcTech.IsoDep)
    getTag.mockResolvedValue({ id: "08AABBCC" })
    transceive.mockImplementation((bytes: number[]) => blocked.transceive(bytes))
    await act(async () => {
      await latest?.readFlashcard()
    })
    await waitFor(() => expect(latest?.cashuCard?.pinState).toBe("blocked"))

    expect(latest?.cashuCard?.ownerUnsettled).toBe("failed")
    expect(owner()).toBe(LL.FlashcardV2.ownerUnconfirmed())
    expect(screen.getByTestId("flashcard-v2-blocked")).toBeTruthy()
    expect(screen.getByText(LL.FlashcardV2.blockedUnconfirmedBody())).toBeTruthy()
    expect(screen.queryByText(LL.FlashcardV2.blockedOtherBody())).toBeNull()
  })

  it("a blocked card another phone owns is refused before any quote, and says only that phone can unblock it", async () => {
    await giveThisPhoneASeed()
    await mountScreen()
    const blocked = createFakeCard(128, { pin: "1234", owner: FAKE_OWNER_KEY })
    // Three wrong PINs block it, as a holder would.
    await selectApplet(blocked.transceive)
    for (let i = 0; i < 3; i += 1) {
      await verifyCardPin(blocked.transceive, "0000", {
        sealed: false,
        cardPubkey: PUBKEY_HEX,
      }).catch(() => undefined)
    }
    requestTechnology.mockResolvedValue(NfcTech.IsoDep)
    getTag.mockResolvedValue({ id: "08AABBCC" })
    transceive.mockImplementation((bytes: number[]) => blocked.transceive(bytes))
    await act(async () => {
      await latest?.readFlashcard()
    })
    await waitFor(() => expect(latest?.cashuCard?.pinState).toBe("blocked"))

    expect(latest?.cashuCard?.ownerKeySource).toBeUndefined()
    expect(topUpEligibility(readCard(), { usdEnabled: false })).toEqual({
      ok: false,
      reason: "blocked",
    })
    expect(screen.queryByText(LL.FlashcardV2.topUp())).toBeNull()
    expect(screen.getByText(LL.FlashcardV2.blockedOtherBody())).toBeTruthy()
    expect(screen.queryByText(LL.FlashcardV2.blockedOwnerBody())).toBeNull()
    expect(owner()).toBe(LL.FlashcardV2.ownerOther())
  })

  it("a phone restored from the seed that set the card up: the card takes the derived key, which is saved, and the Owner row says this phone", async () => {
    await giveThisPhoneASeed()
    await mountScreen()

    await tapCard({ owner: SEED_KEY })

    expect(card.ins().filter((ins) => ins === INS.ALLOW_LOAD)).toHaveLength(1)
    expect(latest?.cashuCard?.ownerKeySource).toBe("seed")
    expect(owner()).toBe(LL.FlashcardV2.ownerThisPhone())
    await expect(ownerKeyStore.get(PUBKEY_HEX)).resolves.toMatchObject({
      privateKey: SEED_KEY,
      source: "seed",
    })
  })

  it("a key saved here is offered to the card too, which takes it: the Owner row says this phone", async () => {
    await ownerKeyStore.put(PUBKEY_HEX, {
      privateKey: DEVICE_KEY,
      source: "device",
      createdAt: 1,
    })
    await mountScreen()

    await tapCard({ owner: DEVICE_KEY })

    // A saved key is not always one the card took: the card is asked (Foxy's cardGrant).
    expect(card.ins().filter((ins) => ins === INS.ALLOW_LOAD)).toHaveLength(1)
    expect(card.granted()).toBe(true)
    expect(latest?.cashuCard?.ownerKeySource).toBe("device")
    expect(owner()).toBe(LL.FlashcardV2.ownerThisPhone())
  })

  it("a saved key the card refuses (a setup cut short, then set up by another phone) is not this phone's: the Owner row says another phone, and a blocked card is refused before any quote", async () => {
    // This phone saved its key before SET_OWNER, which never landed; another
    // phone then set the card up (spec/APDU.md, Personalisation).
    await ownerKeyStore.put(PUBKEY_HEX, {
      privateKey: DEVICE_KEY,
      source: "device",
      createdAt: 1,
    })
    await mountScreen()
    const blocked = createFakeCard(128, { pin: "1234", owner: FAKE_OWNER_KEY })
    await selectApplet(blocked.transceive)
    for (let i = 0; i < 3; i += 1) {
      await verifyCardPin(blocked.transceive, "0000", {
        sealed: false,
        cardPubkey: PUBKEY_HEX,
      }).catch(() => undefined)
    }
    requestTechnology.mockResolvedValue(NfcTech.IsoDep)
    getTag.mockResolvedValue({ id: "08AABBCC" })
    transceive.mockImplementation((bytes: number[]) => blocked.transceive(bytes))
    await act(async () => {
      await latest?.readFlashcard()
    })
    await waitFor(() => expect(latest?.cashuCard?.pinState).toBe("blocked"))

    // Asked, and refused (6A91).
    expect(blocked.ins().filter((ins) => ins === INS.ALLOW_LOAD)).toHaveLength(1)
    expect(blocked.granted()).toBe(false)
    expect(latest?.cashuCard?.ownerKeySource).toBeUndefined()
    expect(owner()).toBe(LL.FlashcardV2.ownerOther())
    expect(topUpEligibility(readCard(), { usdEnabled: false })).toEqual({
      ok: false,
      reason: "blocked",
    })
    expect(screen.queryByText(LL.FlashcardV2.topUp())).toBeNull()
    expect(screen.getByText(LL.FlashcardV2.blockedOtherBody())).toBeTruthy()
    expect(screen.queryByText(LL.FlashcardV2.blockedOwnerBody())).toBeNull()
  })

  it("a phone with no seed and no saved key asks nothing and owns nothing", async () => {
    await mountScreen()

    await tapCard({ owner: FAKE_OWNER_KEY })

    expect(card.ins()).not.toContain(INS.ALLOW_LOAD)
    expect(latest?.cashuCard?.ownerKeySource).toBeUndefined()
    expect(owner()).toBe(LL.FlashcardV2.ownerOther())
  })

  describe("the owner's refresh in the read tap", () => {
    afterEach(() => {
      jest.requireActual("@app/utils/cashu-card-headers").resetKeptHeader()
    })

    it("an owned card whose budget ran out is refreshed in the read tap (0x53), and the screen shows no refresh notice", async () => {
      // A header the phone keeps (fetched off the tap): the newest vector.
      const headers = jest.requireActual("@app/utils/cashu-card-headers")
      await headers.refreshTipHeader({ fetcher: esploraFetch(HEADER_VECTORS[2]) })
      await ownerKeyStore.put(PUBKEY_HEX, {
        privateKey: DEVICE_KEY,
        source: "device",
        createdAt: 1,
      })
      await mountScreen()

      await tapCard({ owner: DEVICE_KEY, rolls: 7, limits: { rollBudget: 7 } })

      expect(card.ins()).toContain(INS.REFRESH)
      expect(card.rolls()).toBe(0)
      // The record the screen and the store hold is the card's after the
      // refresh, not the one it read before it.
      expect(latest?.cashuCard?.record.rolls).toBe(0)
      expect(knownCards()[PUBKEY_HEX]?.limits).toMatchObject({ rolls: 0, rollBudget: 7 })
      expect(screen.queryByTestId("flashcard-v2-refresh-needed")).toBeNull()
      expect(latest?.cashuCard?.now).toBe(HEADER_VECTORS[2].time)
    })

    it("a card another phone owns is not refreshed, and still asks for its owner's refresh", async () => {
      const headers = jest.requireActual("@app/utils/cashu-card-headers")
      await headers.refreshTipHeader({ fetcher: esploraFetch(HEADER_VECTORS[2]) })
      await giveThisPhoneASeed()
      await mountScreen()

      await tapCard({ owner: FAKE_OWNER_KEY, rolls: 7, limits: { rollBudget: 7 } })

      expect(card.ins()).not.toContain(INS.REFRESH)
      expect(latest?.cashuCard?.record.rolls).toBe(7)
      expect(screen.getByTestId("flashcard-v2-refresh-needed")).toBeTruthy()
      // Tapping it again on this phone changes nothing: it names the owner's phone.
      expect(screen.getByText(LL.FlashcardV2.refreshNeededOtherBody())).toBeTruthy()
      expect(screen.queryByText(LL.FlashcardV2.refreshNeededBody())).toBeNull()
    })

    it("an owned card whose refresh could not be sent (no tip header yet) tells its owner to tap it online (decision 16)", async () => {
      await ownerKeyStore.put(PUBKEY_HEX, {
        privateKey: DEVICE_KEY,
        source: "device",
        createdAt: 1,
      })
      await mountScreen()

      await tapCard({ owner: DEVICE_KEY, rolls: 7, limits: { rollBudget: 7 } })

      expect(card.ins()).not.toContain(INS.REFRESH)
      expect(owner()).toBe(LL.FlashcardV2.ownerThisPhone())
      expect(screen.getByTestId("flashcard-v2-refresh-needed")).toBeTruthy()
      expect(screen.getByText(LL.FlashcardV2.refreshNeededBody())).toBeTruthy()
      expect(screen.queryByText(LL.FlashcardV2.refreshNeededOtherBody())).toBeNull()
    })

    // A locked card answers ALLOW_LOAD 6986 (spec/APDU.md, ALLOW_LOAD) and
    // keeps REFRESH open to its owner (REFRESH: "a locked card too"), so the
    // read asks it by REFRESH, as Foxy never sends the grant to a locked card.
    it("a locked card this phone owns, whose window has rolled, is refreshed in the read tap and is this phone's, with no grant asked for", async () => {
      const headers = jest.requireActual("@app/utils/cashu-card-headers")
      await headers.refreshTipHeader({ fetcher: esploraFetch(HEADER_VECTORS[2]) })
      await ownerKeyStore.put(PUBKEY_HEX, {
        privateKey: DEVICE_KEY,
        source: "device",
        createdAt: 1,
      })
      await mountScreen()

      await tapCard({ owner: DEVICE_KEY, locked: true, rolls: 3 })

      expect(card.ins()).not.toContain(INS.ALLOW_LOAD)
      expect(card.ins()).toContain(INS.REFRESH)
      expect(card.rolls()).toBe(0)
      expect(latest?.cashuCard?.locked).toBe(true)
      expect(latest?.cashuCard?.record.rolls).toBe(0)
      expect(latest?.cashuCard?.ownerKeySource).toBe("device")
      expect(owner()).toBe(LL.FlashcardV2.ownerThisPhone())
      expect(card.triesLeft()).toBe(3)
    })

    it("a locked card another phone owns refuses the REFRESH (6A91): not this phone's, nothing changed, no PIN try spent", async () => {
      const headers = jest.requireActual("@app/utils/cashu-card-headers")
      await headers.refreshTipHeader({ fetcher: esploraFetch(HEADER_VECTORS[2]) })
      await giveThisPhoneASeed()
      await mountScreen()

      await tapCard({
        owner: FAKE_OWNER_KEY,
        locked: true,
        rolls: 7,
        limits: { rollBudget: 7 },
      })

      expect(card.ins()).not.toContain(INS.ALLOW_LOAD)
      // Asked once, by REFRESH, and refused: the card's rolls stand.
      expect(card.ins().filter((ins) => ins === INS.REFRESH)).toHaveLength(1)
      expect(card.rolls()).toBe(7)
      expect(card.triesLeft()).toBe(3)
      expect(card.verified()).toBe(false)
      expect(latest?.cashuCard?.record.rolls).toBe(7)
      expect(latest?.cashuCard?.ownerKeySource).toBeUndefined()
      expect(owner()).toBe(LL.FlashcardV2.ownerOther())
      // Nothing saved for a card that refused the key.
      await expect(ownerKeyStore.get(PUBKEY_HEX)).resolves.toBeUndefined()
    })

    it("an unlocked card this phone owns is still asked by ALLOW_LOAD, then refreshed", async () => {
      const headers = jest.requireActual("@app/utils/cashu-card-headers")
      await headers.refreshTipHeader({ fetcher: esploraFetch(HEADER_VECTORS[2]) })
      await ownerKeyStore.put(PUBKEY_HEX, {
        privateKey: DEVICE_KEY,
        source: "device",
        createdAt: 1,
      })
      await mountScreen()

      await tapCard({ owner: DEVICE_KEY, rolls: 3 })

      const ins = card.ins()
      expect(ins.filter((i) => i === INS.ALLOW_LOAD)).toHaveLength(1)
      expect(ins.indexOf(INS.ALLOW_LOAD)).toBeLessThan(ins.indexOf(INS.REFRESH))
      expect(card.granted()).toBe(true)
      expect(card.rolls()).toBe(0)
      expect(latest?.cashuCard?.ownerKeySource).toBe("device")
      expect(owner()).toBe(LL.FlashcardV2.ownerThisPhone())
    })
  })
})
