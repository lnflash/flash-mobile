import React from "react"
import { TouchableOpacity, View } from "react-native"
import { useI18nContext } from "@app/i18n/i18n-react"
import { makeStyles, Text } from "@rneui/themed"

// types
import { WalletCurrency } from "@app/graphql/generated"

type Props = {
  fromWalletCurrency: WalletCurrency
  setAmountToBalancePercentage: (val: number) => void
}

const CashoutPercentage: React.FC<Props> = ({
  fromWalletCurrency,
  setAmountToBalancePercentage,
}) => {
  const { LL } = useI18nContext()
  const styles = useStyles()

  return (
    <View style={styles.fieldContainer}>
      <View style={styles.percentageLabelContainer}>
        <Text style={styles.percentageFieldLabel}>
          {LL.TransferScreen.percentageToConvert()}
        </Text>
      </View>
      <View style={styles.percentageContainer}>
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
            <Text>{"100%"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

export default CashoutPercentage

const useStyles = makeStyles(({ colors }) => ({
  fieldContainer: {
    marginBottom: 20,
  },
  percentageFieldLabel: {
    fontSize: 12,
    fontWeight: "bold",
    padding: 10,
  },
  percentageFieldContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    flex: 1,
    flexWrap: "wrap",
  },
  percentageField: {
    flex: 1,
    backgroundColor: colors.grey5,
    padding: 10,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 5,
    minWidth: 80,
  },
  percentageLabelContainer: {
    flex: 1,
  },
  percentageContainer: {
    flexDirection: "row",
  },
}))