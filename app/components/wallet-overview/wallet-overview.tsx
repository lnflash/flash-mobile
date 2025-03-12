import React, { useEffect, useState } from "react"
import { StackNavigationProp } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import { Balance } from "../cards"

// hooks
import { useWalletOverviewScreenQuery, WalletCurrency } from "@app/graphql/generated"
import { usePersistentStateContext } from "@app/store/persistent-state"
import { useDisplayCurrency } from "@app/hooks/use-display-currency"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useNavigation } from "@react-navigation/native"
import { useBreez } from "@app/hooks"

// utils
import { toBtcMoneyAmount, toUsdMoneyAmount } from "@app/types/amounts"
import { getUsdWallet } from "@app/graphql/wallets-utils"

const WalletOverview = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const isAuthed = useIsAuthed()
  const { btcWallet } = useBreez()

  const { persistentState, updateState } = usePersistentStateContext()
  const { formatMoneyAmount, displayCurrency, moneyAmountToDisplayCurrencyString } =
    useDisplayCurrency()

  const { data, error } = useWalletOverviewScreenQuery({
    fetchPolicy: "network-only",
    skip: !isAuthed,
  })

  const [btcBalance, setBtcBalance] = useState<string | undefined>(
    persistentState?.btcBalance || undefined,
  )
  const [btcDisplayBalance, setBtcDisplayBalance] = useState<string | undefined>(
    persistentState?.btcDisplayBalance || "0",
  )
  const [cashBalance, setCashBalance] = useState<string | undefined>(
    persistentState?.cashBalance || undefined,
  )
  const [cashDisplayBalance, setCashDisplayBalance] = useState<string | undefined>(
    persistentState?.cashDisplayBalance || "0",
  )

  useEffect(() => {
    if (
      persistentState.btcDisplayBalance !== btcDisplayBalance ||
      persistentState.cashDisplayBalance !== cashDisplayBalance ||
      persistentState.btcBalance !== btcBalance ||
      persistentState.cashBalance !== cashBalance
    ) {
      updateState((state) => {
        if (state)
          return {
            ...state,
            btcDisplayBalance,
            cashDisplayBalance,
            btcBalance,
            cashBalance,
          }
        return undefined
      })
    }
  }, [btcDisplayBalance, cashDisplayBalance, btcBalance, cashBalance])

  useEffect(() => {
    if (isAuthed) formatBalance()
  }, [isAuthed, data?.me?.defaultAccount?.wallets, btcWallet?.balance, displayCurrency])

  const formatBalance = () => {
    const extBtcWalletBalance = toBtcMoneyAmount(btcWallet?.balance ?? NaN)
    setBtcBalance(
      formatMoneyAmount({
        moneyAmount: extBtcWalletBalance,
      }),
    )
    setBtcDisplayBalance(
      moneyAmountToDisplayCurrencyString({
        moneyAmount: extBtcWalletBalance,
        isApproximate: true,
      }),
    )

    if (data) {
      const extUsdWallet = getUsdWallet(data?.me?.defaultAccount?.wallets)
      const extUsdWalletBalance = toUsdMoneyAmount(extUsdWallet?.balance ?? NaN)
      setCashBalance(
        formatMoneyAmount({
          moneyAmount: extUsdWalletBalance,
        }),
      )
      setCashDisplayBalance(
        moneyAmountToDisplayCurrencyString({
          moneyAmount: extUsdWalletBalance,
          isApproximate: displayCurrency !== WalletCurrency.Usd,
        }),
      )
    }
  }

  const onPressCash = () => navigation.navigate("USDTransactionHistory")

  const onPressBitcoin = () => navigation.navigate("BTCTransactionHistory")

  const onPressFlashcard = () => navigation.navigate("Card")

  return (
    <>
      <Balance
        icon="cash"
        title="Cash"
        amount={cashDisplayBalance}
        // amount={cashBalance}
        currency={displayCurrency}
        onPress={onPressCash}
      />
      {persistentState.isAdvanceMode && (
        <Balance
          icon="bitcoin"
          title="Bitcoin"
          amount={btcBalance?.split(" ")[0]}
          // amount={btcDisplayBalance}
          currency="SATS"
          onPress={onPressBitcoin}
        />
      )}
      <Balance
        icon="flashcard"
        title="Flash Card"
        amount="$239.18"
        currency="USD"
        onPress={onPressFlashcard}
      />
    </>
  )
}

export default WalletOverview
