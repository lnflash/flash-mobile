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

// store
import { useAppDispatch, useAppSelector } from "@app/store/redux"
import { resetAccountUpgrade } from "@app/store/redux/slices/accountUpgradeSlice"

type Props = StackScreenProps<RootStackParamList, "AccountUpgradeSuccess">

const Success: React.FC<Props> = ({ navigation }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme

  const dispatch = useAppDispatch()
  const { accountType } = useAppSelector((state) => state.accountUpgrade)

  const onComplete = () => {
    dispatch(resetAccountUpgrade())
    navigation.reset({
      index: 0,
      routes: [{ name: "Primary" }],
    })
  }

  return (
    <Screen backgroundColor={colors.accent02}>
      <View style={styles.wrapper}>
        <Text type="h02" bold style={styles.header}>
          {`You successfully upgraded your account to ${accountType.toUpperCase()}`}
        </Text>
        <Account />
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
