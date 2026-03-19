import React from "react"
import { AmountInvalidReason, AmountStatus } from "./payment-details"
import { GaloyErrorBox } from "@app/components/atomic/galoy-error-box"
import { Text, makeStyles } from "@rneui/themed"
import { AccountLevel } from "@app/graphql/level-context"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useDisplayCurrency } from "@app/hooks/use-display-currency"
import { useNavigation } from "@react-navigation/native"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { StackNavigationProp } from "@react-navigation/stack"
import { toBtcMoneyAmount } from "@app/types/amounts"

export type SendBitcoinDetailsExtraInfoProps = {
  errorMessage?: string
  amountStatus: AmountStatus
  currentLevel: AccountLevel
}

export const SendBitcoinDetailsExtraInfo = ({
  errorMessage,
  amountStatus,
  currentLevel,
}: SendBitcoinDetailsExtraInfoProps) => {
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { formatMoneyAmount } = useDisplayCurrency()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()

  const onAccountUpgrade = () => navigation.navigate("AccountType")

  if (errorMessage) {
    return <GaloyErrorBox errorMessage={errorMessage} />
  }

  if (amountStatus.validAmount) {
    return null
  }

  switch (amountStatus.invalidReason) {
    case AmountInvalidReason.InsufficientLimit:
      return (
        <>
          <GaloyErrorBox
            errorMessage={LL.SendBitcoinScreen.amountExceedsLimit({
              limit: formatMoneyAmount({
                moneyAmount: amountStatus.remainingLimit,
              }),
            })}
          />
          {currentLevel !== AccountLevel.Three && (
            <Text type="p2" style={styles.upgradeAccountText} onPress={onAccountUpgrade}>
              {LL.SendBitcoinScreen.upgradeAccountToIncreaseLimit()}
            </Text>
          )}
        </>
      )
    case AmountInvalidReason.InsufficientBalance:
      return (
        <GaloyErrorBox
          errorMessage={LL.SendBitcoinScreen.amountExceed({
            balance: formatMoneyAmount({ moneyAmount: amountStatus.balance }),
          })}
        />
      )
    case AmountInvalidReason.MinOnChainLimit:
      return <GaloyErrorBox errorMessage={LL.SendBitcoinScreen.MinOnChainLimit()} />
    case AmountInvalidReason.MinOnChainSatLimit:
      return <GaloyErrorBox errorMessage={LL.SendBitcoinScreen.MinOnChainSatLimit()} />
    case AmountInvalidReason.MinFlashcardLimit:
      return <GaloyErrorBox errorMessage={LL.SendBitcoinScreen.MinFlashcardLimit()} />
    default:
      return null
  }
}

const useStyles = makeStyles(() => {
  return {
    upgradeAccountText: {
      marginTop: 5,
      textDecorationLine: "underline",
    },
  }
})
