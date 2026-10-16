import type { MoneyAmount, WalletOrDisplayCurrency } from "@app/types/amounts"

/**
 * Split a total into `parts` shares in whole minor units (cents, sats),
 * for a group send (spec §5, prepareGroupSend). Integer division, then the
 * leftover minor units handed out one each in payee-list order from index 0
 * (ENG-688 decision 4). The shares always add up to the total; a total
 * smaller than `parts` leaves the later shares at zero, which the caller
 * refuses.
 */
export const splitMoneyAmount = <T extends WalletOrDisplayCurrency>(
  total: MoneyAmount<T>,
  parts: number,
): MoneyAmount<T>[] => {
  if (!Number.isInteger(parts) || parts < 1) {
    throw new RangeError(`Cannot split into ${parts} parts`)
  }
  if (!Number.isSafeInteger(total.amount) || total.amount < 0) {
    throw new RangeError(
      `Cannot split ${total.amount}: not a whole number of minor units`,
    )
  }
  const share = Math.floor(total.amount / parts)
  const leftover = total.amount - share * parts
  return Array.from({ length: parts }, (_, index) => ({
    ...total,
    amount: share + (index < leftover ? 1 : 0),
  }))
}
