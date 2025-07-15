import React from "react"
import { View } from "react-native"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import { Text, makeStyles, useTheme } from "@rneui/themed"
import { Screen } from "@app/components/screen"
import { useI18nContext } from "@app/i18n/i18n-react"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { PrimaryBtn } from "@app/components/buttons"

type TransferScreenProps = {
  navigation: StackNavigationProp<RootStackParamList, "transfer">
}

const TransferScreen: React.FC<TransferScreenProps> = () => {
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const isAuthed = useIsAuthed()
  const styles = useStyles()

  if (!isAuthed) {
    navigation.goBack()
    return null
  }

  const handleTopUp = () => {
    navigation.navigate("topUp")
  }

  const handleSettle = () => {
    // TODO: Implement settle functionality
    console.log("Settle functionality not implemented yet")
  }

  return (
    <Screen>
      <View style={styles.container}>
        <Text type="h1" style={styles.title}>
          {LL.TransferScreen.title()}
        </Text>

        <View style={styles.optionsContainer}>
          <View style={styles.optionCard}>
            <Text type="h2" style={styles.optionTitle}>
              {LL.TransferScreen.topUp()}
            </Text>
            <Text type="p1" style={[styles.optionDescription, { color: colors.grey1 }]}>
              {LL.TransferScreen.topUpDesc()}
            </Text>
            <PrimaryBtn
              label={LL.TransferScreen.topUp()}
              onPress={handleTopUp}
              btnStyle={styles.primaryButton}
            />
          </View>

          <View style={styles.optionCard}>
            <Text type="h2" style={styles.optionTitle}>
              {LL.TransferScreen.settle()}
            </Text>
            <Text type="p1" style={[styles.optionDescription, { color: colors.grey1 }]}>
              {LL.TransferScreen.settleDesc()}
            </Text>
            <PrimaryBtn
              label={LL.TransferScreen.settle()}
              onPress={handleSettle}
              type="outline"
              btnStyle={styles.secondaryButton}
            />
          </View>
        </View>
      </View>
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    textAlign: "center",
    marginBottom: 40,
  },
  optionsContainer: {
    flex: 1,
    justifyContent: "center",
    gap: 20,
  },
  optionCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  optionTitle: {
    textAlign: "center",
    marginBottom: 8,
  },
  optionDescription: {
    textAlign: "center",
    marginBottom: 24,
  },
  primaryButton: {
    marginTop: 8,
  },
  secondaryButton: {
    marginTop: 8,
  },
}))

export default TransferScreen
