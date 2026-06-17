import React, { useState } from "react"
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { Text, makeStyles, useTheme } from "@rneui/themed"
import { Screen } from "@app/components/screen"
import { useBridgeCreateExternalAccountMutation } from "@app/graphql/generated"
import { useActivityIndicator } from "@app/hooks"

type Props = StackScreenProps<RootStackParamList, "BridgeAddExternalAccount">

const BridgeAddExternalAccount: React.FC<Props> = ({ navigation }) => {
  const styles = useStyles()
  const { theme } = useTheme()
  const { toggleActivityIndicator } = useActivityIndicator()

  const [createExternalAccount] = useBridgeCreateExternalAccountMutation()

  const [bankName, setBankName] = useState("")
  const [accountOwnerName, setAccountOwnerName] = useState("")
  const [routingNumber, setRoutingNumber] = useState("")
  const [accountNumber, setAccountNumber] = useState("")
  const [checkingOrSavings, setCheckingOrSavings] = useState<"checking" | "savings">(
    "checking",
  )
  const [streetLine1, setStreetLine1] = useState("")
  const [city, setCity] = useState("")
  const [state, setState] = useState("")
  const [postalCode, setPostalCode] = useState("")
  const [country, setCountry] = useState("USA")

  const handleSubmit = async () => {
    if (!bankName || !accountOwnerName || !routingNumber || !accountNumber) {
      Alert.alert("Error", "Please fill in all required fields")
      return
    }

    if (!streetLine1 || !city || !state || !postalCode || !country) {
      Alert.alert("Error", "Please fill in your address details")
      return
    }

    toggleActivityIndicator(true)
    try {
      const res = await createExternalAccount({
        variables: {
          input: {
            bankName,
            accountOwnerName,
            routingNumber,
            accountNumber,
            checkingOrSavings,
            streetLine1,
            city,
            state,
            postalCode,
            country,
          },
        },
      })

      toggleActivityIndicator(false)

      const errors = res.data?.bridgeCreateExternalAccount?.errors
      if (errors && errors.length > 0) {
        Alert.alert("Error", errors[0].message)
        return
      }

      const externalAccount = res.data?.bridgeCreateExternalAccount?.externalAccount
      if (externalAccount) {
        Alert.alert(
          "Bank Account Added",
          `Your ${externalAccount.bankName} account (ending in ${externalAccount.accountNumberLast4}) has been linked successfully.`,
          [
            {
              text: "Continue",
              onPress: () => navigation.navigate("CashoutDetails", { type: "bridge" }),
            },
          ],
        )
      } else {
        Alert.alert("Error", "Failed to add bank account. Please try again.")
      }
    } catch (error) {
      toggleActivityIndicator(false)
      Alert.alert("Error", "Something went wrong. Please try again.")
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text type="h1" style={styles.title}>
            Add Bank Account
          </Text>
          <Text style={styles.subtitle}>
            Enter your US bank account details below to link it for withdrawals.
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Bank Name</Text>
            <TextInput
              style={styles.input}
              value={bankName}
              onChangeText={setBankName}
              placeholder="e.g. Bank of America"
              placeholderTextColor={theme.colors.grey3}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Account Owner Name</Text>
            <TextInput
              style={styles.input}
              value={accountOwnerName}
              onChangeText={setAccountOwnerName}
              placeholder="Full name on account"
              placeholderTextColor={theme.colors.grey3}
            />
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldRowLeft}>
              <Text style={styles.label}>Routing Number</Text>
              <TextInput
                style={styles.input}
                value={routingNumber}
                onChangeText={setRoutingNumber}
                placeholder="9-digit routing"
                placeholderTextColor={theme.colors.grey3}
                keyboardType="number-pad"
                maxLength={9}
              />
            </View>
            <View style={styles.fieldRowRight}>
              <Text style={styles.label}>Account Number</Text>
              <TextInput
                style={styles.input}
                value={accountNumber}
                onChangeText={setAccountNumber}
                placeholder="Account number"
                placeholderTextColor={theme.colors.grey3}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Account Type</Text>
            <View style={styles.segmentRow}>
              <TouchableOpacity
                style={[
                  styles.segmentButton,
                  checkingOrSavings === "checking" && styles.segmentButtonActive,
                ]}
                onPress={() => setCheckingOrSavings("checking")}
              >
                <Text
                  style={[
                    styles.segmentText,
                    checkingOrSavings === "checking" && styles.segmentTextActive,
                  ]}
                >
                  Checking
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.segmentButton,
                  checkingOrSavings === "savings" && styles.segmentButtonActive,
                ]}
                onPress={() => setCheckingOrSavings("savings")}
              >
                <Text
                  style={[
                    styles.segmentText,
                    checkingOrSavings === "savings" && styles.segmentTextActive,
                  ]}
                >
                  Savings
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text type="h2" style={styles.sectionTitle}>
            Your Address
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Street Address</Text>
            <TextInput
              style={styles.input}
              value={streetLine1}
              onChangeText={setStreetLine1}
              placeholder="123 Main St"
              placeholderTextColor={theme.colors.grey3}
            />
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldRowCity}>
              <Text style={styles.label}>City</Text>
              <TextInput
                style={styles.input}
                value={city}
                onChangeText={setCity}
                placeholder="City"
                placeholderTextColor={theme.colors.grey3}
              />
            </View>
            <View style={styles.fieldRowState}>
              <Text style={styles.label}>State</Text>
              <TextInput
                style={styles.input}
                value={state}
                onChangeText={setState}
                placeholder="FL"
                placeholderTextColor={theme.colors.grey3}
                maxLength={2}
              />
            </View>
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldRowLeft}>
              <Text style={styles.label}>ZIP Code</Text>
              <TextInput
                style={styles.input}
                value={postalCode}
                onChangeText={setPostalCode}
                placeholder="33101"
                placeholderTextColor={theme.colors.grey3}
                keyboardType="number-pad"
                maxLength={5}
              />
            </View>
            <View style={styles.fieldRowRight}>
              <Text style={styles.label}>Country</Text>
              <TextInput
                style={styles.input}
                value={country}
                onChangeText={setCountry}
                placeholder="USA"
                placeholderTextColor={theme.colors.grey3}
                maxLength={3}
              />
            </View>
          </View>

          <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
            <Text style={styles.submitText}>Link Bank Account</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  title: {
    marginBottom: 8,
  },
  subtitle: {
    color: colors.grey2,
    marginBottom: 24,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  fieldRow: {
    flexDirection: "row",
    marginBottom: 0,
  },
  fieldRowLeft: {
    flex: 1,
    marginRight: 8,
  },
  fieldRowRight: {
    flex: 1,
    marginLeft: 8,
  },
  fieldRowCity: {
    flex: 2,
    marginRight: 8,
  },
  fieldRowState: {
    flex: 1,
    marginLeft: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
    color: colors.grey0,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.grey3,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.grey0,
    backgroundColor: colors.white,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 8,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.grey3,
    alignItems: "center",
  },
  segmentButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segmentText: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.grey1,
  },
  segmentTextActive: {
    color: colors.white,
  },
  sectionTitle: {
    marginTop: 8,
    marginBottom: 16,
  },
  submitButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 24,
    marginBottom: 40,
  },
  submitText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: "600",
  },
}))

export default BridgeAddExternalAccount
