import React, { useState } from "react"
import { View } from "react-native"
import { makeStyles, Text } from "@rneui/themed"
import { useI18nContext } from "@app/i18n/i18n-react"
import { Network, parsePaymentDestination } from "@flash/client"

// components
import { Screen } from "@app/components/screen"
import { DestinationField, Fees } from "@app/components/refund-flow"
import { GaloyPrimaryButton } from "@app/components/atomic/galoy-primary-button"

// utils
import { LNURL_DOMAINS } from "@app/config"

const RefundDestination = () => {
  const styles = usestyles()
  const { LL } = useI18nContext()

  const [selectedFee, setSelectedFee] = useState<number>()
  const [destination, setDestination] = useState<string>()
  const [status, setStatus] = useState("entering")
  const [error, setError] = useState<string>()

  const validateDestination = () => {
    if (!destination) {
      setError("Please, enter destination to proceed")
    } else if (!selectedFee) {
      setError("Please, select fee to proceed")
    } else {
      setStatus("validating")
      const parsedDestination: any = parsePaymentDestination({
        destination,
        network: "mainnet" as Network,
        lnAddressDomains: LNURL_DOMAINS,
      })
      console.log("PARSED DESTINATION>>>>>>>>>>>>>", parsedDestination)
      if (parsedDestination.valid && parsedDestination.paymentType === "onchain") {
        setStatus("valid")
      } else {
        setStatus("invalid")
        setError("Please, enter valid destination")
      }
    }
  }

  return (
    <Screen
      preset="scroll"
      style={styles.screenStyle}
      keyboardOffset="navigationHeader"
      keyboardShouldPersistTaps="handled"
    >
      <DestinationField
        destination={destination}
        status={status}
        validateDestination={validateDestination}
        handleChangeText={setDestination}
        setDestination={setDestination}
      />
      <Fees selectedFee={selectedFee} setFee={setSelectedFee} />
      <Text style={styles.errorMsg}>{error}</Text>
      <View style={styles.buttonContainer}>
        <GaloyPrimaryButton
          title={LL.common.next()}
          loading={status === "validating"}
          disabled={!destination || !selectedFee}
          onPress={validateDestination}
        />
      </View>
    </Screen>
  )
}

export default RefundDestination

const usestyles = makeStyles(({ colors }) => ({
  screenStyle: {
    padding: 20,
    flexGrow: 1,
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
