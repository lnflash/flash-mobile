import React from "react"
import { ScrollView } from "react-native"
import { makeStyles } from "@rneui/themed"
import { Text, useTheme } from "@rneui/themed"
import moment from "moment"

// components
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { CashoutCard, CashoutFromWallet } from "@app/components/cashout-flow"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useCashoutScreenQuery, useInitiateCashoutMutation } from "@app/graphql/generated"

//utils
import { getUsdWallet } from "@app/graphql/wallets-utils"
import { toUsdMoneyAmount } from "@app/types/amounts"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

type Props = StackScreenProps<RootStackParamList, "CashoutConfirmation">

const CashoutConfirmation: React.FC<Props> = ({ navigation, route }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()

  const [initiateCashout] = useInitiateCashoutMutation()

  const { data } = useCashoutScreenQuery({
    fetchPolicy: "cache-first",
    returnPartialData: true,
  })

  const usdWallet = getUsdWallet(data?.me?.defaultAccount?.wallets)
  const usdBalance = toUsdMoneyAmount(usdWallet?.balance ?? NaN)

  const onConfirm = () => {}

  return (
    <Screen>
      <ScrollView style={{ padding: 20 }}>
        <Text type="caption" color={colors.placeholder} style={styles.valid}>
          {LL.Cashout.valid({ time: moment(1744716526481).fromNow(true) })}
        </Text>
        <CashoutFromWallet usdBalance={usdBalance} />
        <CashoutCard title={LL.Cashout.exchangeRate()} detail="$84500/J$43212" />
        <CashoutCard title={LL.Cashout.sendAmount()} detail="$0.99" />
        <CashoutCard title={LL.Cashout.receiveAmount()} detail="$0.90/J$10" />
        <CashoutCard title={LL.Cashout.fee()} detail="$0.10" />
      </ScrollView>
      <PrimaryBtn
        label={LL.common.confirm()}
        btnStyle={styles.buttonContainer}
        onPress={onConfirm}
      />
    </Screen>
  )
}

export default CashoutConfirmation

const useStyles = makeStyles(({ colors }) => ({
  valid: {
    alignSelf: "center",
    marginBottom: 10,
  },
  buttonContainer: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
}))
