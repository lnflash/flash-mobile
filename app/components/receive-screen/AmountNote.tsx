import React, { useEffect, useState } from "react"
import { View } from "react-native"
import { makeStyles } from "@rneui/themed"

// components
import { AmountInput } from "../amount-input"
import { NoteInput } from "../note-input"

// types
import { MoneyAmount, WalletOrDisplayCurrency } from "@app/types/amounts"
import { Invoice } from "@app/screens/receive-bitcoin-screen/payment/index.types"

// utils
import {
  fetchBreezLightningLimits,
  fetchBreezOnChainLimits,
} from "@app/utils/breez-sdk-liquid"

type Props = {
  request: any
}

const AmountNote: React.FC<Props> = ({ request }) => {
  const styles = useStyles()

  const [minAmount, setMinAmount] = useState<MoneyAmount<WalletOrDisplayCurrency>>()
  const [maxAmount, setMaxAmount] = useState<MoneyAmount<WalletOrDisplayCurrency>>()

  useEffect(() => {
    fetchMinMaxAmount()
  }, [request.receivingWalletDescriptor.currency, request.type])

  const fetchMinMaxAmount = async () => {
    if (request.receivingWalletDescriptor.currency === "BTC") {
      let limits
      if (request.type === Invoice.Lightning) {
        limits = await fetchBreezLightningLimits()
      } else if (request.type === Invoice.OnChain) {
        limits = await fetchBreezOnChainLimits()
      }

      setMinAmount({
        amount: limits?.receive.minSat || 0,
        currency: "BTC",
        currencyCode: "SAT",
      })
      setMaxAmount({
        amount: limits?.receive.maxSat || 0,
        currency: "BTC",
        currencyCode: "SAT",
      })
    } else {
      setMinAmount({
        amount: 1,
        currency: "USD",
        currencyCode: "USD",
      })
      setMaxAmount(undefined)
    }
  }

  if (request.type !== "PayCode") {
    return (
      <View style={styles.container}>
        <AmountInput
          request={request}
          unitOfAccountAmount={request.unitOfAccountAmount}
          setAmount={request.setAmount}
          canSetAmount={request.canSetAmount}
          convertMoneyAmount={request.convertMoneyAmount}
          walletCurrency={request.receivingWalletDescriptor.currency}
          showValuesIfDisabled={false}
          minAmount={minAmount}
          maxAmount={maxAmount}
          big={false}
          newDesign={true}
        />
        <NoteInput
          onBlur={request.setMemo}
          onChangeText={request.setMemoChangeText}
          value={request.memoChangeText || ""}
          editable={request.canSetMemo}
          style={{ marginTop: 10 }}
          big={false}
          newDesign={true}
        />
      </View>
    )
  } else {
    return null
  }
}

export default AmountNote

const useStyles = makeStyles(({ colors }) => ({
  container: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border01,
  },
}))
