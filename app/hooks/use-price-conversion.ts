import { useRealtimePriceQuery, WalletCurrency } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import {
  createToDisplayAmount,
  DisplayCurrency,
  MoneyAmount,
  moneyAmountIsCurrencyType,
  WalletOrDisplayCurrency,
} from "@app/types/amounts"
import { useMemo } from "react"
import { getCrashlytics } from "@react-native-firebase/crashlytics"

export const SATS_PER_BTC = 100000000

const usdDisplayCurrency = {
  symbol: "$",
  id: "USD",
  fractionDigits: 2,
}

const defaultDisplayCurrency = usdDisplayCurrency

export const usePriceConversion = () => {
  const isAuthed = useIsAuthed()
  const { data } = useRealtimePriceQuery({ skip: !isAuthed })

  const displayCurrency =
    data?.me?.defaultAccount?.realtimePrice?.denominatorCurrency ||
    defaultDisplayCurrency.id

  const priceData = useMemo(() => {
    const realtimePrice = data?.me?.defaultAccount?.realtimePrice

    if (!realtimePrice) {
      return {
        displayCurrencyPerSat: NaN,
        displayCurrencyPerCent: NaN,
      }
    }

    return {
      displayCurrencyPerSat:
        realtimePrice.btcSatPrice.base / 10 ** realtimePrice.btcSatPrice.offset,
      displayCurrencyPerCent:
        realtimePrice.usdCentPrice.base / 10 ** realtimePrice.usdCentPrice.offset,
    }
  }, [data?.me?.defaultAccount?.realtimePrice])

  const priceOfCurrencyInCurrency = useMemo(() => {
    const { displayCurrencyPerSat, displayCurrencyPerCent } = priceData

    if (!displayCurrencyPerSat || !displayCurrencyPerCent) {
      return undefined
    }

    // has units of denomiatedInCurrency/currency
    return (
      currency: WalletOrDisplayCurrency,
      inCurrency: WalletOrDisplayCurrency,
    ): number => {
      const priceOfCurrencyInCurrency = {
        [WalletCurrency.Btc]: {
          [DisplayCurrency]: displayCurrencyPerSat,
          [WalletCurrency.Usd]: displayCurrencyPerSat * (1 / displayCurrencyPerCent),
          [WalletCurrency.Btc]: 1,
        },
        [WalletCurrency.Usd]: {
          [DisplayCurrency]: displayCurrencyPerCent,
          [WalletCurrency.Btc]: displayCurrencyPerCent * (1 / displayCurrencyPerSat),
          [WalletCurrency.Usd]: 1,
        },
        [DisplayCurrency]: {
          [WalletCurrency.Btc]: 1 / displayCurrencyPerSat,
          [WalletCurrency.Usd]: 1 / displayCurrencyPerCent,
          [DisplayCurrency]: 1,
        },
      }
      return priceOfCurrencyInCurrency[currency][inCurrency]
    }
  }, [priceData])

  const convertMoneyAmount = useMemo(() => {
    if (!priceOfCurrencyInCurrency) {
      return undefined
    }

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

      // if (toCurrency === "BTC") {
      //   amount = Math.round(amount)
      // }

      if (
        moneyAmountIsCurrencyType(moneyAmount, DisplayCurrency) &&
        moneyAmount.currencyCode !== displayCurrency
      ) {
        amount = NaN

        getCrashlytics().recordError(
          new Error(
            `Price conversion is out of sync with display currency. Money amount: ${moneyAmount.currencyCode}, display currency: ${displayCurrency}`,
          ),
        )
      }

      return {
        amount,
        currency: toCurrency,
        currencyCode: toCurrency === DisplayCurrency ? displayCurrency : toCurrency,
      }
    }
  }, [priceOfCurrencyInCurrency, displayCurrency])

  return {
    convertMoneyAmount,
    displayCurrency,
    toDisplayMoneyAmount: createToDisplayAmount(displayCurrency),
    usdPerSat: priceOfCurrencyInCurrency
      ? (priceOfCurrencyInCurrency(WalletCurrency.Btc, WalletCurrency.Usd) / 100).toFixed(
          8,
        )
      : null,
  }
}
