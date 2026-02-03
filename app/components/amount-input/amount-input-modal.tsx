import * as React from "react"
import { makeStyles } from "@rneui/themed"
import { Modal, SafeAreaView } from "react-native"

// components
import { AmountInputScreen } from "../amount-input-screen"

// types
import { WalletCurrency } from "@app/graphql/generated"
import { ConvertMoneyAmount } from "@app/screens/send-bitcoin-screen/payment-details"
import { MoneyAmount, WalletOrDisplayCurrency } from "@app/types/amounts"

export type AmountInputModalProps = {
  moneyAmount?: MoneyAmount<WalletOrDisplayCurrency>
  walletCurrency: WalletCurrency
  convertMoneyAmount: ConvertMoneyAmount
  onSetAmount?: (moneyAmount: MoneyAmount<WalletOrDisplayCurrency>) => void
  maxAmount?: MoneyAmount<WalletOrDisplayCurrency>
  minAmount?: MoneyAmount<WalletOrDisplayCurrency>
  isOpen: boolean
  close: () => void
  title: string
}

export const AmountInputModal: React.FC<AmountInputModalProps> = ({
  moneyAmount,
  walletCurrency,
  onSetAmount,
  maxAmount,
  minAmount,
  convertMoneyAmount,
  isOpen,
  close,
  title,
}) => {
  const styles = useStyles()

  return (
    <Modal visible={isOpen} style={styles.modal} animationType="slide">
      <SafeAreaView style={styles.amountInputScreenContainer}>
        <AmountInputScreen
          initialAmount={moneyAmount}
          convertMoneyAmount={convertMoneyAmount}
          walletCurrency={walletCurrency}
          setAmount={onSetAmount}
          maxAmount={maxAmount}
          minAmount={minAmount}
          goBack={close}
          title={title}
        />
      </SafeAreaView>
    </Modal>
  )
}

const useStyles = makeStyles(({ colors, mode }) => ({
  amountInputScreenContainer: {
    flex: 1,
    backgroundColor: mode === "light" ? colors.white : "#007856",
  },
  modal: {
    margin: 0,
  },
}))
