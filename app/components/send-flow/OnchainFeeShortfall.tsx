import React from "react"
import { View } from "react-native"
import { makeStyles, Text } from "@rneui/themed"

// components
import { GaloyTertiaryButton } from "@app/components/atomic/galoy-tertiary-button"

type Action = {
  label: string
  onPress: () => void
}

type Props = {
  message: string
  sendMax?: Action
  payFromCash?: Action
}

// One line under the speed picker when no speed fits the balance, with at most
// two ways forward. Kept to a line and a row so the send details screen stays
// a single screen.
const OnchainFeeShortfall: React.FC<Props> = ({ message, sendMax, payFromCash }) => {
  const styles = useStyles()

  return (
    <View style={styles.container}>
      <Text testID="onchain-fee-shortfall" type="p3">
        {message}
      </Text>
      {(sendMax || payFromCash) && (
        <View style={styles.actions}>
          {sendMax && (
            <GaloyTertiaryButton
              testID="onchain-send-max"
              hitSlop={8}
              clear
              title={sendMax.label}
              onPress={sendMax.onPress}
            />
          )}
          {payFromCash && (
            <GaloyTertiaryButton
              testID="onchain-pay-from-cash"
              hitSlop={8}
              clear
              title={payFromCash.label}
              onPress={payFromCash.onPress}
            />
          )}
        </View>
      )}
    </View>
  )
}

export default OnchainFeeShortfall

const useStyles = makeStyles(() => ({
  container: {
    marginTop: -5,
    marginBottom: 10,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 12,
  },
}))
