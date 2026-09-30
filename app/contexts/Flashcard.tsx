import React, { createContext, useEffect, useRef, useState } from "react"
import { Dimensions, Modal, Platform, TouchableOpacity, View } from "react-native"
import NfcManager, { Ndef, TagEvent, NfcTech } from "react-native-nfc-manager"
import * as Animatable from "react-native-animatable"
import { makeStyles, Text } from "@rneui/themed"
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
import { CashuCardInfo, readCashuCard } from "../utils/cashu-card"
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
})

type Props = {
  children: string | JSX.Element | JSX.Element[]
}

export const FlashcardProvider = ({ children }: Props) => {
  const isAuthed = useIsAuthed()
  const styles = useStyles()

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
  const [cashuCard, setCashuCard] = useState<CashuCardState>()
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
    setCashuCard((current) => (current ? { ...current, unitTotals } : current))
    if (isAuthed) {
      dispatch(cardUnitResolved({ pubkey: card.pubkey, unit: soleUnit(unitTotals) }))
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
      }}
    >
      {children}
      {loading && <Loading />}
      <Modal
        animationType="slide"
        transparent={true}
        visible={visible && Platform.OS === "android"}
        onRequestClose={cancelTechnologyRequest}
      >
        <TouchableOpacity onPress={cancelTechnologyRequest} style={styles.backdrop}>
          <View style={styles.container}>
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
          </View>
        </TouchableOpacity>
      </Modal>
    </FlashcardContext.Provider>
  )
}

const useStyles = makeStyles(({ colors, mode }) => ({
  nfcScan: {
    marginVertical: 40,
  },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: mode === "dark" ? "rgba(57,57,57,.7)" : "rgba(0,0,0,.5)",
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
