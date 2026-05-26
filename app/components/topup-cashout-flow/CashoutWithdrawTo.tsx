import React, { useState } from "react"
import { TouchableOpacity, View } from "react-native"
import { Icon, makeStyles, Text, useTheme } from "@rneui/themed"

import { useI18nContext } from "@app/i18n/i18n-react"
import { useBankAccountsQuery } from "@app/graphql/generated"

const CashoutWithdrawTo: React.FC = () => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const [expanded, setExpanded] = useState(false)

  const { data } = useBankAccountsQuery({ fetchPolicy: "cache-only" })

  const bankAccount =
    data?.me?.bankAccounts.find((el) => el.isDefault) || data?.me?.bankAccounts[0]

  if (!bankAccount) return null

  const maskedAccount = `**********${String(bankAccount.accountNumber).slice(-4)}`

  return (
    <View>
      <Text type="bl" bold>
        {LL.Cashout.withdrawTo()}
      </Text>
      <TouchableOpacity
        style={styles.card}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={styles.header}>
          <Text type="bl">{maskedAccount}</Text>
          <Icon
            name={expanded ? "chevron-down" : "chevron-forward"}
            type="ionicon"
            size={20}
            color={colors.grey3}
          />
        </View>
        {expanded && (
          <View style={styles.details}>
            <DetailRow label={LL.Cashout.bankName()} value={bankAccount.bankName} />
            <DetailRow label={LL.Cashout.bankBranch()} value={bankAccount.bankBranch} />
            <DetailRow
              label={LL.Cashout.accountNumber()}
              value={String(bankAccount.accountNumber)}
            />
            <DetailRow label={LL.Cashout.accountType()} value={bankAccount.accountType} />
            <DetailRow label={LL.Cashout.currency()} value={bankAccount.currency} />
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
