import { AmountInput } from "@app/components/amount-input"
import { CashoutPercentage } from "@app/components/cashout-flow"
import { Screen } from "@app/components/screen"
import { useDisplayCurrency, usePriceConversion } from "@app/hooks"
import { MoneyAmount, WalletOrDisplayCurrency } from "@app/types/amounts"
import { makeStyles } from "@rneui/themed"
import React, { useState } from "react"
import { ScrollView } from "react-native-gesture-handler"

const CashoutDetails = () => {
  const styles = useStyles()
  const { zeroDisplayAmount } = useDisplayCurrency()
  const { convertMoneyAmount } = usePriceConversion()

  const [moneyAmount, setMoneyAmount] =
    useState<MoneyAmount<WalletOrDisplayCurrency>>(zeroDisplayAmount)

  return (
    <Screen>
      <ScrollView style={styles.scrollViewContainer}>
        <AmountInput
          unitOfAccountAmount={moneyAmount}
          walletCurrency={"USD"}
          setAmount={setMoneyAmount}
          convertMoneyAmount={convertMoneyAmount as keyof typeof convertMoneyAmount}
        />
        <CashoutPercentage
          fromWalletCurrency={"USD"}
          setAmountToBalancePercentage={() => {}}
        />
      </ScrollView>
    </Screen>
  )
}

export default CashoutDetails

const useStyles = makeStyles(({ colors }) => ({
  scrollViewContainer: {
    flex: 1,
    flexDirection: "column",
    margin: 20,
  },
  buttonContainer: { marginHorizontal: 20, marginBottom: 20 },
}))
