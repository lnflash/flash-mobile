import React, { useState } from "react"
import { View } from "react-native"
import { StackScreenProps } from "@react-navigation/stack"
import { makeStyles, Text, useTheme } from "@rneui/themed"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useDisplayCurrency, usePriceConversion } from "@app/hooks"

// components
import { Screen } from "@app/components/screen"
import { SuccessModal } from "@app/components/refund-flow"
import { AmountInput } from "@app/components/amount-input"
import { GaloyPrimaryButton } from "@app/components/atomic/galoy-primary-button"
import { PaymentDestinationDisplay } from "@app/components/payment-destination-display"

// assets
import DestinationIcon from "@app/assets/icons/destination.svg"

// utils
import { testProps } from "@app/utils/testProps"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { DisplayCurrency, toBtcMoneyAmount } from "@app/types/amounts"
import { refund } from "@breeztech/react-native-breez-sdk-liquid"

type Props = StackScreenProps<RootStackParamList, "RefundConfirmation">

const RefundConfirmation: React.FC<Props> = ({ navigation, route }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { convertMoneyAmount } = usePriceConversion()
  const { formatDisplayAndWalletAmount } = useDisplayCurrency()

  const [modalVisible, setModalVisible] = useState<boolean>(false)
  const [errorMsg, setErrorMsg] = useState<string>()

  if (!convertMoneyAmount) return false

  const onConfirm = async () => {
    const refundResponse = await refund({
      swapAddress: route.params.swapAddress,
      refundAddress: route.params.destination,
      satPerVbyte: route.params.fee,
    })
    console.log("Refund Response>>>>>>>>>>>>>>>", refundResponse)
    if (refundResponse.refundTxId) {
      setModalVisible(true)
      setTimeout(() => {
        setModalVisible(false)
      }, 3000)
    } else {
      setErrorMsg("Something went wrong. Please, try again.")
    }
  }

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
      {!!errorMsg && <Text style={styles.errorMsg}>{errorMsg}</Text>}
      <View style={styles.buttonContainer}>
        <GaloyPrimaryButton title={LL.common.confirm()} onPress={onConfirm} />
      </View>
      <SuccessModal isVisible={modalVisible} />
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
