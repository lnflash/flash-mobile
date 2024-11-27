import { AmountInput } from "@app/components/amount-input"
import { Screen } from "@app/components/screen"
import { useDisplayCurrency, usePriceConversion } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { DisplayCurrency, toBtcMoneyAmount } from "@app/types/amounts"
import { StackScreenProps } from "@react-navigation/stack"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import React from "react"
import { View } from "react-native"
import styled from "styled-components/native"
import DestinationIcon from "@app/assets/icons/destination.svg"
import { PaymentDestinationDisplay } from "@app/components/payment-destination-display"
import { testProps } from "@app/utils/testProps"

type Props = StackScreenProps<RootStackParamList, "RefundConfirmation">

const RefundConfirmation: React.FC<Props> = ({ navigation, route }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { convertMoneyAmount } = usePriceConversion()
  const { formatDisplayAndWalletAmount } = useDisplayCurrency()

  if (!convertMoneyAmount) return false

  return (
    <Screen
      preset="scroll"
      style={styles.screenStyle}
      keyboardOffset="navigationHeader"
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.fieldContainer}>
        <Text style={styles.fieldTitleText}>{LL.SendBitcoinScreen.destination()}</Text>
        <View style={styles.fieldBackground}>
          <View style={styles.destinationIconContainer}>
            <DestinationIcon fill={colors.black} />
          </View>
          <PaymentDestinationDisplay
            destination={route.params.destination}
            paymentType={"onchain"}
          />
        </View>
      </View>
      <View style={styles.fieldContainer}>
        <Text style={styles.fieldTitleText}>{LL.SendBitcoinScreen.amount()}</Text>
        <AmountInput
          unitOfAccountAmount={toBtcMoneyAmount(route.params.amount)}
          canSetAmount={false}
          convertMoneyAmount={convertMoneyAmount}
          walletCurrency={"BTC"}
        />
      </View>
      <View style={styles.fieldContainer}>
        <Text style={styles.fieldTitleText}>
          {LL.SendBitcoinConfirmationScreen.feeLabel()}
        </Text>
        <View style={styles.fieldBackground}>
          <Text {...testProps("Successful Fee")}>
            {formatDisplayAndWalletAmount({
              displayAmount: convertMoneyAmount(
                toBtcMoneyAmount(route.params.fee),
                DisplayCurrency,
              ),
              walletAmount: toBtcMoneyAmount(route.params.fee),
            })}
          </Text>
        </View>
      </View>
    </Screen>
  )
}

export default RefundConfirmation

const useStyles = makeStyles(({ colors }) => ({
  screenStyle: {
    padding: 20,
    flexGrow: 1,
  },
  fieldTitleText: {
    fontWeight: "bold",
    marginBottom: 4,
  },
  fieldContainer: {
    marginBottom: 12,
  },
  fieldBackground: {
    flexDirection: "row",
    borderStyle: "solid",
    overflow: "hidden",
    backgroundColor: colors.grey5,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
    height: 60,
  },
  destinationIconContainer: {
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  buttonContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  errorMsg: {
    color: colors.error,
    marginTop: 15,
  },
}))
