import React, { useEffect, useState } from "react"
import { View } from "react-native"
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
import { useI18nContext } from "@app/i18n/i18n-react"
import {
  useAttachedCashuCard,
  useBreez,
  useFlashcard,
  useOpenFlashcard,
  useTapFlashcard,
} from "@app/hooks"

// utils
import {
  MoneyAmount,
  toBtcMoneyAmount,
  toSpendableBalance,
  toUsdMoneyAmount,
} from "@app/types/amounts"
import { getCashWallet } from "@app/graphql/wallets-utils"
import type { KnownCard } from "@app/store/redux/slices/flashcardV2Slice"

type Props = {
  setIsUnverifiedSeedModalVisible: (value: boolean) => void
}

const WalletOverview: React.FC<Props> = ({ setIsUnverifiedSeedModalVisible }) => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const isAuthed = useIsAuthed()
  const { LL } = useI18nContext()
  const { btcWallet } = useBreez()
  const { lnurl, balanceInSats, cashuCard } = useFlashcard()
  // One rule for the tile and the Settings row, and every tap routed by what
  // was tapped (ENG-616): see app/hooks/use-tap-flashcard.ts. The tile's sync
  // refreshes the BoltCard in place, as it always has (the tile body is what
  // opens Card); only a Cashu card tapped on it opens a screen, its own.
  const openFlashcard = useOpenFlashcard()
  const refreshFlashcard = useTapFlashcard({ openBoltCard: false })
  // The Cashu card attached to the app, with the balance it held at its last
  // read; hidden when no card is attached, even if the phone remembers others.
  const attachedCashuCard = useAttachedCashuCard()
  const tapFlashcard = useTapFlashcard()

  const { persistentState, updateState } = usePersistentStateContext()
  const { formatMoneyAmount, displayCurrency, moneyAmountToDisplayCurrencyString } =
    useDisplayCurrency()

  const { data } = useWalletOverviewScreenQuery({
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
  const [cardDisplayBalance, setCardDisplayBalance] = useState<string | undefined>(
    persistentState?.cardDisplayBalance || undefined,
  )

  useEffect(() => {
    if (
      persistentState.btcDisplayBalance !== btcDisplayBalance ||
      persistentState.cashDisplayBalance !== cashDisplayBalance ||
      persistentState.btcBalance !== btcBalance ||
      persistentState.cashBalance !== cashBalance ||
      persistentState.cardDisplayBalance !== cardDisplayBalance
    ) {
      updateState((state) => {
        if (state)
          return {
            ...state,
            btcDisplayBalance,
            cashDisplayBalance,
            btcBalance,
            cashBalance,
            cardDisplayBalance,
          }
        return undefined
      })
    }
  }, [btcDisplayBalance, cashDisplayBalance, btcBalance, cashBalance, cardDisplayBalance])

  useEffect(() => {
    if (isAuthed) formatBalance()
  }, [
    isAuthed,
    data?.me?.defaultAccount?.wallets,
    btcWallet?.balance,
    balanceInSats,
    displayCurrency,
    // recompute once price conversion becomes ready so the balance isn't stuck blank/stale (ENG-512)
    moneyAmountToDisplayCurrencyString,
  ])

  const formatBalance = () => {
    // Balances here are display-only — floor to whole spendable minor units
    // so the cards never show money the user can't send (#690).
    const extBtcWalletBalance = toSpendableBalance(
      toBtcMoneyAmount(btcWallet?.balance ?? NaN),
    )
    const btcAmount = formatMoneyAmount({ moneyAmount: extBtcWalletBalance })
    const btcDisplay = moneyAmountToDisplayCurrencyString({
      moneyAmount: extBtcWalletBalance,
    })
    // Only overwrite once we have a real value. On a fresh login the wallet
    // query can resolve before price conversion is ready (or the Cash wallet
    // is briefly missing mid USD→USDT cutover); writing the resulting
    // ""/undefined would clobber the balance and render a blank card (ENG-512).
    if (btcAmount) setBtcBalance(btcAmount)
    if (btcDisplay) setBtcDisplayBalance(btcDisplay)

    if (data) {
      const extUsdWallet = getCashWallet(data?.me?.defaultAccount?.wallets)
      const extUsdWalletBalance = toSpendableBalance(
        toUsdMoneyAmount(extUsdWallet?.balance ?? NaN),
      )
      const cashAmount = formatMoneyAmount({ moneyAmount: extUsdWalletBalance })
      const cashDisplay = moneyAmountToDisplayCurrencyString({
        moneyAmount: extUsdWalletBalance,
      })
      if (cashAmount) setCashBalance(cashAmount)
      if (cashDisplay) setCashDisplayBalance(cashDisplay)
    }

    // Flashcard balance comes from the (cached) card HTML via useFlashcard and
    // runs through the same price conversion — guard it identically so a linked
    // card never flips to the "Add Flashcard" empty state mid-load (ENG-512).
    const cardDisplay = moneyAmountToDisplayCurrencyString({
      moneyAmount: toBtcMoneyAmount(balanceInSats ?? NaN),
    })
    if (cardDisplay) setCardDisplayBalance(cardDisplay)
  }

  const navigateHandler = (activeTab: string) => {
    if (persistentState.isAdvanceMode) {
      navigation.navigate("TransactionHistoryTabs", {
        initialRouteName: activeTab,
      })
    } else {
      navigation.navigate(activeTab as any)
    }
  }

  const onPressCash = () => navigateHandler("USDTransactionHistory")

  // The card read this session opens at once; otherwise a tap reads it.
  const openCashuCard = () =>
    cashuCard ? navigation.navigate("FlashcardV2") : tapFlashcard()

  const cashuCardAmount = attachedCashuCard && knownCardAmount(attachedCashuCard)
  const cashuCardInDisplay =
    cashuCardAmount &&
    moneyAmountToDisplayCurrencyString({ moneyAmount: cashuCardAmount })
  // Before the price arrives, and for a unit the mint has not named, the row
  // shows the card's own figure, with no currency code after it.
  const cashuCardOwn = (card: KnownCard): string =>
    cashuCardAmount
      ? formatMoneyAmount({ moneyAmount: cashuCardAmount })
      : LL.FlashcardV2.unitUnknown({ amount: grouped.format(card.lastBalance) })

  const onPressBitcoin = () => navigateHandler("BTCTransactionHistory")

  return (
    <View style={{ marginHorizontal: 20 }}>
      <Balance
        icon="cash"
        title={LL.HomeScreen.cash()}
        amount={cashDisplayBalance}
        // amount={cashBalance}
        currency={displayCurrency}
        onPress={onPressCash}
      />
      {persistentState.isAdvanceMode && (
        <Balance
          icon="bitcoin"
          title={LL.HomeScreen.bitcoin()}
          amount={btcBalance}
          // amount={btcDisplayBalance}
          currency=""
          onPress={onPressBitcoin}
          onPressRightBtn={() => setIsUnverifiedSeedModalVisible(true)}
          rightIcon={persistentState.backedUpBtcWallet ? undefined : "warning"}
        />
      )}
      {lnurl && (
        <Balance
          icon={cardDisplayBalance ? "flashcard" : "cardAdd"}
          title={LL.HomeScreen.flashcard()}
          amount={cardDisplayBalance}
          currency={displayCurrency}
          emptyText={LL.HomeScreen.addFlashcard()}
          onPress={openFlashcard}
          onPressRightBtn={refreshFlashcard}
          rightIcon={"sync"}
        />
      )}
      {attachedCashuCard && (
        <Balance
          icon="flashcard"
          title={LL.HomeScreen.flashcard()}
          amount={cashuCardInDisplay || cashuCardOwn(attachedCashuCard)}
          currency={cashuCardInDisplay ? displayCurrency : ""}
          onPress={openCashuCard}
          onPressRightBtn={tapFlashcard}
          testID="home-cashu-card"
          rightIcon={"sync"}
        />
      )}
    </View>
  )
}

const grouped = new Intl.NumberFormat("en-US")

/**
 * What a Cashu card held when this phone last read it, in the card's unit.
 * Undefined while the mint has not named the unit of a card holding value.
 */
const knownCardAmount = (card: KnownCard): MoneyAmount<WalletCurrency> | undefined => {
  if (card.unit === "sat") return toBtcMoneyAmount(card.lastBalance)
  if (card.unit === "usd") return toUsdMoneyAmount(card.lastBalance)
  return card.lastBalance === 0 ? toBtcMoneyAmount(0) : undefined
}

export default WalletOverview
