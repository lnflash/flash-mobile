import React from "react"
import { View } from "react-native"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"

// assets
import Account from "@app/assets/illustrations/account.svg"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"

// store
import { useAppSelector } from "@app/store/redux"

// gql
import { AccountLevel } from "@app/graphql/generated"

type Props = StackScreenProps<RootStackParamList, "AccountUpgradeSuccess">

const accountTypeLabel = { ONE: "PERSONAL", TWO: "PRO", THREE: "MERCHANT" }

const Success: React.FC<Props> = ({ navigation }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()

  const { accountType } = useAppSelector((state) => state.accountUpgrade)

  const onComplete = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: "Primary" }],
    })
  }

  return (
    <Screen backgroundColor={colors.accent02}>
      <View style={styles.wrapper}>
        <Text type="h02" bold style={styles.header}>
          {LL.AccountUpgrade.successTitle({
            accountType: accountTypeLabel[accountType as keyof typeof accountTypeLabel],
          })}
        </Text>
        <Account />
        {accountType === AccountLevel.Three && (
          <Text
            type="bl"
            color={colors.grey5}
            style={{ marginHorizontal: 30, textAlign: "center" }}
          >
            {LL.AccountUpgrade.successDesc()}
          </Text>
        )}
      </View>
      <PrimaryBtn
        label="Complete"
        onPress={onComplete}
        btnStyle={styles.btn}
        txtStyle={{ color: "#002118" }}
      />
    </Screen>
  )
}

export default Success

const useStyles = makeStyles(() => ({
  wrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    textAlign: "center",
    color: "#fff",
  },
  btn: {
    backgroundColor: "#fff",
    marginHorizontal: 20,
    marginBottom: 10,
  },
}))
