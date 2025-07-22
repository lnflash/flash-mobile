import React from "react"
import { View } from "react-native"
import { makeStyles, Text } from "@rneui/themed"
import { useSafeAreaInsets } from "react-native-safe-area-context"

// components
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"

const BankTransferScreen = () => {
  const styles = useStyles()
  const { bottom } = useSafeAreaInsets()

  return (
    <Screen preset="scroll" style={{ paddingHorizontal: 20 }}>
      <Text type="h02" bold style={styles.title}>
        Bank Transfer
      </Text>
      <Text type="p1" style={styles.desc}>
        Your order has been created. To complete the order, please transfer $102 USD to
        the bank details provided below.
      </Text>
      <Text type="p1" style={styles.desc}>
        Use UUM7MJRD as the reference description. This unique code will help us associate
        the payment with your Flash account and process the Bitcoin transfer.
      </Text>
      <Text type="p1" style={styles.desc}>
        After we have received your payment, you will be credited with $100 USD in your
        Cash wallet, with a $2 USD fee deducted. You can then choose when you convert
        those USD to Bitcoin on your own using the Convert functionality in the mobile
        app.
      </Text>
      <View style={styles.bankDetails}>
        <View style={styles.fieldContainer}>
          <Text type="bl">Account Type</Text>
          <Text type="p1" bold>
            Checking
          </Text>
        </View>
        <View style={styles.fieldContainer}>
          <Text type="bl">Destination Bank</Text>
          <Text type="p1" bold>
            Banco Hipotecario
          </Text>
        </View>
        <View style={styles.fieldContainer}>
          <Text type="bl">Account Number</Text>
          <Text type="p1" bold>
            00210312362
          </Text>
        </View>
        <View style={styles.fieldContainer}>
          <Text type="bl">Type of Client</Text>
          <Text type="p1" bold>
            Corporate
          </Text>
        </View>
        <View style={styles.fieldContainer}>
          <Text type="bl">Receiver's Name</Text>
          <Text type="p1" bold>
            BBW SA de CV
          </Text>
        </View>
        <View style={styles.fieldContainer}>
          <Text type="bl">Email</Text>
          <Text type="p1" bold>
            fiat@blink.sv
          </Text>
        </View>
        <View style={styles.fieldContainer}>
          <Text type="bl">Amount</Text>
          <Text type="p1" bold>
            102 USD
          </Text>
        </View>
        <View style={styles.fieldContainer}>
          <Text type="bl">Unique Code</Text>
          <Text type="p1" bold>
            UUM7MJRD
          </Text>
        </View>
        <View style={styles.fieldContainer}>
          <Text type="bl">Fees</Text>
          <Text type="p1" bold>
            2 USD
          </Text>
        </View>
      </View>
      <Text type="p1" style={styles.desc}>
        After payment completion on your end you can send us an email to fiat@blink.sv
        with a screenshot of your payment confirmation.
      </Text>
      <Text type="p1" style={styles.desc}>
        Your payment will be processed even if we don't receive this email, but having
        this confirmation can help accelerate the order.
      </Text>
      <PrimaryBtn
        label="Back to Home"
        onPress={() => {}}
        btnStyle={{ marginBottom: bottom + 20, marginTop: 20 }}
      />
    </Screen>
  )
}

export default BankTransferScreen

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
