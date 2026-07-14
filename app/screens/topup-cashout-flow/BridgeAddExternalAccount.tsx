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
import { useI18nContext } from "@app/i18n/i18n-react"

type Props = StackScreenProps<RootStackParamList, "BridgeAddExternalAccount">

const BridgeAddExternalAccount: React.FC<Props> = ({ navigation, route }) => {
  const styles = useStyles()
  const { theme } = useTheme()
  const { LL } = useI18nContext()
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

  // Post-link landing spot. From the Bank accounts hub, navigate back to the
  // existing hub instance (drops this form from the stack); from the cash-out
  // flow, replace so back doesn't return to the form (see #652).
  const navigateAfterLink = () => {
    if (route.params?.returnTo === "BankAccounts") {
      navigation.navigate("BankAccounts")
      return
    }
    navigation.replace("CashoutDetails", { type: "bridge" })
  }

  const handleSubmit = async () => {
    if (!bankName || !accountOwnerName || !routingNumber || !accountNumber) {
      Alert.alert(LL.common.error(), LL.BridgeAddExternalAccount.requiredFieldsError())
      return
    }

    if (!streetLine1 || !city || !state || !postalCode || !country) {
      Alert.alert(LL.common.error(), LL.BridgeAddExternalAccount.addressFieldsError())
      return
    }

    toggleActivityIndicator(true)
    try {
      const res = await createExternalAccount({
        variables: {
          input: {
            bankName: bankName.trim(),
            accountOwnerName: accountOwnerName.trim(),
            routingNumber: routingNumber.trim(),
            accountNumber: accountNumber.trim(),
            checkingOrSavings,
            streetLine1: streetLine1.trim(),
            city: city.trim(),
            // Bridge expects ISO codes — 2-char state, 3-char country.
            // autoCapitalize is only a keyboard hint (autofill and hardware
            // keyboards ignore it), so normalize here rather than trust casing.
            state: state.trim().toUpperCase(),
            postalCode: postalCode.trim(),
            country: country.trim().toUpperCase(),
          },
        },
      })

      toggleActivityIndicator(false)

      const errors = res.data?.bridgeCreateExternalAccount?.errors
      if (errors && errors.length > 0) {
        // If the account is already linked, proceed instead of erroring
        if (errors[0].code === "BRIDGE_API_ERROR") {
          Alert.alert(
            LL.BridgeAddExternalAccount.alreadyLinkedTitle(),
            LL.BridgeAddExternalAccount.alreadyLinkedMessage(),
            [
              {
                text: LL.BridgeAddExternalAccount.continue(),
                onPress: navigateAfterLink,
              },
            ],
          )
          return
        }
        Alert.alert(LL.common.error(), errors[0].message)
        return
      }

      const externalAccount = res.data?.bridgeCreateExternalAccount?.externalAccount
      if (externalAccount) {
        Alert.alert(
          LL.BridgeAddExternalAccount.bankAccountAddedTitle(),
          LL.BridgeAddExternalAccount.bankAccountAddedMessage({
            bankName: externalAccount.bankName,
            last4: externalAccount.accountNumberLast4,
          }),
          [
            {
              text: LL.BridgeAddExternalAccount.continue(),
              onPress: navigateAfterLink,
            },
          ],
        )
      } else {
        Alert.alert(LL.common.error(), LL.BridgeAddExternalAccount.failedToAdd())
      }
    } catch (error) {
      toggleActivityIndicator(false)
      Alert.alert(LL.common.error(), LL.BridgeAddExternalAccount.genericError())
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
          <View style={styles.headerRow}>
            <Text type="h1" style={styles.title}>
              {LL.BridgeAddExternalAccount.title()}
            </Text>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.cancelText}>{LL.common.cancel()}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>{LL.BridgeAddExternalAccount.subtitle()}</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{LL.BridgeAddExternalAccount.bankName()}</Text>
            <TextInput
              style={styles.input}
              value={bankName}
              onChangeText={setBankName}
              autoCapitalize="words"
              placeholder={LL.BridgeAddExternalAccount.bankNamePlaceholder()}
              placeholderTextColor={theme.colors.grey3}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              {LL.BridgeAddExternalAccount.accountOwnerName()}
            </Text>
            <TextInput
              style={styles.input}
              value={accountOwnerName}
              onChangeText={setAccountOwnerName}
              autoCapitalize="words"
              placeholder={LL.BridgeAddExternalAccount.accountOwnerNamePlaceholder()}
              placeholderTextColor={theme.colors.grey3}
            />
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldRowLeft}>
              <Text style={styles.label}>
                {LL.BridgeAddExternalAccount.routingNumber()}
              </Text>
              <TextInput
                style={styles.input}
                value={routingNumber}
                onChangeText={setRoutingNumber}
                placeholder={LL.BridgeAddExternalAccount.routingNumberPlaceholder()}
                placeholderTextColor={theme.colors.grey3}
                keyboardType="number-pad"
                maxLength={9}
              />
            </View>
            <View style={styles.fieldRowRight}>
              <Text style={styles.label}>
                {LL.BridgeAddExternalAccount.accountNumber()}
              </Text>
              <TextInput
                style={styles.input}
                value={accountNumber}
                onChangeText={setAccountNumber}
                placeholder={LL.BridgeAddExternalAccount.accountNumberPlaceholder()}
                placeholderTextColor={theme.colors.grey3}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{LL.BridgeAddExternalAccount.accountType()}</Text>
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
                  {LL.BridgeAddExternalAccount.checking()}
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
                  {LL.BridgeAddExternalAccount.savings()}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text type="h2" style={styles.sectionTitle}>
            {LL.BridgeAddExternalAccount.yourAddress()}
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              {LL.BridgeAddExternalAccount.streetAddress()}
            </Text>
            <TextInput
              style={styles.input}
              value={streetLine1}
              onChangeText={setStreetLine1}
              autoCapitalize="words"
              placeholder={LL.BridgeAddExternalAccount.streetAddressPlaceholder()}
              placeholderTextColor={theme.colors.grey3}
            />
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldRowCity}>
              <Text style={styles.label}>{LL.BridgeAddExternalAccount.city()}</Text>
              <TextInput
                style={styles.input}
                value={city}
                onChangeText={setCity}
                autoCapitalize="words"
                placeholder={LL.BridgeAddExternalAccount.cityPlaceholder()}
                placeholderTextColor={theme.colors.grey3}
              />
            </View>
            <View style={styles.fieldRowState}>
              <Text style={styles.label}>{LL.BridgeAddExternalAccount.state()}</Text>
              <TextInput
                style={styles.input}
                value={state}
                onChangeText={setState}
                autoCapitalize="characters"
                placeholder={LL.BridgeAddExternalAccount.statePlaceholder()}
                placeholderTextColor={theme.colors.grey3}
                maxLength={2}
              />
            </View>
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldRowLeft}>
              <Text style={styles.label}>{LL.BridgeAddExternalAccount.zipCode()}</Text>
              <TextInput
                style={styles.input}
                value={postalCode}
                onChangeText={setPostalCode}
                placeholder={LL.BridgeAddExternalAccount.zipCodePlaceholder()}
                placeholderTextColor={theme.colors.grey3}
                keyboardType="number-pad"
                maxLength={5}
              />
            </View>
            <View style={styles.fieldRowRight}>
              <Text style={styles.label}>{LL.BridgeAddExternalAccount.country()}</Text>
              <TextInput
                style={styles.input}
                value={country}
                onChangeText={setCountry}
                autoCapitalize="characters"
                placeholder={LL.BridgeAddExternalAccount.countryPlaceholder()}
                placeholderTextColor={theme.colors.grey3}
                maxLength={3}
              />
            </View>
          </View>

          <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
            <Text style={styles.submitText}>
              {LL.BridgeAddExternalAccount.linkBankAccount()}
            </Text>
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: {
    flex: 1,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.primary,
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
