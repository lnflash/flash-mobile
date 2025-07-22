import React from "react"
import { View } from "react-native"
import { makeStyles, Text } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useSafeAreaInsets } from "react-native-safe-area-context"

// components
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"

type Props = StackScreenProps<RootStackParamList, "BankTransfer">

const BankTransfer: React.FC<Props> = ({ navigation, route }) => {
  const styles = useStyles()
  const { bottom } = useSafeAreaInsets()
  const { LL } = useI18nContext()

  const { email, amount, wallet } = route.params
  const fee = amount * 0.02

  return (
    <Screen preset="scroll" style={{ paddingHorizontal: 20 }}>
      <Text type="h02" bold style={styles.title}>
        {LL.BankTransfer.title()}
      </Text>
      <Text type="p1" style={styles.desc}>
        {LL.BankTransfer.desc1({ amount: amount + fee })}
      </Text>
      <Text type="p1" style={styles.desc}>
        {LL.BankTransfer.desc2({ code: "UUM7MJRD" })}
      </Text>
      <Text type="p1" style={styles.desc}>
        {LL.BankTransfer.desc3({ amount: amount, fee: fee })}
      </Text>
      <View style={styles.bankDetails}>
        <View style={styles.fieldContainer}>
          <Text type="bl">{LL.BankTransfer.accountType()}</Text>
          <Text type="p1" bold>
            Checking
          </Text>
        </View>
        <View style={styles.fieldContainer}>
          <Text type="bl">{LL.BankTransfer.destinationBank()}</Text>
          <Text type="p1" bold>
            Banco Hipotecario
          </Text>
        </View>
        <View style={styles.fieldContainer}>
          <Text type="bl">{LL.BankTransfer.accountNumber()}</Text>
          <Text type="p1" bold>
            00210312362
          </Text>
        </View>
        <View style={styles.fieldContainer}>
          <Text type="bl">{LL.BankTransfer.typeOfClient()}</Text>
          <Text type="p1" bold>
            Corporate
          </Text>
        </View>
        <View style={styles.fieldContainer}>
          <Text type="bl">{LL.BankTransfer.receiverName()}</Text>
          <Text type="p1" bold>
            BBW SA de CV
          </Text>
        </View>
        <View style={styles.fieldContainer}>
          <Text type="bl">{LL.BankTransfer.email()}</Text>
          <Text type="p1" bold>
            fiat@blink.sv
          </Text>
        </View>
        <View style={styles.fieldContainer}>
          <Text type="bl">{LL.BankTransfer.amount()}</Text>
          <Text type="p1" bold>
            {`${amount + fee} USD`}
          </Text>
        </View>
        <View style={styles.fieldContainer}>
          <Text type="bl">{LL.BankTransfer.uniqueCode()}</Text>
          <Text type="p1" bold>
            UUM7MJRD
          </Text>
        </View>
        <View style={styles.fieldContainer}>
          <Text type="bl">{LL.BankTransfer.fees()}</Text>
          <Text type="p1" bold>
            {`${fee} USD`}
          </Text>
        </View>
      </View>
      <Text type="p1" style={styles.desc}>
        {LL.BankTransfer.desc4({ email: "fiat@blink.sv" })}
      </Text>
      <Text type="p1" style={styles.desc}>
        {LL.BankTransfer.desc5()}
      </Text>
      <PrimaryBtn
        label={LL.BankTransfer.backHome()}
        onPress={() => navigation.reset({ index: 0, routes: [{ name: "Primary" }] })}
        btnStyle={{ marginBottom: bottom + 20, marginTop: 20 }}
      />
    </Screen>
  )
}

export default BankTransfer

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  title: {
    textAlign: "center",
    marginBottom: 30,
  },
  desc: {
    marginBottom: 15,
  },
  bankDetails: {
    marginVertical: 20,
  },
  fieldContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.grey5,
    padding: 20,
    borderRadius: 10,
    marginBottom: 15,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.grey3,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    backgroundColor: colors.white,
    color: colors.black,
    marginTop: 8,
  },
  buttonGroup: {
    marginTop: 8,
  },
}))
