import React from "react"
import { TouchableOpacity, View } from "react-native"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { Icon, Text, makeStyles, useTheme } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { useI18nContext } from "@app/i18n/i18n-react"

// components
import { Screen } from "@app/components/screen"

// assets
import ArrowDown from "@app/assets/icons/arrow-down-to-bracket.svg"
import ArrowUp from "@app/assets/icons/arrow-up-from-bracket.svg"

type Props = StackScreenProps<RootStackParamList, "BuySellBitcoin">

const BuySellBitcoin: React.FC<Props> = ({ navigation }) => {
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { colors } = useTheme().theme

  const handleTopUp = () => {
    navigation.navigate("BuyBitcoin")
  }

  const handleSettle = () => {
    navigation.navigate("CashoutDetails")
  }

  return (
    <Screen>
      <View style={styles.container}>
        <Text type="h02" bold style={styles.title}>
          {LL.TransferScreen.title()}
        </Text>
        <TouchableOpacity style={styles.btn} onPress={handleTopUp}>
          <ArrowDown color={colors.black} width={40} height={40} />
          <View style={styles.btnTextWrapper}>
            <Text type="p1">{LL.TransferScreen.topUp()}</Text>
            <Text type="p3" color={colors.grey2}>
              {LL.TransferScreen.topUpDesc()}
            </Text>
          </View>
          <Icon type="ionicon" name={"chevron-forward"} size={20} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={handleSettle}>
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
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
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

export default BuySellBitcoin
