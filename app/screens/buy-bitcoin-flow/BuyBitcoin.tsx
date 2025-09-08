import React from "react"
import { TouchableOpacity, View } from "react-native"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { Icon, Text, makeStyles, useTheme } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { useI18nContext } from "@app/i18n/i18n-react"

// components
import { Screen } from "@app/components/screen"

type Props = StackScreenProps<RootStackParamList, "BuyBitcoin">

const BuyBitcoin: React.FC<Props> = ({ navigation }) => {
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { colors } = useTheme().theme

  return (
    <Screen>
      <View style={styles.container}>
        <Text type="h02" bold style={styles.title}>
          {LL.TopUpScreen.title()}
        </Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={() =>
            navigation.navigate("BuyBitcoinDetails", { paymentType: "bankTransfer" })
          }
        >
          <Icon type="ionicon" name={"business"} size={40} />

          <View style={styles.btnTextWrapper}>
            <Text type="p1"> {LL.TopUpScreen.bankTransfer()}</Text>
            <Text type="p3" color={colors.grey2}>
              {LL.TopUpScreen.bankTransferDesc()}
            </Text>
          </View>
          <Icon type="ionicon" name={"chevron-forward"} size={20} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.btn}
          onPress={() =>
            navigation.navigate("BuyBitcoinDetails", { paymentType: "card" })
          }
        >
          <Icon type="ionicon" name={"card"} size={40} />
          <View style={styles.btnTextWrapper}>
            <Text type="p1"> {LL.TopUpScreen.debitCreditCard()}</Text>
            <Text type="p3" color={colors.grey2}>
              {LL.TopUpScreen.debitCreditCardDesc()}
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

export default BuyBitcoin
