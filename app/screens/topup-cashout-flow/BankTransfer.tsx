import React from "react"
import { View, Linking, TouchableOpacity } from "react-native"
import { makeStyles, Text } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useSafeAreaInsets } from "react-native-safe-area-context"

// components
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"

// config
import { WHATSAPP_SUPPORT_URL } from "@app/config"

// gql
import { useBridgeVirtualAccountQuery } from "@app/graphql/generated"

type Props = StackScreenProps<RootStackParamList, "BankTransfer">

const BankTransfer: React.FC<Props> = ({ navigation, route }) => {
  const styles = useStyles()
  const { bottom } = useSafeAreaInsets()
  const { LL } = useI18nContext()
  const backHomeButtonStyle = React.useMemo(
    () => [styles.backHomeButton, { marginBottom: bottom + 20 }],
    [bottom, styles.backHomeButton],
  )

  const { data } = useBridgeVirtualAccountQuery()

  const { amount, paymentType } = route.params
  const fee = amount * 0.02

  if (paymentType === "bridge") {
    return (
      <Screen preset="scroll" style={styles.container}>
        <Text type="h02" bold style={styles.title}>
          {LL.BankTransfer.virtualBankTransfer()}
        </Text>
        <Text type="p1" style={styles.desc}>
          {LL.BankTransfer.desc1({ amount: amount + fee })}
        </Text>
        <View style={styles.fieldContainer}>
          <Text type="bl">{LL.BankTransfer.bankName()}</Text>
          <Text type="p1" bold>
            {data?.bridgeVirtualAccount?.bankName}
          </Text>
        </View>
        <View style={styles.fieldContainer}>
          <Text type="bl">{LL.BankTransfer.accountNumber()}</Text>
          <Text type="p1" bold>
            {data?.bridgeVirtualAccount?.accountNumber}
          </Text>
        </View>
        <View style={styles.fieldContainer}>
          <Text type="bl">{LL.BankTransfer.routingNumber()}</Text>
          <Text type="p1" bold>
            {data?.bridgeVirtualAccount?.routingNumber}
          </Text>
        </View>
        <PrimaryBtn
          label={LL.BankTransfer.backHome()}
          onPress={() => navigation.reset({ index: 0, routes: [{ name: "Primary" }] })}
          btnStyle={backHomeButtonStyle}
        />
      </Screen>
    )
  }

  return (
    <Screen preset="scroll" style={styles.container}>
      <Text type="h02" bold style={styles.title}>
        Bank Transfer
      </Text>
      <View style={styles.messageContainer}>
        <Text type="p1" style={styles.messageText}>
          Contact Support for Banking Information to Top up
        </Text>
        <TouchableOpacity
          style={styles.whatsappButton}
          onPress={() => Linking.openURL(WHATSAPP_SUPPORT_URL)}
        >
          <Text style={styles.whatsappButtonText}>
            Chat on WhatsApp
          </Text>
        </TouchableOpacity>
      </View>
      <PrimaryBtn
        label={LL.BankTransfer.backHome()}
        onPress={() => navigation.reset({ index: 0, routes: [{ name: "Primary" }] })}
        btnStyle={backHomeButtonStyle}
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
  messageContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  messageText: {
    textAlign: "center",
    marginBottom: 24,
  },
  whatsappButton: {
    backgroundColor: "#25D366",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  whatsappButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
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
  backHomeButton: {
    marginTop: 20,
  },
}))
