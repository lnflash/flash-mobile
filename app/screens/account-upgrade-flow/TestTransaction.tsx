import React, { useEffect, useState } from "react"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { StackScreenProps } from "@react-navigation/stack"
import { makeStyles, Text } from "@rneui/themed"
import { View } from "react-native"

// components
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { InputField } from "@app/components/account-upgrade-flow"

// hooks
import { useAccountUpgrade, useActivityIndicator } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"

// store
import { useAppSelector } from "@app/store/redux"

type Props = StackScreenProps<RootStackParamList, "TestTransaction">

const TestTransaction: React.FC<Props> = ({ navigation, route }) => {
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { fetchAccountUpgrade } = useAccountUpgrade()
  const { toggleActivityIndicator } = useActivityIndicator()

  const [errorMsg, setErrorMsg] = useState<string>()
  const [amount, setAmount] = useState<string>()

  const { bankInfo } = useAppSelector((state) => state.accountUpgrade)

  useEffect(() => {
    fetchAccountUpgrade()
  }, [])

  const onConfirm = () => {}

  return (
    <Screen>
      <View style={styles.wrapper}>
        <Text type="p1" style={styles.header}>
          {LL.AccountUpgrade.transactionTitle({
            accountNum: "****" + bankInfo.accountNumber?.slice(-4) || "",
          })}
        </Text>
        <InputField
          label={LL.AccountUpgrade.transactionAmount()}
          placeholder="123456"
          value={amount}
          errorMsg={errorMsg}
          onChangeText={setAmount}
        />
      </View>
      <PrimaryBtn
        label="Confirm"
        disabled={!amount}
        btnStyle={styles.btn}
        onPress={onConfirm}
      />
    </Screen>
  )
}

export default TestTransaction

const useStyles = makeStyles(() => ({
  wrapper: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  header: {
    marginBottom: 30,
  },
  btn: {
    marginHorizontal: 20,
    marginVertical: 10,
  },
}))
