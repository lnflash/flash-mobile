import * as React from "react"
import { WalletCurrency } from "@app/graphql/generated"
import { useDisplayCurrency } from "@app/hooks/use-display-currency"
import { useI18nContext } from "@app/i18n/i18n-react"
import { ConvertMoneyAmount } from "@app/screens/send-bitcoin-screen/payment-details"
import {
  DisplayCurrency,
  isNonZeroMoneyAmount,
  MoneyAmount,
  WalletOrDisplayCurrency,
} from "@app/types/amounts"
import { testProps } from "@app/utils/testProps"
import { MaxAmountButton } from "../amount-input-screen"
import { AmountInputModal } from "./amount-input-modal"
import { AmountInputButton } from "./amount-input-button"

export type AmountInputProps = {
  unitOfAccountAmount?: MoneyAmount<WalletOrDisplayCurrency>
  walletCurrency: WalletCurrency
  /**
   * The wallet whose balance the keypad's header shows, when the amount is
   * paid from another wallet than `walletCurrency` names (a Cashu card top-up
   * is entered in the card's unit and paid from the Cash wallet). Defaults to
   * `walletCurrency`.
   */
  balanceWalletCurrency?: WalletCurrency
  convertMoneyAmount: ConvertMoneyAmount
  setAmount?: (moneyAmount: MoneyAmount<WalletOrDisplayCurrency>) => void
  maxAmount?: MoneyAmount<WalletOrDisplayCurrency>
  minAmount?: MoneyAmount<WalletOrDisplayCurrency>
  maxAmountButton?: MaxAmountButton
  canSetAmount?: boolean
  isSendingMax?: boolean
  showValuesIfDisabled?: boolean
  big?: boolean
  newDesign?: boolean
  /**
   * Open the keypad as the field mounts, on a screen whose first job is taking
   * an amount. Read once, at mount; later changes are ignored, so a screen that
   * decides later mounts the field once it has decided.
   */
  initiallyOpen?: boolean
}

export const AmountInput: React.FC<AmountInputProps> = ({
  unitOfAccountAmount,
  walletCurrency,
  balanceWalletCurrency,
  setAmount,
  maxAmount,
  minAmount,
  maxAmountButton,
  convertMoneyAmount,
  canSetAmount = true,
  isSendingMax = false,
  showValuesIfDisabled = true,
  big = true,
  newDesign = false,
  initiallyOpen = false,
}) => {
  const { LL } = useI18nContext()
  const { formatMoneyAmount, getSecondaryAmountIfCurrencyIsDifferent } =
    useDisplayCurrency()

  const [isSettingAmount, setIsSettingAmount] = React.useState(initiallyOpen)

  const onSetAmount = (amount: MoneyAmount<WalletOrDisplayCurrency>) => {
    setAmount && setAmount(amount)
    setIsSettingAmount(false)
  }

  let formattedPrimaryAmount = undefined
  let formattedSecondaryAmount = undefined

  if (isNonZeroMoneyAmount(unitOfAccountAmount)) {
    const isBtcDenominatedCashWalletAmount =
      (walletCurrency === WalletCurrency.Usd || walletCurrency === WalletCurrency.Usdt) &&
      unitOfAccountAmount.currency === WalletCurrency.Btc

    const primaryAmount = convertMoneyAmount(unitOfAccountAmount, DisplayCurrency)

    formattedPrimaryAmount = formatMoneyAmount({
      moneyAmount: primaryAmount,
    })

    const secondaryAmount = getSecondaryAmountIfCurrencyIsDifferent({
      primaryAmount,
      walletAmount: convertMoneyAmount(unitOfAccountAmount, walletCurrency),
      displayAmount: convertMoneyAmount(unitOfAccountAmount, DisplayCurrency),
    })

    formattedPrimaryAmount = formatMoneyAmount({
      moneyAmount: primaryAmount,
      isApproximate: isBtcDenominatedCashWalletAmount && !secondaryAmount,
    })

    formattedSecondaryAmount =
      secondaryAmount &&
      formatMoneyAmount({
        moneyAmount: secondaryAmount,
        isApproximate:
          isBtcDenominatedCashWalletAmount &&
          (secondaryAmount.currency === WalletCurrency.Usd ||
            secondaryAmount.currency === WalletCurrency.Usdt),
      })
  }

  if (isSendingMax && formattedPrimaryAmount)
    formattedPrimaryAmount = `~ ${formattedPrimaryAmount} (${LL.SendBitcoinScreen.max()})`

  const onPressInputButton = () => {
    setIsSettingAmount(true)
  }

  return (
    <>
      <AmountInputButton
        placeholder={LL.AmountInputButton.tapToSetAmount()}
        onPress={onPressInputButton}
        value={formattedPrimaryAmount}
        iconName={canSetAmount ? "pencil" : undefined}
        secondaryValue={formattedSecondaryAmount}
        disabled={!canSetAmount}
        primaryTextTestProps={"Amount Input Button Amount"}
        showValuesIfDisabled={showValuesIfDisabled}
        big={big}
        newDesign={newDesign}
        {...testProps("Amount Input Button")}
      />
      <AmountInputModal
        moneyAmount={unitOfAccountAmount}
        isOpen={isSettingAmount}
        walletCurrency={walletCurrency}
        balanceWalletCurrency={balanceWalletCurrency}
        convertMoneyAmount={convertMoneyAmount}
        onSetAmount={onSetAmount}
        maxAmount={maxAmount}
        minAmount={minAmount}
        maxAmountButton={maxAmountButton}
        close={() => setIsSettingAmount(false)}
      />
    </>
  )
}
