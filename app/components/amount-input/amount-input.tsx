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
import { AmountInputModal } from "./amount-input-modal"
import { AmountInputButton } from "./amount-input-button"

export type AmountInputProps = {
  unitOfAccountAmount?: MoneyAmount<WalletOrDisplayCurrency>
  walletCurrency: WalletCurrency
  convertMoneyAmount: ConvertMoneyAmount
  setAmount?: (moneyAmount: MoneyAmount<WalletOrDisplayCurrency>) => void
  maxAmount?: MoneyAmount<WalletOrDisplayCurrency>
  minAmount?: MoneyAmount<WalletOrDisplayCurrency>
  canSetAmount?: boolean
  isSendingMax?: boolean
  showValuesIfDisabled?: boolean
  big?: boolean
  newDesign?: boolean
  title?: string
}

export const AmountInput: React.FC<AmountInputProps> = ({
  unitOfAccountAmount,
  walletCurrency,
  setAmount,
  maxAmount,
  minAmount,
  convertMoneyAmount,
  canSetAmount = true,
  isSendingMax = false,
  showValuesIfDisabled = true,
  big = true,
  newDesign = false,
  title = "Receive",
}) => {
  const { LL } = useI18nContext()
  const { formatMoneyAmount, getSecondaryAmountIfCurrencyIsDifferent } =
    useDisplayCurrency()

  const [isSettingAmount, setIsSettingAmount] = React.useState(false)

  const onSetAmount = (amount: MoneyAmount<WalletOrDisplayCurrency>) => {
    setAmount && setAmount(amount)
    setIsSettingAmount(false)
  }

  let formattedPrimaryAmount = undefined
  let formattedSecondaryAmount = undefined

  if (isNonZeroMoneyAmount(unitOfAccountAmount)) {
    const isBtcDenominatedUsdWalletAmount =
      walletCurrency === WalletCurrency.Usd &&
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
      isApproximate: isBtcDenominatedUsdWalletAmount && !secondaryAmount,
    })

    formattedSecondaryAmount =
      secondaryAmount &&
      formatMoneyAmount({
        moneyAmount: secondaryAmount,
        isApproximate:
          isBtcDenominatedUsdWalletAmount &&
          secondaryAmount.currency === WalletCurrency.Usd,
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
        iconName="pencil"
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
        convertMoneyAmount={convertMoneyAmount}
        onSetAmount={onSetAmount}
        maxAmount={maxAmount}
        minAmount={minAmount}
        close={() => setIsSettingAmount(false)}
        title={title}
      />
    </>
  )
}
