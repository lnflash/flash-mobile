import { useRealtimePriceQuery, WalletCurrency } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { createToDisplayAmount } from "@app/types/amounts"
import {
  createConvertMoneyAmount,
  priceOfCurrencyInCurrencyFor,
} from "@app/utils/price-conversion"
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

  // The math lives in app/utils/price-conversion.ts, which the assistant's
  // action tools convert through too (ENG-688).
  const priceOfCurrencyInCurrency = useMemo(
    () => priceOfCurrencyInCurrencyFor(data?.me?.defaultAccount?.realtimePrice),
    [data?.me?.defaultAccount?.realtimePrice],
  )

  const convertMoneyAmount = useMemo(() => {
    if (!priceOfCurrencyInCurrency) {
      return undefined
    }

    return createConvertMoneyAmount({
      priceOfCurrencyInCurrency,
      displayCurrency,
      onDisplayCurrencyMismatch: (moneyAmount) =>
        getCrashlytics().recordError(
          new Error(
            `Price conversion is out of sync with display currency. Money amount: ${moneyAmount.currencyCode}, display currency: ${displayCurrency}`,
          ),
        ),
    })
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
