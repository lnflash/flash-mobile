import { WalletCurrency } from "@app/graphql/generated"
import {
  DisplayCurrency,
  MoneyAmount,
  moneyAmountIsCurrencyType,
  WalletOrDisplayCurrency,
} from "@app/types/amounts"

// The price conversion behind usePriceConversion (app/hooks/use-price-
// conversion.ts), without React. The hook reads the account's realtimePrice
// from the cache; the assistant's action tools read it from the network,
// because a card has to say how long its rate holds (spec §5, "Expiry").
// Both convert through this one module, so an amount the assistant shows is
// the one the screens would show for the same rate: no second copy of the
// rounding.

/** A price of one minor unit, as realtimePrice gives it: base / 10^offset. */
export type PriceOfOneMinorUnit = { base: number; offset: number }

/** What realtimePrice answers: one sat and one US cent, in display minor units. */
export type RealtimePriceRates = {
  btcSatPrice: PriceOfOneMinorUnit
  usdCentPrice: PriceOfOneMinorUnit
}

/** The price of one minor unit of `currency`, in minor units of `inCurrency`. */
export type PriceOfCurrencyInCurrency = (
  currency: WalletOrDisplayCurrency,
  inCurrency: WalletOrDisplayCurrency,
) => number

export type ConvertMoneyAmountFn = <T extends WalletOrDisplayCurrency>(
  moneyAmount: MoneyAmount<WalletOrDisplayCurrency>,
  toCurrency: T,
) => MoneyAmount<T>

/** The price table for a realtimePrice answer; undefined without a usable one. */
export const priceOfCurrencyInCurrencyFor = (
  rates: RealtimePriceRates | null | undefined,
): PriceOfCurrencyInCurrency | undefined => {
  if (!rates) return undefined
  const displayCurrencyPerSat = rates.btcSatPrice.base / 10 ** rates.btcSatPrice.offset
  const displayCurrencyPerCent = rates.usdCentPrice.base / 10 ** rates.usdCentPrice.offset
  if (!displayCurrencyPerSat || !displayCurrencyPerCent) return undefined

  // has units of denomiatedInCurrency/currency
  return (currency, inCurrency) => {
    const priceOfCurrencyInCurrency = {
      [WalletCurrency.Btc]: {
        [DisplayCurrency]: displayCurrencyPerSat,
        [WalletCurrency.Usd]: displayCurrencyPerSat * (1 / displayCurrencyPerCent),
        [WalletCurrency.Usdt]: displayCurrencyPerSat * (1 / displayCurrencyPerCent),
        [WalletCurrency.Btc]: 1,
      },
      [WalletCurrency.Usd]: {
        [DisplayCurrency]: displayCurrencyPerCent,
        [WalletCurrency.Btc]: displayCurrencyPerCent * (1 / displayCurrencyPerSat),
        [WalletCurrency.Usd]: 1,
        [WalletCurrency.Usdt]: 1,
      },
      [WalletCurrency.Usdt]: {
        [DisplayCurrency]: displayCurrencyPerCent,
        [WalletCurrency.Btc]: displayCurrencyPerCent * (1 / displayCurrencyPerSat),
        [WalletCurrency.Usd]: 1,
        [WalletCurrency.Usdt]: 1,
      },
      [DisplayCurrency]: {
        [WalletCurrency.Btc]: 1 / displayCurrencyPerSat,
        [WalletCurrency.Usd]: 1 / displayCurrencyPerCent,
        [WalletCurrency.Usdt]: 1 / displayCurrencyPerCent,
        [DisplayCurrency]: 1,
      },
    }
    return priceOfCurrencyInCurrency[currency][inCurrency]
  }
}

/**
 * convertMoneyAmount over a price table. Sats round to whole sats; nothing
 * else is rounded. An amount in a display currency other than this one
 * converts to NaN, never to a number at the wrong rate, and
 * `onDisplayCurrencyMismatch` hears of it.
 */
export const createConvertMoneyAmount = ({
  priceOfCurrencyInCurrency,
  displayCurrency,
  onDisplayCurrencyMismatch,
}: {
  priceOfCurrencyInCurrency: PriceOfCurrencyInCurrency
  displayCurrency: string
  onDisplayCurrencyMismatch?: (moneyAmount: MoneyAmount<WalletOrDisplayCurrency>) => void
}): ConvertMoneyAmountFn => {
  return <T extends WalletOrDisplayCurrency>(
    moneyAmount: MoneyAmount<WalletOrDisplayCurrency>,
    toCurrency: T,
  ): MoneyAmount<T> => {
    // If the money amount is already the correct currency, return it
    if (moneyAmountIsCurrencyType(moneyAmount, toCurrency)) {
      return moneyAmount
    }

    let amount =
      moneyAmount.amount * priceOfCurrencyInCurrency(moneyAmount.currency, toCurrency)

    if (toCurrency === "BTC") {
      amount = Math.round(amount)
    }

    if (
      moneyAmountIsCurrencyType(moneyAmount, DisplayCurrency) &&
      moneyAmount.currencyCode !== displayCurrency
    ) {
      amount = NaN
      onDisplayCurrencyMismatch?.(moneyAmount)
    }

    return {
      amount,
      currency: toCurrency,
      currencyCode: toCurrency === DisplayCurrency ? displayCurrency : toCurrency,
    }
  }
}
