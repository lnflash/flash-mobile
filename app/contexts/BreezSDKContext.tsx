import React, { createContext, useEffect, useState, useCallback } from "react"
import RNFS from "react-native-fs"
import * as Keychain from "react-native-keychain"
import * as bip39 from "bip39"
export const KEYCHAIN_MNEMONIC_KEY = "mnemonic_key"

import {
  BreezSdkInterface,
  connect,
  defaultConfig,
  InputType_Tags,
  Network,
  OnchainConfirmationSpeed,
  ReceivePaymentMethod,
  SdkEvent,
  Seed,
  SendPaymentMethod,
  SendPaymentOptions,
} from "@breeztech/breez-sdk-spark-react-native"

import { API_KEY } from "@env"

interface BreezSDKContextType {
  sdk?: BreezSdkInterface
  isConnected: boolean
  isConnecting: boolean
  error?: string
  balance?: bigint
  sendPayment: (invoice: string, amountSats: bigint) => Promise<any>
  receivePayment: (amountSats: bigint, description?: string) => Promise<any>
  disconnect: () => Promise<void>
}

export const BreezSDKContext = createContext<BreezSDKContextType | undefined>(undefined)

type Props = {
  children: string | JSX.Element | JSX.Element[]
}

export const BreezSDKProvider = ({ children }: Props) => {
  const [sdk, setSdk] = useState<BreezSdkInterface>()
  const [listenerId, setListenerId] = useState<string>()
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState()
  const [balance, setBalance] = useState<bigint>()

  // Initialize SDK on mount
  useEffect(() => {
    initializeSDK()

    return () => {
      // Cleanup on unmount
      if (sdk) {
        disconnect()
      }
    }
  }, [])

  const initializeSDK = async () => {
    try {
      setIsConnecting(true)
      setError(undefined)

      // Get your mnemonic from secure storage (AsyncStorage, Keychain, etc.)
      const mnemonic = await getOrGenerateMnemonic()
      const seed = new Seed.Mnemonic({ mnemonic, passphrase: undefined })

      // Configure SDK
      const config = defaultConfig(Network.Mainnet)
      config.apiKey = API_KEY

      // Connect to SDK
      const connectedSdk = await connect({
        config,
        seed,
        storageDir: `${RNFS.DocumentDirectoryPath}/data`,
      })

      setSdk(connectedSdk)
      setIsConnected(true)

      // Fetch initial balance
      await updateBalance(connectedSdk)

      // Set up event listeners
      setupEventListeners(connectedSdk)
    } catch (err: any) {
      console.error("Failed to initialize Breez SDK:", err)
      setError(err.message)
    } finally {
      setIsConnecting(false)
    }
  }

  const setupEventListeners = async (sdkInstance: BreezSdkInterface) => {
    class JsEventListener {
      onEvent = async (event: SdkEvent) => {
        console.log(`Received event: ${JSON.stringify(event)}`)
      }
    }

    const eventListener = new JsEventListener()
    const listenerId = await sdkInstance.addEventListener(eventListener)
    setListenerId(listenerId)
  }

  const updateBalance = async (sdkInstance: BreezSdkInterface) => {
    try {
      const walletInfo = await sdkInstance.getInfo({ ensureSynced: false })
      setBalance(walletInfo.balanceSats)
    } catch (err) {
      console.error("Failed to fetch balance:", err)
    }
  }

  const sendPayment = useCallback(
    async (invoice: string, amountSats: bigint) => {
      if (!sdk || !isConnected) {
        throw new Error("SDK not connected")
      }

      try {
        const prepareResponse = await sdk.prepareSendPayment({
          paymentRequest: invoice,
          amount: amountSats,
          tokenIdentifier: undefined,
        })

        // If the fees are acceptable, continue to create the Send Payment
        if (prepareResponse.paymentMethod instanceof SendPaymentMethod.Bolt11Invoice) {
          // Fees to pay via Lightning
          const lightningFeeSats = prepareResponse.paymentMethod.inner.lightningFeeSats
          // Or fees to pay (if available) via a Spark transfer
          const sparkTransferFeeSats =
            prepareResponse.paymentMethod.inner.sparkTransferFeeSats
          console.debug(`Lightning Fees: ${lightningFeeSats} sats`)
          console.debug(`Spark Transfer Fees: ${sparkTransferFeeSats} sats`)
        } else if (
          prepareResponse.paymentMethod instanceof SendPaymentMethod.BitcoinAddress
        ) {
          const feeQuote = prepareResponse.paymentMethod.inner.feeQuote
          const slowFeeSats =
            feeQuote.speedSlow.userFeeSat + feeQuote.speedSlow.l1BroadcastFeeSat
          const mediumFeeSats =
            feeQuote.speedMedium.userFeeSat + feeQuote.speedMedium.l1BroadcastFeeSat
          const fastFeeSats =
            feeQuote.speedFast.userFeeSat + feeQuote.speedFast.l1BroadcastFeeSat
          console.debug(`Slow Fees: ${slowFeeSats} sats`)
          console.debug(`Medium Fees: ${mediumFeeSats} sats`)
          console.debug(`Fast Fees: ${fastFeeSats} sats`)
        }
        if (prepareResponse.paymentMethod instanceof SendPaymentMethod.SparkAddress) {
          const feeSats = prepareResponse.paymentMethod.inner.fee
          console.debug(`Fees: ${feeSats} sats`)
        }

        let options = undefined
        if (true) {
          options = new SendPaymentOptions.Bolt11Invoice({
            preferSpark: false,
            completionTimeoutSecs: 10,
          })
        } else if (false) {
          const options = new SendPaymentOptions.BitcoinAddress({
            confirmationSpeed: OnchainConfirmationSpeed.Medium,
          })
        }

        const optionalIdempotencyKey = "<idempotency key uuid>"
        const sendResponse = await sdk.sendPayment({
          prepareResponse,
          options,
          idempotencyKey: optionalIdempotencyKey,
        })

        const payment = sendResponse.payment

        // Update balance after payment
        await updateBalance(sdk)

        return payment
      } catch (err) {
        console.error("Payment failed:", err)
        throw err
      }
    },
    [sdk, isConnected],
  )

  const receivePayment = useCallback(
    async (amountSats: bigint, description = "") => {
      if (!sdk || !isConnected) {
        throw new Error("SDK not connected")
      }

      try {
        let paymentMethod
        if (true) {
          paymentMethod = new ReceivePaymentMethod.Bolt11Invoice({
            description,
            amountSats,
          })
        } else if (false) {
          paymentMethod = new ReceivePaymentMethod.BitcoinAddress()
        } else if (false) {
          paymentMethod = new ReceivePaymentMethod.SparkAddress()
        } else if (false) {
          paymentMethod = new ReceivePaymentMethod.SparkInvoice({
            description: description,
            amount: amountSats,
            expiryTime: undefined,
            senderPublicKey: undefined,
            tokenIdentifier: undefined,
          })
        }

        const response = await sdk.receivePayment({
          paymentMethod,
        })

        const paymentRequest = response.paymentRequest
        console.log(`Payment Request: ${paymentRequest}`)

        const receiveFeeSats = response.fee
        console.log(`Fees: ${receiveFeeSats} sats`)
      } catch (err) {
        console.error("Failed to create invoice:", err)
        throw err
      }
    },
    [sdk, isConnected],
  )

  const fetchPayments = async () => {
    if (!sdk || !isConnected) {
      throw new Error("SDK not connected")
    }

    const response = await sdk.listPayments({
      typeFilter: undefined,
      statusFilter: undefined,
      assetFilter: undefined,
      fromTimestamp: undefined,
      toTimestamp: undefined,
      offset: undefined,
      limit: undefined,
      sortAscending: undefined,
      sparkHtlcStatusFilter: undefined,
    })
    const payments = response.payments
  }

  const fetchPaymentDetails = async (paymentId: string) => {
    if (!sdk || !isConnected) {
      throw new Error("SDK not connected")
    }

    const response = await sdk.getPayment({
      paymentId,
    })
    const payment = response.payment
  }

  const parseInput = async (inputStr: string) => {
    if (!sdk || !isConnected) {
      throw new Error("SDK not connected")
    }

    const input = await sdk.parse(inputStr)

    if (input.tag === InputType_Tags.BitcoinAddress) {
      console.log(`Input is Bitcoin address ${input.inner[0].address}`)
    } else if (input.tag === InputType_Tags.Bolt11Invoice) {
      console.log(
        `Input is BOLT11 invoice for ${
          input.inner[0].amountMsat != null
            ? input.inner[0].amountMsat.toString()
            : "unknown"
        } msats`,
      )
    } else if (input.tag === InputType_Tags.LnurlPay) {
      console.log(
        "Input is LNURL-Pay/Lightning address accepting min/max " +
          `${input.inner[0].minSendable}/${input.inner[0].maxSendable} msats`,
      )
    } else if (input.tag === InputType_Tags.LnurlWithdraw) {
      console.log(
        "Input is LNURL-Withdraw for min/max " +
          `${input.inner[0].minWithdrawable}/${input.inner[0].maxWithdrawable} msats`,
      )
    } else if (input.tag === InputType_Tags.SparkAddress) {
      console.log(`Input is Spark address ${input.inner[0].address}`)
    } else if (input.tag === InputType_Tags.SparkInvoice) {
      const invoice = input.inner[0]
      console.log("Input is Spark invoice:")
      if (invoice.tokenIdentifier != null) {
        console.log(
          `  Amount: ${invoice.amount} base units of token with id ${invoice.tokenIdentifier}`,
        )
      } else {
        console.log(`  Amount: ${invoice.amount} sats`)
      }

      if (invoice.description != null) {
        console.log(`  Description: ${invoice.description}`)
      }

      if (invoice.expiryTime != null) {
        console.log(
          `  Expiry time: ${new Date(Number(invoice.expiryTime) * 1000).toISOString()}`,
        )
      }

      if (invoice.senderPublicKey != null) {
        console.log(`  Sender public key: ${invoice.senderPublicKey}`)
      }
    } else {
      // Other input types are available
    }
  }

  const disconnect = async () => {
    try {
      if (sdk) {
        await sdk.disconnect()
        setSdk(undefined)
        setIsConnected(false)
        if (listenerId) {
          await sdk.removeEventListener(listenerId)
          setListenerId(undefined)
        }
      }
    } catch (err) {
      console.error("Failed to disconnect SDK:", err)
    }
  }

  const value = {
    sdk,
    isConnected,
    isConnecting,
    error,
    balance,
    sendPayment,
    receivePayment,
    disconnect,
  }

  return <BreezSDKContext.Provider value={value}>{children}</BreezSDKContext.Provider>
}

// Helper function - implement based on your security needs
async function getOrGenerateMnemonic() {
  try {
    console.log("Looking for mnemonic in keychain")
    const credentials = await Keychain.getInternetCredentials(KEYCHAIN_MNEMONIC_KEY)
    if (credentials) {
      console.log("Mnemonic found in keychain")
      return credentials.password
    }

    console.log("Mnemonic not found in keychain. Generating new one")
    const mnemonic = bip39.generateMnemonic(128)
    await Keychain.setInternetCredentials(
      KEYCHAIN_MNEMONIC_KEY,
      KEYCHAIN_MNEMONIC_KEY,
      mnemonic,
    )
    return mnemonic
  } catch (error) {
    console.error("Error in getMnemonic: ", error)
    throw error
  }
}
