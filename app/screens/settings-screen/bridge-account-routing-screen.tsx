import React from "react"
import { ActivityIndicator, Pressable, View } from "react-native"

import Clipboard from "@react-native-clipboard/clipboard"
import { Icon, Text, makeStyles, useTheme } from "@rneui/themed"

import { Screen } from "@app/components/screen"
import {
  useBridgeKycStatusQuery,
  useBridgeVirtualAccountQuery,
} from "@app/graphql/generated"
import { toastShow } from "@app/utils/toast"

type DetailRowProps = {
  label: string
  value?: string | null
  onCopy: () => void
}

const DetailRow = ({ label, value, onCopy }: DetailRowProps) => {
  const styles = useStyles()
  const { colors } = useTheme().theme

  return (
    <View style={styles.detailRow}>
      <View style={styles.detailText}>
        <Text type="p3" color={colors.grey1}>
          {label}
        </Text>
        <Text type="p1" bold selectable>
          {value || "-"}
        </Text>
      </View>
      {Boolean(value) && (
        <Pressable style={styles.copyButton} onPress={onCopy}>
          <Icon name="copy-outline" type="ionicon" size={20} color={colors.black} />
        </Pressable>
      )}
    </View>
  )
}

export const BridgeAccountRoutingScreen: React.FC = () => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { data: kycData, loading: kycLoading } = useBridgeKycStatusQuery({
    fetchPolicy: "cache-and-network",
  })
  const isApproved = kycData?.bridgeKycStatus === "approved"
  const { data, loading: accountLoading } = useBridgeVirtualAccountQuery({
    fetchPolicy: "cache-and-network",
    skip: !isApproved,
  })

  const account = data?.bridgeVirtualAccount
  const isLoading = kycLoading || (isApproved && accountLoading)

  const copyValue = (value: string, label: string) => {
    Clipboard.setString(value)
    toastShow({ type: "success", message: `${label} copied` })
  }

  const copyDetails = () => {
    if (!account?.bankName || !account?.accountNumber || !account?.routingNumber) {
      return
    }

    Clipboard.setString(
      [
        `Bank Name: ${account.bankName}`,
        `Account Number: ${account.accountNumber}`,
        `Routing Number: ${account.routingNumber}`,
      ].join("\n"),
    )
    toastShow({ type: "success", message: "Account details copied" })
  }

  if (isLoading) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator />
      </Screen>
    )
  }

  if (!isApproved) {
    return (
      <Screen preset="scroll" style={styles.container}>
        <Text type="h02" bold style={styles.title}>
          Your account and routing number
        </Text>
        <Text type="p1" color={colors.grey1}>
          Complete Bridge KYC to view your account and routing number.
        </Text>
      </Screen>
    )
  }

  if (!account?.bankName || !account?.accountNumber || !account?.routingNumber) {
    return (
      <Screen preset="scroll" style={styles.container}>
        <Text type="h02" bold style={styles.title}>
          Your account and routing number
        </Text>
        <Text type="p1" color={colors.grey1}>
          Your bank transfer details are not ready yet. Please try again later.
        </Text>
      </Screen>
    )
  }

  return (
    <Screen preset="scroll" style={styles.container}>
      <Text type="h02" bold style={styles.title}>
        Your account and routing number
      </Text>
      <Text type="p1" color={colors.grey1} style={styles.description}>
        Share these details with someone who wants to pay you by USD bank transfer. Funds
        sent to this account will be credited to your Flash Cash wallet after Bridge
        processes the transfer.
      </Text>

      <View style={styles.details}>
        <DetailRow
          label="Bank Name"
          value={account.bankName}
          onCopy={() => copyValue(account.bankName || "", "Bank name")}
        />
        <DetailRow
          label="Account Number"
          value={account.accountNumber}
          onCopy={() => copyValue(account.accountNumber || "", "Account number")}
        />
        <DetailRow
          label="Routing Number"
          value={account.routingNumber}
          onCopy={() => copyValue(account.routingNumber || "", "Routing number")}
        />
      </View>

      <Pressable style={styles.primaryButton} onPress={copyDetails}>
        <Icon name="copy-outline" type="ionicon" size={20} color={colors.white} />
        <Text type="p1" bold color={colors.white}>
          Copy all details
        </Text>
      </Pressable>

      <View style={styles.notice}>
        <Text type="p3" color={colors.grey1}>
          Use this account only for payments intended for your Flash account. Ask the
          sender to include your name in their transfer notes when possible.
        </Text>
      </View>
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    textAlign: "center",
    marginBottom: 12,
  },
  description: {
    marginBottom: 24,
  },
  details: {
    borderTopWidth: 1,
    borderTopColor: colors.grey4,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 76,
    borderBottomWidth: 1,
    borderBottomColor: colors.grey4,
  },
  detailText: {
    flex: 1,
    rowGap: 4,
    paddingRight: 16,
  },
  copyButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.grey5,
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 12,
    marginTop: 24,
    marginBottom: 20,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    columnGap: 8,
    backgroundColor: colors.primary,
  },
  notice: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.grey5,
  },
}))
