import React, { useState } from "react"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { StackScreenProps } from "@react-navigation/stack"
import { makeStyles, Text } from "@rneui/themed"
import { View } from "react-native"

// components
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { InputField } from "@app/components/account-upgrade-flow"

// hooks
import { useActivityIndicator } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"

type Props = StackScreenProps<RootStackParamList, "TestTransaction">

const TestTransaction: React.FC<Props> = ({ navigation, route }) => {
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { toggleActivityIndicator } = useActivityIndicator()

  const [errorMsg, setErrorMsg] = useState<string>()
  const [amount, setAmount] = useState<string>()

  const onConfirm = () => {}

  return (
    <Screen>
      <View style={styles.wrapper}>
        <Text type="p1" style={styles.header}>
          To complete upgrading your account to MERCHANT, enter the test transaction
          amount we sent your bank account to confirm your bank details.
        </Text>
        <InputField
          label="Transaction amount"
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
