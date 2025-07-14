import React, { useEffect } from "react"
import { TouchableOpacity, View } from "react-native"
import { StackScreenProps } from "@react-navigation/stack"
import { Icon, makeStyles, Text, useTheme } from "@rneui/themed"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { AccountLevel } from "@app/graphql/generated"

// components
import { Screen } from "@app/components/screen"
import { ProgressSteps } from "@app/components/account-upgrade-flow"

// hooks
import { useLevel } from "@app/graphql/level-context"
import { useAccountUpgrade } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"

// store
import { useAppDispatch } from "@app/store/redux"
import { setAccountUpgrade } from "@app/store/redux/slices/accountUpgradeSlice"

type Props = StackScreenProps<RootStackParamList, "AccountType">

const AccountType: React.FC<Props> = ({ navigation }) => {
  const dispatch = useAppDispatch()
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { currentLevel } = useLevel()
  const { fetchAccountUpgrade } = useAccountUpgrade()

  useEffect(() => {
    fetchAccountUpgrade()
  }, [])

  const onPress = (accountType: string) => {
    const numOfSteps =
      accountType === "personal" ? 3 : currentLevel === AccountLevel.Zero ? 5 : 4

    dispatch(setAccountUpgrade({ accountType, numOfSteps }))
    navigation.navigate("PersonalInformation")
  }

  const numOfSteps = currentLevel === AccountLevel.Zero ? 3 : 4

  return (
    <Screen>
      <ProgressSteps numOfSteps={numOfSteps} currentStep={1} />
      {currentLevel === AccountLevel.Zero && (
        <TouchableOpacity style={styles.card} onPress={() => onPress("personal")}>
          <Icon name={"person"} size={35} color={colors.grey1} type="ionicon" />
          <View style={styles.textWrapper}>
            <Text type="bl" bold>
              {LL.AccountUpgrade.personal()}
            </Text>
            <Text type="bm" style={{ marginTop: 2 }}>
              {LL.AccountUpgrade.personalDesc()}
            </Text>
          </View>
          <Icon name={"chevron-forward"} size={25} color={colors.grey2} type="ionicon" />
        </TouchableOpacity>
      )}
      {(currentLevel === AccountLevel.Zero || currentLevel === AccountLevel.One) && (
        <TouchableOpacity style={styles.card} onPress={() => onPress("business")}>
          <Icon name={"briefcase"} size={35} color={colors.grey1} type="ionicon" />
          <View style={styles.textWrapper}>
            <Text type="bl" bold>
              {LL.AccountUpgrade.pro()}
            </Text>
            <Text type="bm" style={{ marginTop: 2 }}>
              {LL.AccountUpgrade.proDesc()}
            </Text>
          </View>
          <Icon name={"chevron-forward"} size={25} color={colors.grey2} type="ionicon" />
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.card} onPress={() => onPress("merchant")}>
        <Icon name={"cart"} size={35} color={colors.grey1} type="ionicon" />
        <View style={styles.textWrapper}>
          <Text type="bl" bold>
            {LL.AccountUpgrade.merchant()}
          </Text>
          <Text type="bm" style={{ marginTop: 2 }}>
            {LL.AccountUpgrade.merchantDesc()}
          </Text>
        </View>
        <Icon name={"chevron-forward"} size={25} color={colors.grey2} type="ionicon" />
      </TouchableOpacity>
    </Screen>
  )
}

export default AccountType

const useStyles = makeStyles(({ colors }) => ({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.grey5,
    padding: 15,
    marginHorizontal: 20,
    marginVertical: 10,
    borderRadius: 20,
  },
  textWrapper: {
    flex: 1,
    marginHorizontal: 15,
  },
}))
