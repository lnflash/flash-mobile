import React, { useEffect, useState } from "react"
import { View } from "react-native"
import { StackScreenProps } from "@react-navigation/stack"
import { makeStyles } from "@rneui/themed"
import { parsePaymentDestination, Network as NetworkGaloyClient } from "@flash/client"
import { LNURL_DOMAINS } from "@app/config"

// components
import { DetailDescription, InforError } from "@app/components/redeem-flow"
import { AmountInput } from "@app/components/amount-input"
import { GaloyPrimaryButton } from "@app/components/atomic/galoy-primary-button"
import { Screen } from "@app/components/screen"

// hooks
import { usePriceConversion } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"
import { usePersistentStateContext } from "@app/store/persistent-state"

// types
import { useLnUsdInvoiceCreateMutation, WalletCurrency } from "@app/graphql/generated"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import {
  DisplayCurrency,
  MoneyAmount,
  toBtcMoneyAmount,
  WalletOrDisplayCurrency,
} from "@app/types/amounts"

type Prop = StackScreenProps<RootStackParamList, "redeemBitcoinDetail">

const RedeemBitcoinDetailScreen: React.FC<Prop> = ({ route, navigation }) => {
  const {
    callback,
    domain,
    defaultDescription,
    k1,
    minWithdrawable,
    maxWithdrawable,
    lnurl,
  } = route.params.receiveDestination.validDestination
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { persistentState } = usePersistentStateContext()
  const { convertMoneyAmount } = usePriceConversion()

  const [lnUsdInvoiceCreate] = useLnUsdInvoiceCreateMutation()

  const [hasError, setHasError] = useState(false)
  const [minSats, setMinSats] = useState(
    toBtcMoneyAmount(Math.round(minWithdrawable / 1000)),
  )
  const [maxSats, setMaxSats] = useState(
    toBtcMoneyAmount(Math.round(maxWithdrawable / 1000)),
  )

  const [unitOfAccountAmount, setUnitOfAccountAmount] =
    useState<MoneyAmount<WalletOrDisplayCurrency>>(minSats)

  if (!convertMoneyAmount) {
    console.log("convertMoneyAmount is undefined")
    return null
  }

  const amountIsFlexible = minSats.amount !== maxSats.amount

  // Round to ensure integer satoshis for LNURL withdrawal validation
  const btcMoneyAmount = convertMoneyAmount(unitOfAccountAmount, WalletCurrency.Btc, true)

  const validAmount =
    btcMoneyAmount.amount !== null &&
    btcMoneyAmount.amount <= maxSats.amount &&
    btcMoneyAmount.amount >= minSats.amount

  useEffect(() => {
    if (persistentState.defaultWallet?.walletCurrency === WalletCurrency.Usd) {
      calculateEstimatedFee()
      navigation.setOptions({ title: LL.RedeemBitcoinScreen.usdTitle() })
    } else if (persistentState.defaultWallet?.walletCurrency === WalletCurrency.Btc) {
      navigation.setOptions({ title: LL.RedeemBitcoinScreen.title() })
    }
  }, [persistentState.defaultWallet])

  const calculateEstimatedFee = async () => {
    if (persistentState.defaultWallet) {
      const usdAmount = convertMoneyAmount(maxSats, WalletCurrency.Usd)
      const { data } = await lnUsdInvoiceCreate({
        variables: {
          input: {
            walletId: persistentState.defaultWallet?.id,
            amount: usdAmount.amount,
            memo: defaultDescription,
          },
        },
      })
      if (data?.lnUsdInvoiceCreate.invoice) {
        const parsedDestination: any = parsePaymentDestination({
          destination: data?.lnUsdInvoiceCreate.invoice?.paymentRequest,
          network: "mainnet" as NetworkGaloyClient, // hard coded to mainnet
          lnAddressDomains: LNURL_DOMAINS,
        })
        const estimatedFee = parsedDestination.amount - maxSats.amount
        const maxAmount = maxSats.amount - estimatedFee
        setMaxSats(toBtcMoneyAmount(maxAmount))
      }
    }
  }

  const navigate = () => {
    if (persistentState.defaultWallet) {
      navigation.replace("redeemBitcoinResult", {
        callback,
        domain,
        k1,
        defaultDescription,
        minWithdrawableSatoshis: minSats,
        maxWithdrawableSatoshis: maxSats,
        receivingWalletDescriptor: {
          id: persistentState.defaultWallet?.id,
          currency: persistentState.defaultWallet?.walletCurrency,
        },
        unitOfAccountAmount,
        settlementAmount: btcMoneyAmount,
        displayAmount: convertMoneyAmount(btcMoneyAmount, DisplayCurrency),
        usdAmount: convertMoneyAmount(btcMoneyAmount, WalletCurrency.Usd),
        lnurl,
      })
    }
  }

  return (
    <Screen preset="scroll" style={styles.contentContainer}>
      <DetailDescription defaultDescription={defaultDescription} domain={domain} />
      <View style={styles.currencyInputContainer}>
        <AmountInput
          walletCurrency={persistentState.defaultWallet?.walletCurrency || "BTC"}
          unitOfAccountAmount={unitOfAccountAmount}
          setAmount={setUnitOfAccountAmount}
          maxAmount={maxSats}
          minAmount={minSats}
          convertMoneyAmount={convertMoneyAmount}
          canSetAmount={amountIsFlexible}
        />
        <InforError
          unitOfAccountAmount={unitOfAccountAmount}
          minWithdrawableSatoshis={minSats}
          maxWithdrawableSatoshis={maxSats}
          amountIsFlexible={amountIsFlexible}
          setHasError={setHasError}
        />
      </View>

      <GaloyPrimaryButton
        title={LL.RedeemBitcoinScreen.redeemBitcoin()}
        disabled={!validAmount || hasError}
        onPress={navigate}
      />
    </Screen>
  )
}

export default RedeemBitcoinDetailScreen

const useStyles = makeStyles(({ colors }) => ({
  currencyInputContainer: {
    paddingVertical: 20,
    borderRadius: 10,
  },
  contentContainer: {
    padding: 20,
    flexGrow: 1,
  },
}))
