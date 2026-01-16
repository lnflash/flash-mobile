import React, { createContext, useCallback, useEffect, useState } from "react"
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
import {
  BoltcardApi,
  BoltcardSettings,
  PinStatus,
  BoltcardSettingsUpdate,
} from "../utils/boltcard-api"
import { parseBoltcardUrl, isFlashPluginUrl } from "../utils/boltcard-url"

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
  // New Boltcard settings fields
  cardId?: string
  storeId?: string
  apiBaseUrl?: string
  settings?: BoltcardSettings
  pinStatus?: PinStatus
  settingsLoading?: boolean
  settingsError?: string
  // Existing methods
  resetFlashcard: () => void
  readFlashcard: (isPayment?: boolean) => void
  // New Boltcard settings methods
  fetchSettings: () => Promise<void>
  updateCardSettings: (settings: BoltcardSettingsUpdate) => Promise<boolean>
  setCardPin: (pin: string) => Promise<boolean>
  removeCardPin: () => Promise<boolean>
  fetchPinStatus: () => Promise<void>
  unlockCard: () => Promise<boolean>
  // NFC verification for settings changes
  verifyCardOwnership: () => Promise<boolean>
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
  // New Boltcard settings fields
  cardId: undefined,
  storeId: undefined,
  apiBaseUrl: undefined,
  settings: undefined,
  pinStatus: undefined,
  settingsLoading: undefined,
  settingsError: undefined,
  // Existing methods
  resetFlashcard: () => {},
  readFlashcard: () => {},
  // New Boltcard settings methods
  fetchSettings: async () => {},
  updateCardSettings: async () => false,
  setCardPin: async () => false,
  removeCardPin: async () => false,
  fetchPinStatus: async () => {},
  unlockCard: async () => false,
  verifyCardOwnership: async () => false,
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

  // New Boltcard settings state
  const [cardId, setCardId] = useState<string>()
  const [storeId, setStoreId] = useState<string>()
  const [apiBaseUrl, setApiBaseUrl] = useState<string>()
  const [settings, setSettings] = useState<BoltcardSettings>()
  const [pinStatus, setPinStatus] = useState<PinStatus>()
  const [settingsLoading, setSettingsLoading] = useState<boolean>()
  const [settingsError, setSettingsError] = useState<string>()

  useEffect(() => {
    loadFlashcard()
  }, [])

  const loadFlashcard = async () => {
    const {
      flashcardTag,
      flashcardHtml,
      flashcardStoreId,
      flashcardCardId,
      flashcardApiBaseUrl,
    } = persistentState
    if (flashcardTag && flashcardHtml) {
      setTag(flashcardTag)
      getLnurl(flashcardHtml)
      getBalance(flashcardHtml)
      getTransactions(flashcardHtml)

      // Load Boltcard URL info from persistent state
      if (flashcardStoreId) setStoreId(flashcardStoreId)
      if (flashcardCardId) setCardId(flashcardCardId)
      if (flashcardApiBaseUrl) setApiBaseUrl(flashcardApiBaseUrl)
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

      // Try to parse Boltcard URL info for settings API
      let parsedStoreId: string | undefined
      let parsedCardId: string | undefined
      let parsedApiBaseUrl: string | undefined

      if (isFlashPluginUrl(payload)) {
        try {
          const urlInfo = parseBoltcardUrl(payload, tag.id)
          parsedStoreId = urlInfo.storeId
          parsedCardId = urlInfo.cardId
          parsedApiBaseUrl = urlInfo.baseUrl
          console.log("Parsed Boltcard URL info:", urlInfo)

          // Update local state
          setStoreId(parsedStoreId)
          setCardId(parsedCardId)
          setApiBaseUrl(parsedApiBaseUrl)
        } catch (parseErr) {
          console.log("Could not parse Boltcard URL for settings:", parseErr)
          // Not a fatal error - card still works, just settings won't be available
        }
      }

      updateState((state: any) => {
        if (state)
          return {
            ...state,
            flashcardAdded: isAuthed ? true : undefined,
            flashcardTag: isAuthed ? tag : undefined,
            flashcardHtml: isAuthed ? html : undefined,
            // Store Boltcard URL info for settings API
            flashcardStoreId: isAuthed ? parsedStoreId : undefined,
            flashcardCardId: isAuthed ? parsedCardId : undefined,
            flashcardApiBaseUrl: isAuthed ? parsedApiBaseUrl : undefined,
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
    // Clear Boltcard settings state
    setCardId(undefined)
    setStoreId(undefined)
    setApiBaseUrl(undefined)
    setSettings(undefined)
    setPinStatus(undefined)
    setSettingsLoading(undefined)
    setSettingsError(undefined)

    updateState((state: any) => {
      if (state)
        return {
          ...state,
          flashcardTag: undefined,
          flashcardHtml: undefined,
          // Clear Boltcard URL info
          flashcardStoreId: undefined,
          flashcardCardId: undefined,
          flashcardApiBaseUrl: undefined,
        }
      return undefined
    })
  }

  // Boltcard Settings API Methods

  /**
   * Fetch current card settings from BTCPayServer
   */
  const fetchSettings = useCallback(async () => {
    if (!apiBaseUrl || !storeId) {
      setSettingsError("Card settings not available - missing API info")
      return
    }

    setSettingsLoading(true)
    setSettingsError(undefined)

    try {
      const fetchedSettings = await BoltcardApi.getSettings(apiBaseUrl, storeId)
      setSettings(fetchedSettings)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch settings"
      setSettingsError(message)
      console.log("Error fetching Boltcard settings:", err)
    } finally {
      setSettingsLoading(false)
    }
  }, [apiBaseUrl, storeId])

  /**
   * Fetch PIN status for the card
   */
  const fetchPinStatus = useCallback(async () => {
    if (!apiBaseUrl || !storeId || !cardId) {
      return
    }

    try {
      const status = await BoltcardApi.getPinStatus(apiBaseUrl, storeId, cardId)
      setPinStatus(status)
    } catch (err) {
      console.log("Error fetching PIN status:", err)
    }
  }, [apiBaseUrl, storeId, cardId])

  /**
   * Update card settings (max withdrawal, enable/disable)
   */
  const updateCardSettings = useCallback(
    async (newSettings: BoltcardSettingsUpdate): Promise<boolean> => {
      if (!apiBaseUrl || !storeId) {
        toastShow({
          position: "top",
          message: "Card settings not available",
          type: "error",
        })
        return false
      }

      setSettingsLoading(true)
      try {
        const updatedSettings = await BoltcardApi.updateSettings(apiBaseUrl, storeId, newSettings)
        setSettings(updatedSettings)
        toastShow({
          position: "top",
          message: "Settings updated successfully",
          type: "success",
        })
        return true
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update settings"
        toastShow({
          position: "top",
          message,
          type: "error",
        })
        return false
      } finally {
        setSettingsLoading(false)
      }
    },
    [apiBaseUrl, storeId],
  )

  /**
   * Set or update PIN for the card
   */
  const setCardPin = useCallback(
    async (pin: string): Promise<boolean> => {
      if (!apiBaseUrl || !storeId || !cardId) {
        toastShow({
          position: "top",
          message: "Card settings not available",
          type: "error",
        })
        return false
      }

      setSettingsLoading(true)
      try {
        await BoltcardApi.setPin(apiBaseUrl, storeId, cardId, pin)
        // Refresh PIN status
        await fetchPinStatus()
        toastShow({
          position: "top",
          message: "PIN set successfully",
          type: "success",
        })
        return true
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to set PIN"
        toastShow({
          position: "top",
          message,
          type: "error",
        })
        return false
      } finally {
        setSettingsLoading(false)
      }
    },
    [apiBaseUrl, storeId, cardId, fetchPinStatus],
  )

  /**
   * Remove PIN from the card
   */
  const removeCardPin = useCallback(async (): Promise<boolean> => {
    if (!apiBaseUrl || !storeId || !cardId) {
      toastShow({
        position: "top",
        message: "Card settings not available",
        type: "error",
      })
      return false
    }

    setSettingsLoading(true)
    try {
      await BoltcardApi.removePin(apiBaseUrl, storeId, cardId)
      // Refresh PIN status
      await fetchPinStatus()
      toastShow({
        position: "top",
        message: "PIN removed successfully",
        type: "success",
      })
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to remove PIN"
      toastShow({
        position: "top",
        message,
        type: "error",
      })
      return false
    } finally {
      setSettingsLoading(false)
    }
  }, [apiBaseUrl, storeId, cardId, fetchPinStatus])

  /**
   * Unlock a locked card
   */
  const unlockCard = useCallback(async (): Promise<boolean> => {
    if (!apiBaseUrl || !storeId || !cardId) {
      toastShow({
        position: "top",
        message: "Card settings not available",
        type: "error",
      })
      return false
    }

    setSettingsLoading(true)
    try {
      await BoltcardApi.unlockCard(apiBaseUrl, storeId, cardId)
      // Refresh PIN status
      await fetchPinStatus()
      toastShow({
        position: "top",
        message: "Card unlocked successfully",
        type: "success",
      })
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to unlock card"
      toastShow({
        position: "top",
        message,
        type: "error",
      })
      return false
    } finally {
      setSettingsLoading(false)
    }
  }, [apiBaseUrl, storeId, cardId, fetchPinStatus])

  /**
   * Verify card ownership by requiring NFC scan
   * Returns true if the scanned card matches the stored card
   */
  const verifyCardOwnership = useCallback(async (): Promise<boolean> => {
    if (!tag?.id) {
      toastShow({
        position: "top",
        message: "No card registered",
        type: "error",
      })
      return false
    }

    return new Promise((resolve) => {
      const verifyTag = async () => {
        try {
          setVisible(true)
          NfcManager.start()
          await NfcManager.requestTechnology(NfcTech.Ndef)
          const scannedTag = await NfcManager.getTag()

          if (scannedTag && scannedTag.id === tag.id) {
            toastShow({
              position: "top",
              message: "Card verified",
              type: "success",
            })
            resolve(true)
          } else {
            toastShow({
              position: "top",
              message: "Card does not match. Please scan the correct card.",
              type: "error",
            })
            resolve(false)
          }
        } catch (ex) {
          console.warn("NFC verification error:", ex)
          toastShow({
            position: "top",
            message: "Card verification failed",
            type: "error",
          })
          resolve(false)
        } finally {
          setVisible(false)
          NfcManager.cancelTechnologyRequest()
        }
      }

      verifyTag()
    })
  }, [tag])

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
        // Boltcard settings
        cardId,
        storeId,
        apiBaseUrl,
        settings,
        pinStatus,
        settingsLoading,
        settingsError,
        // Methods
        resetFlashcard,
        readFlashcard,
        fetchSettings,
        updateCardSettings,
        setCardPin,
        removeCardPin,
        fetchPinStatus,
        unlockCard,
        verifyCardOwnership,
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
