import RNFS from "react-native-fs"
import Share from "react-native-share"
import * as Keychain from "react-native-keychain"
import {
  connect,
  defaultConfig,
  disconnect,
  fetchLightningLimits,
  getInfo,
  LiquidNetwork,
  listPayments,
  PaymentState,
  prepareSendPayment,
  sendPayment,
  SendPaymentResponse,
  sync,
  WalletInfo,
} from "@breeztech/react-native-breez-sdk-liquid"
import { API_KEY, MIGRATION_FEE_LNURL_W } from "@env"
import { KEYCHAIN_MNEMONIC_KEY, lnurlWithdraw, receivePaymentBreez } from "./spark"

let liquidWalletInitialized = false

const initLiquidWallet = async () => {
  if (liquidWalletInitialized) return
  console.log("INIT LIQUID WALLET")
  const credentials = await Keychain.getInternetCredentials(KEYCHAIN_MNEMONIC_KEY)
  if (!credentials) {
    throw "Mnemonic Key not found on the Keychain to connect to liquid wallet"
  }
  const mnemonic = credentials.password
  const config = await defaultConfig(LiquidNetwork.MAINNET, API_KEY)
  try {
    await connect({ mnemonic, config })
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    if (msg.includes("Already initialized")) {
      // Native SDK still connected from a prior session/crash — treat as success
      liquidWalletInitialized = true
      return
    }
    throw "Failed to connect breez sdk LIQUID"
  }
  liquidWalletInitialized = true
}

const drainLiquidWallet = async (
  walletInfo: WalletInfo,
): Promise<{ sendResponse: SendPaymentResponse; estimatedFee: number }> => {
  try {
    let invoiceRes = await receivePaymentBreez(
      Math.round(walletInfo.balanceSat / 2),
      "Liquid to Spark migration",
    )

    let prepareResponse = await prepareSendPayment({
      destination: invoiceRes.paymentRequest,
    })

    const estimatedFee = prepareResponse.feesSat || 50

    invoiceRes = await receivePaymentBreez(
      walletInfo.balanceSat - Math.round(estimatedFee + estimatedFee / 2),
      "Liquid to Spark wallet migration",
    )

    prepareResponse = await prepareSendPayment({
      destination: invoiceRes.paymentRequest,
    })
    console.log("Prepare Send Payment: ", prepareResponse)

    const sendResponse = await sendPayment({ prepareResponse })
    console.log("Send Payment:  ", sendResponse)

    return { sendResponse, estimatedFee }
  } catch {
    throw `Failed to migrate your liquid wallet to spark wallet. Please, try later! Your liquid wallet balance is ${walletInfo.balanceSat} sats.`
  }
}

const feeReimbursement = async (estimatedFee: number): Promise<boolean> => {
  try {
    console.log(
      "LNURL WITHDRAW PARAMS: ",
      MIGRATION_FEE_LNURL_W,
      Math.round(estimatedFee + estimatedFee / 2),
    )

    const lnurwRespons = await lnurlWithdraw(
      MIGRATION_FEE_LNURL_W,
      Math.round(estimatedFee + estimatedFee / 2),
    )

    return lnurwRespons.success
  } catch (err) {
    throw `Fee reimbursement failed. The amount to reimburse is ${Math.round(
      estimatedFee + estimatedFee / 2,
    )} sats. Please, take a screenshot of this and contact flash support team!`
  }
}

type HandleSparkMigrationResponse = {
  success: boolean
  err?: string
}

export const handleSparkMigration = async (
  openModal: () => void,
): Promise<HandleSparkMigrationResponse> => {
  try {
    await initLiquidWallet()
    await sync()

    console.log("SPARK MIGRATION STARTED")

    const { walletInfo } = await getInfo()
    const limits = await fetchLightningLimits()

    console.log(">>>>>>>>>>>>")
    console.log(walletInfo)
    console.log(limits)
    console.log(">>>>>>>>>>>>")

    if (walletInfo.balanceSat > Math.max(limits.send.minSat, 100)) {
      openModal()

      const { sendResponse, estimatedFee } = await drainLiquidWallet(walletInfo)

      if (sendResponse.payment.status === PaymentState.FAILED) {
        return {
          success: false,
          err: `Failed to migrate your liquid wallet to spark wallet. Please, try later! Your liquid wallet balance is ${walletInfo.balanceSat} sats.`,
        }
      }

      // Funds transferred successfully — fee reimbursement is best-effort
      try {
        const reimbursed = await feeReimbursement(estimatedFee)
        if (!reimbursed) {
          return {
            success: true,
            err: `Fee reimbursement failed. The amount to reimburse is ${Math.round(
              estimatedFee + estimatedFee / 2,
            )} sats. Please, take a screenshot of this and contact flash support team!`,
          }
        }
      } catch (reimburseErr) {
        return {
          success: true,
          err: String(reimburseErr),
        }
      }

      return { success: true }
    } else {
      disconnectLiquidSdk()
      return {
        success: true,
        err: `There is no enough funds to be able to migrate your balance. Your balance is ${walletInfo.balanceSat} sats. Please, take a screenshot of this and contact flash support team!`,
      }
    }
  } catch (err) {
    disconnectLiquidSdk()
    return {
      success: false,
      err: String(err),
    }
  }
}

export const exportLiquidTxs = async () => {
  const txs = await listPayments({})

  const header = "date,type,amount_sat,fees_sat,status,tx_id,destination"
  const rows = txs.map((tx) => {
    const date = tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : ""
    const type = tx.paymentType ?? ""
    const amount = tx.amountSat ?? 0
    const fees = tx.feesSat ?? 0
    const status = tx.status ?? ""
    const txId = tx.txId ?? ""
    const destination = (tx.destination ?? "").replace(/,/g, ";").replace(/\n/g, " ")
    return `${date},${type},${amount},${fees},${status},${txId},${destination}`
  })

  const csv = [header, ...rows].join("\n")
  const base64 = Buffer.from(csv, "utf-8").toString("base64")

  await Share.open({
    title: "liquid-wallet-transactions",
    filename: "liquid-wallet-transactions",
    url: `data:text/comma-separated-values;base64,${base64}`,
    type: "text/comma-separated-values",
  })
}

export const disconnectLiquidSdk = async () => {
  try {
    await disconnect()
    const config = await defaultConfig(LiquidNetwork.MAINNET, API_KEY)
    const exists = await RNFS.exists(config.workingDir)
    if (exists) {
      await RNFS.unlink(config.workingDir)
    }
    liquidWalletInitialized = false
    console.log("DISCONNECT TO BREEZ LIQUID SDK")
  } catch (err) {
    console.log("DISCONNECT LIQUID SDK: ", err)
  }
}
