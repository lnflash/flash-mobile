import { TranslationFunctions } from "@app/i18n/i18n-types"
import { SectionTransactions } from "@app/screens/transaction-history/index.types"

import { TransactionFragment, TxDirection, TxStatus } from "./generated"

const getUserTimezoneDate = (date: Date): Date => {
  const userTimezoneOffset = new Date().getTimezoneOffset() * 60000
  return new Date(date.getTime() - userTimezoneOffset)
}

const sameDay = (d1: number, d2: number | Date): boolean => {
  const date1 = getUserTimezoneDate(new Date(1000 * d1))

  let date2: Date
  if (typeof d2 === "number") {
    date2 = getUserTimezoneDate(new Date(d2))
  } else {
    date2 = getUserTimezoneDate(d2)
  }

  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  )
}

const formatDateByMonthYear = (locale: string, date: number | Date): string => {
  const parsedDate = typeof date === "number" ? new Date(1000 * date) : new Date(date)
  return parsedDate.toLocaleString(locale, { month: "long", year: "numeric" }) // e.g., "November 2023"
}

const isToday = (tx: TransactionFragment) => sameDay(tx.createdAt, new Date())

const isYesterday = (tx: TransactionFragment) =>
  sameDay(tx.createdAt, new Date().setDate(new Date().getDate() - 1))

export const groupTransactionsByDate = ({
  pendingIncomingTxs,
  txs,
  LL,
  locale,
}: {
  pendingIncomingTxs?: TransactionFragment[]
  txs: TransactionFragment[]
  LL: TranslationFunctions
  locale: string
}) => {
  const sections: SectionTransactions[] = []
  const settledOrOutgoingTransactions = txs.filter(
    (tx) => tx.status !== TxStatus.Pending || tx.direction === TxDirection.Send,
  )

  const transactionsByRelativeDate: Record<string, TransactionFragment[]> = {}

  for (const tx of pendingIncomingTxs ?? []) {
    if (!transactionsByRelativeDate[LL.common.today()]) {
      transactionsByRelativeDate[LL.common.today()] = []
    }

    transactionsByRelativeDate[LL.common.today()].push(tx)
  }

  for (const tx of settledOrOutgoingTransactions) {
    let dateString: string

    if (isToday(tx)) {
      dateString = LL.common.today()
    } else if (isYesterday(tx)) {
      dateString = LL.common.yesterday()
    } else {
      dateString = formatDateByMonthYear(locale, tx.createdAt)
    }

    if (!transactionsByRelativeDate[dateString]) {
      transactionsByRelativeDate[dateString] = []
    }
    transactionsByRelativeDate[dateString].push(tx)
  }

  Object.keys(transactionsByRelativeDate).forEach((key) => {
    sections.push({ title: key as any, data: transactionsByRelativeDate[key] })
  })

  return sections
}

export const getDescriptionDisplay = ({
  LL,
  tx,
  bankName,
  showMemo,
}: {
  LL: TranslationFunctions
  tx: TransactionFragment | undefined
  bankName: string
  showMemo?: boolean
}) => {
  if (!tx) {
    return ""
  }

  const { memo, direction, settlementVia } = tx
  if (memo && (!memo.includes("Pay to Flash Wallet User") || showMemo)) {
    return memo
  }

  const isReceive = direction === "RECEIVE"

  switch (settlementVia?.__typename) {
    case "SettlementViaOnChain":
      return "OnChain Payment"
    case "SettlementViaLn":
      if (isReceive) {
        return `Received`
      }
      return "Sent"

    case "SettlementViaIntraLedger":
      return isReceive
        ? `${LL.common.from()} ${
            settlementVia?.counterPartyUsername || bankName + " User"
          }`
        : `${LL.common.to()} ${settlementVia?.counterPartyUsername || bankName + " User"}`
  }
}
