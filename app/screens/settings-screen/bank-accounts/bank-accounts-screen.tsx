import React, { useState } from "react"
import { ActivityIndicator, Alert, Pressable, View } from "react-native"

import Clipboard from "@react-native-clipboard/clipboard"
import { useFocusEffect, useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import { Icon, Text, makeStyles, useTheme } from "@rneui/themed"

import { Screen } from "@app/components/screen"
import { BridgeKycModal } from "@app/components/topup-cashout-flow"
import { WHATSAPP_SUPPORT_URL } from "@app/config"
import { AccountLevel } from "@app/graphql/generated"
import { useAccountStatus } from "@app/hooks/use-account-status"
import { useBridgeKyc } from "@app/hooks/use-bridge-kyc"
import { useI18nContext } from "@app/i18n/i18n-react"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { useAppDispatch } from "@app/store/redux"
import { setAccountUpgrade } from "@app/store/redux/slices/accountUpgradeSlice"
import { openWhatsAppUrl } from "@app/utils/external"
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
  const { LL } = useI18nContext()

  const copyValue = (value: string | null | undefined, message: string) => {
    if (!value) return
    Clipboard.setString(value)
    toastShow({ type: "success", message })
  }

  const copyAll = () => {
    Clipboard.setString(
      [
        `Bank Name: ${account.bankName}`,
        `Account Number: ${account.accountNumber ?? ""}`,
        `Routing Number: ${account.routingNumber ?? ""}`,
      ].join("\n"),
    )
    toastShow({ type: "success", message: LL.BankAccountsScreen.accountDetailsCopied() })
  }

  if (account.pending) {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text type="p1" bold>
            {LL.BankAccountsScreen.flashUsdAccount()}
          </Text>
          <StatusPill status="pending" />
        </View>
        <Text type="p3" color={colors.grey1}>
          {LL.BankAccountsScreen.receivingSetupPending()}
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text type="p1" bold>
          {LL.BankAccountsScreen.flashUsdAccount()}
        </Text>
        <StatusPill status="verified" />
      </View>

      <ReceiveRow
        label={LL.BankAccountsScreen.bankName()}
        value={account.bankName}
        onCopy={() => copyValue(account.bankName, LL.BankAccountsScreen.bankNameCopied())}
      />
      <ReceiveRow
        label={LL.BankAccountsScreen.accountNumber()}
        value={account.accountNumber}
        masked
        onCopy={() =>
          copyValue(account.accountNumber, LL.BankAccountsScreen.accountNumberCopied())
        }
      />
      <ReceiveRow
        label={LL.BankAccountsScreen.routingNumber()}
        value={account.routingNumber}
        onCopy={() =>
          copyValue(account.routingNumber, LL.BankAccountsScreen.routingNumberCopied())
        }
      />

      <Text type="p3" color={colors.grey1} style={styles.cardHint}>
        {LL.BankAccountsScreen.receiveCardHint()}
      </Text>
      <Pressable style={styles.secondaryButton} onPress={copyAll}>
        <Icon name="copy-outline" type="ionicon" size={18} color={colors.primary} />
        <Text type="p2" bold color={colors.primary}>
          {LL.BankAccountsScreen.copyAllDetails()}
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
  const { LL } = useI18nContext()

  const map: Record<BankAccountStatus, { label: string; color: string }> = {
    verified: { label: LL.BankAccountsScreen.verified(), color: colors.green },
    pending: { label: LL.BankAccountsScreen.pending(), color: colors.warning },
    actionRequired: {
      label: LL.BankAccountsScreen.actionNeeded(),
      color: colors.error,
    },
    unknown: { label: LL.BankAccountsScreen.unknownStatus(), color: colors.grey3 },
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
  onEdit: () => void
}

const WithdrawRow = ({ account, onSetDefault, onEdit }: WithdrawRowProps) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()

  const openActions = () => {
    const options: {
      text: string
      style?: "cancel" | "destructive"
      onPress?: () => void
    }[] = []
    if (account.canSetDefault && !account.isDefault) {
      options.push({ text: LL.BankAccountsScreen.setAsDefault(), onPress: onSetDefault })
    }
    if (account.source === "erpnext") {
      options.push({ text: LL.BankAccountsScreen.updateDetails(), onPress: onEdit })
    }
    options.push({
      text: account.canRemove
        ? LL.BankAccountsScreen.remove()
        : LL.BankAccountsScreen.removeComingSoon(),
      style: "destructive",
      onPress: () =>
        account.canRemove
          ? undefined // TODO: wire bridgeDeleteExternalAccount
          : toastShow({
              type: "warning",
              message: LL.BankAccountsScreen.removingAccountsComingSoon(),
            }),
    })
    options.push({ text: LL.common.cancel(), style: "cancel" })
    Alert.alert(
      account.bankName,
      LL.BankAccountsScreen.accountEnding({ last4: account.last4 }),
      options,
    )
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
                  {LL.BankAccountsScreen.defaultBadge()}
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
  const { LL } = useI18nContext()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()

  const { loading, kycApproved, receiveAccount, withdrawGroups, setDefault, refetch } =
    useBankAccounts()

  // The locked card gates on the usdAccount capability (Bridge KYC), so its
  // CTA launches the KYC flow directly (ENG-516). Bridge has an L1 floor:
  // unverified accounts are sent through the verify wizard first.
  const { kycModalVisible, startBridgeKyc, closeKycModal, submitBridgeKyc } =
    useBridgeKyc()
  const { capabilities } = useAccountStatus()
  const dispatch = useAppDispatch()
  const onVerifyIdentity = () => {
    if (!capabilities.verified) {
      dispatch(setAccountUpgrade({ accountType: AccountLevel.One, numOfSteps: 3 }))
      navigation.navigate("PersonalInformation")
      return
    }
    startBridgeKyc()
  }

  useFocusEffect(
    React.useCallback(() => {
      refetch()
    }, [refetch]),
  )

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
          {LL.BankAccountsScreen.receiveMoney()}
        </Text>
        <View style={styles.direction}>
          <Icon name="arrow-down" type="ionicon" size={14} color={colors.grey2} />
          <Text type="p4" color={colors.grey2}>
            {LL.BankAccountsScreen.intoFlash()}
          </Text>
        </View>
      </View>

      {kycApproved ? (
        receiveAccount ? (
          <ReceiveCard account={receiveAccount} />
        ) : (
          <View style={styles.card}>
            <Text type="p3" color={colors.grey1}>
              {LL.BankAccountsScreen.receivingNotReady()}
            </Text>
          </View>
        )
      ) : (
        <View style={styles.lockedCard}>
          <View style={styles.lockedIconRow}>
            <Icon name="lock-closed" type="ionicon" size={32} color={colors.primary} />
          </View>
          <Text type="p1" bold style={styles.lockedTitle}>
            {LL.BankAccountsScreen.verifyIdentityTitle()}
          </Text>
          <Text type="p3" color={colors.grey1} style={styles.lockedDesc}>
            {LL.BankAccountsScreen.verifyIdentityDescription()}
          </Text>
          <Pressable style={styles.upgradeButton} onPress={onVerifyIdentity}>
            <Icon
              name="shield-checkmark-outline"
              type="ionicon"
              size={20}
              color={colors.white}
            />
            <Text type="p1" bold color={colors.white}>
              {LL.BankAccountsScreen.upgradeYourAccount()}
            </Text>
          </Pressable>
        </View>
      )}

      {/* WITHDRAW */}
      <View style={styles.sectionHeader}>
        <Text type="p2" bold color={colors.grey1}>
          {LL.BankAccountsScreen.withdrawTo()}
        </Text>
        <View style={styles.direction}>
          <Icon name="arrow-up" type="ionicon" size={14} color={colors.grey2} />
          <Text type="p4" color={colors.grey2}>
            {LL.BankAccountsScreen.outOfFlash()}
          </Text>
        </View>
      </View>
      <Text type="p3" color={colors.grey1} style={styles.subhint}>
        {LL.BankAccountsScreen.defaultHint()}
      </Text>

      {withdrawGroups.length === 0 ? (
        <View style={styles.card}>
          <Text type="p3" color={colors.grey1}>
            {LL.BankAccountsScreen.noWithdrawalAccounts()}
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
                  onSetDefault={() => {
                    if (account.isDefault) return
                    setDefault(account)
                    toastShow({
                      type: "success",
                      message: LL.BankAccountsScreen.defaultUpdated(),
                    })
                  }}
                  onEdit={() =>
                    navigation.navigate("EditBankAccount", {
                      accountId: account.id,
                      bankName: account.bankName,
                      bankBranch: account.bankBranch ?? "",
                      accountType: account.accountType ?? "",
                      accountNumber: account.accountNumber ?? "",
                      currency: account.currencyRaw ?? account.currency,
                      rejectionReason:
                        account.pendingUpdate?.rejectionReason ?? undefined,
                    })
                  }
                />
              ))}
            </View>
          </View>
        ))
      )}

      <Pressable
        style={[styles.primaryButton, !kycApproved && styles.disabled]}
        disabled={!kycApproved}
        onPress={() =>
          navigation.navigate("BridgeAddExternalAccount", { returnTo: "BankAccounts" })
        }
      >
        <Icon name="add" type="ionicon" size={20} color={colors.white} />
        <Text type="p1" bold color={colors.white}>
          {LL.BankAccountsScreen.addBankAccount()}
        </Text>
      </Pressable>

      <Pressable
        style={styles.supportButton}
        onPress={() => openWhatsAppUrl(WHATSAPP_SUPPORT_URL)}
      >
        <Icon name="logo-whatsapp" type="ionicon" size={20} color={colors.primary} />
        <Text type="p2" bold color={colors.primary}>
          {LL.BankAccountsScreen.contactSupport()}
        </Text>
      </Pressable>

      <BridgeKycModal
        visible={kycModalVisible}
        onClose={closeKycModal}
        onSubmit={submitBridgeKyc}
      />
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 24,
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
  lockedCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.black,
    padding: 20,
    alignItems: "center",
    rowGap: 8,
  },
  lockedIconRow: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.grey5,
    marginBottom: 4,
  },
  lockedDesc: {
    textAlign: "center",
    marginBottom: 8,
  },
  upgradeButton: {
    minHeight: 52,
    borderRadius: 12,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    columnGap: 8,
    backgroundColor: colors.primary,
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
  supportButton: {
    minHeight: 48,
    borderRadius: 12,
    marginBottom: 24,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    columnGap: 8,
  },
}))
