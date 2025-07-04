import React, { createContext, useEffect, useState } from "react"
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

// utils
import { toastShow } from "../utils/toast"

// assets
import NfcScan from "@app/assets/icons/nfc-scan.svg"

const width = Dimensions.get("screen").width

type TransactionItem = {
  date: string
  sats: string
}

interface FlashcardInterface {
  tag?: TagEvent
  k1?: string
  callback?: string
  lnurl?: string
  balanceInSats?: number
  transactions?: TransactionItem[]
  loading?: boolean
  error?: string
  resetFlashcard: () => void
  readFlashcard: (isPayment?: boolean) => void
}

export const FlashcardContext = createContext<FlashcardInterface>({
  tag: undefined,
  k1: undefined,
  callback: undefined,
  lnurl: undefined,
  balanceInSats: undefined,
  transactions: undefined,
  loading: undefined,
  error: undefined,
  resetFlashcard: () => {},
  readFlashcard: () => {},
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

  const readFlashcard = async (isPayment?: boolean) => {
    const isSupported = await NfcManager.isSupported()
    const isEnabled = await NfcManager.isEnabled()

    if (!isSupported) {
      toastShow({
        position: "top",
        message: "NFC is not supported on this device",
        type: "error",
      })
    } else if (!isEnabled) {
      toastShow({
        position: "top",
        message: "NFC is not enabled on this device.",
        type: "error",
      })
    } else {
      handleTag(isPayment)
    }
  }

  const handleTag = async (isPayment?: boolean) => {
    try {
      setVisible(true)
      NfcManager.start()
      await NfcManager.requestTechnology(NfcTech.Ndef)
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
              await getHtml(tag, payload)
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
  }

  const getPayDetails = async (payload: string) => {
    try {
      const lnurlParams = await getParams(payload)
      if ("tag" in lnurlParams && lnurlParams.tag === "withdrawRequest") {
        const { k1, callback } = lnurlParams

        console.log("K1>>>>>>>>>>>>>>", k1)
        console.log("CALLBACK>>>>>>>>>>>>>", callback)
        setK1(k1)
        setCallback(callback)
      } else {
        toastShow({
          position: "top",
          message: `not a properly configured lnurl withdraw tag\n\n${payload}\n\n${
            "reason" in lnurlParams && lnurlParams.reason
          }`,
          type: "error",
        })
      }
    } catch (err) {
      console.log("NFC ERROR:", err)
      toastShow({
        position: "top",
        message: "Unsupported NFC card. Please ensure you are using a flashcard.",
        type: "error",
      })
    }
  }

  const getHtml = async (tag: TagEvent, payload: string) => {
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

      getLnurl(html)
      getBalance(html)
      getTransactions(html)
    } catch (err) {
      console.log("NFC ERROR:", err)
      toastShow({
        position: "top",
        message:
          "Unsupported NFC card. Please ensure you are using a flashcard or other boltcard compatible NFC",
        type: "error",
      })
    }
  }

  const getLnurl = (html: string) => {
    const lnurlMatch = html.match(/href="lightning:(lnurl\w+)"/)
    if (lnurlMatch) {
      console.log("LNURL MATCH>>>>>>>>>>", lnurlMatch[1])
      setLnurl(lnurlMatch[1])
    }
  }

  const getBalance = (html: string) => {
    const balanceMatch = html.match(/(\d{1,3}(?:,\d{3})*)\s*SATS<\/dt>/)
    if (balanceMatch) {
      const parsedBalance = balanceMatch[1].replace(/,/g, "") // Remove commas
      const satoshiAmount = parseInt(parsedBalance, 10)

      console.log("SATOSHI AMOUNT>>>>>>>>>>>>>>>", satoshiAmount)
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

  return (
    <FlashcardContext.Provider
      value={{
        tag,
        k1,
        callback,
        lnurl,
        balanceInSats,
        transactions,
        loading,
        error,
        resetFlashcard,
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
                <NfcScan
                  width={width / 2}
                  height={width / 2}
                  style={{ marginVertical: 40 }}
                />
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
