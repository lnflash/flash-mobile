import React, { useState } from "react"
import { ActivityIndicator, Alert, Pressable, View } from "react-native"

import Clipboard from "@react-native-clipboard/clipboard"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import { Icon, Text, makeStyles, useTheme } from "@rneui/themed"

import { Screen } from "@app/components/screen"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { toastShow } from "@app/utils/toast"

import { BankAccountStatus, BankAccountVM } from "./types"
import { useBankAccounts } from "./use-bank-accounts"

// ---------------------------------------------------------------------------
// Receive (money-in) — the single Flash virtual account, read-only.
// ---------------------------------------------------------------------------

type ReceiveRowProps = {
  label: string
  value?: string | null
  masked?: boolean
  onCopy: () => void
}

const ReceiveRow = ({ label, value, masked, onCopy }: ReceiveRowProps) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const [revealed, setRevealed] = useState(!masked)

  const shown = revealed ? value : value ? `••••${String(value).slice(-4)}` : "-"

  return (
    <View style={styles.detailRow}>
      <View style={styles.detailText}>
        <Text type="p3" color={colors.grey1}>
          {label}
        </Text>
        <Text type="p1" bold selectable>
          {shown || "-"}
        </Text>
      </View>
      <View style={styles.rowActions}>
        {masked && Boolean(value) && (
          <Pressable style={styles.iconButton} onPress={() => setRevealed((r) => !r)}>
            <Icon
              name={revealed ? "eye-off-outline" : "eye-outline"}
              type="ionicon"
              size={20}
              color={colors.black}
            />
          </Pressable>
        )}
        {Boolean(value) && (
          <Pressable style={styles.iconButton} onPress={onCopy}>
            <Icon name="copy-outline" type="ionicon" size={20} color={colors.black} />
          </Pressable>
        )}
      </View>
    </View>
  )
}

const ReceiveCard = ({ account }: { account: BankAccountVM }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme

  const copyValue = (value: string | null | undefined, label: string) => {
    if (!value) return
    Clipboard.setString(value)
    toastShow({ type: "success", message: `${label} copied` })
  }

  const copyAll = () => {
    Clipboard.setString(
      [
        `Bank Name: ${account.bankName}`,
        `Account Number: ${account.accountNumber ?? ""}`,
        `Routing Number: ${account.routingNumber ?? ""}`,
      ].join("\n"),
    )
    toastShow({ type: "success", message: "Account details copied" })
  }

  if (account.pending) {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text type="p1" bold>
            Your Flash USD account
          </Text>
          <StatusPill status="pending" />
        </View>
        <Text type="p3" color={colors.grey1}>
          Your bank transfer details are being set up. Check back soon.
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text type="p1" bold>
          Your Flash USD account
        </Text>
        <StatusPill status="verified" />
      </View>

      <ReceiveRow
        label="Bank Name"
        value={account.bankName}
        onCopy={() => copyValue(account.bankName, "Bank name")}
      />
      <ReceiveRow
        label="Account Number"
        value={account.accountNumber}
        masked
        onCopy={() => copyValue(account.accountNumber, "Account number")}
      />
      <ReceiveRow
        label="Routing Number"
        value={account.routingNumber}
        onCopy={() => copyValue(account.routingNumber, "Routing number")}
      />

      <Text type="p3" color={colors.grey1} style={styles.cardHint}>
        Share these to receive USD bank transfers into Flash Cash.
      </Text>
      <Pressable style={styles.secondaryButton} onPress={copyAll}>
        <Icon name="copy-outline" type="ionicon" size={18} color={colors.primary} />
        <Text type="p2" bold color={colors.primary}>
          Copy all details
        </Text>
      </Pressable>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

const StatusPill = ({ status }: { status: BankAccountStatus }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme

  const map: Record<BankAccountStatus, { label: string; color: string }> = {
    verified: { label: "Verified", color: colors.green },
    pending: { label: "Pending", color: colors.warning },
    actionRequired: { label: "Action needed", color: colors.error },
    unknown: { label: "—", color: colors.grey3 },
  }
  const { label, color } = map[status]

  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <Text type="p4" bold color={color}>
        {label}
      </Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Withdraw (money-out) — grouped by currency, one default per currency.
// ---------------------------------------------------------------------------

type WithdrawRowProps = {
  account: BankAccountVM
  onSetDefault: () => void
}

const WithdrawRow = ({ account, onSetDefault }: WithdrawRowProps) => {
  const styles = useStyles()
  const { colors } = useTheme().theme

  const openActions = () => {
    const options: {
      text: string
      style?: "cancel" | "destructive"
      onPress?: () => void
    }[] = []
    if (account.canSetDefault && !account.isDefault) {
      options.push({ text: "Set as default", onPress: onSetDefault })
    }
    options.push({
      text: account.canRemove ? "Remove" : "Remove (coming soon)",
      style: "destructive",
      onPress: () =>
        account.canRemove
          ? undefined // TODO: wire bridgeDeleteExternalAccount
          : toastShow({
              type: "warning",
              message: "Removing accounts is coming soon",
            }),
    })
    options.push({ text: "Cancel", style: "cancel" })
    Alert.alert(account.bankName, `Account ending ${account.last4}`, options)
  }

  return (
    <View style={styles.detailRow}>
      <Pressable
        style={styles.radioTap}
        onPress={account.canSetDefault ? onSetDefault : undefined}
      >
        <Icon
          name={account.isDefault ? "radio-button-on" : "radio-button-off"}
          type="ionicon"
          size={22}
          color={account.isDefault ? colors.primary : colors.grey3}
        />
        <View style={styles.withdrawText}>
          <View style={styles.sideToSide}>
            <Text type="p1" bold>
              {account.bankName}
            </Text>
            {account.isDefault && (
              <View style={styles.defaultBadge}>
                <Text type="p4" bold color={colors.white}>
                  Default
                </Text>
              </View>
            )}
          </View>
          <View style={styles.sideToSide}>
            <Text type="p3" color={colors.grey1}>
              ••••{account.last4}
            </Text>
            <StatusPill status={account.status} />
          </View>
        </View>
      </Pressable>
      <Pressable style={styles.iconButton} onPress={openActions}>
        <Icon name="ellipsis-horizontal" type="ionicon" size={20} color={colors.grey2} />
      </Pressable>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export const BankAccountsScreen: React.FC = () => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()

  const { loading, kycApproved, receiveAccount, withdrawGroups, setDefault } =
    useBankAccounts()

  if (loading) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator />
      </Screen>
    )
  }

  return (
    <Screen preset="scroll" style={styles.container}>
      {/* RECEIVE */}
      <View style={styles.sectionHeader}>
        <Text type="p2" bold color={colors.grey1}>
          RECEIVE MONEY
        </Text>
        <View style={styles.direction}>
          <Icon name="arrow-down" type="ionicon" size={14} color={colors.grey2} />
          <Text type="p4" color={colors.grey2}>
            into Flash
          </Text>
        </View>
      </View>

      {kycApproved ? (
        receiveAccount ? (
          <ReceiveCard account={receiveAccount} />
        ) : (
          <View style={styles.card}>
            <Text type="p3" color={colors.grey1}>
              Your receiving account is not ready yet. Please try again later.
            </Text>
          </View>
        )
      ) : (
        <View style={styles.card}>
          <Text type="p1" bold style={styles.lockedTitle}>
            Verify identity to unlock
          </Text>
          <Text type="p3" color={colors.grey1}>
            Complete verification to get your USD account and routing number and to add
            withdrawal banks.
          </Text>
        </View>
      )}

      {/* WITHDRAW */}
      <View style={styles.sectionHeader}>
        <Text type="p2" bold color={colors.grey1}>
          WITHDRAW TO
        </Text>
        <View style={styles.direction}>
          <Icon name="arrow-up" type="ionicon" size={14} color={colors.grey2} />
          <Text type="p4" color={colors.grey2}>
            out of Flash
          </Text>
        </View>
      </View>
      <Text type="p3" color={colors.grey1} style={styles.subhint}>
        Your default account is auto-selected at cash-out. You can change it any time.
      </Text>

      {withdrawGroups.length === 0 ? (
        <View style={styles.card}>
          <Text type="p3" color={colors.grey1}>
            No withdrawal accounts yet. Add one to cash out.
          </Text>
        </View>
      ) : (
        withdrawGroups.map((group) => (
          <View key={group.currency} style={styles.group}>
            <Text type="p3" bold color={colors.grey2} style={styles.groupTitle}>
              {group.currency}
            </Text>
            <View style={styles.groupBody}>
              {group.accounts.map((account) => (
                <WithdrawRow
                  key={account.key}
                  account={account}
                  onSetDefault={() => setDefault(account)}
                />
              ))}
            </View>
          </View>
        ))
      )}

      <Pressable
        style={[styles.primaryButton, !kycApproved && styles.disabled]}
        disabled={!kycApproved}
        onPress={() => navigation.navigate("BridgeAddExternalAccount")}
      >
        <Icon name="add" type="ionicon" size={20} color={colors.white} />
        <Text type="p1" bold color={colors.white}>
          Add bank account
        </Text>
      </Pressable>
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
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 20,
    marginBottom: 10,
  },
  direction: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 4,
  },
  subhint: {
    marginBottom: 12,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    rowGap: 8,
    backgroundColor: colors.grey5,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  cardHint: {
    marginTop: 8,
  },
  lockedTitle: {
    marginBottom: 4,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 64,
    borderBottomWidth: 1,
    borderBottomColor: colors.grey4,
  },
  detailText: {
    flex: 1,
    rowGap: 4,
    paddingRight: 16,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 4,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: 10,
    marginTop: 4,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    columnGap: 8,
  },
  pill: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  group: {
    marginBottom: 12,
  },
  groupTitle: {
    marginBottom: 6,
  },
  groupBody: {
    borderTopWidth: 1,
    borderTopColor: colors.grey4,
  },
  radioTap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    columnGap: 12,
    paddingRight: 12,
  },
  withdrawText: {
    flex: 1,
    rowGap: 4,
  },
  sideToSide: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  defaultBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: colors.primary,
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 12,
    marginTop: 12,
    marginBottom: 24,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    columnGap: 8,
    backgroundColor: colors.primary,
  },
  disabled: {
    opacity: 0.5,
  },
}))
