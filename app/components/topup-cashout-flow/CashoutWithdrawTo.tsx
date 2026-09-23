import React, { useState } from "react"
import { TouchableOpacity, View } from "react-native"
import { Icon, makeStyles, Text, useTheme } from "@rneui/themed"

import { useI18nContext } from "@app/i18n/i18n-react"
import { displayCurrencyCode } from "@app/utils/currency-display"
import { testProps } from "@app/utils/testProps"

import { CashoutAccountSource, last4Of, useCashoutAccounts } from "./use-cashout-accounts"

type Props = {
  /** Which rail's accounts to show: local (ERPNext) or Bridge external (US). */
  source?: CashoutAccountSource
  /** Payout currency already fixed by an offer; narrows the local selection. */
  preferredCurrency?: string
  /** The account chosen for this cashout; falls back to the server default. */
  selectedAccountId?: string
  /**
   * Makes the card a picker trigger: tapping it asks the screen to open its
   * CashoutAccountPicker (the sheet lives at the screen root, not in this
   * card — see CashoutAccountPicker). Without it the card is display-only (the
   * confirmation screen, where the offer is already locked to an account) and
   * tapping expands the account details.
   */
  onOpenPicker?: () => void
}

const CashoutWithdrawTo: React.FC<Props> = ({
  source = "local",
  preferredCurrency,
  selectedAccountId,
  onOpenPicker,
}) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const [expanded, setExpanded] = useState(false)

  const isPicker = Boolean(onOpenPicker)
  const { isBridge, bankAccount, externalAccount } = useCashoutAccounts({
    source,
    selectedAccountId,
    preferredCurrency,
  })

  const current = bankAccount ?? externalAccount
  // Display-only mode has nothing to show without an account; the picker still
  // renders so the user can reach "Manage bank accounts" and add one.
  if (!current && !isPicker) return null

  const maskedAccount = bankAccount
    ? `**********${last4Of(bankAccount.accountNumber)}`
    : externalAccount
    ? `${externalAccount.bankName} ••${externalAccount.accountNumberLast4}`
    : isBridge
    ? LL.Cashout.noExternalAccountFound()
    : LL.Cashout.noBankAccountFound()

  const onPressCard = () => {
    if (onOpenPicker) {
      onOpenPicker()
      return
    }
    setExpanded(!expanded)
  }

  return (
    <View>
      <Text type="bl" bold>
        {LL.Cashout.withdrawTo()}
      </Text>
      <TouchableOpacity
        style={styles.card}
        onPress={onPressCard}
        activeOpacity={0.7}
        {...testProps("cashout-withdraw-to")}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text type="bl">{maskedAccount}</Text>
            {isPicker && bankAccount && (
              <Text type="caption" color={colors.grey3}>
                {bankAccount.bankName} · {displayCurrencyCode(bankAccount.currency)}
              </Text>
            )}
          </View>
          <Icon
            name={expanded ? "chevron-down" : "chevron-forward"}
            type="ionicon"
            size={20}
            color={colors.grey3}
          />
        </View>
        {expanded && bankAccount && (
          <View style={styles.details}>
            <DetailRow label={LL.Cashout.bankName()} value={bankAccount.bankName} />
            <DetailRow label={LL.Cashout.bankBranch()} value={bankAccount.bankBranch} />
            <DetailRow
              label={LL.Cashout.accountNumber()}
              value={String(bankAccount.accountNumber)}
            />
            <DetailRow label={LL.Cashout.accountType()} value={bankAccount.accountType} />
            <DetailRow
              label={LL.Cashout.currency()}
              value={displayCurrencyCode(bankAccount.currency)}
            />
          </View>
        )}
      </TouchableOpacity>
    </View>
  )
}

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const styles = useStyles()
  return (
    <View style={styles.detailRow}>
      <Text type="bm" style={styles.detailLabel}>
        {label}
      </Text>
      <Text type="bm">{value}</Text>
    </View>
  )
}

export default CashoutWithdrawTo

const useStyles = makeStyles(({ colors }) => ({
  card: {
    borderRadius: 10,
    marginTop: 5,
    marginBottom: 15,
    padding: 15,
    backgroundColor: colors.grey5,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerText: {
    flex: 1,
    rowGap: 2,
    paddingRight: 12,
  },
  details: {
    marginTop: 12,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  detailLabel: {
    color: colors.grey3,
  },
}))
