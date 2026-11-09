import React, { useEffect, useRef, useState } from "react"
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native"
import { NfcError } from "react-native-nfc-manager"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"

import { PrimaryBtn } from "@app/components/buttons"
import { PinPad } from "@app/components/card/PinPad"
import { Screen } from "@app/components/screen"
import { CASHU_MINT_URL, DEFAULT_CARD_MINTS, mintDisplayName } from "@app/config/appinfo"
import { useFlashcard } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import {
  AppletNotSelectedError,
  CardError,
  CardNeedsUpdateError,
  CardProtocolError,
  CardTap,
  PIN_MAX_LENGTH,
  SW_PIN_BLOCKED,
  Transceiver,
  WrongCardError,
  getCardRecord,
  getInfo,
  isValidCardPin,
  triesLeft,
} from "@app/utils/cashu-card"
import { cardMintUrl } from "@app/utils/cashu-card-bridge"
import {
  isolatedMintName,
  limitsSummary,
  unconfirmedWhat,
} from "@app/utils/cashu-card-format"
import {
  checkCardMint,
  isForgeMint,
  mintOfCardOrUndefined,
} from "@app/utils/cashu-card-topup/connected"
import { sameMint } from "@app/utils/cashu-card-topup/mint-url"
import { fetchKeysetUnits } from "@app/utils/cashu-mint"
import { refreshTipHeader } from "@app/utils/cashu-card-headers"
import {
  CardLimits,
  NO_LIMITS,
  allowLoad,
  ownerSigner,
} from "@app/utils/cashu-card-owner"
import {
  CardNotOpenError,
  CardNotOpenReason,
  CardSetup,
  OwnerKey,
  SetupIntent,
  SetupProgress,
  SetupReadBackError,
  SetupUnconfirmedError,
  checkSetupVersion,
  compareReadBack,
  currentSetup,
  finishHolderSetup,
  freezeSetupIntent,
  heldByCard,
  newOwnerKey,
  newSetupProgress,
  ownerKeyFor,
  saveOwnerKey,
  setUpCard,
  setupRecord,
  setupUnverified,
  setupWriteSent,
} from "@app/utils/cashu-card-owner-store"
import { RelayUnsettledError } from "@app/utils/cashu-card-relay"
import {
  PersistWriteError,
  flushPersisted,
  useAppDispatch,
  useAppSelector,
} from "@app/store/redux"
import { cardLimitsSet, cardSetupSaved } from "@app/store/redux/slices/flashcardV2Slice"
import { toastShow } from "@app/utils/toast"

import { LimitField, limitsFromFields } from "./flashcard-v2-limits"

type LLType = ReturnType<typeof useI18nContext>["LL"]

/** A status word as the log shows it, e.g. "6F00". */
const swHex = (sw: number) => sw.toString(16).toUpperCase().padStart(4, "0")

const SW_CARD_IN_USE = 0x6a8d
const SW_OWNER_PROOF = 0x6a91

type Step =
  | { name: "preparing" }
  | { name: "intro" }
  /** "Change" on the intro (ENG-787): which mint the card's eCash comes from. */
  | { name: "mint" }
  /** "Change" beside the limits on the intro (ENG-827): the owner's limits setup writes. */
  | { name: "limits" }
  /**
   * `resume` (ENG-826): the PIN this sequence already set on the card, typed
   * once after a restart, with no confirm.
   */
  | { name: "pin"; confirm: boolean; resume?: boolean }
  | { name: "tap" }
  | { name: "finished" }

/** What the tap did. `verified` (ENG-827): set up, and the card read back all of it. */
type SetUpOutcome = "set-up" | "already-mine" | "verified"

/**
 * One setup sequence (ENG-825): what it set out to write, fixed at the first
 * tap press, and what it has sent. Every retry tap reuses it as it is.
 */
type SetupSequence = { intent: SetupIntent; progress: SetupProgress }

/**
 * The wallet's stored record of this card's setup (ENG-826), when it is one
 * this screen acts on: this format, this card, and not finished (ENG-827: a
 * `set-up` record not verified is not finished).
 */
const storedSetupFor = (
  setup: CardSetup | undefined,
  cardPubkey: string,
): CardSetup | undefined => {
  const current = currentSetup(setup)
  return current &&
    current.intent?.cardPubkey === cardPubkey &&
    (current.status !== "set-up" || setupUnverified(current))
    ? current
    : undefined
}

/**
 * A stored setup this screen resumes: started, with a write sent (SET_OWNER
 * among them, ENG-827), or set up and not verified.
 */
const resumable = (setup: CardSetup | undefined): CardSetup | undefined =>
  setup &&
  ((setup.status === "started" && setupWriteSent(setup.progress)) ||
    setupUnverified(setup))
    ? setup
    : undefined

/**
 * What the card already read says about setting it up, before any PIN is
 * typed: display only. The tap's own reads decide (`setUpCard`). A setup this
 * wallet resumes (ENG-826) is not refused for its own PIN, nor for an owner
 * it may have set: the tap's owner proof decides.
 */
const refusalBeforeTap = (
  card: {
    hasOwner: boolean
    unspent: number
    pinState: string
  },
  resumed?: CardSetup,
): CardNotOpenReason | undefined => {
  if (card.hasOwner && !resumed?.progress.ownerSent) return "owned"
  // A card this sequence may own already (ENG-827): what is left to send is
  // the owner's SET_LIMIT and the verifying read, which funds don't affect
  // (spec/APDU.md SET_LIMIT: "no PIN, any funds"; ALLOW_LOAD needs only the
  // owner's proof). Topped up before Finish setup, it still finishes.
  const ownedBySequence = card.hasOwner && resumed?.progress.ownerSent === true
  if (card.unspent > 0 && !ownedBySequence) return "in-use"
  const ownPin =
    card.pinState === "set" &&
    resumed !== undefined &&
    resumed.intent.pinChosen &&
    resumed.progress.pinSent
  if (card.pinState !== "unset" && !ownPin && !(card.hasOwner && resumed)) {
    return "pin-set"
  }
  return undefined
}

/** The mint step's choice: a listed mint, or an address written in. */
type MintChoice = { kind: "listed"; url: string } | { kind: "other" }

/**
 * The mints setup lists (ENG-787): the app's card mint first when it is not
 * one of `DEFAULT_CARD_MINTS` (a development build's dev mint), then those.
 */
const listedMints = (): { url: string; name: string }[] => {
  const own = cardMintUrl()
  const listed = DEFAULT_CARD_MINTS.map((mint) => ({ ...mint }))
  return listed.some((mint) => sameMint(mint.url, own))
    ? listed
    : [{ url: own, name: mintDisplayName(own) }, ...listed]
}

/** Whether a mint's own `/v1/keysets` lists a sat keyset: a typo answers nothing. */
const answersAsMint = async (url: string): Promise<boolean> => {
  try {
    const units = await fetchKeysetUnits(url)
    return Object.values(units).includes("sat")
  } catch {
    return false
  }
}

const MONOSPACE = Platform.select({ ios: "Menlo", default: "monospace" })

/**
 * Beside a mint that is not forge: Flash tills take forge cards only, for now
 * (ENG-831). Nothing beside forge. Remove when ENG-788 ships.
 */
const TillNote: React.FC<{ url: string; testID: string }> = ({ url, testID }) => {
  const styles = useStyles()
  const { LL } = useI18nContext()
  if (isForgeMint(url)) return null
  return (
    <Text type="caption" style={styles.caveat} testID={testID}>
      {LL.FlashcardV2.setUpTillNote()}
    </Text>
  )
}

/**
 * Set up a Cashu card (ENG-675, card protocol 2.0; architect's decision 15):
 * this phone becomes the owner of an empty card that has none.
 *
 * Before the tap, off the card: the owner key (derived from the wallet's
 * recovery phrase when the phone has one, else a random key that lives only
 * on this phone, which the screen says), and the tip block header, the card
 * clock's anchor (none when the network does not answer: the card then waits
 * for its first header). Then one tap, owner last (`setUpCard`): the PIN if
 * one is chosen, the record (the mint), the key saved on this phone, and
 * SET_OWNER. A tap cut short is finished by the next: a card that answers it
 * already has an owner is asked for the owner's grant with the key this phone
 * saved, and if it gives it, the setup had landed.
 *
 * An empty card with no owner belongs to the first phone that sets it up
 * (SECURITY-MODEL): the screen says so.
 *
 * Before any write (ENG-825): the first tap press fixes what the sequence
 * writes (the card, the mint, whether a PIN is chosen), and every retry tap
 * holds the card it reaches to that: the same card key, an applet version
 * setup writes to (`SETUP_APPLET_VERSIONS`), answers that add up, and a card
 * that is open, unused, unlocked, with no limits, no PIN from before and no
 * record for another mint. A card that fails is told inline, and nothing is
 * written to it. A card already read as owned, funded or with a PIN is told
 * so at the intro, before a PIN is typed for nothing.
 *
 * The mint (ENG-787): a card whose record already names a mint (a setup cut
 * short, or an earlier one) is set up for that same mint, with no choice.
 * Otherwise the app's card mint (forge, "Flash") is written with no extra
 * press; one "Change" link opens the other listed mints and a written-in
 * address. A mint that is not forge gets the till note and the notice once,
 * under the choice: SET_CARD fixes the mint, and this app can't move the card
 * later.
 *
 * The limits (ENG-827): none unless the holder changes them behind one
 * "Change" link (a no-PIN allowance needs a PIN: "Continue without a PIN"
 * says so, and taps nothing). In the same tap, after SET_OWNER, the owner's
 * SET_LIMIT writes them, then ALLOW_LOAD, GET_INFO and GET_CARD read back
 * everything: all matching, the setup is verified. A tap cut after SET_OWNER
 * is finished by the next one, through the owned path, with no PIN asked
 * (`finishHolderSetup`); a card whose limits differ and are not a new card's
 * is never overwritten, and the holder is pointed to Limits.
 */
export const FlashcardV2SetupScreen = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { cashuCard, runCardOperation } = useFlashcard()
  const dispatch = useAppDispatch()
  // The wallet's record of this card's setup (ENG-826), as it stood when the
  // screen opened: a setup cut short, even by a restart, resumes from it.
  const storedSetup = useAppSelector((state) =>
    cashuCard ? state.flashcardV2.setups?.[cashuCard.pubkey] : undefined,
  )
  const [stored] = useState(() =>
    cashuCard ? storedSetupFor(storedSetup, cashuCard.pubkey) : undefined,
  )
  const [resumed] = useState(() => resumable(stored))

  const [step, setStep] = useState<Step>({ name: "preparing" })
  const [key, setKey] = useState<OwnerKey>()
  const [anchor, setAnchor] = useState<number[]>()
  const [entry, setEntry] = useState("")
  const [pin, setPin] = useState<string>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  // The last tap set the card up and it did not confirm all of it (ENG-827):
  // the next tap finishes it.
  const [unconfirmed, setUnconfirmed] = useState(() => setupUnverified(resumed))
  // The owner's limits setup writes after SET_OWNER (ENG-827): none unless
  // the holder changes them; a resumed setup keeps its own.
  const [limits, setLimitsChoice] = useState<CardLimits>(
    () => resumed?.intent.limits ?? NO_LIMITS,
  )
  // The sequence the first tap press fixed; retries reuse it. A resumed one
  // (ENG-826) is the stored intent and progress.
  const sequence = useRef<SetupSequence | undefined>(
    resumed ? { intent: resumed.intent, progress: { ...resumed.progress } } : undefined,
  )

  // The record's own mint, on a card whose record is set: kept, never changed.
  // GET_INFO and GET_CARD both say the record is set.
  const [recordedMint] = useState(() =>
    cashuCard?.recordSet && cashuCard.record?.recordSet
      ? mintOfCardOrUndefined(cashuCard.record)
      : undefined,
  )
  const [mint, setMint] = useState(
    () => resumed?.intent.mint ?? recordedMint ?? cardMintUrl(),
  )
  // The mint step's own state; nothing reaches `mint` before Continue.
  const [choice, setChoice] = useState<MintChoice>({ kind: "listed", url: mint })
  const [address, setAddress] = useState("https://")
  const [addressError, setAddressError] = useState<string>()
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (error && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(error)
  }, [error])
  useEffect(() => {
    if (addressError && Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility(addressError)
    }
  }, [addressError])

  useEffect(() => {
    if (!cashuCard) navigation.goBack()
  }, [cashuCard, navigation])

  // The key and the anchor, before any tap. The key saved for this card, if
  // an earlier tap was cut short after saving it, is the one to finish with.
  useEffect(() => {
    if (!cashuCard) return undefined
    let live = true
    ;(async () => {
      const saved = await ownerKeyFor(cashuCard.pubkey).catch(() => undefined)
      const chosen =
        saved && (saved.saved || saved.source === "dev")
          ? saved
          : await newOwnerKey(cashuCard.pubkey)
      const header = await refreshTipHeader()
      if (!live) return
      setKey(chosen)
      setAnchor(header?.bytes)
      // A setup that stopped because the card did not keep its record
      // (ENG-826) is final: said at once.
      if (stored?.status === "mismatched") {
        setError(LL.FlashcardV2.setUpMismatchStored())
        setStep({ name: "finished" })
        return
      }
      // A card already read as one setup refuses: said now, before a PIN is
      // typed for nothing. Display only: the tap's reads decide.
      const refusal = refusalBeforeTap(cashuCard, resumed)
      if (refusal) {
        setError(notOpenMessage(refusal, LL))
        setStep({ name: "finished" })
        return
      }
      if (resumed) {
        // A setup cut short, resumed (ENG-826): its intent is fixed. A card
        // that may already be owned is asked for the owner's grant; a PIN
        // this sequence set is typed once to verify it; a PIN that never
        // landed is chosen again; no PIN, straight to the tap.
        if (cashuCard.hasOwner || !resumed.intent.pinChosen) {
          setStep({ name: "tap" })
        } else if (cashuCard.pinState === "set") {
          setStep({ name: "pin", confirm: false, resume: true })
        } else {
          setStep({ name: "pin", confirm: false })
        }
        return
      }
      setStep({ name: "intro" })
    })().catch(() => {
      if (live) {
        setError(LL.FlashcardV2.setUpFailed())
        setStep({ name: "finished" })
      }
    })
    return () => {
      live = false
    }
    // Once, for the card the screen opened on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!cashuCard) return null

  /**
   * When SET_OWNER went through, as the wallet's record of this card's setup
   * says it now (ENG-827): the stored record, kept current by `persist`, else
   * the one the screen resumed.
   */
  const setUpAtOnRecord = (): number | undefined => {
    const current = currentSetup(storedSetup)
    return (
      (current?.intent?.cardPubkey === cashuCard.pubkey && current.status === "set-up"
        ? current.setUpAt
        : undefined) ?? resumed?.setUpAt
    )
  }

  /** The setup record on disk before the write it precedes (ENG-826). */
  const persist = async (setup: CardSetup) => {
    dispatch(cardSetupSaved(setup))
    await flushPersisted()
  }

  /**
   * A card this sequence may have sent SET_OWNER to, found owned by this
   * phone (ENG-826): the record it read back, held to the intent, finishes
   * the wallet's record. A card from before (no SET_OWNER on record) gets
   * none.
   */
  const recordAlreadyMine = async (
    transceive: Transceiver,
    { intent, progress }: SetupSequence,
  ) => {
    if (!progress.ownerSent) return
    try {
      const readBack = await getCardRecord(transceive)
      const mismatch = compareReadBack(intent, readBack)
      const at = Date.now()
      await persist(
        mismatch.length > 0
          ? setupRecord(intent, progress, {
              status: "mismatched",
              heldByCard: heldByCard(readBack),
              mismatch,
            })
          : setupRecord(intent, progress, {
              status: "set-up",
              heldByCard: heldByCard(readBack),
              setUpAt: at,
              at,
            }),
      )
    } catch (err) {
      console.warn(
        `Cashu card setup record not finished: ${
          err instanceof Error ? err.name : typeof err
        }`,
      )
    }
  }

  /** The tap (see the screen's comment). */
  const setUp = async (
    transceive: Transceiver,
    tap: CardTap,
    { owner, intent, progress }: SetupSequence & { owner: OwnerKey },
  ): Promise<SetUpOutcome> => {
    // An applet version setup does not write to: nothing more is sent.
    checkSetupVersion(tap.version)
    let info
    try {
      info = await getInfo(transceive)
    } catch (err) {
      if (err instanceof CardProtocolError) throw new CardNotOpenError("unreadable")
      throw err
    }
    if (info.hasOwner) {
      // Owned already: by this phone if it takes this phone's proof (a
      // setup whose answer was lost landed), else by someone else.
      try {
        await allowLoad(transceive, ownerSigner(owner.privateKey))
      } catch (err) {
        if (err instanceof CardError && err.sw === SW_OWNER_PROOF) {
          throw new CardNotOpenError("owned")
        }
        throw err
      }
      await saveOwnerKey(cashuCard.pubkey, owner)
      // ENG-827: a setup whose SET_OWNER went out finishes here: SET_LIMIT if
      // the card's limits are a new card's, then the verifying read, under
      // the grant just given.
      if (progress.ownerSent && intent.limits) {
        await finishHolderSetup(transceive, {
          intent,
          progress,
          key: owner,
          persist,
          granted: true,
          // When SET_OWNER went through, from the record on disk now: an
          // in-session retry's own SET_OWNER time, not this tap's.
          setUpAt: setUpAtOnRecord(),
        })
        return "verified"
      }
      await recordAlreadyMine(transceive, { intent, progress })
      return "already-mine"
    }
    await setUpCard(
      transceive,
      { tap, info, intent, progress, pin, anchor, key: owner, persist },
      saveOwnerKey,
    )
    return intent.limits ? "verified" : "set-up"
  }

  /**
   * The sequence a tap runs: the one an earlier tap press fixed, else a new
   * one from what the holder chose. A mint the card cannot hold throws here,
   * before any APDU.
   */
  const sequenceForTap = (): SetupSequence => {
    if (!sequence.current) {
      sequence.current = {
        intent: freezeSetupIntent({ cardPubkey: cashuCard.pubkey, mint, pin, limits }),
        progress: newSetupProgress(),
      }
    }
    return sequence.current
  }

  /** The holder goes back to change the PIN or the mint: a sequence that sent nothing is dropped. */
  const dropUnsentSequence = () => {
    if (sequence.current && !setupWriteSent(sequence.current.progress)) {
      sequence.current = undefined
    }
  }

  const tap = async () => {
    if (!key) return
    setBusy(true)
    setError(undefined)
    try {
      let current: SetupSequence
      try {
        current = sequenceForTap()
      } catch {
        // A mint the card cannot hold: nothing was sent.
        setError(LL.FlashcardV2.setUpFailed())
        return
      }
      const intentLimits = current.intent.limits
      const outcome = await runCardOperation(
        (transceive, _report, cardTap) =>
          setUp(transceive, cardTap, { ...current, owner: key }),
        cashuCard.pubkey,
        {
          // A 2.2 card's last payment settles before setup touches it: an
          // unsettled one stops the tap before anything is written.
          changesSlots: true,
          // No limits assumed (ENG-827): an already-mine tap wrote none, and
          // a verified one re-reads them; the wallet's own copy is set below.
          assume: {
            hasOwner: true,
            recordSet: true,
            ...(pin ? { pinState: "set" as const } : {}),
            // GET_CARD's record set flag; the re-read reads the record whole.
            record: { recordSet: true },
          },
          // The payment limit is said only under the grant, and only when
          // this tap verified the card holds it.
          learned: (result: SetUpOutcome) => ({
            ownerKeySource: key.source,
            ...(result === "verified" && intentLimits
              ? { ownerPaymentLimit: intentLimits.payment }
              : {}),
          }),
        },
      )
      if (outcome === "verified" && intentLimits) {
        dispatch(
          cardLimitsSet({
            pubkey: cashuCard.pubkey,
            limits: {
              day: intentLimits.day,
              payment: intentLimits.payment,
              allowance: intentLimits.allowance,
              rollBudget: intentLimits.rollBudget,
            },
          }),
        )
      }
      const message =
        outcome === "verified"
          ? LL.FlashcardV2.setUpVerified()
          : outcome === "already-mine"
          ? LL.FlashcardV2.setUpAlreadyMine()
          : LL.FlashcardV2.setUpDone()
      toastShow({ position: "top", type: "success", message })
      AccessibilityInfo.announceForAccessibility(message)
      navigation.goBack()
    } catch (err) {
      if (err instanceof NfcError.UserCancel) return
      const failure = setUpFailure(err, LL)
      setError(failure.message)
      // Once set up and not confirmed, the button finishes it from then on.
      if (failure.unconfirmed) setUnconfirmed(true)
      if (failure.final) {
        sequence.current = undefined
        setStep({ name: "finished" })
      } else if (failure.retryPin) {
        // A wrong PIN for the one this sequence set: typed again, once.
        setPin(undefined)
        setEntry("")
        setStep({ name: "pin", confirm: false, resume: true })
      }
    } finally {
      setBusy(false)
    }
  }

  const onDigit = (d: string) => {
    setError(undefined)
    setEntry((e) => (e.length < PIN_MAX_LENGTH ? e + d : e))
  }

  const pinNext = () => {
    if (step.name !== "pin") return
    if (step.resume) {
      // The PIN already on the card: one entry, checked by the card itself.
      setPin(entry)
      setEntry("")
      setStep({ name: "tap" })
      return
    }
    if (!step.confirm) {
      setPin(entry)
      setEntry("")
      setStep({ name: "pin", confirm: true })
      return
    }
    if (entry !== pin) {
      setError(LL.FlashcardV2.pinMismatch())
      setPin(undefined)
      setEntry("")
      setStep({ name: "pin", confirm: false })
      return
    }
    setEntry("")
    setStep({ name: "tap" })
  }

  /** "Change" beside the limits: the step opens at the limits chosen so far. */
  const openLimitsStep = () => {
    dropUnsentSequence()
    setError(undefined)
    setStep({ name: "limits" })
  }

  const addressCheck = checkCardMint(address)
  const addressProblem = (check = addressCheck) =>
    check.ok
      ? undefined
      : check.reason === "too-long"
      ? LL.FlashcardV2.setUpMintTooLong()
      : LL.FlashcardV2.setUpMintInvalid()

  const openMintStep = () => {
    dropUnsentSequence()
    setError(undefined)
    setAddressError(undefined)
    setChoice(
      listedMints().some((listed) => sameMint(listed.url, mint))
        ? { kind: "listed", url: mint }
        : { kind: "other" },
    )
    if (!listedMints().some((listed) => sameMint(listed.url, mint))) setAddress(mint)
    setStep({ name: "mint" })
  }

  /** Continue on the mint step: a listed mint at once, a written-in one once it answers. */
  const mintNext = async () => {
    if (choice.kind === "listed") {
      setMint(choice.url)
      setStep({ name: "intro" })
      return
    }
    if (!addressCheck.ok) {
      setAddressError(addressProblem())
      return
    }
    const url = addressCheck.url
    setChecking(true)
    setAddressError(undefined)
    const answered = await answersAsMint(url)
    setChecking(false)
    // A typo would be frozen onto the card: only a mint that answers is taken.
    if (!answered) {
      setAddressError(LL.FlashcardV2.setUpMintNoAnswer())
      return
    }
    setMint(url)
    setStep({ name: "intro" })
  }

  /** What is said once under a choice: the till note, and that the mint stays (decision 2). */
  const mintCaveats = (url: string, testID: string) => (
    <>
      <TillNote url={url} testID={`${testID}-till`} />
      {!sameMint(url, CASHU_MINT_URL) && (
        <Text type="caption" style={styles.caveat} testID={`${testID}-notice`}>
          {LL.FlashcardV2.setUpMintNotice({ mint: isolatedMintName(url) })}
        </Text>
      )}
    </>
  )

  const errorLine = (
    <View style={styles.status} testID="setup-status" accessibilityLiveRegion="polite">
      {error && (
        <Text type="p2" style={styles.error} testID="setup-error">
          {error}
        </Text>
      )}
    </View>
  )

  const body = (() => {
    switch (step.name) {
      case "preparing":
        return <ActivityIndicator color={colors.primary} />
      case "intro":
        return (
          <>
            <Text type="p1" style={styles.center} testID="setup-intro">
              {LL.FlashcardV2.setUpIntro()}
            </Text>
            <Text type="p2" style={styles.center}>
              {LL.FlashcardV2.setUpFirstPhone()}
            </Text>
            <Text
              type="p2"
              bold
              style={styles.center}
              testID={`setup-key-${key?.source}`}
            >
              {key?.source === "device"
                ? LL.FlashcardV2.setUpKeyDevice()
                : LL.FlashcardV2.setUpKeySeed()}
            </Text>
            <View style={styles.mintRow}>
              <Text type="p2" style={styles.mintRowText} testID="setup-mint-row">
                {LL.FlashcardV2.setUpMintRow({ mint: isolatedMintName(mint) })}
              </Text>
              {/* A card whose record names its mint keeps it: no choice. */}
              {!recordedMint && !resumed && (
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={openMintStep}
                  style={styles.link}
                  testID="setup-mint-change"
                >
                  <Text type="p2" bold>
                    {LL.FlashcardV2.setUpMintChange()}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.mintRow}>
              <Text type="p2" style={styles.mintRowText} testID="setup-limits-row">
                {LL.FlashcardV2.setUpLimitsRow({ limits: limitsSummary(limits, LL) })}
              </Text>
              {/* A resumed setup's limits are fixed with its intent. */}
              {!resumed && (
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={openLimitsStep}
                  style={styles.link}
                  testID="setup-limits-change"
                >
                  <Text type="p2" bold>
                    {LL.FlashcardV2.setUpMintChange()}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {errorLine}
            <PrimaryBtn
              label={LL.FlashcardV2.setUpChoosePin()}
              onPress={() => {
                dropUnsentSequence()
                setStep({ name: "pin", confirm: false })
              }}
              testID="setup-choose-pin"
            />
            <PrimaryBtn
              type="outline"
              label={LL.FlashcardV2.setUpNoPin()}
              onPress={() => {
                // A no-PIN allowance needs a PIN on the card (SET_LIMIT 6985
                // after SET_OWNER would strand the setup): said here, and
                // nothing is tapped.
                if (limits.allowance > 0) {
                  setError(LL.FlashcardV2.setUpLimitsNeedPin())
                  return
                }
                dropUnsentSequence()
                setPin(undefined)
                setStep({ name: "tap" })
              }}
              testID="setup-no-pin"
            />
          </>
        )
      case "limits":
        return (
          <SetupLimitsStep
            limits={limits}
            onContinue={(chosen) => {
              setLimitsChoice(chosen)
              setStep({ name: "intro" })
            }}
            onBack={() => setStep({ name: "intro" })}
          />
        )
      case "mint":
        return (
          <>
            <Text type="h02" accessibilityRole="header" testID="setup-mint-title">
              {LL.FlashcardV2.setUpMintTitle()}
            </Text>
            <Text type="p2">{LL.FlashcardV2.setUpMintIntro()}</Text>
            <View accessibilityRole="radiogroup" style={styles.mints}>
              {listedMints().map((listed) => {
                const checked =
                  choice.kind === "listed" && sameMint(choice.url, listed.url)
                return (
                  <View key={listed.url}>
                    <TouchableOpacity
                      accessibilityRole="radio"
                      accessibilityState={{ checked }}
                      accessibilityLabel={listed.name}
                      style={[styles.mintOption, checked && styles.mintSelected]}
                      onPress={() => {
                        setAddressError(undefined)
                        setChoice({ kind: "listed", url: listed.url })
                      }}
                      testID={`setup-mint-option-${listed.name}`}
                    >
                      <Text type="p1">{listed.name}</Text>
                      <Text type="p1" bold>
                        {checked ? "✓" : ""}
                      </Text>
                    </TouchableOpacity>
                    <TillNote
                      url={listed.url}
                      testID={`setup-mint-till-${listed.name}`}
                    />
                    {checked && !sameMint(listed.url, CASHU_MINT_URL) && (
                      <Text
                        type="caption"
                        style={styles.caveat}
                        testID="setup-mint-choice-notice"
                      >
                        {LL.FlashcardV2.setUpMintNotice({
                          mint: isolatedMintName(listed.url),
                        })}
                      </Text>
                    )}
                  </View>
                )
              })}
              <TouchableOpacity
                accessibilityRole="radio"
                accessibilityState={{ checked: choice.kind === "other" }}
                style={[
                  styles.mintOption,
                  choice.kind === "other" && styles.mintSelected,
                ]}
                onPress={() => setChoice({ kind: "other" })}
                testID="setup-mint-option-other"
              >
                <Text type="p1">{LL.FlashcardV2.setUpMintOther()}</Text>
                <Text type="p1" bold>
                  {choice.kind === "other" ? "✓" : ""}
                </Text>
              </TouchableOpacity>
            </View>
            {choice.kind === "other" && (
              <>
                <TextInput
                  value={address}
                  onChangeText={(text) => {
                    setAddress(text)
                    setAddressError(undefined)
                  }}
                  onBlur={() => setAddressError(addressProblem())}
                  autoCorrect={false}
                  autoCapitalize="none"
                  autoComplete="off"
                  keyboardType="url"
                  accessibilityLabel={LL.FlashcardV2.setUpMintPlaceholder()}
                  style={[styles.address, { color: colors.black }]}
                  testID="setup-mint-address"
                />
                <Text type="caption">{LL.FlashcardV2.setUpMintPlaceholder()}</Text>
                {addressCheck.ok && mintCaveats(addressCheck.url, "setup-mint-address")}
              </>
            )}
            <View
              style={styles.status}
              testID="setup-mint-status"
              accessibilityLiveRegion="polite"
            >
              {addressError && (
                <Text type="p2" style={styles.error} testID="setup-mint-error">
                  {addressError}
                </Text>
              )}
            </View>
            <PrimaryBtn
              label={LL.FlashcardV2.next()}
              loading={checking}
              disabled={checking || (choice.kind === "other" && !addressCheck.ok)}
              onPress={mintNext}
              testID="setup-mint-next"
            />
            {/* Back changes nothing: the mint stays what it was. */}
            <PrimaryBtn
              type="outline"
              label={LL.common.back()}
              disabled={checking}
              onPress={() => {
                setAddressError(undefined)
                setStep({ name: "intro" })
              }}
              testID="setup-mint-back"
            />
          </>
        )
      case "pin":
        return (
          <>
            <Text type="h02" testID="pin-step-title" accessibilityRole="header">
              {step.resume
                ? LL.FlashcardV2.setUpResumePin()
                : step.confirm
                ? LL.FlashcardV2.confirmPin()
                : LL.FlashcardV2.newPin()}
            </Text>
            <Text type="caption">{LL.FlashcardV2.pinLength()}</Text>
            <Text
              type="h01"
              style={styles.dots}
              testID="pin-entry"
              accessibilityLabel={LL.FlashcardV2.pinEntered({ count: entry.length })}
            >
              {"●".repeat(entry.length)}
              <Text type="h01" style={styles.empty}>
                {"○".repeat(Math.max(0, 4 - entry.length))}
              </Text>
            </Text>
            {errorLine}
            <PinPad
              onDigit={onDigit}
              onBackspace={() => setEntry((e) => e.slice(0, -1))}
              onClear={() => setEntry("")}
            />
            <PrimaryBtn
              label={LL.FlashcardV2.next()}
              disabled={!isValidCardPin(entry)}
              onPress={pinNext}
              testID="pin-next"
            />
          </>
        )
      case "tap":
        return (
          <>
            <Text type="p1" style={styles.center} testID="setup-tap-note">
              {resumed && !pin
                ? LL.FlashcardV2.setUpResume()
                : pin
                ? LL.FlashcardV2.tapToApply()
                : LL.FlashcardV2.setUpNoPinNote()}
            </Text>
            {errorLine}
            <PrimaryBtn
              label={
                unconfirmed ? LL.FlashcardV2.setUpFinish() : LL.FlashcardV2.setUpTap()
              }
              loading={busy}
              disabled={busy}
              onPress={tap}
              testID="setup-tap"
            />
          </>
        )
      case "finished":
        return (
          <>
            {errorLine}
            <PrimaryBtn
              label={LL.common.close()}
              onPress={() => navigation.goBack()}
              testID="setup-close"
            />
          </>
        )
    }
  })()

  return (
    <Screen preset="scroll" backgroundColor={colors.background}>
      <View style={styles.container}>{body}</View>
    </Screen>
  )
}

/**
 * Setup's limits step (ENG-827): the owner's limits setup writes after
 * SET_OWNER, opened at the ones chosen so far. Continue takes whole numbers
 * and a budget of 1 to 30 (`limitsFromFields`), else says so inline; Back
 * changes nothing.
 */
const SetupLimitsStep: React.FC<{
  limits: CardLimits
  onContinue: (limits: CardLimits) => void
  onBack: () => void
}> = ({ limits, onContinue, onBack }) => {
  const styles = useStyles()
  const { LL } = useI18nContext()
  const [day, setDay] = useState(String(limits.day))
  const [payment, setPayment] = useState(String(limits.payment))
  const [allowance, setAllowance] = useState(String(limits.allowance))
  const [rollBudget, setRollBudget] = useState(String(limits.rollBudget))
  const [error, setError] = useState<string>()
  useEffect(() => {
    if (error && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(error)
  }, [error])

  /** A field's typed text, digits only; typing clears the error. */
  const change = (set: (text: string) => void) => (text: string) => {
    setError(undefined)
    set(text.replace(/[^0-9]/g, ""))
  }
  const next = () => {
    const chosen = limitsFromFields({ day, payment, allowance, rollBudget })
    if (!chosen) {
      setError(LL.FlashcardV2.limitsInvalid())
      return
    }
    onContinue(chosen)
  }

  return (
    <>
      <Text type="h02" accessibilityRole="header" testID="setup-limits-title">
        {LL.FlashcardV2.limitsTitle()}
      </Text>
      <Text type="p2">{LL.FlashcardV2.limitsIntro()}</Text>
      <LimitField
        label={LL.FlashcardV2.limitsDaily()}
        note={LL.FlashcardV2.limitsDailyNote()}
        value={day}
        onChange={change(setDay)}
        editable
        testID="setup-limits-day"
      />
      <LimitField
        label={LL.FlashcardV2.limitsPayment()}
        note={LL.FlashcardV2.limitsPaymentNote()}
        value={payment}
        onChange={change(setPayment)}
        editable
        testID="setup-limits-payment"
      />
      <LimitField
        label={LL.FlashcardV2.limitsAllowance()}
        note={LL.FlashcardV2.limitsAllowanceNote()}
        value={allowance}
        onChange={change(setAllowance)}
        editable
        testID="setup-limits-allowance"
      />
      <LimitField
        label={LL.FlashcardV2.limitsRollBudget()}
        note={LL.FlashcardV2.limitsRollBudgetNote()}
        value={rollBudget}
        onChange={change(setRollBudget)}
        editable
        testID="setup-limits-roll-budget"
      />
      <View
        style={styles.status}
        testID="setup-limits-status"
        accessibilityLiveRegion="polite"
      >
        {error && (
          <Text type="p2" style={styles.error} testID="setup-limits-error">
            {error}
          </Text>
        )}
      </View>
      <PrimaryBtn
        label={LL.FlashcardV2.next()}
        onPress={next}
        testID="setup-limits-next"
      />
      {/* Back changes nothing: the limits stay what they were. */}
      <PrimaryBtn
        type="outline"
        label={LL.common.back()}
        onPress={onBack}
        testID="setup-limits-back"
      />
    </>
  )
}

/** What a card setup refuses is told, by why (ENG-825). */
const notOpenMessage = (reason: CardNotOpenReason, LL: LLType, mint?: string): string => {
  switch (reason) {
    case "owned":
      return LL.FlashcardV2.setUpAlreadyOwned()
    case "in-use":
      return LL.FlashcardV2.setUpInUse()
    case "used":
      return LL.FlashcardV2.setUpUsed()
    case "locked":
      return LL.FlashcardV2.setUpLocked()
    case "limits-set":
      return LL.FlashcardV2.setUpLimitsSet()
    case "pin-set":
      return LL.FlashcardV2.setUpPinSet()
    case "other-mint":
      return LL.FlashcardV2.setUpOtherMint({ mint: isolatedMintName(mint ?? "") })
    case "unreadable":
      return LL.FlashcardV2.setUpUnreadable()
  }
}

/** What to tell the holder about a setup tap that failed, and whether to try again here. */
const setUpFailure = (
  err: unknown,
  LL: LLType,
): { message: string; final?: boolean; retryPin?: boolean; unconfirmed?: boolean } => {
  if (err instanceof WrongCardError) return { message: LL.FlashcardV2.wrongCard() }
  // Set up, owned by this phone, and not all of it confirmed (ENG-827): the
  // same sequence finishes it at the next tap. Limits the card holds that
  // setup did not write are never overwritten: the holder checks Limits.
  if (err instanceof SetupUnconfirmedError) {
    // No tap finishes a card whose limits came from elsewhere: final here,
    // as the card screen says it (`setupLimitsDiffer`), with no Finish.
    if (err.limitsChangedElsewhere) {
      return { message: LL.FlashcardV2.setUpLimitsDiffer(), final: true }
    }
    return {
      message: LL.FlashcardV2.setUpUnconfirmed({ what: unconfirmedWhat(err.fields, LL) }),
      unconfirmed: true,
    }
  }
  // The card did not keep the record written to it (ENG-826): final, and
  // this phone is not its owner.
  if (err instanceof SetupReadBackError) {
    return { message: LL.FlashcardV2.setUpReadBackMismatch(), final: true }
  }
  // The record of the next write did not reach the phone's storage: that
  // write was not sent. Try again.
  if (err instanceof PersistWriteError) return { message: LL.FlashcardV2.setUpFailed() }
  if (err instanceof CardNeedsUpdateError) {
    // The applet answered, but not as one setup writes to: an older one needs
    // the card updated, a newer one needs this app updated.
    if (err.found === "older") {
      return { message: LL.FlashcardV2.setUpNeedsApplet(), final: true }
    }
    if (err.found === "newer") {
      return { message: LL.FlashcardV2.setUpNeedsAppUpdate(), final: true }
    }
    return { message: LL.FlashcardV2.needsUpdateBody(), final: true }
  }
  if (err instanceof AppletNotSelectedError)
    return { message: LL.FlashcardV2.notCashuCard() }
  if (err instanceof RelayUnsettledError)
    return { message: LL.FlashcardV2.relayPending() }
  if (err instanceof CardNotOpenError) {
    // Answers that don't add up may be a tap held badly: tap again.
    if (err.reason === "unreadable") return { message: LL.FlashcardV2.setUpUnreadable() }
    return { message: notOpenMessage(err.reason, LL, err.mint), final: true }
  }
  if (err instanceof CardError) {
    // VERIFY_PIN refused the PIN typed on a resume (ENG-826). The last wrong
    // PIN blocks it: final, as top-up says it; otherwise type it again.
    const tries = triesLeft(err.sw)
    if (tries === 0 || err.sw === SW_PIN_BLOCKED) {
      return { message: LL.FlashcardV2.cardNowBlocked(), final: true }
    }
    if (tries !== undefined) {
      return { message: LL.FlashcardV2.wrongPin({ tries }), retryPin: true }
    }
    if (err.sw === SW_CARD_IN_USE)
      return { message: LL.FlashcardV2.setUpInUse(), final: true }
    if (err.sw === 0x6986) return { message: LL.FlashcardV2.cardLocked(), final: true }
    console.warn(`Cashu card refused ${err.context}: ${err.name} ${swHex(err.sw)}`)
    return { message: LL.FlashcardV2.setUpFailed() }
  }
  // An answer framed wrong: nothing was acted on. Tap again.
  if (err instanceof CardProtocolError)
    return { message: LL.FlashcardV2.setUpUnreadable() }
  // No answer: the card may hold any part of the setup. The next tap finishes
  // it, with the key this phone already saved.
  return { message: LL.FlashcardV2.setUpUncertain() }
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    padding: 20,
    gap: 16,
    alignItems: "stretch",
  },
  center: {
    textAlign: "center",
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
  mintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  mintRowText: {
    textAlign: "center",
  },
  // At least 44 pt to press.
  link: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  mints: {
    gap: 8,
  },
  mintOption: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border01,
  },
  mintSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  caveat: {
    marginTop: 4,
    marginHorizontal: 16,
    color: colors.grey2,
  },
  address: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border01,
    paddingHorizontal: 12,
    fontFamily: MONOSPACE,
  },
}))
