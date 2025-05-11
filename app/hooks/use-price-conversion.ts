import {
  useRealtimePriceQuery,
  useRealtimePriceUnauthedQuery,
  useRealtimePriceWsSubscription,
  WalletCurrency,
} from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import {
  createToDisplayAmount,
  DisplayCurrency,
  MoneyAmount,
  moneyAmountIsCurrencyType,
  WalletOrDisplayCurrency,
} from "@app/types/amounts"
import { useMemo } from "react"
import crashlytics from "@react-native-firebase/crashlytics"
import { WatchQueryFetchPolicy } from "@apollo/client"

export const SATS_PER_BTC = 100000000

const usdDisplayCurrency = {
  symbol: "$",
  id: "USD",
  fractionDigits: 2,
}

const defaultDisplayCurrency = usdDisplayCurrency

export const usePriceConversion = (fetchPolicy?: WatchQueryFetchPolicy) => {
  const isAuthed = useIsAuthed()
  let realtimePrice = null
  if (isAuthed) {
    const { data } = useRealtimePriceQuery({
      fetchPolicy: fetchPolicy || "cache-and-network",
      skip: !isAuthed,
    })
    realtimePrice = data?.me?.defaultAccount.realtimePrice
  } else {
    const { data } = useRealtimePriceUnauthedQuery({
      fetchPolicy: fetchPolicy || "cache-and-network",
      variables: { currency: defaultDisplayCurrency.id },
      skip: isAuthed,
    })
    realtimePrice = data?.realtimePrice
  }

  const displayCurrency = realtimePrice?.denominatorCurrency || defaultDisplayCurrency.id

  let displayCurrencyPerSat = NaN
  let displayCurrencyPerCent = NaN
  if (realtimePrice) {
    displayCurrencyPerSat =
      realtimePrice.btcSatPrice.base / 10 ** realtimePrice.btcSatPrice.offset
    displayCurrencyPerCent =
      realtimePrice.usdCentPrice.base / 10 ** realtimePrice.usdCentPrice.offset
  }

  const { data: subData } = useRealtimePriceWsSubscription({
    variables: { currency: realtimePrice?.denominatorCurrency || "" },
    skip: !realtimePrice?.denominatorCurrency || !isAuthed,
  })

  const subRealtimePrice = subData?.realtimePrice.realtimePrice

  if (subRealtimePrice) {
    displayCurrencyPerSat =
      subRealtimePrice.btcSatPrice.base / 10 ** subRealtimePrice.btcSatPrice.offset
    displayCurrencyPerCent =
      subRealtimePrice.usdCentPrice.base / 10 ** subRealtimePrice.usdCentPrice.offset
  }

  const priceOfCurrencyInCurrency = useMemo(() => {
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
  }, [displayCurrencyPerSat, displayCurrencyPerCent])

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

      if (toCurrency === "BTC") {
        amount = Math.floor(amount)
      }

      if (
        moneyAmountIsCurrencyType(moneyAmount, DisplayCurrency) &&
        moneyAmount.currencyCode !== displayCurrency
      ) {
        amount = NaN

        crashlytics().recordError(
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
