import React, { createContext, useEffect, useRef, useState } from "react"
import { Dimensions, Platform, View } from "react-native"
import RNModal from "react-native-modal"
import { SafeAreaView } from "react-native-safe-area-context"
import NfcManager, { Ndef, TagEvent, NfcTech } from "react-native-nfc-manager"
import * as Animatable from "react-native-animatable"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { getParams } from "js-lnurl"
import axios from "axios"

// components
import { PrimaryBtn } from "@app/components/buttons"
import { Loading } from "./ActivityIndicatorContext"

// hooks
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { usePersistentStateContext } from "@app/store/persistent-state"
import { useAppDispatch } from "@app/store/redux"
import {
  cardForgotten,
  cardSeen,
  cardUnitResolved,
} from "@app/store/redux/slices/flashcardV2Slice"

// utils
import { toastShow } from "../utils/toast"
import {
  AppletNotSelectedError,
  CardError,
  CardInfo,
  CardKeysetTotal,
  CashuCardInfo,
  Transceiver,
  WrongCardError,
  getBalance as getCardBalance,
  getInfo,
  getPubkey,
  readCashuCard,
  readKeysetSplit,
  selectApplet,
  toHex,
} from "../utils/cashu-card"
import { extendCardTimeout } from "../utils/cashu-card-nfc"
import {
  CardUnitTotals,
  soleUnit,
  totalsByUnit,
  unitsForKeysets,
} from "../utils/cashu-mint"

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

/**
 * A card's unspent value per unit, as the mint names the unit of each keyset
 * on it. An empty card needs no lookup. Undefined when the tap could not read
 * the keyset split (there is nothing to ask the mint about), or when the mint
 * could not be asked or did not answer with a keyset list.
 */
const cardUnitTotals = async (
  card: CashuCardInfo,
): Promise<CardUnitTotals | undefined> => {
  const { keysets } = card
  if (!keysets) return undefined
  if (keysets.length === 0) return { byUnit: [], unknown: 0 }
  try {
    const units = await unitsForKeysets(keysets.map((k) => k.keysetId))
    return totalsByUnit(keysets, units)
  } catch (err) {
    console.warn("Cashu mint keyset lookup failed:", describeError(err))
    return undefined
  }
}

const width = Dimensions.get("screen").width

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
  /** A BoltCard whose balance page loaded: the BoltCard screen has a card to show. */
  boltCard?: boolean
}

/** A Cashu card as the app holds it: what the card said, plus what the mint said. */
export type CashuCardState = CashuCardInfo & {
  /**
   * The card's unspent value per unit, once the mint has named the unit of
   * each keyset on it. Undefined while that lookup is outstanding, after it
   * failed, or when the tap could not read the keyset split at all: the
   * screen then labels the card's figure "unit unknown".
   */
  unitTotals?: CardUnitTotals
}

/** How a caller of `runCardOperation` learns about, or vouches for, the card afterwards. */
export type CardOperationOptions = {
  /**
   * What the operation proves about the card once it has succeeded: SET_PIN
   * or CHANGE_PIN answering 9000 proves a PIN is set. Applied to the card on
   * screen (and, signed in, to its record) only when the re-read after a
   * successful operation is lost, so the screen never keeps showing the
   * state the operation just changed.
   */
  assume?: Partial<CardInfo>
  /**
   * Called with what GET_INFO said when the card was re-read: after the
   * operation succeeded, or after the card refused it. Not called when there
   * was no re-read or it was lost.
   */
  onReread?: (info: CardInfo) => void
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
  readFlashcard: (isPayment?: boolean) => Promise<FlashcardReadResult>
  /**
   * One more tap, for something that changes the card: PIN, load, spend.
   * Opens a session, selects the applet, checks it is `expectedPubkey`'s card,
   * runs `op`, re-reads the card (GET_INFO + GET_BALANCE) so `cashuCard` shows
   * the result, and releases.
   *
   * The re-read never costs the operation its outcome: once `op` has
   * succeeded its result is returned even if the card leaves before the
   * re-read, with `options.assume` applied instead. A card that refused `op`
   * (a `CardError`) is re-read too, because a refusal can change it (the
   * third wrong PIN blocks it), and the refusal is then rethrown unchanged. A
   * different card, a tag without the applet, or a lost channel gets no
   * re-read. Every failure is rethrown after the release; the caller owns the
   * message.
   */
  runCardOperation: <T>(
    op: (transceive: Transceiver) => Promise<T>,
    expectedPubkey: string,
    options?: CardOperationOptions,
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
  loading: undefined,
  error: undefined,
  resetFlashcard: () => {},
  forgetCashuCard: () => {},
  readFlashcard: async () => ({}),
  runCardOperation: async () => {
    throw new Error("FlashcardProvider is not mounted")
  },
})

type Props = {
  children: string | JSX.Element | JSX.Element[]
}

export const FlashcardProvider = ({ children }: Props) => {
  const isAuthed = useIsAuthed()
  const styles = useStyles()
  const { mode } = useTheme().theme

  const { updateState, persistentState } = usePersistentStateContext()

  const [visible, setVisible] = useState(false)
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

  const readFlashcard = async (isPayment?: boolean): Promise<FlashcardReadResult> => {
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
    return handleTag(isPayment)
  }

  const handleTag = async (isPayment?: boolean): Promise<FlashcardReadResult> => {
    let boltCard = false
    try {
      setVisible(true)
      NfcManager.start()
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
      const tech = await NfcManager.requestTechnology([NfcTech.IsoDep, NfcTech.Ndef])
      if (tech === NfcTech.IsoDep) {
        let info: CashuCardInfo | null
        try {
          info = await readCashuCard((bytes) =>
            NfcManager.isoDepHandler.transceive(bytes),
          )
        } catch (err) {
          // The card answered SELECT (or the channel itself dropped), so this
          // tap is over: it must not be re-read as a BoltCard. Every NDEF-side
          // failure toasts, so this one does too. Rethrowing keeps the outer
          // catch as the only logging site and the finally as the only release.
          toastShow({
            position: "top",
            message:
              "Couldn't read the card. Hold your phone steady against it and try again.",
            type: "error",
          })
          throw err
        }
        if (info) {
          // The card screen renders this; the caller navigates on the result.
          cashuGeneration.current += 1
          setCashuCard(info)
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
                at: Date.now(),
              }),
            )
          }
          // The mint names the units; ask it off the NFC session, which the
          // finally below releases without waiting.
          resolveCashuUnits(info, cashuGeneration.current)
          return { cashuCard: info }
        }
        // The applet SELECT was refused: not a Cashu card. Parse the same
        // tag's NDEF message below.
      }
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
      cancelTechnologyRequest()
    }
    return boltCard ? { boltCard } : {}
  }

  /**
   * Puts the mint's units on a Cashu card that was just read: per-unit totals
   * on the card in context and, signed in, the card's single unit (if it has
   * exactly one) on its record. A mint that cannot be reached, or a tap that
   * lost the keyset split, leaves the screen's figure labelled "unit unknown"
   * and the record's unit as it was; the next read asks again. A newer read,
   * or a forget, in the meantime wins.
   */
  const resolveCashuUnits = async (card: CashuCardInfo, generation: number) => {
    const unitTotals = await cardUnitTotals(card)
    if (!unitTotals || generation !== cashuGeneration.current) return
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
   * Puts what a card operation learned on the card in context and, signed
   * in, on its record. Only the card on screen is touched: the operation ran
   * against it (`runCardOperation` checked the pubkey), and a card forgotten
   * while the tap ran stays forgotten.
   *
   * The keyset split, and the units the mint named for it, describe the
   * balance the tap read. A balance that changed leaves neither true, so both
   * are dropped, in context and from the record's unit: the screen says
   * "unit unknown" until the next read rather than show old per-unit figures
   * beside a new total.
   */
  const recordCardOperation = (
    pubkey: string,
    update: Partial<CardInfo> & { balance?: number },
    keysets?: CardKeysetTotal[],
  ) => {
    const previous = cashuCardRef.current
    if (previous?.pubkey !== pubkey) return
    const moved = update.balance !== undefined && update.balance !== previous.balance
    const card: CashuCardState = {
      ...previous,
      ...update,
      // A split read in the same session as the move replaces the old one.
      keysets: moved ? keysets : previous.keysets,
      unitTotals: moved ? undefined : previous.unitTotals,
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
          at: Date.now(),
        }),
      )
      if (moved) dispatch(cardUnitResolved({ pubkey, unit: undefined }))
    }
  }

  /**
   * Re-reads the card after an operation (GET_INFO + GET_BALANCE) and records
   * what it says. Best effort: resolves what GET_INFO said, or undefined when
   * the card left first. The operation's own outcome stands either way, so a
   * lost re-read is logged (error name only) and never thrown.
   */
  const rereadCard = async (
    transceive: Transceiver,
    pubkey: string,
  ): Promise<CardInfo | undefined> => {
    try {
      const info = await getInfo(transceive)
      const balance = await getCardBalance(transceive)
      // An operation that moved value (a top-up) changed the card's keyset
      // split too: read it while the card is still in the field, best
      // effort, as a tap does, so the screen can name the units again.
      const previous = cashuCardRef.current
      const moved = previous?.pubkey === pubkey && balance !== previous.balance
      const keysets = moved ? await readKeysetSplit(transceive, info) : undefined
      recordCardOperation(pubkey, { ...info, balance }, keysets)
      return info
    } catch (err) {
      console.warn("Cashu card re-read after an operation failed:", describeError(err))
      return undefined
    }
  }

  const runCardOperation = async <T,>(
    op: (transceive: Transceiver) => Promise<T>,
    expectedPubkey: string,
    { assume, onReread }: CardOperationOptions = {},
  ): Promise<T> => {
    setVisible(true)
    NfcManager.start()
    try {
      // IsoDep only: this tap is for the applet, never for an NDEF tag.
      await NfcManager.requestTechnology(NfcTech.IsoDep)
      // On-card work can outlive Android's 618 ms default (see the helper).
      await extendCardTimeout()
      const transceive: Transceiver = (bytes) =>
        NfcManager.isoDepHandler.transceive(bytes)
      // A fresh IsoDep channel resets the active applet; without a SELECT
      // Android answers every command with 6E00 (flash-pos found this).
      await selectApplet(transceive)
      const pubkey = toHex(await getPubkey(transceive))
      if (pubkey !== expectedPubkey) throw new WrongCardError(pubkey)

      const reread = async () => {
        const info = await rereadCard(transceive, expectedPubkey)
        if (info) onReread?.(info)
        return info
      }

      let result: T
      try {
        result = await op(transceive)
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
      if (!(await reread()) && assume) recordCardOperation(expectedPubkey, assume)
      return result
    } finally {
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
    NfcManager.cancelTechnologyRequest()
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
              <Text type="bm">Please tap NFC tags</Text>
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
