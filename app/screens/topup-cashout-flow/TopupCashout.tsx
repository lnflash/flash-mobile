import React, { useMemo, useState } from "react"
import { TouchableOpacity, View } from "react-native"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { Icon, Text, makeStyles, useTheme } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { useI18nContext } from "@app/i18n/i18n-react"

// components
import { Screen } from "@app/components/screen"
import { TransferOptionModal, BridgeKycModal } from "@app/components/topup-cashout-flow"
import type { TransferOption } from "@app/components/topup-cashout-flow"

// assets
import ArrowDown from "@app/assets/icons/arrow-down-to-bracket.svg"
import ArrowUp from "@app/assets/icons/arrow-up-from-bracket.svg"

type Props = StackScreenProps<RootStackParamList, "TopupCashout">

const TopupCashout: React.FC<Props> = ({ navigation }) => {
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { colors } = useTheme().theme

  const [topupModalVisible, setTopupModalVisible] = useState(false)
  const [settleModalVisible, setSettleModalVisible] = useState(false)
  const [bridgeKycModalVisible, setBridgeKycModalVisible] = useState(false)

  const topupOptions: TransferOption[] = useMemo(
    () => [
      {
        icon: "card",
        title: LL.TopUpScreen.debitCreditCard(),
        description: LL.TopUpScreen.debitCreditCardDesc(),
        onPress: () => {
          setTopupModalVisible(false)
          navigation.navigate("TopupDetails", { paymentType: "card" })
        },
      },
      {
        icon: "business",
        title: LL.TopUpScreen.bankTransfer(),
        description: LL.TopUpScreen.bankTransferDesc(),
        onPress: () => {
          setTopupModalVisible(false)
          navigation.navigate("TopupDetails", { paymentType: "bankTransfer" })
        },
      },
      {
        icon: "globe",
        title: LL.TransferScreen.internationalBankTransfer(),
        description: LL.TransferScreen.internationalBankTransferDesc(),
        onPress: () => {
          setTopupModalVisible(false)
          setBridgeKycModalVisible(true)
        },
      },
    ],
    [LL, navigation],
  )

  const settleOptions: TransferOption[] = useMemo(
    () => [
      {
        icon: "business",
        title: LL.TransferScreen.jmdBankAccount(),
        description: LL.TransferScreen.jmdBankAccountDesc(),
        onPress: () => {
          setSettleModalVisible(false)
          navigation.navigate("CashoutDetails")
        },
      },
      {
        icon: "globe",
        title: LL.TransferScreen.internationalBankAccount(),
        description: LL.TransferScreen.internationalBankAccountDesc(),
        onPress: () => {
          setSettleModalVisible(false)
          setBridgeKycModalVisible(true)
        },
      },
    ],
    [LL, navigation],
  )

  return (
    <Screen>
      <View style={styles.container}>
        <Text type="h02" bold style={styles.title}>
          {LL.TransferScreen.title()}
        </Text>
        <TouchableOpacity style={styles.btn} onPress={() => setTopupModalVisible(true)}>
          <ArrowDown color={colors.black} width={40} height={40} />
          <View style={styles.btnTextWrapper}>
            <Text type="p1">{LL.TransferScreen.topUp()}</Text>
            <Text type="p3" color={colors.grey2}>
              {LL.TransferScreen.topUpDesc()}
            </Text>
          </View>
          <Icon type="ionicon" name={"chevron-forward"} size={20} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={() => setSettleModalVisible(true)}>
          <ArrowUp color={colors.black} width={40} height={40} />
          <View style={styles.btnTextWrapper}>
            <Text type="p1"> {LL.TransferScreen.settle()}</Text>
            <Text type="p3" color={colors.grey2}>
              {LL.TransferScreen.settleDesc()}
            </Text>
          </View>
          <Icon type="ionicon" name={"chevron-forward"} size={20} />
        </TouchableOpacity>
      </View>

      <TransferOptionModal
        visible={topupModalVisible}
        title={LL.TransferScreen.selectTopUpMethod()}
        options={topupOptions}
        onClose={() => setTopupModalVisible(false)}
      />
      <TransferOptionModal
        visible={settleModalVisible}
        title={LL.TransferScreen.selectSettleMethod()}
        options={settleOptions}
        onClose={() => setSettleModalVisible(false)}
      />

      <BridgeKycModal
        visible={bridgeKycModalVisible}
        onClose={() => setBridgeKycModalVisible(false)}
        onSubmit={(data) => {
          setBridgeKycModalVisible(false)
          // TODO: send KYC data to Bridge API when query is ready
          console.log("Bridge KYC submitted:", data)
        }}
      />
    </Screen>
  )
}

const useStyles = makeStyles(() => ({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  title: {
    textAlign: "center",
    marginBottom: 30,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#dedede",
    marginBottom: 20,
    minHeight: 100,
    paddingHorizontal: 20,
  },
  btnTextWrapper: {
    flex: 1,
    rowGap: 5,
    marginHorizontal: 15,
  },
}))

export default TopupCashout
