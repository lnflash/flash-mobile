import * as React from "react"
import { makeStyles } from "@rneui/themed"
import { Modal } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

// components
import { AmountInputScreen, MaxAmountButton } from "../amount-input-screen"

// types
import { WalletCurrency } from "@app/graphql/generated"
import { ConvertMoneyAmount } from "@app/screens/send-bitcoin-screen/payment-details"
import { MoneyAmount, WalletOrDisplayCurrency } from "@app/types/amounts"

export type AmountInputModalProps = {
  moneyAmount?: MoneyAmount<WalletOrDisplayCurrency>
  walletCurrency: WalletCurrency
  /** The wallet whose balance the keypad's header shows; defaults to `walletCurrency`. */
  balanceWalletCurrency?: WalletCurrency
  convertMoneyAmount: ConvertMoneyAmount
  onSetAmount?: (moneyAmount: MoneyAmount<WalletOrDisplayCurrency>) => void
  maxAmount?: MoneyAmount<WalletOrDisplayCurrency>
  minAmount?: MoneyAmount<WalletOrDisplayCurrency>
  maxAmountButton?: MaxAmountButton
  isOpen: boolean
  close: () => void
}

export const AmountInputModal: React.FC<AmountInputModalProps> = ({
  moneyAmount,
  walletCurrency,
  balanceWalletCurrency,
  onSetAmount,
  maxAmount,
  minAmount,
  maxAmountButton,
  convertMoneyAmount,
  isOpen,
  close,
}) => {
  const styles = useStyles()

  // Android's back key, and its back gesture (enableOnBackInvokedCallback is
  // off), reach a core Modal only as onRequestClose: without it, back does
  // nothing while the keypad is up.
  return (
    <Modal
      visible={isOpen}
      onRequestClose={close}
      style={styles.modal}
      animationType="slide"
    >
      <SafeAreaView style={styles.amountInputScreenContainer}>
        <AmountInputScreen
          initialAmount={moneyAmount}
          convertMoneyAmount={convertMoneyAmount}
          walletCurrency={walletCurrency}
          balanceWalletCurrency={balanceWalletCurrency}
          setAmount={onSetAmount}
          maxAmount={maxAmount}
          minAmount={minAmount}
          maxAmountButton={maxAmountButton}
          goBack={close}
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
