import { INVITE_CODE, MNEMONIC_WORDS, API_KEY } from "@env"
import {
  defaultConfig,
  EnvironmentType,
  connect,
  mnemonicToSeed,
  NodeConfig,
  NodeConfigType,
  receivePayment,
  LnInvoice,
  sendPayment,
  Payment,
  parseInvoice,
  receiveOnchain,
  SwapInfo,
  fetchReverseSwapFees,
  sendOnchain,
  ReverseSwapInfo,
  ReverseSwapPairInfo,
  recommendedFees,
  RecommendedFees,
} from "@breeztech/react-native-breez-sdk"
import * as bip39 from "bip39"
import * as Keychain from "react-native-keychain"

const KEYCHAIN_MNEMONIC_KEY = "mnemonic_key"

// Retry function
const retry = <T>(fn: () => Promise<T>, ms = 5000, maxRetries = 3) =>
  new Promise<T>((resolve, reject) => {
    let attempts = 0
    const tryFn = async () => {
      try {
        const result = await fn()
        resolve(result)
      } catch (err) {
        // eslint-disable-next-line no-plusplus
        if (++attempts >= maxRetries) {
          reject(err)
        } else {
          setTimeout(tryFn, ms)
        }
      }
    }
    tryFn()
  })

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const getMnemonic = async (): Promise<string> => {
  try {
    const credentials = await Keychain.getGenericPassword({
      service: KEYCHAIN_MNEMONIC_KEY,
    })
    if (credentials) {
      return credentials.password
    }

    // Generate mnemonic and store it in the keychain
    // For development, we use a fixed mnemonic stored in .env
    const mnemonic = bip39.generateMnemonic(128)
    await Keychain.setGenericPassword(KEYCHAIN_MNEMONIC_KEY, mnemonic, {
      service: KEYCHAIN_MNEMONIC_KEY,
    })
    return mnemonic
  } catch (error) {
    console.error("Error in getMnemonic: ", error)
    throw error
  }
}

const connectToSDK = async () => {
  try {
    const mnemonic = MNEMONIC_WORDS // await getMnemonic()
    console.log("Mnemonic: ", mnemonic)
    const seed = await mnemonicToSeed(mnemonic)
    const inviteCode = INVITE_CODE
    const nodeConfig: NodeConfig = {
      type: NodeConfigType.GREENLIGHT,
      config: {
        inviteCode,
      },
    }
    const config = await defaultConfig(EnvironmentType.PRODUCTION, API_KEY, nodeConfig)

    console.log("Starting connection to Breez SDK")
    await connect(config, seed)
    console.log("Finished connection to Breez SDK")
  } catch (error) {
    console.error("Connect error: ", error)
    throw error
  }
}

let breezSDKInitialized = false
let breezSDKInitializing: Promise<void | boolean> | null = null

export const initializeBreezSDK = async (): Promise<boolean> => {
  if (breezSDKInitialized) {
    console.log("BreezSDK already initialized")
    return false
  }

  if (breezSDKInitializing !== null) {
    console.log("BreezSDK initialization in progress")
    return breezSDKInitializing as Promise<boolean>
  }

  breezSDKInitializing = (async () => {
    try {
      await retry(connectToSDK, 5000, 3)
      breezSDKInitialized = true
      return true
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error("Failed to connect to Breez SDK after 3 attempts: ", error.message)
      throw new Error(`Failed to connect to Breez SDK after 3 attempts: ${error.message}`)
    } finally {
      breezSDKInitializing = null
    }
  })()

  return breezSDKInitializing as Promise<boolean>
}

export const receivePaymentBreezSDK = async (
  paymentAmount: number,
  description: string,
): Promise<LnInvoice> => {
  try {
    const invoice = await receivePayment(paymentAmount, description)
    return invoice
  } catch (error) {
    console.log(error)
    throw error
  }
}

export const sendPaymentBreezSDK = async (
  paymentRequest: string,
  paymentAmount?: number,
): Promise<Payment> => {
  try {
    const payment = await sendPayment(paymentRequest, paymentAmount)
    return payment
  } catch (error) {
    console.log(error)
    throw error
  }
}

export const parseInvoiceBreezSDK = async (
  paymentRequest: string,
): Promise<LnInvoice> => {
  try {
    const invoice = await parseInvoice(paymentRequest)
    return invoice
  } catch (error) {
    console.log(error)
    throw error
  }
}

export const receiveOnchainBreezSDK = async (): Promise<SwapInfo> => {
  try {
    const swapInfo = await receiveOnchain()
    return swapInfo
  } catch (error) {
    console.log(error)
    throw error
  }
}

export const fetchReverseSwapFeesBreezSDK = async (
  amount: number,
): Promise<ReverseSwapPairInfo> => {
  try {
    console.log("Fetching reverse swap fees for amount: ", amount)
    const fees = await fetchReverseSwapFees()
    return fees
  } catch (error) {
    console.log(error)
    throw error
  }
}

export const sendOnchainBreezSDK = async (
  currentFees: ReverseSwapPairInfo,
  destinationAddress: string,
  satPerVbyte: number,
): Promise<ReverseSwapInfo> => {
  try {
    console.log("Sending onchain payment to address: ", destinationAddress)
    const reverseSwapInfo = await sendOnchain(
      currentFees.min,
      destinationAddress,
      currentFees.feesHash,
      satPerVbyte,
    )
    return reverseSwapInfo
  } catch (error) {
    console.log(error)
    throw error
  }
}

export const recommendedFeesBreezSDK = async (): Promise<RecommendedFees> => {
  try {
    console.log("Fetching recommended fees")
    const fees = await recommendedFees()
    return fees
  } catch (error) {
    console.log(error)
    throw error
  }
}
