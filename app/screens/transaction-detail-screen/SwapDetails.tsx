import React from "react"
import { View, TouchableOpacity, StyleSheet } from "react-native"
import { Card, Text, useTheme } from "@rneui/themed"
import Clipboard from "@react-native-clipboard/clipboard"
import { TransactionWithSwapDetails } from "@app/types/transaction"
import { useI18nContext } from "@app/i18n/i18n-react"

interface SwapDetailsProps {
  transaction: TransactionWithSwapDetails
}

const truncate = (str: string, length: number): string => {
  if (str.length <= length) return str
  return str.substring(0, length) + "..."
}

export const SwapDetails: React.FC<SwapDetailsProps> = ({ transaction }) => {
  const { LL } = useI18nContext()
  const { colors } = useTheme().theme

  const handleCopy = (value: string) => {
    Clipboard.setString(value)
  }

  const CopyableRow: React.FC<{ label: string; value: string; fullValue?: boolean }> = ({
    label,
    value,
    fullValue = false,
  }) => (
    <TouchableOpacity onPress={() => handleCopy(value)} style={styles.row}>
      <Text style={[styles.label, { color: colors.grey2 }]}>{label}</Text>
      <View style={[styles.valueContainer, { backgroundColor: colors.grey5 }]}>
        <Text style={[styles.value, { color: colors.black }]} selectable>
          {fullValue ? value : truncate(value, 20)}
        </Text>
      </View>
    </TouchableOpacity>
  )

  return (
    <Card containerStyle={styles.card}>
      <Text style={[styles.title, { color: colors.black }]}>
        Swap Details
      </Text>
      
      {transaction.initiationVia.__typename === "InitiationViaOnChain" && (
        <CopyableRow
          label="Destination Address"
          value={transaction.initiationVia.address}
          fullValue
        />
      )}
      
      {transaction.swapId && (
        <CopyableRow label="Swap ID" value={transaction.swapId} />
      )}
      
      {transaction.lockupTxId && (
        <CopyableRow
          label="Lockup Transaction"
          value={transaction.lockupTxId}
        />
      )}
      
      {transaction.claimTxId && (
        <CopyableRow
          label="Claim Transaction"
          value={transaction.claimTxId}
        />
      )}
      
      {transaction.swapperFeesSat !== undefined && (
        <CopyableRow
          label="Swap Fees"
          value={`${transaction.swapperFeesSat} sats`}
        />
      )}
      
      {transaction.bitcoinExpirationBlockheight !== undefined && (
        <CopyableRow
          label="Expires at Block"
          value={transaction.bitcoinExpirationBlockheight.toString()}
        />
      )}
    </Card>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 26,
    borderRadius: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  row: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    marginBottom: 8,
  },
  valueContainer: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  value: {
    fontSize: 15,
    fontWeight: "500",
  },
})
