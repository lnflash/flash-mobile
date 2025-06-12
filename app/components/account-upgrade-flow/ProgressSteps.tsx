import React from "react"
import { View } from "react-native"
import { Icon, makeStyles, Text, useTheme } from "@rneui/themed"

type Props = {
  numOfSteps: number
  currentStep: number
}

const ProgressSteps: React.FC<Props> = ({ numOfSteps, currentStep }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme

  const renderStep = (i: number) => {
    if (currentStep === i + 1) {
      return (
        <View style={[styles.step, styles.currentStep]}>
          <Text type="bl" style={styles.currentStepText}>
            {i + 1}
          </Text>
        </View>
      )
    } else if (currentStep > i + 1) {
      return (
        <Icon name={"checkmark-circle"} size={40} color={colors.green} type="ionicon" />
      )
    } else {
      return (
        <View style={styles.step}>
          <Text type="bl" color={colors.grey2}>
            {i + 1}
          </Text>
        </View>
      )
    }
  }

  return (
    <View style={styles.wrapper}>
      {Array(numOfSteps)
        .fill(0)
        .map((_, i) => (
          <>
            {renderStep(i)}
            {i + 1 < numOfSteps && (
              <View
                style={[
                  styles.separator,
                  currentStep <= i + 1 ? { backgroundColor: colors.grey2 } : {},
                ]}
              />
            )}
          </>
        ))}
    </View>
  )
}

export default ProgressSteps

const useStyles = makeStyles(({ colors }) => ({
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginVertical: 10,
  },
  separator: {
    flex: 1,
    height: 3,
    backgroundColor: colors._lightBlue,
    marginHorizontal: 5,
  },
  step: {
    width: 35,
    height: 35,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 1000,
    borderWidth: 2,
    borderColor: colors.grey2,
  },
  currentStep: {
    backgroundColor: colors._lightBlue,
    borderColor: colors._borderBlue,
  },
  currentStepText: {
    color: "#fff",
  },
}))
