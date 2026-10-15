import React, { useEffect, useRef, useState } from "react"
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  TouchableOpacity,
  View,
} from "react-native"
import { NfcError } from "react-native-nfc-manager"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"

import { AmountInput } from "@app/components/amount-input"
import { PrimaryBtn } from "@app/components/buttons"
import { PinPad } from "@app/components/card/PinPad"
import { Screen } from "@app/components/screen"
import { useFeatureFlags } from "@app/config/feature-flags-context"
import { CashuCardState, cardOwnership } from "@app/contexts/Flashcard"
import { WalletCurrency, useHomeAuthedQuery } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { getCashWallet } from "@app/graphql/wallets-utils"
import { nudgeTopUpMinter, useCardTopUp } from "@app/hooks/use-card-top-up"
import { useDisplayCurrency } from "@app/hooks/use-display-currency"
import { usePriceConversion } from "@app/hooks/use-price-conversion"
import { useFlashcard } from "@app/hooks/useFlashcard"
import { useI18nContext } from "@app/i18n/i18n-react"
import { TranslationFunctions } from "@app/i18n/i18n-types"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { MoneyAmount, WalletOrDisplayCurrency, toWalletAmount } from "@app/types/amounts"
import {
  CardError,
  CardNeedsUpdateError,
  PIN_MAX_LENGTH,
  WrongCardError,
  isValidCardPin,
  triesLeft,
} from "@app/utils/cashu-card"
import { stubbedPayOutcome } from "@app/utils/cashu-card-bridge"
import { formatUnitAmount } from "@app/utils/cashu-card-format"
import {
  CardUnit,
  MAX_TOPUP_AMOUNT,
  ReclaimPlan,
  ReclaimResult,
  TopUpAmountProblem,
  TopUpError,
  TopUpRecord,
  cancelTopUp,
  cardCommitments,
  mintTopUp,
  payTopUp,
  prepareTopUp,
  slotsNeeded,
  topUpAmountProblem,
} from "@app/utils/cashu-card-topup"

import { shortPubkey } from "./flashcard-v2"

type LLType = TranslationFunctions

/** What the amount step says for a `topUpAmountProblem` reason. */
const amountProblemText = (
  LL: LLType,
  kind: TopUpAmountProblem,
  { unit, needed, free }: { unit: CardUnit; needed: number; free: number },
): string => {
  switch (kind) {
    case "too-much":
      return LL.FlashcardV2.topUpTooMuch({
        max: formatUnitAmount(MAX_TOPUP_AMOUNT, unit, LL),
      })
    case "no-room":
      return LL.FlashcardV2.topUpNoRoom({ needed, free })
    case "over-balance":
      return LL.FlashcardV2.topUpMoreThanBalance()
  }
}

/**
 * How long this screen waits for the mint to see a payment before offering to
 * leave. The app keeps asking after that (`useTopUpMinter`) until the quote
 * expires, and mints without the card: a sat top-up is a Lightning payment
 * out of IBEX to the mint's phoenixd, not an intraledger one, so PENDING and
 * a slow settle are normal.
 */
const MINT_POLL_MS = 1500
const MINT_POLL_ATTEMPTS = 10
const SW_PIN_BLOCKED = 0x6983

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

/**
 * Whether this card can take a top-up, and in which unit (ENG-616 D1: a card
 * holds one unit, sats by default). A card holding value takes top-ups only
 * in that value's unit, so a card is never mixed; an empty card can take
 * either. A top-up paid for and not on the card yet commits the card to its
 * unit just the same (`unfinishedUnits`), or it would land beside another.
 * A card with no owner takes no load at all (6A90), so it is set up first
 * (`not-set-up`). A blocked PIN is refused unless this phone is the card's
 * owner, as the card said at the read (`cardOwnership` is `mine`: the card
 * took this phone's key): the owner's grant loads without the PIN, and anyone
 * else's load would need it, so a blocked card owned by another phone, or one
 * whose owner the read could not settle, is refused before any quote. A PIN state or a unit this app cannot
 * read is refused too.
 * While `usdEnabled` (the cashuCardUsdEnabled flag) is off, a card whose
 * unit is USD takes no new top-up: flash-pos charges every card proof as
 * sats until ENG-619. An unfinished USD top-up is still finished: a resume
 * never asks this.
 */
export type TopUpEligibility =
  /** `committed`: the unit is fixed by an unfinished top-up, not by the card's value. */
  | { ok: true; unit: CardUnit | "choose"; committed?: boolean }
  | {
      ok: false
      reason:
        | "not-set-up"
        | "blocked"
        | "pin-unknown"
        | "mixed"
        | "unit-unknown"
        | "reread"
        | "unfinished-unit"
        | "usd-off"
        | "usd-off-unfinished"
    }

/**
 * Whether the top-up asks for the card's PIN before paying. This phone is the
 * card's owner (the card took its key at the read): its load tap needs no PIN.
 * A phone the card refused (`6A91`) is asked before paying. One whose
 * ownership the read could not settle is not: its load tap offers the owner's
 * grant first and asks for the PIN only if the card refuses it (`not-owner`),
 * so an owner is never asked for a PIN it may not have.
 */
export const asksForPinBeforePaying = (
  card: Pick<
    CashuCardState,
    "pinState" | "hasOwner" | "ownerKeySource" | "ownerUnsettled"
  >,
): boolean => card.pinState === "set" && cardOwnership(card) === "other"

/**
 * The card has spent slots that its last read never looked at: a read that
 * skipped the GET_PROOFs (offline, or signed out: ENG-708) leaves
 * `spentSlots` undefined. A load from such a read asks the mint about no
 * spent slot, frees none, and counts every one as still settling, so a load
 * that needs them is refused with a reason that is not true. The card is read
 * again first (`reread`). A resumed top-up skips `topUpEligibility`, so its
 * load is refused the same way; the record stays saved, to finish once the
 * card has been read again.
 */
export const spentSlotsUnread = (card: Pick<CashuCardState, "spent" | "spentSlots">) =>
  card.spent > 0 && card.spentSlots === undefined

export const topUpEligibility = (
  card: CashuCardState,
  {
    unfinishedUnits = [],
    usdEnabled,
  }: { unfinishedUnits?: readonly CardUnit[]; usdEnabled: boolean },
): TopUpEligibility => {
  if (!card.hasOwner) return { ok: false, reason: "not-set-up" }
  const ownedHere = cardOwnership(card) === "mine"
  if (card.pinState === "blocked" && !ownedHere) return { ok: false, reason: "blocked" }
  if (card.pinState === "unknown") return { ok: false, reason: "pin-unknown" }
  if (spentSlotsUnread(card)) return { ok: false, reason: "reread" }
  let cardUnit: CardUnit | undefined
  if (card.balance > 0) {
    const totals = card.unitTotals
    if (!totals) return { ok: false, reason: "unit-unknown" }
    if (totals.unknown > 0 || totals.byUnit.length !== 1)
      return { ok: false, reason: "mixed" }
    const [{ unit }] = totals.byUnit
    if (unit !== "sat" && unit !== "usd") return { ok: false, reason: "mixed" }
    cardUnit = unit
  }
  const units = new Set<CardUnit>(unfinishedUnits)
  if (cardUnit) units.add(cardUnit)
  if (units.size > 1) return { ok: false, reason: "unfinished-unit" }
  const [only] = [...units]
  if (!only) return { ok: true, unit: "choose" }
  if (only === "usd" && !usdEnabled) {
    return { ok: false, reason: cardUnit ? "usd-off" : "usd-off-unfinished" }
  }
  return cardUnit ? { ok: true, unit: only } : { ok: true, unit: only, committed: true }
}

const refusal = (reason: Exclude<TopUpEligibility, { ok: true }>["reason"], LL: LLType) =>
  ({
    "not-set-up": LL.FlashcardV2.topUpCantNotSetUp(),
    "blocked": LL.FlashcardV2.topUpCantBlocked(),
    "pin-unknown": LL.FlashcardV2.topUpCantPinUnknown(),
    "mixed": LL.FlashcardV2.topUpCantMixed(),
    "unit-unknown": LL.FlashcardV2.topUpCantUnknownUnit(),
    "reread": LL.FlashcardV2.topUpCantReread(),
    "unfinished-unit": LL.FlashcardV2.topUpCantUnfinishedUnit(),
    "usd-off": LL.FlashcardV2.topUpCantUsd(),
    "usd-off-unfinished": LL.FlashcardV2.topUpCantUsdUnfinished(),
  }[reason])

const mintFailure = (err: unknown, LL: LLType): string => {
  if (!(err instanceof TopUpError)) return LL.FlashcardV2.topUpFailed()
  if (err.reason === "expired") return LL.FlashcardV2.topUpMintExpired()
  if (err.reason === "dleq" || err.reason === "mint-mismatch" || err.reason === "restore")
    return LL.FlashcardV2.topUpMintRefused()
  // Not "your top-up is saved": it is not.
  if (err.reason === "not-found") return LL.FlashcardV2.topUpGone()
  return LL.FlashcardV2.topUpFailed()
}

/**
 * A load the engine or the mint stopped before the card was written to:
 * never "no card found", which would send the user tapping a card the phone
 * never reached. A card without the room says how many spent slots are still
 * owed at the mint (the reclaim that ran in the same tap, `err.reclaim`):
 * they are the room the next load tap may free.
 */
const loadFailure = (err: TopUpError, LL: LLType): string => {
  switch (err.reason) {
    case "slots": {
      const settling = err.reclaim?.settling ?? 0
      const noRoom = LL.FlashcardV2.topUpNoRoomOnCard()
      return settling > 0
        ? `${noRoom} ${LL.FlashcardV2.topUpSlotsSettling({ count: settling })}`
        : noRoom
    }
    case "mint-unreachable":
      return LL.FlashcardV2.topUpMintUnreachable()
    case "not-found":
      return LL.FlashcardV2.topUpGone()
    case "not-owner":
      return LL.FlashcardV2.topUpNotOwner()
    case "needs-update":
      return LL.FlashcardV2.needsUpdateBody()
    default:
      return LL.FlashcardV2.topUpFailed()
  }
}

/**
 * What a PIN tap that failed means (a check before paying, or a load): a
 * different card, a card that needs an update, a wrong PIN with the tries
 * left, a PIN now blocked (2.0: the owner's phone unblocks it), or no card.
 */
const pinFailure = (err: unknown, LL: LLType): { message: string; final: boolean } => {
  if (err instanceof WrongCardError) {
    return { message: LL.FlashcardV2.wrongCard(), final: false }
  }
  if (err instanceof CardNeedsUpdateError) {
    return { message: LL.FlashcardV2.needsUpdateBody(), final: true }
  }
  if (err instanceof CardError) {
    const tries = triesLeft(err.sw)
    if (tries === 0 || err.sw === SW_PIN_BLOCKED) {
      return { message: LL.FlashcardV2.cardNowBlocked(), final: true }
    }
    if (tries !== undefined) {
      return { message: LL.FlashcardV2.wrongPin({ tries }), final: false }
    }
  }
  return { message: LL.FlashcardV2.cardNotFound(), final: false }
}

const NO_COMMITMENTS: { slots: number; units: CardUnit[] } = { slots: 0, units: [] }
const NO_RECLAIM: ReclaimPlan = { reclaimable: 0, settling: 0 }

type Step =
  | { name: "loading" }
  | { name: "refused"; message: string }
  | { name: "amount" }
  /** "check": prove the PIN before paying; "load": a resumed load, PIN then tap. */
  | { name: "pin"; purpose: "check" | "load"; record?: TopUpRecord }
  | { name: "confirm"; record: TopUpRecord; fee?: number }
  | { name: "working"; record: TopUpRecord; message: string; canLeave?: boolean }
  | { name: "load"; record: TopUpRecord }
  /** `reclaim`: what the load tap's reclaim of spent slots found; none on a resume of a loaded top-up. */
  | { name: "done"; record: TopUpRecord; reclaim?: ReclaimResult }

/**
 * Top up a Cashu card from the Cash wallet (ENG-616 PR 2).
 *
 * The app quotes at the mint it is connected to, the Cash wallet pays the
 * mint's invoice, the app mints outputs locked to this card, and one tap
 * writes them on. Every step is saved before it runs (`cashu-card-topup`), so
 * leaving at any point loses nothing: the card's screen offers to finish.
 *
 * On a card this phone owns, the load tap opens with the owner's grant
 * (ALLOW_LOAD) and asks for no PIN (card protocol 2.0). On a card with a PIN
 * that another phone owns, the PIN is checked with a tap BEFORE anything is
 * paid: a wrong PIN found at the load tap instead would cost tries on value
 * already paid for. The PIN lives in this screen's state only.
 */
export const FlashcardV2TopUpScreen = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const { params } = useRoute<RouteProp<RootStackParamList, "FlashcardV2TopUp">>()
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { cashuCardUsdEnabled } = useFeatureFlags()
  const { cashuCard } = useFlashcard()
  const { deps, feeFor, checkPin, load, reclaimPlanFor } = useCardTopUp()
  const { convertMoneyAmount } = usePriceConversion()
  const { formatMoneyAmount } = useDisplayCurrency()
  const isAuthed = useIsAuthed()
  const { data } = useHomeAuthedQuery({ skip: !isAuthed, fetchPolicy: "cache-first" })
  const cashWallet = getCashWallet(data?.me?.defaultAccount?.wallets)

  // What the card's unfinished top-ups already hold of it: slots and unit.
  // Read once for a new top-up; prepareTopUp checks them again, from the
  // store, before anything is quoted.
  const [commitments, setCommitments] = useState(NO_COMMITMENTS)
  // Whether that read has settled, whatever it found: the amount field waits
  // for it.
  const [commitmentsRead, setCommitmentsRead] = useState(false)
  // The spent slots the load tap will free (ENG-631): room for a new top-up,
  // once the mint has said every one of them is settled. The amount field
  // waits for the mint's answer the same way: on a card with no empty slot
  // the room is 0 until then, and a field shown before it would refuse every
  // amount, then change its mind a round-trip later.
  const [reclaim, setReclaim] = useState<ReclaimPlan>(NO_RECLAIM)
  // Whether that plan has settled: answered, refused, or never asked for.
  const [reclaimRead, setReclaimRead] = useState(false)
  const eligibility = cashuCard
    ? topUpEligibility(cashuCard, {
        unfinishedUnits: commitments.units,
        usdEnabled: cashuCardUsdEnabled,
      })
    : undefined
  const resumeId = params?.topUpId
  const [step, setStep] = useState<Step>(() => {
    if (resumeId) return { name: "loading" }
    if (eligibility && !eligibility.ok) {
      return { name: "refused", message: refusal(eligibility.reason, LL) }
    }
    return { name: "amount" }
  })
  const [unit, setUnit] = useState<CardUnit>(
    eligibility?.ok && eligibility.unit !== "choose" ? eligibility.unit : "sat",
  )
  const [amount, setAmount] = useState<MoneyAmount<WalletOrDisplayCurrency>>()
  // An empty card with USD on offers a choice of unit above the amount.
  const offersUnitChoice = Boolean(
    eligibility?.ok && eligibility.unit === "choose" && cashuCardUsdEnabled,
  )
  const [pinEntry, setPinEntry] = useState("")
  // A PIN this session proved on the card; never stored.
  const [pin, setPin] = useState<string>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const stepRef = useRef(step)
  stepRef.current = step
  // Set once the screen is on its way out: a quote that arrives after that
  // is dropped, not left behind.
  const leftRef = useRef(false)
  useEffect(() => {
    leftRef.current = false
    return () => {
      leftRef.current = true
    }
  }, [])

  // iOS has no live regions: an error is read out as it appears.
  useEffect(() => {
    if (error && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(error)
  }, [error])

  useEffect(() => {
    if (!cashuCard) navigation.goBack()
  }, [cashuCard, navigation])

  // A new top-up: what the card's unfinished ones hold of it. One whose unit
  // differs refuses this one; their slots are not free.
  useEffect(() => {
    if (resumeId || !cashuCard) return undefined
    let live = true
    const read = deps.store.list().then(
      (records) => {
        const committed = cardCommitments(records, cashuCard.pubkey)
        // Nothing held: nothing to change.
        if (!live || (committed.slots === 0 && committed.units.length === 0)) return
        setCommitments(committed)
        const after = topUpEligibility(cashuCard, {
          unfinishedUnits: committed.units,
          usdEnabled: cashuCardUsdEnabled,
        })
        if (!after.ok) {
          setStep((current) =>
            current.name === "amount"
              ? { name: "refused", message: refusal(after.reason, LL) }
              : current,
          )
        } else if (after.unit !== "choose") {
          setUnit(after.unit)
        }
      },
      // Unreadable: prepareTopUp reads the store too, and refuses.
      () => undefined,
    )
    // Every arm settles it: something held, nothing held, or unreadable.
    read.finally(() => {
      if (live) setCommitmentsRead(true)
    })
    return () => {
      live = false
    }
    // Read once, for the card the screen opened on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useReclaimPlan(resumeId ? undefined : cashuCard, reclaimPlanFor, {
    onPlan: setReclaim,
    onSettled: () => setReclaimRead(true),
  })

  // Leaving before any payment was sent drops the quote: nothing can land,
  // and the card's screen should not offer to finish it. A quote that was
  // ever sent for payment stays, even after a refusal: only the mint can say
  // it was not paid, once it has expired (`cancelTopUp`, `advanceTopUps`).
  useEffect(
    () =>
      navigation.addListener("beforeRemove", () => {
        leftRef.current = true
        const current = stepRef.current
        if (
          current.name === "confirm" &&
          current.record.state === "quoted" &&
          !current.record.payment.dispatched &&
          !current.record.payment.everDispatched
        ) {
          cancelTopUp(deps, current.record.id).catch(() => undefined)
        }
      }),
    [navigation, deps],
  )

  const walletCurrency = unit === "sat" ? WalletCurrency.Btc : WalletCurrency.Usd
  const unitName =
    unit === "sat" ? LL.FlashcardV2.topUpUnitSat() : LL.FlashcardV2.topUpUnitUsd()
  const cardAmount =
    amount && convertMoneyAmount ? convertMoneyAmount(amount, walletCurrency).amount : 0
  // Empty slots, plus the spent ones the load tap will free: a spent slot is
  // owed until it settles at the mint, and counts only once the mint has said
  // every spent slot on the card is settled (`reclaimPlan`). Those an
  // unfinished top-up will take are not free either.
  const reservedSlots = commitments.slots
  const freeSlots = cashuCard
    ? Math.max(0, cashuCard.empty + reclaim.reclaimable - reservedSlots)
    : 0
  const needed = cardAmount > 0 ? slotsNeeded(cardAmount) : 0
  const cost =
    cashWallet && convertMoneyAmount && cardAmount > 0
      ? convertMoneyAmount(
          { amount: cardAmount, currency: walletCurrency, currencyCode: walletCurrency },
          cashWallet.walletCurrency,
        ).amount
      : undefined
  // The development pay stub (ENG-634) skips the payment, so the Cash balance
  // does not limit it; a release build has no stub and always checks. Judged
  // against the mint this screen quotes at (`deps.mint`), as `pay` judges it.
  const amountProblemKind = topUpAmountProblem({
    amount: cardAmount,
    needed,
    freeSlots,
    cost,
    balance: cashWallet?.balance,
    payStubbed: stubbedPayOutcome(deps.mint.url) !== undefined,
  })
  const amountProblem =
    amountProblemKind &&
    amountProblemText(LL, amountProblemKind, { unit, needed, free: freeSlots })

  const asksForPin = cashuCard !== undefined && asksForPinBeforePaying(cashuCard)

  const refusedUnread = () => {
    const unread = cashuCard !== undefined && spentSlotsUnread(cashuCard)
    if (unread) setStep({ name: "refused", message: refusal("reread", LL) })
    return unread
  }
  const readyToLoad = (record: TopUpRecord) => {
    setError(undefined)
    if (refusedUnread()) return
    if (asksForPin && !pin) {
      setStep({ name: "pin", purpose: "load", record })
    } else {
      setStep({ name: "load", record })
    }
  }

  const mintUntilReady = async (record: TopUpRecord) => {
    setStep({ name: "working", record, message: LL.FlashcardV2.topUpMinting() })
    try {
      for (let attempt = 0; attempt < MINT_POLL_ATTEMPTS; attempt += 1) {
        const { record: after, status } = await mintTopUp(deps, record.id)
        if (status === "minted") {
          readyToLoad(after)
          return
        }
        await sleep(MINT_POLL_MS)
      }
      // The app keeps asking, and mints without the card, once this screen
      // is gone.
      nudgeTopUpMinter()
      setStep({
        name: "working",
        record,
        message: LL.FlashcardV2.topUpWaiting(),
        canLeave: true,
      })
    } catch (err) {
      setStep({ name: "working", record, message: mintFailure(err, LL), canLeave: true })
    }
  }

  const prepare = async () => {
    if (!cashuCard || !cashWallet) return
    setBusy(true)
    setError(undefined)
    try {
      const record = await prepareTopUp(deps, {
        cardPubkey: cashuCard.pubkey,
        unit,
        amount: cardAmount,
        walletId: cashWallet.id,
        card: {
          hasOwner: cashuCard.hasOwner,
          empty: cashuCard.empty,
          reclaimable: reclaim.reclaimable,
          // The pieces it holds as last read: the top-up fills their gaps.
          pieces: cashuCard.pieces,
          // The unit of the card's own value; an empty card has none.
          unit:
            eligibility?.ok && eligibility.unit !== "choose" && !eligibility.committed
              ? eligibility.unit
              : undefined,
        },
      })
      if (leftRef.current) {
        // The screen was left while the mint answered: nothing was sent.
        cancelTopUp(deps, record.id).catch(() => undefined)
        return
      }
      const fee = await feeFor(record)
      setStep({ name: "confirm", record, fee })
    } catch (err) {
      // No record exists yet, so nothing was saved or paid.
      if (err instanceof TopUpError && err.reason === "slots") {
        setError(LL.FlashcardV2.topUpNoRoom({ needed, free: freeSlots }))
      } else if (err instanceof TopUpError && err.reason === "unit") {
        setError(LL.FlashcardV2.topUpCantUnfinishedUnit())
      } else if (err instanceof TopUpError && err.reason === "owner-unset") {
        setError(LL.FlashcardV2.topUpCantNotSetUp())
      } else {
        setError(LL.FlashcardV2.topUpPrepareFailed())
      }
      setStep({ name: "amount" })
    } finally {
      setBusy(false)
    }
  }

  const continueFromAmount = () => {
    if (!cashuCard || cardAmount <= 0 || amountProblem) return
    if (asksForPin) {
      setError(undefined)
      setStep({ name: "pin", purpose: "check" })
      return
    }
    prepare()
  }

  const pay = async (record: TopUpRecord, fee?: number) => {
    setError(undefined)
    setStep({ name: "working", record, message: LL.FlashcardV2.topUpPaying() })
    let paid
    try {
      paid = await payTopUp(deps, record.id)
    } catch {
      // Thrown before the payment went out, or after: the saved record says
      // which (an unreadable one says nothing, so the answer is unknown). One
      // gone from the store was dropped as expired.
      const saved = await deps.store.get(record.id).then(
        (found) => found ?? null,
        () => undefined,
      )
      if (saved === null) {
        setStep({ name: "refused", message: LL.FlashcardV2.topUpInvoiceExpired() })
        return
      }
      setStep({ name: "confirm", record: saved ?? record, fee })
      const neverSent =
        saved && !saved.payment.everDispatched && !saved.payment.dispatched
      setError(
        neverSent
          ? LL.FlashcardV2.topUpPrepareFailed()
          : LL.FlashcardV2.topUpPaymentUnknown(),
      )
      return
    }
    const { record: after, result } = paid
    switch (result.status) {
      case "paid":
      case "pending":
        nudgeTopUpMinter()
        await mintUntilReady(after)
        return
      case "expired":
        // Not sent. The record stays until the mint says whether an earlier
        // dispatch landed; the card's screen shows it meanwhile.
        setStep({ name: "refused", message: LL.FlashcardV2.topUpInvoiceExpired() })
        return
      case "failed":
        // Refused before it ran: nothing left the wallet.
        setStep({ name: "confirm", record: after, fee })
        setError(LL.FlashcardV2.topUpPaymentFailed())
        return
      case "unknown":
        // May still land: the app watches the mint for it from here.
        nudgeTopUpMinter()
        setStep({ name: "confirm", record: after, fee })
        setError(LL.FlashcardV2.topUpPaymentUnknown())
    }
  }

  const loadCard = async (record: TopUpRecord, pinToUse?: string) => {
    if (!cashuCard || refusedUnread()) return
    setBusy(true)
    setError(undefined)
    try {
      const { record: done, reclaim: freed } = await load(record, cashuCard, pinToUse)
      if (done.state !== "loaded") {
        // Part of it is being spent at the mint right now: a later load
        // asks the mint again.
        setStep({ name: "refused", message: LL.FlashcardV2.topUpHeld() })
        return
      }
      const message = LL.FlashcardV2.topUpLoaded({
        amount: formatUnitAmount(done.amount, done.unit, LL),
      })
      AccessibilityInfo.announceForAccessibility(message)
      setStep({ name: "done", record: done, reclaim: freed })
    } catch (err) {
      if (err instanceof NfcError.UserCancel) return
      if (
        err instanceof TopUpError &&
        err.reason === "not-owner" &&
        cashuCard.pinState === "set"
      ) {
        // The card took no grant from this phone: it wants its PIN, asked for
        // here and sent in the next tap. Nothing was written.
        setPin(undefined)
        setPinEntry("")
        setStep({ name: "pin", purpose: "load", record })
        setError(loadFailure(err, LL))
        return
      }
      if (err instanceof TopUpError) {
        setError(loadFailure(err, LL))
        return
      }
      const failure = pinFailure(err, LL)
      if (failure.final) {
        setStep({ name: "refused", message: failure.message })
        return
      }
      if (err instanceof CardError && triesLeft(err.sw) !== undefined) {
        // The PIN is wrong (it changed since it was checked): ask again.
        setPin(undefined)
        setPinEntry("")
        setStep({ name: "pin", purpose: "load", record })
      }
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  const submitPin = async () => {
    if (!cashuCard || !isValidCardPin(pinEntry) || step.name !== "pin") return
    const entered = pinEntry
    setPinEntry("")
    if (step.purpose === "load" && step.record) {
      setPin(entered)
      await loadCard(step.record, entered)
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      await checkPin(cashuCard, entered)
      setPin(entered)
    } catch (err) {
      setBusy(false)
      if (err instanceof NfcError.UserCancel) return
      const failure = pinFailure(err, LL)
      if (failure.final) setStep({ name: "refused", message: failure.message })
      else setError(failure.message)
      return
    }
    setBusy(false)
    await prepare()
  }

  // Resume a saved top-up where it stopped.
  useEffect(() => {
    if (!resumeId) return
    ;(async () => {
      const record = await deps.store.get(resumeId)
      if (!record) {
        navigation.goBack()
        return
      }
      setUnit(record.unit)
      switch (record.state) {
        case "quoted": {
          const fee = await feeFor(record)
          setStep({ name: "confirm", record, fee })
          if (record.payment.dispatched) setError(LL.FlashcardV2.topUpPaymentUnknown())
          break
        }
        case "paid":
          await mintUntilReady(record)
          break
        case "minted":
          readyToLoad(record)
          break
        case "loaded":
          setStep({ name: "done", record })
          break
      }
    })().catch(() => setStep({ name: "refused", message: LL.FlashcardV2.topUpFailed() }))
    // A resume runs once, for the record it was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeId])

  if (!cashuCard) return null

  const amountText = (record: TopUpRecord) =>
    formatUnitAmount(record.amount, record.unit, LL)

  const errorLine = (
    <View style={styles.status} testID="topup-status" accessibilityLiveRegion="polite">
      {error && (
        <Text type="p2" style={styles.error} testID="topup-error">
          {error}
        </Text>
      )}
    </View>
  )

  const body = (() => {
    switch (step.name) {
      case "loading":
        return <ActivityIndicator color={colors.primary} />
      case "refused":
        return (
          <>
            <Text type="p1" style={styles.center} testID="topup-refused">
              {step.message}
            </Text>
            <PrimaryBtn
              label={LL.FlashcardV2.topUpDone()}
              onPress={() => navigation.goBack()}
              testID="topup-close"
            />
          </>
        )
      case "amount":
        return (
          <>
            {offersUnitChoice ? (
              <View style={styles.units} accessibilityRole="radiogroup">
                {(["sat", "usd"] as const).map((option) => (
                  <TouchableOpacity
                    key={option}
                    testID={`topup-unit-${option}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: unit === option }}
                    style={[styles.unit, unit === option && styles.unitSelected]}
                    onPress={() => {
                      setUnit(option)
                      setAmount(undefined)
                    }}
                  >
                    <Text type="p2">
                      {option === "sat"
                        ? LL.FlashcardV2.topUpUnitSat()
                        : LL.FlashcardV2.topUpUnitUsd()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              eligibility?.ok &&
              eligibility.unit !== "choose" && (
                <Text type="caption" style={styles.center} testID="topup-unit-fixed">
                  {eligibility.committed
                    ? LL.FlashcardV2.topUpUnitCommitted({ unit: unitName })
                    : LL.FlashcardV2.topUpUnitFixed({ unit: unitName })}
                </Text>
              )
            )}
            {/* The field waits for the unfinished top-ups to be read: one can
                refuse this top-up or fix its unit, and initiallyOpen is read
                only as the field mounts. It mounts once, so a keypad opened
                from it is never taken down by the read. It waits for the
                reclaim plan too: the room it checks amounts against is not
                known until the mint has answered. That answer comes over the
                network, so the wait is shown, not left as a gap. */}
            {!(commitmentsRead && reclaimRead) && (
              <ActivityIndicator color={colors.primary} testID="topup-amount-loading" />
            )}
            {convertMoneyAmount && commitmentsRead && reclaimRead && (
              <AmountInput
                unitOfAccountAmount={amount}
                walletCurrency={walletCurrency}
                // Paid from the Cash wallet whatever the card's unit, so the
                // keypad shows that wallet's balance.
                balanceWalletCurrency={cashWallet?.walletCurrency ?? WalletCurrency.Usd}
                setAmount={setAmount}
                convertMoneyAmount={convertMoneyAmount}
                // A top-up's first job is its amount: the keypad opens by
                // itself, unless the card offers a choice of unit first.
                initiallyOpen={!amount && !offersUnitChoice}
              />
            )}
            {needed > 0 && !amountProblem && (
              <Text type="caption" style={styles.center} testID="topup-slots">
                {reclaim.reclaimable > 0
                  ? LL.FlashcardV2.topUpSlotsReclaim({
                      needed,
                      free: freeSlots,
                      reclaim: reclaim.reclaimable,
                    })
                  : LL.FlashcardV2.topUpSlots({ needed, free: freeSlots })}
              </Text>
            )}
            {reservedSlots > 0 && (
              <Text type="caption" style={styles.center} testID="topup-slots-reserved">
                {LL.FlashcardV2.topUpSlotsReserved({ reserved: reservedSlots })}
              </Text>
            )}
            {amountProblem && (
              // One testID per reason: the e2e flows tell no room from no balance.
              <Text
                type="p2"
                style={styles.error}
                testID={`topup-amount-problem-${amountProblemKind}`}
              >
                {amountProblem}
              </Text>
            )}
            <View style={styles.wallet}>
              <Text type="p2">{LL.FlashcardV2.topUpPaidFrom()}</Text>
              {cashWallet && (
                <Text type="caption" testID="topup-balance">
                  {LL.FlashcardV2.topUpCashBalance({
                    balance: formatMoneyAmount({
                      moneyAmount: toWalletAmount({
                        amount: cashWallet.balance ?? undefined,
                        currency: cashWallet.walletCurrency,
                      }),
                    }),
                  })}
                </Text>
              )}
            </View>
            {cashuCard.pinState === "unset" && (
              <Text type="caption" style={styles.warning} testID="topup-no-pin">
                {LL.FlashcardV2.topUpNoPinWarning()}
              </Text>
            )}
            {errorLine}
            <PrimaryBtn
              label={LL.FlashcardV2.next()}
              disabled={cardAmount <= 0 || Boolean(amountProblem) || !cashWallet || busy}
              loading={busy}
              onPress={continueFromAmount}
              testID="topup-next"
            />
          </>
        )
      case "pin":
        return (
          <>
            <Text type="h02" accessibilityRole="header" style={styles.center}>
              {LL.FlashcardV2.topUpPinTitle()}
            </Text>
            <Text type="caption" style={styles.center}>
              {step.purpose === "check" || !step.record
                ? LL.FlashcardV2.topUpPinBody()
                : LL.FlashcardV2.topUpTapToLoad({ amount: amountText(step.record) })}
            </Text>
            <Text
              type="h01"
              style={styles.dots}
              testID="topup-pin-entry"
              accessibilityLabel={LL.FlashcardV2.pinEntered({ count: pinEntry.length })}
            >
              {"●".repeat(pinEntry.length)}
              <Text type="h01" style={styles.empty}>
                {"○".repeat(Math.max(0, 4 - pinEntry.length))}
              </Text>
            </Text>
            {errorLine}
            <PinPad
              onDigit={(digit) => {
                setError(undefined)
                setPinEntry((e) => (e.length < PIN_MAX_LENGTH ? e + digit : e))
              }}
              onBackspace={() => setPinEntry((e) => e.slice(0, -1))}
              onClear={() => setPinEntry("")}
            />
            <PrimaryBtn
              label={
                step.purpose === "check"
                  ? LL.FlashcardV2.topUpCheckPin()
                  : LL.FlashcardV2.topUpLoad()
              }
              disabled={!isValidCardPin(pinEntry) || busy}
              loading={busy}
              onPress={submitPin}
              testID="topup-pin-submit"
            />
          </>
        )
      case "confirm":
        return (
          <>
            <Text type="h02" accessibilityRole="header" style={styles.center}>
              {LL.FlashcardV2.topUpConfirmTitle()}
            </Text>
            <View style={styles.rows}>
              <Row
                label={LL.FlashcardV2.topUpConfirmLoad()}
                value={amountText(step.record)}
                testID="topup-confirm-amount"
              />
              <Row
                label={LL.FlashcardV2.topUpConfirmCard()}
                value={shortPubkey(step.record.cardPubkey)}
              />
              <Row
                label={LL.FlashcardV2.topUpConfirmFee()}
                testID="topup-confirm-fee"
                value={
                  step.fee === undefined
                    ? "—"
                    : step.fee === 0
                    ? LL.FlashcardV2.topUpConfirmNoFee()
                    : formatMoneyAmount({
                        moneyAmount: toWalletAmount({
                          amount: step.fee,
                          currency: cashWallet?.walletCurrency ?? WalletCurrency.Usd,
                        }),
                      })
                }
              />
            </View>
            <Text type="caption" style={styles.center}>
              {LL.FlashcardV2.topUpPaidFrom()}
            </Text>
            {errorLine}
            <PrimaryBtn
              label={
                step.record.payment.dispatched
                  ? LL.FlashcardV2.topUpRetry()
                  : LL.FlashcardV2.topUpPay()
              }
              onPress={() => pay(step.record, step.fee)}
              testID="topup-pay"
            />
            {!step.record.payment.dispatched && (
              <PrimaryBtn
                type="outline"
                label={LL.FlashcardV2.topUpCancel()}
                onPress={() => navigation.goBack()}
              />
            )}
          </>
        )
      case "working":
        return (
          <>
            {!step.canLeave && <ActivityIndicator color={colors.primary} />}
            <Text type="p1" style={styles.center} testID="topup-working">
              {step.message}
            </Text>
            {step.canLeave && (
              <>
                <PrimaryBtn
                  label={LL.FlashcardV2.topUpRetry()}
                  onPress={() => mintUntilReady(step.record)}
                />
                <PrimaryBtn
                  type="outline"
                  label={LL.FlashcardV2.topUpDone()}
                  onPress={() => navigation.goBack()}
                />
              </>
            )}
          </>
        )
      case "load":
        return (
          <>
            <Text type="p1" style={styles.center} testID="topup-tap">
              {LL.FlashcardV2.topUpTapToLoad({ amount: amountText(step.record) })}
            </Text>
            {errorLine}
            <PrimaryBtn
              label={LL.FlashcardV2.topUpLoad()}
              loading={busy}
              disabled={busy}
              onPress={() => loadCard(step.record, pin)}
              testID="topup-load"
            />
          </>
        )
      case "done":
        return (
          <>
            <Text type="p1" style={styles.center} testID="topup-done">
              {LL.FlashcardV2.topUpLoaded({ amount: amountText(step.record) })}
            </Text>
            {step.reclaim && <ReclaimNotes reclaim={step.reclaim} />}
            <PrimaryBtn
              label={LL.FlashcardV2.topUpDone()}
              onPress={() => navigation.goBack()}
              testID="topup-close"
            />
          </>
        )
    }
  })()

  return (
    <Screen preset="scroll" backgroundColor={colors.background}>
      <View style={styles.content}>{body}</View>
    </Screen>
  )
}

/**
 * A new top-up: which of the card's spent slots the load tap will free, asked
 * of the mint once, off the card, for the card the screen opened on (none on
 * a resume: its amount is set). The tap asks again before it runs. An
 * unanswered mint counts no spent slot as room.
 *
 * `onSettled` fires once the plan is known, whichever way: at once when
 * there is nothing to ask about, or when the mint has answered or refused.
 */
const useReclaimPlan = (
  card: Pick<CashuCardState, "pubkey" | "spentSlots"> | undefined,
  planFor: (card: Pick<CashuCardState, "pubkey" | "spentSlots">) => Promise<ReclaimPlan>,
  { onPlan, onSettled }: { onPlan: (plan: ReclaimPlan) => void; onSettled: () => void },
) => {
  useEffect(() => {
    if (!card?.spentSlots?.length) {
      onSettled()
      return undefined
    }
    let live = true
    planFor(card)
      .then(
        (plan) => live && onPlan(plan),
        () => undefined,
      )
      .finally(() => {
        if (live) onSettled()
      })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/**
 * What the load tap's reclaim did: the spent slots it freed, and those still
 * owed at the mint. The load went through, so the settling note is a note
 * (`topUpSettlingNote`), not the "try again later" the `slots` refusal ends
 * with (`topUpSlotsSettling`): there is nothing here to try again.
 */
const ReclaimNotes = ({ reclaim }: { reclaim: ReclaimResult }) => {
  const styles = useStyles()
  const { LL } = useI18nContext()
  return (
    <>
      {reclaim.cleared > 0 && (
        <Text type="caption" style={styles.center} testID="topup-reclaimed">
          {LL.FlashcardV2.topUpReclaimed({ count: reclaim.cleared })}
        </Text>
      )}
      {reclaim.settling > 0 && (
        <Text type="caption" style={styles.center} testID="topup-settling">
          {LL.FlashcardV2.topUpSettlingNote({ count: reclaim.settling })}
        </Text>
      )}
    </>
  )
}

const Row = ({
  label,
  value,
  testID,
}: {
  label: string
  value: string
  testID?: string
}) => {
  const styles = useStyles()
  return (
    <View style={styles.row}>
      <Text type="p2">{label}</Text>
      <Text type="p2" bold testID={testID}>
        {value}
      </Text>
    </View>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  content: {
    padding: 20,
    gap: 16,
  },
  center: {
    textAlign: "center",
  },
  units: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
  },
  unit: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.grey4,
  },
  unitSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.grey5,
  },
  wallet: {
    alignItems: "center",
    gap: 4,
  },
  rows: {
    gap: 10,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  dots: {
    letterSpacing: 6,
    marginVertical: 12,
    textAlign: "center",
  },
  empty: {
    color: colors.grey3,
  },
  status: {
    alignItems: "center",
    gap: 8,
  },
  error: {
    color: colors.error,
    textAlign: "center",
  },
  warning: {
    color: colors.grey2,
    textAlign: "center",
  },
}))
