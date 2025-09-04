import React, { useEffect, useState } from "react"
import { TouchableOpacity, View } from "react-native"
import Clipboard from "@react-native-clipboard/clipboard"
import { StackNavigationProp } from "@react-navigation/stack"
import { Icon, makeStyles, Text, useTheme } from "@rneui/themed"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import { Balance } from "../cards"

// hooks
import { useWalletOverviewScreenQuery } from "@app/graphql/generated"
import { usePersistentStateContext } from "@app/store/persistent-state"
import { useDisplayCurrency } from "@app/hooks/use-display-currency"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useNavigation } from "@react-navigation/native"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useAppConfig, useBreez, useFlashcard } from "@app/hooks"

// utils
import { toBtcMoneyAmount, toUsdMoneyAmount } from "@app/types/amounts"
import { getUsdWallet } from "@app/graphql/wallets-utils"
import { toastShow } from "@app/utils/toast"

type Props = {
  setIsUnverifiedSeedModalVisible: (value: boolean) => void
}

const WalletOverview: React.FC<Props> = ({ setIsUnverifiedSeedModalVisible }) => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const isAuthed = useIsAuthed()
  const styles = useStyle()
  const { colors } = useTheme().theme
  const { appConfig } = useAppConfig()
  const { LL } = useI18nContext()
  const { btcWallet } = useBreez()
  const { lnurl, balanceInSats, readFlashcard } = useFlashcard()

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

  const hostName = appConfig.galoyInstance.lnAddressHostname
  const lnAddress = `${data?.me?.username}@${hostName}`

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
        }),
      )
    }
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

  const onPressBitcoin = () => navigateHandler("BTCTransactionHistory")

  const onPressFlashcard = () => {
    if (lnurl) navigation.navigate("Card")
    else readFlashcard()
  }

  const onCopyLnAddress = () => {
    Clipboard.setString(lnAddress)
    toastShow({
      type: "success",
      position: "top",
      message: (translations) =>
        translations.GaloyAddressScreen.copiedLightningAddressToClipboard(),
      currentTranslation: LL,
    })
  }

  const formattedCardBalance = moneyAmountToDisplayCurrencyString({
    moneyAmount: toBtcMoneyAmount(balanceInSats ?? NaN),
  })

  return (
    <View style={styles.wrapper}>
      {data?.me?.username && (
        <TouchableOpacity style={styles.lnAddressWrapper} onPress={onCopyLnAddress}>
          <Text type="p2" style={{ marginRight: 10 }}>
            {lnAddress}
          </Text>
          <Icon name={"copy-outline"} color={colors.text02} type="ionicon" />
        </TouchableOpacity>
      )}
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
      <Balance
        icon={!!formattedCardBalance ? "flashcard" : "cardAdd"}
        title={LL.HomeScreen.flashcard()}
        amount={formattedCardBalance}
        currency={displayCurrency}
        emptyText={LL.HomeScreen.addFlashcard()}
        onPress={onPressFlashcard}
        onPressRightBtn={() => readFlashcard(false)}
        rightIcon={"sync"}
      />
    </View>
  )
}

export default WalletOverview

const useStyle = makeStyles(() => ({
  wrapper: {
    marginTop: 10,
    marginHorizontal: 20,
  },
  lnAddressWrapper: {
    flexDirection: "row",
    marginLeft: 5,
    marginBottom: 5,
  },
}))
