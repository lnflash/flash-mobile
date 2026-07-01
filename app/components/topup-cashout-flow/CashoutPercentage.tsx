import React from "react"
import { TouchableOpacity, View } from "react-native"
import { makeStyles, Text } from "@rneui/themed"
import { useI18nContext } from "@app/i18n/i18n-react"

type Props = {
  setAmountToBalancePercentage: (val: number) => void
}

const CashoutPercentage: React.FC<Props> = ({ setAmountToBalancePercentage }) => {
  const { LL } = useI18nContext()
  const styles = useStyles()

  return (
    <View style={styles.fieldContainer}>
      <Text type="bl" bold>
        {LL.Cashout.percentageToCashout()}
      </Text>
      <View style={styles.percentageFieldContainer}>
        <TouchableOpacity
          style={{ ...styles.percentageField, marginRight: 20 }}
          onPress={() => setAmountToBalancePercentage(50)}
        >
          <Text>50%</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.percentageField}
          onPress={() => setAmountToBalancePercentage(100)}
        >
          <Text>100%</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

export default CashoutPercentage

const useStyles = makeStyles(({ colors }) => ({
  fieldContainer: {
    marginVertical: 15,
  },
  percentageFieldContainer: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 5,
  },
  percentageField: {
    flex: 1,
    alignItems: "center",
    borderRadius: 10,
    minWidth: 80,
    padding: 10,
    backgroundColor: colors.grey5,
  },
}))
