import { PersistentState } from "@app/store/persistent-state/state-migrations"
import { listPaymentsBreezSDK, payLightningBreez } from "@app/utils/breez-sdk-liquid"
import {
  receivePaymentBreezSDK as sparkReceivePayment,
  getSparkSdk,
} from "@app/utils/breez-sdk-spark"
import { GetInfoRequest } from "@breeztech/breez-sdk-spark-react-native"

export type MigrationResult = {
  status: "completed" | "skipped" | "error"
  message: string
}

export const DUST_THRESHOLD_SATS = 1000

const POLL_INTERVAL_MS = 3000
const MAX_POLL_ATTEMPTS = 60

type UpdateStateFn = (
  update: (state: PersistentState | undefined) => PersistentState | undefined,
) => void

function setMigrationStatus(
  updateState: UpdateStateFn,
  status: PersistentState["sparkMigrationStatus"],
): void {
  updateState((state) => {
    if (!state) return undefined
    return { ...state, sparkMigrationStatus: status }
  })
  console.log(`[Migration] Status set to: ${status}`)
}

async function getSparkBalanceSats(): Promise<number> {
  const sdk = getSparkSdk()
  const info = await sdk.getInfo(GetInfoRequest.create({ ensureSynced: undefined }))
  return Number(info.balanceSats)
}

async function pollSparkForReceipt(minAmountSats: number): Promise<boolean> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    try {
      const balanceSats = await getSparkBalanceSats()
      console.log(
        `[Migration] Poll ${
          i + 1
        }/${MAX_POLL_ATTEMPTS}: Spark balance = ${balanceSats} sats`,
      )
      if (balanceSats >= minAmountSats) {
        return true
      }
    } catch (err) {
      console.log(`[Migration] Poll error (will retry): ${err}`)
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
  return false
}

async function hasInFlightPayments(): Promise<boolean> {
  const payments = await listPaymentsBreezSDK()
  return payments.some(
    (p: any) => p.status === "pending" || p.status === "Pending" || p.status === 0,
  )
}

async function migrateFromPending(
  liquidBalanceSat: number,
  updateState: UpdateStateFn,
): Promise<MigrationResult> {
  console.log(`[Migration] Liquid balance: ${liquidBalanceSat} sats`)

  if (liquidBalanceSat <= 0 || liquidBalanceSat < DUST_THRESHOLD_SATS) {
    setMigrationStatus(updateState, "skipped")
    return {
      status: "skipped",
      message: `Liquid balance (${liquidBalanceSat} sats) below dust threshold (${DUST_THRESHOLD_SATS} sats)`,
    }
  }

  console.log("[Migration] Checking for in-flight Liquid payments...")
  const pendingPayments = await hasInFlightPayments()
  if (pendingPayments) {
    throw new Error("Cannot migrate while payments are in-flight")
  }

  console.log(`[Migration] Generating Spark invoice for ${liquidBalanceSat} sats...`)
  const sparkInvoice = await sparkReceivePayment(
    liquidBalanceSat,
    "Liquid-to-Spark migration",
  )
  const bolt11 = sparkInvoice.destination || sparkInvoice.bolt11
  if (!bolt11) {
    throw new Error("Failed to get bolt11 invoice from Spark")
  }
  console.log("[Migration] Spark invoice generated")

  setMigrationStatus(updateState, "transferring")

  console.log("[Migration] Sending Liquid payment to Spark invoice...")
  await payLightningBreez(bolt11)
  console.log("[Migration] Liquid payment sent, waiting for Spark confirmation...")

  const received = await pollSparkForReceipt(liquidBalanceSat)
  if (!received) {
    return {
      status: "error",
      message:
        "Payment sent but Spark receipt not confirmed yet. Will retry on next check.",
    }
  }

  setMigrationStatus(updateState, "completed")
  console.log("[Migration] Migration completed successfully")
  return {
    status: "completed",
    message: "Funds successfully migrated from Liquid to Spark",
  }
}

async function resumeTransferring(updateState: UpdateStateFn): Promise<MigrationResult> {
  console.log("[Migration] Resuming from transferring state...")

  try {
    const sparkBalance = await getSparkBalanceSats()
    console.log(`[Migration] Spark balance on resume: ${sparkBalance} sats`)

    if (sparkBalance > 0) {
      setMigrationStatus(updateState, "completed")
      console.log("[Migration] Funds already arrived in Spark")
      return { status: "completed", message: "Funds already received in Spark" }
    }
  } catch (err) {
    console.log(`[Migration] Error checking Spark balance: ${err}`)
  }

  console.log("[Migration] Funds not yet in Spark, attempting retry...")

  const payments = await listPaymentsBreezSDK()
  const hasPendingOutgoing = payments.some(
    (p: any) =>
      (p.status === "pending" || p.status === "Pending" || p.status === 0) &&
      (p.paymentType === "send" ||
        p.paymentType === "Send" ||
        p.direction === "outgoing"),
  )

  if (hasPendingOutgoing) {
    console.log("[Migration] Outgoing payment still pending, polling Spark...")
    const received = await pollSparkForReceipt(1)
    if (received) {
      setMigrationStatus(updateState, "completed")
      return { status: "completed", message: "Funds received in Spark after polling" }
    }
    return {
      status: "error",
      message: "Outgoing Liquid payment pending but Spark has not received yet",
    }
  }

  console.log(
    "[Migration] No pending outgoing, generating new Spark invoice for retry...",
  )
  try {
    const sparkInvoice = await sparkReceivePayment(
      undefined,
      "Liquid-to-Spark migration retry",
    )
    const bolt11 = sparkInvoice.destination || sparkInvoice.bolt11
    if (!bolt11) {
      throw new Error("Failed to get bolt11 invoice from Spark for retry")
    }

    await payLightningBreez(bolt11)
    console.log("[Migration] Retry payment sent, polling Spark...")

    const received = await pollSparkForReceipt(1)
    if (received) {
      setMigrationStatus(updateState, "completed")
      return { status: "completed", message: "Funds migrated on retry" }
    }

    return {
      status: "error",
      message: "Retry payment sent but Spark receipt not confirmed",
    }
  } catch (err: any) {
    return {
      status: "error",
      message: `Retry failed: ${err.message}`,
    }
  }
}

export async function checkAndMigrate(
  persistentState: PersistentState,
  updateState: UpdateStateFn,
): Promise<MigrationResult> {
  const currentStatus = persistentState.sparkMigrationStatus
  console.log(`[Migration] Current status: ${currentStatus}`)

  if (currentStatus === "completed") {
    return { status: "completed", message: "Migration already completed" }
  }
  if (currentStatus === "skipped") {
    return {
      status: "skipped",
      message: "Migration previously skipped (no funds to migrate)",
    }
  }

  try {
    if (currentStatus === "pending") {
      const liquidBalanceSat = persistentState.breezBalance ?? 0
      return await migrateFromPending(liquidBalanceSat, updateState)
    }

    if (currentStatus === "transferring") {
      return await resumeTransferring(updateState)
    }

    return { status: "error", message: `Unknown migration status: ${currentStatus}` }
  } catch (err: any) {
    console.log(`[Migration] Error: ${err.message}`)
    return { status: "error", message: err.message }
  }
}
