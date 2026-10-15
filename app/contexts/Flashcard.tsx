import React, { createContext, useContext, useEffect, useRef, useState } from "react"
import { Dimensions, Platform, View } from "react-native"
import RNModal from "react-native-modal"
import { SafeAreaView } from "react-native-safe-area-context"
import NfcManager, { Ndef, TagEvent, NfcTech } from "react-native-nfc-manager"
import * as Animatable from "react-native-animatable"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { getParams } from "js-lnurl"
import axios from "axios"
import { ApolloClient, getApolloContext } from "@apollo/client"

// components
import { PrimaryBtn } from "@app/components/buttons"
import { Loading } from "./ActivityIndicatorContext"

// hooks
import { HideBalanceDocument, HideBalanceQuery } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useConnectivity } from "@app/hooks/use-connectivity"
import { useI18nContext } from "@app/i18n/i18n-react"
import type { TranslationFunctions } from "@app/i18n/i18n-types"
import { usePersistentStateContext } from "@app/store/persistent-state"
import { useAppDispatch, useAppSelector } from "@app/store/redux"
import {
  cardForgotten,
  cardSeen,
  cardUnitResolved,
  keysetUnitsLearned,
  KnownCard,
} from "@app/store/redux/slices/flashcardV2Slice"

// utils
import { toastShow } from "../utils/toast"
import {
  AppletNotSelectedError,
  AuthenticatedTap,
  CardAuthError,
  CardError,
  CardInfo,
  CardKeysetTotal,
  CardNeedsUpdateError,
  CardRecord,
  CardSlotRead,
  CashuCardInfo,
  ReadChanges,
  ReadPreview,
  Transceiver,
  WrongCardError,
  getBalance as getCardBalance,
  getCardRecord,
  getInfo,
  getPubkey,
  readCashuCard,
  readKeysetSplit,
  selectApplet,
  toHex,
} from "../utils/cashu-card"
import { balanceLines } from "../utils/cashu-card-format"
import { extendCardTimeout, setCardAlertMessage } from "../utils/cashu-card-nfc"
import { bridgeTransceiver, getCardBridge } from "../utils/cashu-card-bridge"
import { feedHeader, keptHeader, refreshTipHeader } from "../utils/cashu-card-headers"
import { ownerSigner, refreshCard } from "../utils/cashu-card-owner"
import {
  OwnerKey,
  OwnerKeySource,
  confirmOwnerKey,
  loadSeed,
  refreshAsOwner,
} from "../utils/cashu-card-owner-store"
import {
  CardUnitTotals,
  KeysetUnits,
  soleUnit,
  totalsByUnit,
  unitsForKeysets,
} from "../utils/cashu-mint"
import { cardCommitments, tidyOwed } from "../utils/cashu-card-topup/engine"
import { tidyKeyset } from "../utils/cashu-card-topup/ladder"
import { TidyOffer, tidyOfferFor } from "../utils/cashu-card-topup/offer"
import { topUpMint, topUpStore } from "../utils/cashu-card-topup/connected"

// assets
import NfcScan from "@app/assets/icons/nfc-scan.svg"

// Only an error class name and an HTTP status ever reach the console. The
// message text of these errors (and a thrown string) can contain the card's
// withdraw URL, which together with k1 authorises a withdrawal.
const describeError = (err: unknown): string => {
  const name = err instanceof Error ? err.name : typeof err
  const status = (err as { response?: { status?: unknown } } | null)?.response?.status
  return typeof status === "number" ? `${name} status=${status}` : name
}

/** A card's refusal by its status word; anything else as `describeError` says it. */
const describeCardFailure = (err: unknown): string =>
  err instanceof CardError ? `${err.name} ${err.sw.toString(16)}` : describeError(err)

/**
 * A card's unspent value per unit, as the mint names the unit of each keyset
 * on it, with the units the mint named (`units`, absent for an empty card,
 * which needs no lookup). Undefined when the tap could not read the keyset
 * split (there is nothing to ask the mint about), or when the mint could not
 * be asked or did not answer with a keyset list.
 */
const cardUnitTotals = async (
  card: CashuCardInfo,
): Promise<{ unitTotals: CardUnitTotals; units?: KeysetUnits } | undefined> => {
  const { keysets } = card
  if (!keysets) return undefined
  if (keysets.length === 0) return { unitTotals: { byUnit: [], unknown: 0 } }
  try {
    const units = await unitsForKeysets(keysets.map((k) => k.keysetId))
    return { unitTotals: totalsByUnit(keysets, units), units }
  } catch (err) {
    console.warn("Cashu mint keyset lookup failed:", describeError(err))
    return undefined
  }
}

/**
 * The tidy to offer for a card read under the owner's grant (ENG-702): the
 * mint's fee for the keyset its pieces are in, the slots the card's
 * unfinished top-ups and tidies will take, and `tidyOfferFor`. None for a
 * card with a tidy still owed (the screen lists that one to finish), and none
 * when the mint cannot be asked (offline) or the store cannot be read.
 */
const tidyOfferForRead = async (card: CashuCardInfo): Promise<TidyOffer | undefined> => {
  const pieces = card.unspentSlots
  const keysetId = pieces && tidyKeyset(pieces)
  if (!pieces || !keysetId) return undefined
  try {
    const feePpk = await topUpMint().feePpk(keysetId)
    const tidies = await topUpStore.tidies.list()
    const pubkey = card.pubkey.toLowerCase()
    if (tidies.some((t) => t.cardPubkey === pubkey && tidyOwed(t))) return undefined
    const { slots } = cardCommitments(await topUpStore.list(), pubkey, tidies)
    return tidyOfferFor(
      { ...card, unspentSlots: pieces },
      { feePpk, committedSlots: slots },
    )
  } catch (err) {
    console.warn("Cashu card tidy offer skipped:", describeError(err))
    return undefined
  }
}

/**
 * In a read tap, once the card has proved its key: the card's clock is fed
 * (TELL_TIME, and SET_HEADER when the phone holds a newer header:
 * `feedHeader`); an owned card is asked whether this phone is its owner, and
 * the answer is left in `ownership`; and a card whose day's window has
 * rolled since its owner last refreshed it is refreshed by its owner's
 * phone (REFRESH, the owner's proof over the kept header).
 *
 * An unlocked card is asked by ALLOW_LOAD (`confirmOwnerKey`: the saved
 * key, or the seed's, offered as its proof), then refreshed with the key it
 * took. A locked card answers ALLOW_LOAD `6986` (spec/APDU.md, ALLOW_LOAD)
 * and Foxy never sends it the grant, but REFRESH stays open to its owner
 * (spec/APDU.md, REFRESH): a locked card that needs a refresh is sent one
 * with this phone's key (`refreshAsOwner`), and its `9000` is the answer.
 * A `6A91` there costs no PIN try and changes nothing. A locked card that
 * needs no refresh is not asked: this tap leaves its owner unsettled
 * (`ownership.unsettled` is `locked`), as does a question that failed for
 * any other reason than the card's `6A91`/`6A90` (`failed`: a Keychain
 * that cannot be read, a card that left): the screen never calls the
 * holder's own card "Another phone" on a failure, and asks for another tap
 * only when one can settle it.
 *
 * Best effort: nothing here fails the read, and nothing here waits on the
 * network. Resolves what it changed, so the read asks the card again.
 */
const tendCard = async (
  { transceive, info, pubkey, record }: AuthenticatedTap,
  ownership: TapOwnership,
): Promise<ReadChanges> => {
  const clock = await feedHeader(transceive, info.now)
  let now = clock.now
  let refreshed = false
  const header = keptHeader()
  if (info.hasOwner && info.locked) {
    if (record.rolls > 0 && header) {
      try {
        const answer = await refreshAsOwner(transceive, pubkey, header.bytes)
        if (answer) {
          ownership.key = answer.key
          now = answer.now
          refreshed = true
        }
      } catch (err) {
        ownership.unsettled = "failed"
        console.warn("Cashu card refresh skipped:", describeCardFailure(err))
      }
    } else {
      // Not asked: a locked card takes no ALLOW_LOAD, and no REFRESH is due
      // (or none can be sent without a header). Tapping again changes
      // nothing until one is.
      ownership.unsettled = "locked"
    }
  } else if (info.hasOwner) {
    try {
      ownership.key = await confirmOwnerKey(transceive, pubkey)
      // Every key but the dev bridge's was offered as ALLOW_LOAD's proof.
      ownership.granted = ownership.key !== undefined && ownership.key.source !== "dev"
    } catch (err) {
      ownership.unsettled = "failed"
      console.warn("Cashu card owner check skipped:", describeCardFailure(err))
    }
    if (ownership.key && record.rolls > 0 && header) {
      try {
        now = await refreshCard(
          transceive,
          ownerSigner(ownership.key.privateKey),
          header.bytes,
        )
        refreshed = true
      } catch (err) {
        console.warn("Cashu card refresh skipped:", describeCardFailure(err))
      }
    }
  }
  return {
    clockMoved: now !== info.now,
    refreshed,
    granted: ownership.granted === true,
  }
}

const width = Dimensions.get("screen").width

/** What a read tap learned about the card's owner. */
type TapOwnership = {
  /** The key the card took, if this phone's. */
  key?: OwnerKey
  /**
   * The card granted this phone ALLOW_LOAD in the tap, so the GET_INFO read
   * after it says the card's limit on one payment (`paymentLimit`).
   */
  granted?: boolean
  /**
   * The card has an owner and this tap could not settle whether it is this
   * phone, and why (`OwnerUnsettled`): `locked` for a locked card that was
   * not asked (no REFRESH due, or no header to send one with), `failed` when
   * the Keychain, or the card, failed the question in a way that is neither
   * `9000` nor `6A91`/`6A90`.
   */
  unsettled?: OwnerUnsettled
}

/**
 * Why a read tap left the card's owner unsettled. `locked`: the card is
 * locked for good (cashu-javacard spec/APDU.md, LOCK_CARD), answers
 * ALLOW_LOAD `6986`, and is asked by REFRESH only once one is due and this
 * phone holds a header, so tapping it again settles nothing until then.
 * `failed`: the question itself failed (a Keychain that cannot be read, a
 * card that left), which another tap can settle.
 */
export type OwnerUnsettled = "locked" | "failed"

type TransactionItem = {
  date: string
  sats: string
}

/**
 * What one tap produced, so the caller can open the screen for it
 * (`useTapFlashcard`). Nothing in either field is secret.
 */
export type FlashcardReadResult = {
  /** A Cashu card (ENG-616): what the card screen will show. */
  cashuCard?: CashuCardInfo
  /**
   * A Cashu card of an older protocol (0.x, Foxy 1.x): "This card needs an
   * update" was shown, nothing was read from it, and nothing was written.
   */
  needsUpdate?: boolean
  /** A BoltCard whose balance page loaded: the BoltCard screen has a card to show. */
  boltCard?: boolean
}

/**
 * What a read tap has from a Cashu card before AUTH (ENG-707): what GET_INFO,
 * GET_PUBKEY and GET_BALANCE said, none of it proven. Shown as "Verifying…"
 * while AUTH runs, and dropped when the tap ends, whatever its outcome:
 * nothing reads it to act, and nothing stores it. `unitTotals` is the unit
 * this phone recorded for the card when the balance is the one it recorded.
 */
export type CashuCardPreview = ReadPreview & { unitTotals?: CardUnitTotals }

/** A Cashu card as the app holds it: what the card said, plus what the mint said. */
export type CashuCardState = CashuCardInfo & {
  /**
   * The card's unspent value per unit. Defined once every keyset on the card
   * has a unit the mint named, on this read or an earlier one
   * (`flashcardV2.keysetUnits`). The mint's answer for this split defines it
   * too, counting a keyset the mint does not list toward `unknown`. Undefined
   * while any keyset has never been named and the mint has not answered (its
   * lookup is outstanding, or failed), or when the keyset split could not be
   * read: the screen then labels the card's figure "unit unknown".
   */
  unitTotals?: CardUnitTotals
  /**
   * The unit this phone recorded for the card (`KnownCard.unit`), set only
   * when the read has no keyset split (ENG-708: skipped offline or signed
   * out because the record names the unit, or lost) and the record's
   * `lastBalance` is the balance this read found, the rule
   * the record itself keeps its unit by. Display only: the screen labels the
   * figure with it rather than "unit unknown", and nothing decides on it
   * (top-up eligibility reads `unitTotals` alone). Dropped when an operation
   * moves the balance.
   */
  recordUnit?: string
  /**
   * Where this phone's key for the card's owner comes from, once the card
   * has taken it in the read tap (ENG-675; ALLOW_LOAD, `confirmOwnerKey`, or
   * on a locked card, which refuses ALLOW_LOAD, REFRESH, `refreshAsOwner`):
   * `seed` or `device` for one saved here or derived from the seed, offered
   * either way, since a saved key is not always one the card took; `dev` for
   * the development bridge's. Undefined for a card with no owner, one owned by
   * another phone (the card answered `6A91`), or one whose owner this tap
   * could not settle. Holding a key is not owning the card: every phone with
   * a seed derives one for every card.
   */
  ownerKeySource?: OwnerKeySource
  /**
   * The card has an owner, and the read tap could not settle whether it is
   * this phone (`tendCard`): a locked card with no REFRESH due is never
   * asked, and a Keychain that cannot be read, or a card that answers the
   * question with anything but `9000`, `6A91` or `6A90`, leaves it open. The
   * screen then says the owner is not confirmed rather than "Another phone",
   * and, by the reason (`OwnerUnsettled`), whether another tap can settle it.
   * `cardOwnership` reads it.
   */
  ownerUnsettled?: OwnerUnsettled
  /**
   * The card's limit on one payment, sats (0 is none), as the card said it
   * to this phone: under the owner's grant in the read tap (GET_INFO bytes
   * 30-33 after ALLOW_LOAD), or as this phone's SET_LIMIT wrote it since.
   * Undefined when this phone has had no such answer for the card on screen
   * (another phone's card, a locked one, the dev bridge's): the card says 0
   * to anyone else whatever it holds, so `paymentLimit` alone says nothing.
   * Kept apart from `paymentLimit` so a re-read without the grant (after a
   * PIN change, say) never turns it into that 0.
   */
  ownerPaymentLimit?: number
  /**
   * The tidy the card screen offers (ENG-702), worked out once per read, off
   * the tap: only on a signed-in read where the card took this phone's grant
   * (its owner, online), once the mint has named its fee. Undefined while it
   * is worked out, when the mint could not be asked, and when there is
   * nothing to offer; dropped when a card operation changes the pieces.
   */
  tidyOffer?: TidyOffer
}

/**
 * Whose card it is, as far as this phone knows: `none` for a card with no
 * owner; `mine` once the card took this phone's key (`ownerKeySource`);
 * `other` once the card refused this phone's proof (`6A91`, `6A90`) or this
 * phone holds no key for it at all; `unknown` when the read tap could not
 * settle it (`ownerUnsettled`). Only `other` is said as "Another phone".
 */
export type CardOwnership = "none" | "mine" | "other" | "unknown"

export const cardOwnership = (
  card: Pick<CashuCardState, "hasOwner" | "ownerKeySource" | "ownerUnsettled">,
): CardOwnership => {
  if (!card.hasOwner) return "none"
  if (card.ownerKeySource !== undefined) return "mine"
  return card.ownerUnsettled ? "unknown" : "other"
}

/**
 * Bytes 29, 30-33 and 38-41 of GET_INFO describe this tap only, or what the
 * card owes nobody: what the store keeps of a card's limits is what the owner
 * set, as far as a read can see it. The limit on one payment (bytes 30-33)
 * is the card's only under the owner's grant, so it is passed in apart, as
 * `ownerPaymentLimit`, and left out when the card did not say it to this phone.
 */
const limitsOf = (info: CardInfo, record?: CardRecord, payment?: number) => ({
  day: info.dailyLimit,
  allowance: info.allowance,
  ...(record ? { rollBudget: record.rollBudget, rolls: record.rolls } : {}),
  ...(payment === undefined ? {} : { payment }),
})

/** What an operation teaches this phone about the card that no re-read can say. */
type LearnedFromOperation = Pick<CashuCardState, "ownerKeySource" | "ownerPaymentLimit">

/**
 * What an operation proves about the card, in GET_INFO's terms and, for what
 * only GET_CARD says (the rollover budget, the mint), the record's.
 */
export type AssumedCard = Partial<CardInfo> & { record?: Partial<CardRecord> }

/** How a caller of `runCardOperation` learns about, or vouches for, the card afterwards. */
export type CardOperationOptions<T = unknown> = {
  /**
   * What the operation proves about the card once it has succeeded: SET_PIN
   * or CHANGE_PIN answering 9000 proves a PIN is set. Applied to the card on
   * screen (and, signed in, to its record) only when the re-read after a
   * successful operation is lost, so the screen never keeps showing the
   * state the operation just changed. `record` is merged into the card's
   * record, and also stands in for a lost GET_CARD when the rest of the
   * re-read came back (SET_LIMIT's rollover budget, say).
   */
  assume?: AssumedCard
  /**
   * What the operation taught this phone about the card that no re-read can
   * say (ENG-675): whose key its owner is (`ownerKeySource`, after a setup),
   * or the limit on one payment its owner's SET_LIMIT wrote
   * (`ownerPaymentLimit`), which the card says only under the grant. Given
   * as is, or worked out from the operation's result. Applied to the card on
   * screen once the operation has succeeded, re-read or not.
   */
  learned?: LearnedFromOperation | ((result: T) => LearnedFromOperation)
  /**
   * Called with what GET_INFO said when the card was re-read: after the
   * operation succeeded, or after the card refused it. Not called when there
   * was no re-read or it was lost.
   */
  onReread?: (info: CardInfo) => void
  /**
   * The operation may change the card's pieces without moving its balance or
   * its spent count (a tidy, ENG-702): the re-read reads the slots again, so
   * the screen and the next top-up see the pieces as they are now.
   */
  rereadSlots?: boolean
}

export interface FlashcardInterface {
  tag?: TagEvent
  k1?: string
  callback?: string
  lnurl?: string
  balanceInSats?: number
  transactions?: TransactionItem[]
  /** The last Cashu card this app session read: balance, PIN state, pubkey. */
  cashuCard?: CashuCardState
  /**
   * A read tap's card before it has proved its key (ENG-707): set at
   * GET_BALANCE, cleared when the tap ends. Never a verified card: `cashuCard`
   * is set only once AUTH has passed, and a failed AUTH leaves it as it was.
   */
  cashuCardPreview?: CashuCardPreview
  loading?: boolean
  error?: string
  /** Forgets the BoltCard: context and its persisted link. The Cashu card stays. */
  resetFlashcard: () => void
  /**
   * Forgets the Cashu card: context and this phone's record of it. The
   * BoltCard link stays. "Remove card" on the Cashu screen, and leaving that
   * screen signed out.
   */
  forgetCashuCard: () => void
  /**
   * One read tap. `onUnverified` runs once a Cashu card has said its balance,
   * before it proves its key (`cashuCardPreview` is then set): the card
   * screen can open on it while the tap goes on.
   */
  readFlashcard: (
    isPayment?: boolean,
    onUnverified?: () => void,
  ) => Promise<FlashcardReadResult>
  /**
   * One more tap, for something that changes the card: PIN, load, spend.
   * Opens a session, selects the applet, checks it is `expectedPubkey`'s card,
   * runs `op`, re-reads the card (GET_INFO + GET_BALANCE + GET_CARD) so
   * `cashuCard` shows the result, record and all, and releases.
   *
   * The re-read never costs the operation its outcome: once `op` has
   * succeeded its result is returned even if the card leaves before the
   * re-read, with `options.assume` applied instead. A card that refused `op`
   * (a `CardError`) is re-read too, because a refusal can change it (the
   * third wrong PIN blocks it), and the refusal is then rethrown unchanged. A
   * different card, a tag without the applet, or a lost channel gets no
   * re-read. Every failure is rethrown after the release; the caller owns the
   * message.
   *
   * `op` may `report` where it has got to (ENG-706): the text replaces the
   * scan sheet's prompt on Android and sets iOS's NFC sheet message, until the
   * operation ends. Fire-and-forget: `report` never waits on the screen, so a
   * card command never waits on it either.
   */
  runCardOperation: <T>(
    op: (transceive: Transceiver, report: (text: string) => void) => Promise<T>,
    expectedPubkey: string,
    options?: CardOperationOptions<T>,
  ) => Promise<T>
}

export const FlashcardContext = createContext<FlashcardInterface>({
  tag: undefined,
  k1: undefined,
  callback: undefined,
  lnurl: undefined,
  balanceInSats: undefined,
  transactions: undefined,
  cashuCard: undefined,
  cashuCardPreview: undefined,
  loading: undefined,
  error: undefined,
  resetFlashcard: () => {},
  forgetCashuCard: () => {},
  readFlashcard: async () => ({}),
  runCardOperation: async () => {
    throw new Error("FlashcardProvider is not mounted")
  },
})

/**
 * A preview (ENG-707) labelled with the unit this phone recorded for the card
 * (`KnownCard.unit`, kept only for a card whose pieces were all in one unit);
 * an empty card needs no unit. The balance may have moved since: a payment
 * spends pieces, it does not change their unit, so the label still holds.
 * Display only: the verified read replaces it with the keyset split read
 * after AUTH, and nothing is decided on it. A card this phone never labelled
 * has no unit until then.
 */
export const previewWithKnownUnit = (
  preview: ReadPreview,
  cards?: Record<string, KnownCard>,
): CashuCardPreview => {
  if (preview.balance === 0) return { ...preview, unitTotals: { byUnit: [], unknown: 0 } }
  const known = cards?.[preview.pubkey]
  if (!known?.unit) return preview
  return {
    ...preview,
    unitTotals: { byUnit: [{ unit: known.unit, amount: preview.balance }], unknown: 0 },
  }
}

/**
 * The unit this phone recorded for a card whose read has no keyset split,
 * as `CashuCardState.recordUnit`: only while the record's last balance is
 * the one this read found, the rule `cardSeen` keeps the record's unit by.
 * Undefined for a read that has the split, which the mint labels instead.
 * Display only. A read that cannot top up skips the split exactly when this
 * names its unit (ENG-708), and reads it otherwise, so the unit the mint
 * named before (`flashcardV2.keysetUnits`) still labels a balance that moved.
 */
export const recordedUnitFor = (
  card: Pick<CashuCardInfo, "pubkey" | "balance" | "keysets">,
  cards?: Record<string, KnownCard>,
): string | undefined => {
  if (card.keysets !== undefined) return undefined
  const known = cards?.[card.pubkey]
  return known?.unit !== undefined && known.lastBalance === card.balance
    ? known.unit
    : undefined
}

/** Hide-balance, from Apollo's cache: false where no client is mounted. */
const balanceHidden = (client?: ApolloClient<unknown>): boolean => {
  try {
    return (
      client?.readQuery<HideBalanceQuery>({ query: HideBalanceDocument })?.hideBalance ??
      false
    )
  } catch {
    return false
  }
}

/** What the scan sheet says while the card verifies (ENG-707): its figure, unless hidden. */
const scanSheetVerifying = (
  preview: CashuCardPreview,
  hidden: boolean,
  LL: TranslationFunctions,
): string =>
  hidden
    ? LL.FlashcardV2.scanVerifyingHidden()
    : LL.FlashcardV2.scanVerifying({
        amount: balanceLines(preview, LL)
          .map(({ text }) => text)
          .join(" · "),
      })

type ReadFlashcard = FlashcardInterface["readFlashcard"]

type Props = {
  children: string | JSX.Element | JSX.Element[]
}

export const FlashcardProvider = ({ children }: Props) => {
  const isAuthed = useIsAuthed()
  const { LL } = useI18nContext()
  const styles = useStyles()
  const { mode } = useTheme().theme

  const { updateState, persistentState } = usePersistentStateContext()

  const [visible, setVisible] = useState(false)
  // What a card operation says it is doing, in place of the sheet's prompt.
  const [operationText, setOperationText] = useState<string>()
  const [tag, setTag] = useState<TagEvent>()
  const [k1, setK1] = useState<string>()
  const [callback, setCallback] = useState<string>()
  const [lnurl, setLnurl] = useState<string>()
  const [balanceInSats, setBalanceInSats] = useState<number>()
  const [transactions, setTransactions] = useState<TransactionItem[]>()
  const [loading, setLoading] = useState<boolean>()
  const [error, setError] = useState<string>()
  const [cashuCard, setCashuCardState] = useState<CashuCardState>()
  // The Cashu card as the last write left it. An async flow (a card
  // operation's re-read, a late mint answer) decides against this, never
  // against the render that started it, which can predate a write the flow
  // has to respect. Every write goes through `setCashuCard`.
  const cashuCardRef = useRef<CashuCardState>()
  const setCashuCard = (card: CashuCardState | undefined) => {
    cashuCardRef.current = card
    setCashuCardState(card)
  }
  // Bumped by every Cashu read and every forget, so a mint lookup that
  // finishes late can tell it no longer describes the card on screen.
  const cashuGeneration = useRef(0)
  const dispatch = useAppDispatch()
  // What the mint has named before, kept across sessions: a split whose
  // keysets are all named is labelled at once, before the mint answers again.
  const knownKeysetUnits = useAppSelector((state) => state.flashcardV2.keysetUnits)
  const knownKeysetUnitsRef = useRef(knownKeysetUnits)
  knownKeysetUnitsRef.current = knownKeysetUnits
  const [cashuCardPreview, setCashuCardPreview] = useState<CashuCardPreview>()
  const knownCards = useAppSelector((state) => state.flashcardV2.cards)
  const knownCardsRef = useRef(knownCards)
  knownCardsRef.current = knownCards
  // Online as of the latest render, not the one that started a tap: a read
  // asks it once AUTH is done (ENG-708). A hint, debounced: `isOffline`
  // latches only after 8 s unreachable (cold launch included), so the first
  // 8 s offline still read the slots; recovery is immediate. A wrong
  // "offline" costs that tap its tidy offer and its spent slots, a wrong
  // "online" a slower tap.
  const { isOffline } = useConnectivity()
  const isOfflineRef = useRef(isOffline)
  isOfflineRef.current = isOffline
  /** A read that can top up or be offered a tidy: signed in and online. */
  const fullSlotRead = () => isAuthed && !isOfflineRef.current
  const { client: apollo } = useContext(getApolloContext())
  const verifyingText = (preview: CashuCardPreview) =>
    scanSheetVerifying(preview, balanceHidden(apollo), LL)

  /** A split's units from what the mint named before; undefined unless it named them all. */
  const knownUnitTotals = (keysets?: CardKeysetTotal[]): CardUnitTotals | undefined => {
    if (!keysets) return undefined
    const units = knownKeysetUnitsRef.current ?? {}
    return keysets.every(({ keysetId }) => units[keysetId.toLowerCase()] !== undefined)
      ? totalsByUnit(keysets, units)
      : undefined
  }

  useEffect(() => {
    loadFlashcard()
  }, [])

  const loadFlashcard = async () => {
    const { flashcardTag, flashcardHtml } = persistentState
    if (flashcardTag && flashcardHtml) {
      setTag(flashcardTag)
      getLnurl(flashcardHtml)
      getBalance(flashcardHtml)
      getTransactions(flashcardHtml)
    }
  }

  const readFlashcard: ReadFlashcard = async (isPayment, onUnverified) => {
    // The card's clock is fed from the newest header the phone holds; ask for
    // the tip now, off the tap, which never waits for it.
    refreshTipHeader().catch(() => undefined)
    // The seed's PBKDF2 runs once a session, here, before the tap: the read
    // tap derives an owned card's key from it (`confirmOwnerKey`).
    loadSeed().catch(() => undefined)
    // A development build's simulated card (cardsim) needs no NFC: a
    // simulator has none.
    if (getCardBridge()) return handleTag(isPayment, onUnverified)
    const isSupported = await NfcManager.isSupported()
    const isEnabled = await NfcManager.isEnabled()

    if (!isSupported) {
      toastShow({
        position: "top",
        message: "NFC is not supported on this device",
        type: "error",
      })
      return {}
    }
    if (!isEnabled) {
      toastShow({
        position: "top",
        message: "NFC is not enabled on this device.",
        type: "error",
      })
      return {}
    }
    return handleTag(isPayment, onUnverified)
  }

  const handleTag: ReadFlashcard = async (isPayment, onUnverified) => {
    let boltCard = false
    // Development builds only: the card is cardsim, over HTTP (ENG-634).
    const bridge = getCardBridge()
    try {
      setVisible(true)
      if (!bridge) NfcManager.start()
      // One NFC session covers both card types. A Cashu card is an IsoDep
      // JavaCard applet (lnflash/cashu-javacard); a BoltCard is an NDEF tag.
      // The request resolves with the tech the tapped card connected as, so
      // the Cashu read only runs on an IsoDep tag. A Type-4 tag that connected
      // as IsoDep still reports its NDEF message from getTag(), so a non-Cashu
      // IsoDep tag (e.g. an NTAG 424 BoltCard) continues into the NDEF flow on
      // the same tap. A rejected request (user cancel, timeout) propagates to
      // the outer catch; it must never open a second session.
      //
      // The applet SELECT is the first APDU on the wire, as in cardctl and
      // flash-pos. getTag() waits for the NDEF path: on Android it returns
      // the message cached at discovery, but on iOS it is a live Type-4 NDEF
      // read (NfcManager.m readNDEFWithCompletionHandler) that would SELECT
      // the NDEF application on a Cashu card, which has none, before we had
      // spoken to the applet at all.
      const tech = bridge
        ? NfcTech.IsoDep
        : await NfcManager.requestTechnology([NfcTech.IsoDep, NfcTech.Ndef])
      if (tech === NfcTech.IsoDep) {
        // A 2.0 read makes the card sign (AUTH) and, on the owner's phone,
        // check the owner's proof and take a block header: on-card work that
        // outlives Android's 618 ms default, which then reports
        // TagLostException on a card that never moved (see the helper).
        if (!bridge) await extendCardTimeout()
        let info: CashuCardInfo | null
        // Whose card it is, as the card said in this tap (`tendCard`).
        const ownership: TapOwnership = {}
        try {
          info = await readCashuCard(
            bridge
              ? bridgeTransceiver(bridge.url)
              : (bytes) => NfcManager.isoDepHandler.transceive(bytes),
            {
              afterAuth: (tap) => tendCard(tap, ownership),
              // The slots only for a read that can use them (ENG-708). A
              // top-up (the owner's, or a PIN top-up from another phone) and
              // the owner's tidy offer need the pieces and the spent slots,
              // and the phone signed in and online. Any other read needs the
              // pieces only to name the balance's unit, so it skips them
              // when this phone's record already names it for this balance,
              // and never reads the spent slots (a GET_PROOF each).
              needsPieces: (read) =>
                fullSlotRead() ||
                recordedUnitFor(read, knownCardsRef.current) === undefined,
              needsSpentSlots: fullSlotRead,
              // Nothing proven yet: shown as "Verifying…", never stored.
              onUnverified: (read) => {
                const preview = previewWithKnownUnit(read, knownCardsRef.current)
                setCashuCardPreview(preview)
                // iOS's own NFC sheet says it (iOS only, never awaited: the
                // helper ENG-706 added); Android's in-app sheet is below.
                if (!bridge)
                  setCardAlertMessage(verifyingText(preview)).catch(() => undefined)
                onUnverified?.()
              },
            },
          )
        } catch (err) {
          // A card of an older protocol: nothing more was sent to it, and it
          // is not a BoltCard either. The notice, then the tap is over.
          if (err instanceof CardNeedsUpdateError) {
            toastShow({
              position: "top",
              message: LL.FlashcardV2.needsUpdateBody(),
              type: "error",
            })
            return { needsUpdate: true }
          }
          // The card answered SELECT (or the channel itself dropped), so this
          // tap is over: it must not be re-read as a BoltCard. Every NDEF-side
          // failure toasts, so this one does too. Rethrowing keeps the outer
          // catch as the only logging site and the finally as the only release.
          // A card that could not prove its key (AUTH) stores nothing.
          toastShow({
            position: "top",
            message:
              err instanceof CardAuthError
                ? LL.FlashcardV2.authFailed()
                : "Couldn't read the card. Hold your phone steady against it and try again.",
            type: "error",
          })
          throw err
        }
        if (info) {
          // The card screen renders this; the caller navigates on the result.
          cashuGeneration.current += 1
          const known = knownUnitTotals(info.keysets)
          // Read before `cardSeen` below rewrites the record.
          const recordUnit = recordedUnitFor(info, knownCardsRef.current)
          // Under the grant the read's GET_INFO said the card's payment limit.
          const ownerPaymentLimit = ownership.granted ? info.paymentLimit : undefined
          setCashuCard({
            ...info,
            ...(known ? { unitTotals: known } : {}),
            ...(recordUnit === undefined ? {} : { recordUnit }),
            ...(ownership.key ? { ownerKeySource: ownership.key.source } : {}),
            ...(ownership.unsettled && !ownership.key
              ? { ownerUnsettled: ownership.unsettled }
              : {}),
            ...(ownerPaymentLimit === undefined ? {} : { ownerPaymentLimit }),
          })
          // Verified: the card replaces its preview, set first so that no
          // render has neither (the card screen would pop).
          setCashuCardPreview(undefined)
          // A signed-in phone remembers the card: the applet keeps no history
          // of its own, so this device-local record is the only one (ENG-616).
          // A read while signed out stays in memory, as a BoltCard's does.
          if (isAuthed) {
            dispatch(
              cardSeen({
                pubkey: info.pubkey,
                version: info.version,
                pinState: info.pinState,
                lastBalance: info.balance,
                owned: info.hasOwner,
                needsUpdate: false,
                limits: limitsOf(info, info.record, ownerPaymentLimit),
                at: Date.now(),
              }),
            )
            // Labelled at once, so the record says the same: `cardSeen` just
            // cleared its unit if the balance moved, and the home row reads it.
            // Unlabelled, the record keeps the unit `cardSeen` left it: one the
            // mint named for this same balance stands, even when no keyset
            // units were kept (a record from a build before `keysetUnits`).
            if (known) {
              dispatch(cardUnitResolved({ pubkey: info.pubkey, unit: soleUnit(known) }))
            }
          }
          // The mint names the units: ask it off the NFC session, which the
          // finally below releases without waiting.
          resolveCashuUnits(info, cashuGeneration.current)
          // The owner's phone, online, may offer a tidy (ENG-702): the mint
          // names the fee off the session too. The dev bridge's key is the
          // simulated card's owner by construction (a development build's
          // e2e flows), and is never offered as the read's grant.
          // Gated on what the read did, not on the connectivity hint now:
          // `isOffline` clears the moment the phone is back, which can be
          // during the slot read, after it skipped the spent slots. A tidy
          // run on such a read would ask the mint about no spent slot and
          // free none, so only a read that took both is offered one.
          const owner = ownership.granted || ownership.key?.source === "dev"
          if (isAuthed && owner && info.unspentSlots && info.spentSlots !== undefined) {
            resolveTidyOffer(info, cashuGeneration.current)
          }
          return { cashuCard: info }
        }
        // The applet SELECT was refused: not a Cashu card. Parse the same
        // tag's NDEF message below.
      }
      // A bridge carries APDUs only: there is no NDEF tag behind it.
      if (bridge) return {}
      const tag = await NfcManager.getTag()
      if (tag && tag.id) {
        const ndefRecord = tag?.ndefMessage?.[0]
        // eslint-disable-next-line no-negated-condition
        if (!ndefRecord) {
          toastShow({
            position: "top",
            message:
              "Card data not readable. Please try holding your phone closer to the card and scan again.",
            type: "error",
          })
        } else {
          setLoading(true)
          const payload = Ndef.text.decodePayload(new Uint8Array(ndefRecord.payload))
          if (payload.startsWith("lnurlw")) {
            if (isPayment) {
              await getPayDetails(payload)
            } else {
              boltCard = await getHtml(tag, payload)
            }
          }
          setLoading(false)
        }
      } else {
        toastShow({
          position: "top",
          message:
            "No card detected. Please hold your phone steady against the card and try again.",
          type: "error",
        })
      }
    } catch (ex) {
      console.warn("Oops!", ex)
    } finally {
      // A preview (ENG-707) lasts as long as its tap: `cashuCard` is the proof.
      setCashuCardPreview(undefined)
      cancelTechnologyRequest()
    }
    return boltCard ? { boltCard } : {}
  }

  /**
   * Puts the mint's units on a Cashu card that was just read: per-unit totals
   * on the card in context and, signed in, the card's single unit (if it has
   * exactly one) on its record. A mint that cannot be reached leaves the card
   * as the read labelled it, and the record's unit as the read left it: named
   * from the units the mint named before (`flashcardV2.keysetUnits`) when it
   * had named every keyset on the card. So the screen says "unit unknown"
   * only when a keyset was never named, or when the read lost the keyset
   * split and there is nothing to ask about. The next read asks again. A
   * newer read, or a forget, in the meantime wins; signed in, the units the
   * mint names are kept for later reads either way.
   */
  const resolveCashuUnits = async (card: CashuCardInfo, generation: number) => {
    const answer = await cardUnitTotals(card)
    if (!answer) return
    // Facts about the mint's keysets: kept whatever the card does next.
    if (answer.units && isAuthed) dispatch(keysetUnitsLearned(answer.units))
    const { unitTotals } = answer
    if (generation !== cashuGeneration.current) return
    // Totals belong to the split they were computed from. A card operation
    // that moved value since then dropped that split, and the record's unit
    // with it (`recordCardOperation`): a stale answer restores neither.
    const current = cashuCardRef.current
    if (!current || current.keysets !== card.keysets) return
    setCashuCard({ ...current, unitTotals })
    if (isAuthed) {
      dispatch(cardUnitResolved({ pubkey: card.pubkey, unit: soleUnit(unitTotals) }))
    }
  }

  /**
   * Puts the tidy offer on a card just read under the owner's grant (ENG-702,
   * `tidyOfferForRead`), unless a newer read, a forget, or an operation that
   * changed the pieces came first.
   */
  const resolveTidyOffer = async (card: CashuCardInfo, generation: number) => {
    const offer = await tidyOfferForRead(card)
    const current = cashuCardRef.current
    if (!offer || generation !== cashuGeneration.current) return
    if (!current || current.unspentSlots !== card.unspentSlots) return
    setCashuCard({ ...current, tidyOffer: offer })
  }

  /**
   * Puts what a card operation learned on the card in context and, signed
   * in, on its record. Only the card on screen is touched: the operation ran
   * against it (`runCardOperation` checked the pubkey), and a card forgotten
   * while the tap ran stays forgotten.
   *
   * The keyset split, and the units the mint named for it, describe the
   * balance the tap read. A balance that changed leaves neither true, so both
   * are replaced: the new split is labelled at once when the mint has named
   * all its keysets before, and is otherwise dropped, in context and from the
   * record's unit, so the screen says "unit unknown" until the mint answers
   * rather than show old per-unit figures beside a new total.
   *
   * The spent slots describe the card's spent count the same way: a count
   * that changed (a top-up's load tap freed the settled ones, ENG-631) or a
   * balance that moved replaces them with the slots read in the same
   * session, or drops them when that read was lost; `pieces` as the split.
   */
  const recordCardOperation = (
    pubkey: string,
    { record: recordUpdate, ...update }: AssumedCard & { balance?: number },
    {
      slots,
      piecesChanged = false,
    }: { slots?: CardSlotRead; piecesChanged?: boolean } = {},
  ) => {
    const previous = cashuCardRef.current
    if (previous?.pubkey !== pubkey) return
    // The record as the operation left it: GET_CARD's whole answer, or what
    // the operation proves of it, over what the card said before.
    const record = recordUpdate
      ? { ...previous.record, ...recordUpdate }
      : previous.record
    const moved = update.balance !== undefined && update.balance !== previous.balance
    const spentChanged = update.spent !== undefined && update.spent !== previous.spent
    const keysets = slots?.keysets
    // The new split is labelled at once when the mint named its keysets before.
    const known = moved ? knownUnitTotals(keysets) : undefined
    // The pieces themselves changed (a tidy) or the value did: the pieces
    // read in the same session replace the old ones, and an offer made for
    // the old ones goes (ENG-702).
    const reshaped = moved || piecesChanged
    const card: CashuCardState = {
      ...previous,
      ...update,
      record,
      // A split read in the same session as the move replaces the old one.
      keysets: moved ? keysets : previous.keysets,
      spentSlots:
        moved || spentChanged || piecesChanged ? slots?.spentSlots : previous.spentSlots,
      pieces: reshaped ? slots?.pieces : previous.pieces,
      unspentSlots: reshaped ? slots?.unspent : previous.unspentSlots,
      unitTotals: moved ? known : previous.unitTotals,
      // The recorded unit was for the balance the read found.
      recordUnit: moved ? undefined : previous.recordUnit,
      tidyOffer: reshaped ? undefined : previous.tidyOffer,
    }
    setCashuCard(card)
    if (moved && keysets) {
      // Name the units of the new split, off the NFC session; a newer read
      // or a forget still wins (`resolveCashuUnits`).
      cashuGeneration.current += 1
      resolveCashuUnits(card, cashuGeneration.current)
    }
    // Signed out, a card stays in memory only, as on a tap.
    if (isAuthed) {
      dispatch(
        cardSeen({
          pubkey,
          version: card.version,
          pinState: card.pinState,
          lastBalance: card.balance,
          owned: card.hasOwner,
          needsUpdate: false,
          limits: limitsOf(card, card.record, card.ownerPaymentLimit),
          at: Date.now(),
        }),
      )
      if (moved) {
        dispatch(cardUnitResolved({ pubkey, unit: known ? soleUnit(known) : undefined }))
      }
    }
  }

  /**
   * Re-reads the card after an operation (GET_INFO + GET_BALANCE + GET_CARD)
   * and records what it says. GET_CARD is read because an operation can
   * change the record (SET_LIMIT's rollover budget, SET_CARD's mint, a
   * REFRESH's roll count) and the card on screen must not keep the old one:
   * the limits screen opens its budget field at it, and a SET_LIMIT always
   * writes the budget. Best effort: resolves what GET_INFO said, or undefined
   * when the card left first. A GET_CARD lost after the rest came back keeps
   * the rest, with `assumeRecord` (what the operation proves of the record)
   * over the record the card said before. The operation's own outcome stands
   * either way, so a lost re-read is logged (error name only) and never thrown.
   */
  const rereadCard = async (
    transceive: Transceiver,
    pubkey: string,
    {
      assumeRecord,
      rereadSlots = false,
    }: {
      assumeRecord?: Partial<CardRecord>
      rereadSlots?: boolean
    } = {},
  ): Promise<CardInfo | undefined> => {
    try {
      const info = await getInfo(transceive)
      const balance = await getCardBalance(transceive)
      const record: Partial<CardRecord> | undefined = await getCardRecord(
        transceive,
      ).catch((err) => {
        console.warn("Cashu card record re-read failed:", describeError(err))
        return assumeRecord
      })
      // An operation that moved value (a top-up) changed the card's keyset
      // split too, and one that freed spent slots (the top-up's reclaim,
      // ENG-631) changed its spent count: read the slots while the card is
      // still in the field, best effort, as a tap does, so the screen can
      // name the units again and the next top-up knows what is still spent.
      const previous = cashuCardRef.current
      const same = previous?.pubkey === pubkey
      const changed =
        same &&
        (rereadSlots || balance !== previous.balance || info.spent !== previous.spent)
      const slots = changed ? await readKeysetSplit(transceive, info) : undefined
      recordCardOperation(
        pubkey,
        { ...info, balance, record },
        { slots, piecesChanged: same && rereadSlots },
      )
      return info
    } catch (err) {
      console.warn("Cashu card re-read after an operation failed:", describeError(err))
      return undefined
    }
  }

  const runCardOperation = async <T,>(
    op: (transceive: Transceiver, report: (text: string) => void) => Promise<T>,
    expectedPubkey: string,
    { assume, onReread, learned, rereadSlots }: CardOperationOptions<T> = {},
  ): Promise<T> => {
    // Development builds only: the card is cardsim, over HTTP (ENG-634).
    const bridge = getCardBridge()
    // Never awaited: the next APDU goes out while the screen catches up.
    const report = (text: string) => {
      setOperationText(text)
      if (!bridge) setCardAlertMessage(text).catch(() => undefined)
    }
    setOperationText(undefined)
    setVisible(true)
    if (!bridge) NfcManager.start()
    try {
      let transceive: Transceiver
      if (bridge) {
        transceive = bridgeTransceiver(bridge.url)
      } else {
        // IsoDep only: this tap is for the applet, never for an NDEF tag.
        await NfcManager.requestTechnology(NfcTech.IsoDep)
        // On-card work can outlive Android's 618 ms default (see the helper).
        await extendCardTimeout()
        transceive = (bytes) => NfcManager.isoDepHandler.transceive(bytes)
      }
      // A fresh IsoDep channel resets the active applet; without a SELECT
      // Android answers every command with 6E00 (flash-pos found this). On
      // the bridge, SELECT is what ends the previous "tap": it drops a
      // verified PIN as a new NFC session does.
      await selectApplet(transceive)
      const pubkey = toHex(await getPubkey(transceive))
      if (pubkey !== expectedPubkey) throw new WrongCardError(pubkey)

      // After a refusal nothing the operation would prove holds, so a lost
      // GET_CARD keeps the record the card said before.
      const reread = async (assumeRecord?: Partial<CardRecord>) => {
        const info = await rereadCard(transceive, expectedPubkey, {
          assumeRecord,
          rereadSlots,
        })
        if (info) onReread?.(info)
        return info
      }

      let result: T
      try {
        result = await op(transceive, report)
      } catch (err) {
        // The card answered and refused: the channel is alive and this is
        // the card on screen (GET_PUBKEY above). A refusal can change the
        // card, and the third wrong PIN blocks it, so read what it did before
        // handing the refusal back unchanged. A lost channel, or a tag the
        // applet cannot be selected on, gets no re-read.
        if (err instanceof CardError && !(err instanceof AppletNotSelectedError)) {
          await reread()
        }
        throw err
      }
      // The operation's outcome is settled: a card that leaves before the
      // re-read must not turn a write that landed into a failure (a PIN the
      // holder would then retype as the old one). What the operation itself
      // proves stands in for the lost re-read.
      if (!(await reread(assume?.record)) && assume) {
        recordCardOperation(expectedPubkey, assume)
      }
      if (learned) {
        const current = cashuCardRef.current
        const facts = typeof learned === "function" ? learned(result) : learned
        if (current?.pubkey === expectedPubkey) setCashuCard({ ...current, ...facts })
      }
      return result
    } finally {
      // Also clears the op's text (`cancelTechnologyRequest`).
      cancelTechnologyRequest()
    }
  }

  const getPayDetails = async (payload: string) => {
    try {
      const lnurlParams = await getParams(payload)
      if ("tag" in lnurlParams && lnurlParams.tag === "withdrawRequest") {
        const { k1, callback } = lnurlParams
        // Never log k1 or callback: together they authorise a withdrawal from the card.
        setK1(k1)
        setCallback(callback)
      } else {
        // Fixed text only: the payload and the server's reason string can both
        // carry the card's withdraw URL, which must never be shown or logged.
        toastShow({
          position: "top",
          message: "This card is not set up as a Flashcard. Please tap a Flashcard.",
          type: "error",
        })
      }
    } catch (err) {
      console.warn("NFC withdraw params lookup failed:", describeError(err))
      toastShow({
        position: "top",
        message: "Unsupported NFC card. Please ensure you are using a flashcard.",
        type: "error",
      })
    }
  }

  /** Loads a BoltCard's balance page; true when it named the card's lnurl. */
  const getHtml = async (tag: TagEvent, payload: string): Promise<boolean> => {
    try {
      // Extract the full URL from the payload instead of just the query parameters
      const urlMatch = payload.match(/lnurlw?:\/\/[^?]+/)
      if (!urlMatch) {
        throw new Error("No valid URL found in payload")
      }
      let baseUrl = urlMatch[0].replace(/^lnurlw?:\/\//, "https://")
      // Convert boltcard endpoint to boltcards/balance endpoint
      if (baseUrl.includes("/boltcard")) {
        baseUrl = baseUrl.replace("/boltcard", "/boltcards/balance")
      }
      const payloadPart = payload.split("?")[1]
      const url = `${baseUrl}?${payloadPart}`
      const response = await axios.get(url)
      const html = response.data

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      updateState((state: any) => {
        if (state)
          return {
            ...state,
            flashcardAdded: isAuthed ? true : undefined,
            flashcardTag: isAuthed ? tag : undefined,
            flashcardHtml: isAuthed ? html : undefined,
          }
        return undefined
      })
      setTag(tag)

      const found = getLnurl(html)
      getBalance(html)
      getTransactions(html)
      return found
    } catch (err) {
      console.warn("NFC balance page fetch failed:", describeError(err))
      toastShow({
        position: "top",
        message:
          "Unsupported NFC card. Please ensure you are using a flashcard or other boltcard compatible NFC",
        type: "error",
      })
      return false
    }
  }

  const getLnurl = (html: string): boolean => {
    const lnurlMatch = html.match(/href="lightning:(lnurl\w+)"/)
    if (lnurlMatch) {
      setLnurl(lnurlMatch[1])
      return true
    }
    return false
  }

  const getBalance = (html: string) => {
    const balanceMatch = html.match(/(\d{1,3}(?:,\d{3})*)\s*SATS<\/dt>/)
    if (balanceMatch) {
      const parsedBalance = balanceMatch[1].replace(/,/g, "") // Remove commas
      const satoshiAmount = parseInt(parsedBalance, 10)
      setBalanceInSats(satoshiAmount)
    }
  }

  const getTransactions = (html: string) => {
    // Extract dates and SATS amounts
    const transactionMatches = [
      ...html.matchAll(
        /<time datetime="(.*?)".*?>.*?<\/time>\s*<\/td>\s*<td.*?>\s*<span.*?>(-?\d{1,3}(,\d{3})*) SATS<\/span>/g,
      ),
    ]
    const data = transactionMatches.map((match) => ({
      date: match[1], // Extracted datetime value
      sats: match[2], // Convert SATS value to integer
    }))
    setTransactions(data)
  }

  const cancelTechnologyRequest = () => {
    setVisible(false)
    // No operation's text outlives it, or shows on the next one's sheet.
    setOperationText(undefined)
    // A bridge tap opened no NFC session.
    if (!getCardBridge()) NfcManager.cancelTechnologyRequest()
  }

  const resetFlashcard = async () => {
    setTag(undefined)
    setK1(undefined)
    setCallback(undefined)
    setLnurl(undefined)
    setBalanceInSats(undefined)
    setTransactions(undefined)
    setLoading(undefined)
    setError(undefined)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateState((state: any) => {
      if (state)
        return {
          ...state,
          flashcardTag: undefined,
          flashcardHtml: undefined,
        }
      return undefined
    })
  }

  const forgetCashuCard = () => {
    // A unit lookup still in flight must not write to a card that is gone.
    cashuGeneration.current += 1
    if (cashuCard) dispatch(cardForgotten({ pubkey: cashuCard.pubkey }))
    setCashuCard(undefined)
    setCashuCardPreview(undefined)
  }

  return (
    <FlashcardContext.Provider
      value={{
        tag,
        k1,
        callback,
        lnurl,
        balanceInSats,
        transactions,
        cashuCard,
        cashuCardPreview,
        loading,
        error,
        resetFlashcard,
        forgetCashuCard,
        readFlashcard,
        runCardOperation,
      }}
    >
      {/* The frame the scan sheet renders inline in: the whole app. */}
      <View style={styles.root}>
        {children}
        {loading && <Loading />}
        <RNModal
          isVisible={visible && Platform.OS === "android"}
          onBackdropPress={cancelTechnologyRequest}
          // Back reaches the sheet through react-native-modal's BackHandler
          // listener (inline, no native dialog catches it), added when this
          // provider mounts. BackHandler runs the newest listener first, so
          // this one has to be added after React Navigation's. It is, only
          // because NavigationContainer adds its listener while it renders
          // nothing, waiting on the async getInitialURL
          // (navigation-container-wrapper.tsx), and mounts this provider later.
          // Mount the provider above NavigationContainerWrapper, or make
          // getInitialURL synchronous, and Back on a card screen pops it and
          // leaves the sheet and the read up. flashcard-scan-sheet.spec.tsx
          // presses Back through the real container, so it catches the
          // second; app.tsx marks the first.
          onBackButtonPress={cancelTechnologyRequest}
          backdropColor={mode === "dark" ? "rgb(57,57,57)" : "black"}
          backdropOpacity={mode === "dark" ? 0.7 : 0.5}
          style={styles.sheetModal}
          // A bottom-pinned sheet. React Native's own Modal host measures
          // it wrongly on Android under Fabric (#545): it drew off-screen, with no
          // Cancel in reach. Inline, as modal-nfc renders (#674).
          coverScreen={false}
        >
          <SafeAreaView edges={["bottom"]} style={styles.container}>
            <View style={styles.main}>
              <Text type="h02" bold>
                Ready to Scan
              </Text>
              {/* A read's figure once the card has said it (ENG-707), else a card
                  operation's progress (ENG-706): never both, as a read tap and an
                  operation's tap never overlap. */}
              <Text
                type="bm"
                testID={
                  cashuCardPreview
                    ? "flashcard-scan-sheet-verifying"
                    : "flashcard-scan-sheet-status"
                }
              >
                {cashuCardPreview
                  ? verifyingText(cashuCardPreview)
                  : operationText ?? "Please tap NFC tags"}
              </Text>
              <Animatable.View
                animation="pulse"
                easing="ease-out"
                iterationCount="infinite"
              >
                <NfcScan width={width / 2} height={width / 2} style={styles.nfcScan} />
              </Animatable.View>
            </View>
            <PrimaryBtn type="clear" label="Cancel" onPress={cancelTechnologyRequest} />
          </SafeAreaView>
        </RNModal>
      </View>
    </FlashcardContext.Provider>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  root: {
    flex: 1,
  },
  nfcScan: {
    marginVertical: 40,
  },
  sheetModal: {
    margin: 0,
    justifyContent: "flex-end",
  },
  container: {
    borderTopLeftRadius: 50,
    borderTopRightRadius: 50,
    backgroundColor: colors.white,
    padding: 20,
  },
  main: {
    alignItems: "center",
  },
}))
