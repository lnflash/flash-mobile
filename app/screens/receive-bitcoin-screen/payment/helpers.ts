import { decodeInvoiceString, Network as NetworkLibGaloy } from "@galoymoney/client"
import { Network } from "@app/graphql/generated"
import type { TranslationFunctions } from "@app/i18n/i18n-types"
import { Invoice, GetFullUriInput } from "./index.types"
import { toBtcMoneyAmount, toUsdMoneyAmount } from "@app/types/amounts"

const prefixByType = {
  [Invoice.OnChain]: "bitcoin:",
  [Invoice.Lightning]: "lightning:",
  [Invoice.PayCode]: "",
}

export const getPaymentRequestFullUri = ({
  input,
  amount,
  memo,
  uppercase = false,
  prefix = true,
  type = Invoice.OnChain,
  wallet,
  convertMoneyAmount,
}: GetFullUriInput): string => {
  if (type === Invoice.Lightning) {
    return uppercase ? input.toUpperCase() : input
  }

  let uri = prefix ? `${prefixByType[type]}${input}` : input
  const queryParams: string[] = []

  if (amount) {
    queryParams.push(`amount=${satsToBTC(amount)}`)
  }

  if (memo) {
    queryParams.push(`message=${encodeURIComponent(encodeURIComponent(memo))}`)
  }

  if (queryParams.length > 0) {
    uri = `${uri}?${queryParams.join("&")}`
  }

  return uppercase ? uri.toUpperCase() : uri
}

export const satsToBTC = (satsAmount: number): number => satsAmount / 10 ** 8

export const getDefaultMemo = (bankName: string) => {
  return `Pay to ${bankName} Wallet user`
}

export const secondsToH = (seconds: number): string => {
  const h = Math.floor(seconds / 3600)

  const hDisplay = h > 0 ? h + "h" : ""

  return hDisplay
}

export const secondsToHMS = (seconds: number): string => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60

  const hDisplay = h > 0 ? h + "h" : ""
  const mDisplay = m > 0 ? m + "m" : ""
  const sDisplay = s > 0 ? s + "s" : ""

  return hDisplay + mDisplay + sDisplay
}

export const generateFutureLocalTime = (secondsToAdd: number): string => {
  const date = new Date() // Get current date
  date.setSeconds(date.getSeconds() + secondsToAdd) // Add seconds to the current date

  // Format to local time string
  const hours = date.getHours() % 12 || 12 // Get hours (12 hour format), replace 0 with 12
  const minutes = String(date.getMinutes()).padStart(2, "0") // Get minutes
  const period = date.getHours() >= 12 ? "PM" : "AM" // Get AM/PM

  return `${hours}:${minutes}${period}`
}

/**
 * How long a Lightning invoice stays payable, as the receive screen says it
 * (use-receive-bitcoin.ts): a day, the next few hours, a time of day, a
 * countdown, then "now". The assistant's invoice card says it the same way.
 */
export const lightningInvoiceValidity = (
  LL: TranslationFunctions,
  expiresInSeconds: number,
): string => {
  if (expiresInSeconds > 60 * 60 * 23)
    return LL.ReceiveScreen.invoiceValidity.validFor1Day()
  if (expiresInSeconds > 60 * 60 * 6) {
    return LL.ReceiveScreen.invoiceValidity.validForNext({
      duration: secondsToH(expiresInSeconds),
    })
  }
  if (expiresInSeconds > 60 * 2) {
    return LL.ReceiveScreen.invoiceValidity.validBefore({
      time: generateFutureLocalTime(expiresInSeconds),
    })
  }
  if (expiresInSeconds > 0) {
    return LL.ReceiveScreen.invoiceValidity.expiresIn({
      duration: secondsToHMS(expiresInSeconds),
    })
  }
  return LL.ReceiveScreen.invoiceValidity.expiresNow()
}

export const prToDateString = (paymentRequest: string, network: Network) => {
  let dateString
  try {
    dateString = decodeInvoiceString(
      paymentRequest,
      network as NetworkLibGaloy,
    ).timeExpireDateString
  } catch (e) {
    console.error(e)
  }
  return dateString
}
