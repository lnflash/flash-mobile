import React from "react"
import { TouchableOpacity, View } from "react-native"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { Icon, Text, makeStyles, useTheme } from "@rneui/themed"
import { StackNavigationProp } from "@react-navigation/stack"
import { useI18nContext } from "@app/i18n/i18n-react"

// components
import { Screen } from "@app/components/screen"

type TransferScreenProps = {
  navigation: StackNavigationProp<RootStackParamList, "transfer">
}

const TransferScreen: React.FC<TransferScreenProps> = ({ navigation }) => {
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { colors } = useTheme().theme

  const handleTopUp = () => {
    navigation.navigate("topUp")
  }

  const handleSettle = () => {
    // TODO: Implement settle functionality
    console.log("Settle functionality not implemented yet")
  }

  return (
    <Screen>
      <View style={styles.container}>
        <Text type="h02" bold style={styles.title}>
          {LL.TransferScreen.title()}
        </Text>
        <TouchableOpacity style={styles.btn} onPress={handleTopUp}>
          <Icon
            type="ionicon"
            name={"arrow-down"}
            size={40}
            style={{ borderBottomWidth: 4, borderColor: colors.black }}
          />
          <View style={styles.btnTextWrapper}>
            <Text type="p1">{LL.TransferScreen.topUp()}</Text>
            <Text type="p3" color={colors.grey2}>
              {LL.TransferScreen.topUpDesc()}
            </Text>
          </View>
          <Icon type="ionicon" name={"chevron-forward"} size={20} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={handleSettle}>
          <Icon
            type="ionicon"
            name={"arrow-up"}
            size={40}
            style={{ borderBottomWidth: 4, borderColor: colors.black }}
          />

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

export default TransferScreen
