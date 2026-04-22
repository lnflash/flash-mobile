import React from "react"
import { View, TouchableOpacity } from "react-native"
import { Card, Text, makeStyles } from "@rneui/themed"
import Clipboard from "@react-native-clipboard/clipboard"
import { TransactionWithSwapDetails } from "@app/types/transaction"
import { useI18nContext } from "@app/i18n/i18n-react"
import { toastShow } from "@app/utils/toast"

interface SwapDetailsProps {
  transaction: TransactionWithSwapDetails
}

const truncate = (str: string, length: number): string => {
  if (str.length <= length) return str
  return str.substring(0, length) + "..."
}

export const SwapDetails: React.FC<SwapDetailsProps> = ({ transaction }) => {
  const { LL } = useI18nContext()
  const styles = useStyles()

  const handleCopy = (value: string) => {
    Clipboard.setString(value)
    toastShow({
      type: "success",
      message: (translations) => translations.common.copied(),
      position: "top",
      autoHide: true,
    })
  }

  const CopyableRow: React.FC<{ label: string; value: string; fullValue?: boolean }> = ({
    label,
    value,
    fullValue = false,
  }) => (
    <TouchableOpacity onPress={() => handleCopy(value)} style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueContainer}>
        <Text style={styles.value} selectable>
          {fullValue ? value : truncate(value, 20)}
        </Text>
      </View>
    </TouchableOpacity>
  )

  return (
    <Card containerStyle={styles.card}>
      <Text style={styles.title}>
        {LL.TransactionDetailScreen.swapDetails()}
      </Text>

      {transaction.initiationVia.__typename === "InitiationViaOnChain" && (
        <CopyableRow
          label={LL.TransactionDetailScreen.destinationAddress()}
          value={transaction.initiationVia.address}
          fullValue
        />
      )}

      {transaction.swapId && (
        <CopyableRow
          label={LL.TransactionDetailScreen.swapId()}
          value={transaction.swapId}
        />
      )}

      {transaction.lockupTxId && (
        <CopyableRow
          label={LL.TransactionDetailScreen.lockupTxId()}
          value={transaction.lockupTxId}
        />
      )}

      {transaction.claimTxId && (
        <CopyableRow
          label={LL.TransactionDetailScreen.claimTxId()}
          value={transaction.claimTxId}
        />
      )}

      {transaction.swapperFeesSat !== undefined && (
        <CopyableRow
          label={LL.TransactionDetailScreen.swapFees()}
          value={`${transaction.swapperFeesSat} ${LL.common.sats()}`}
        />
      )}

      {transaction.bitcoinExpirationBlockheight !== undefined && (
        <CopyableRow
          label={LL.TransactionDetailScreen.expirationBlockHeight()}
          value={transaction.bitcoinExpirationBlockheight.toString()}
        />
      )}
    </Card>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  card: {
    marginHorizontal: 16,
    marginBottom: 26,
    borderRadius: 16,
    elevation: 2,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
    color: colors.black,
  },
  row: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    marginBottom: 8,
    color: colors.grey2,
    fontWeight: "500",
  },
  valueContainer: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.grey5,
  },
  value: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.black,
  },
}))
