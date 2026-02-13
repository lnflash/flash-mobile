import { View } from "react-native"
import { makeStyles, Text } from "@rneui/themed"
import { StackNavigationProp } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import { PrimaryBtn } from "@app/components/buttons"
import { GaloyIcon } from "@app/components/atomic/galoy-icon"
import { GaloySecondaryButton } from "@app/components/atomic/galoy-secondary-button"

// hooks
import { useShowWarningSecureAccount } from "../show-warning-secure-account-hook"
import { AccountLevel, useLevel } from "@app/graphql/level-context"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useNavigation } from "@react-navigation/native"
import { useAppSelector } from "@app/store/redux"

export const UpgradeTrialAccount: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { currentLevel } = useLevel()
  const { status } = useAppSelector((state) => state.accountUpgrade)

  const upgradePending = status === "Pending"

  const hasBalance = useShowWarningSecureAccount()

  if (currentLevel === AccountLevel.Zero) {
    return (
      <View style={styles.container}>
        <View style={styles.sideBySide}>
          <Text type="h2" bold>
            {LL.common.trialAccount()}
          </Text>
          <GaloyIcon name="warning" size={30} />
        </View>
        <Text type="p3">{LL.AccountScreen.itsATrialAccount()}</Text>
        {hasBalance && (
          <Text type="p3">⚠️ {LL.AccountScreen.fundsMoreThan5Dollars()}</Text>
        )}
        <GaloySecondaryButton
          title={LL.common.backupAccount()}
          iconName="caret-right"
          iconPosition="right"
          containerStyle={styles.selfCenter}
          onPress={() => navigation.navigate("AccountType")}
        />
      </View>
    )
  } else if (currentLevel !== AccountLevel.Three) {
    return (
      <PrimaryBtn
        label={
          !upgradePending
            ? LL.TransactionLimitsScreen.requestUpgrade()
            : LL.TransactionLimitsScreen.requestPending()
        }
        btnStyle={upgradePending ? { backgroundColor: "#FF7e1c" } : {}}
        onPress={() => navigation.navigate("AccountType")}
        disabled={upgradePending}
      />
    )
  } else {
    return null
  }
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    borderRadius: 20,
    backgroundColor: colors.grey5,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "flex-start",
    rowGap: 10,
  },
  selfCenter: { alignSelf: "center" },
  sideBySide: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 4,
  },
}))
