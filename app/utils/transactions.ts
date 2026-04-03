import type { Payment } from "@breeztech/breez-sdk-spark-react-native"
import { TranslationFunctions } from "@app/i18n/i18n-types"
import { ConvertMoneyAmount } from "@app/screens/send-bitcoin-screen/payment-details"
import { DisplayCurrency } from "@app/types/amounts"
import { toBtcMoneyAmount } from "@app/types/amounts"
import type { BreezTransaction } from "@app/types/transactions"

const getUserTimezoneDate = (date: Date): Date => {
  const userTimezoneOffset = new Date().getTimezoneOffset() * 60000
  return new Date(date.getTime() - userTimezoneOffset)
}

const sameDay = (d1: number, d2: number | Date): boolean => {
  const date1 = getUserTimezoneDate(new Date(1000 * d1))
  const date2 =
    typeof d2 === "number" ? getUserTimezoneDate(new Date(d2)) : getUserTimezoneDate(d2)

  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  )
}

const formatDateByMonthYear = (locale: string, date: number): string => {
  const parsedDate = new Date(1000 * date)
  return parsedDate.toLocaleString(locale, { month: "long", year: "numeric" })
}

type SectionData<T> = {
  title: string
  data: T[]
}

/**
 * Generic utility to group items by date (Today, Yesterday, or Month Year)
 * @param items - Array of items to group
 * @param getTimestamp - Function to extract unix timestamp (in seconds) from an item
 * @param LL - Translation functions for "Today" and "Yesterday" labels
 * @param locale - Locale string for date formatting
 */
export const groupByDate = <T>({
  items,
  getTimestamp,
  LL,
  locale,
}: {
  items: T[]
  getTimestamp: (item: T) => number
  LL: TranslationFunctions
  locale: string
}): SectionData<T>[] => {
  const sections: SectionData<T>[] = []
  const byDate: Record<string, T[]> = {}

  for (const item of items) {
    const timestamp = getTimestamp(item)
    let dateString: string

    if (sameDay(timestamp, new Date())) {
      dateString = LL.common.today()
    } else if (sameDay(timestamp, new Date().setDate(new Date().getDate() - 1))) {
      dateString = LL.common.yesterday()
    } else {
      dateString = formatDateByMonthYear(locale, timestamp)
    }

    if (!byDate[dateString]) {
      byDate[dateString] = []
    }
    byDate[dateString].push(item)
  }

  Object.keys(byDate).forEach((key) => {
    sections.push({ title: key, data: byDate[key] })
  })

  return sections
}

// ============================================================================
// Breez Payment Formatting
//
// Converts Spark SDK Payment to BreezTransaction with pre-computed display values.
// All original Payment data is preserved for use in detail views.
// ============================================================================

/**
 * Format a Spark SDK Payment into a BreezTransaction
 * Preserves all original payment data while adding display values
 */
export const formatBreezPayment = ({
  payment,
  convertMoneyAmount,
}: {
  payment: Payment
  convertMoneyAmount: ConvertMoneyAmount
}): BreezTransaction => {
  const displayAmount = convertMoneyAmount(
    toBtcMoneyAmount(Number(payment.amount)),
    DisplayCurrency,
  )

  const displayFee = convertMoneyAmount(
    toBtcMoneyAmount(Number(payment.fees)),
    DisplayCurrency,
  )

  return {
    source: "breez",
    payment,
    displayAmount: (displayAmount.amount / 100).toString(),
    displayFee: (displayFee.amount / 100).toString(),
  }
}

/**
 * Format multiple Spark SDK Payments into BreezTransactions
 */
export const formatBreezPayments = ({
  payments,
  convertMoneyAmount,
}: {
  payments: Payment[]
  convertMoneyAmount: ConvertMoneyAmount
}): BreezTransaction[] => {
  if (!payments || !convertMoneyAmount) {
    return []
  }

  return payments.map((payment) => formatBreezPayment({ payment, convertMoneyAmount }))
}
