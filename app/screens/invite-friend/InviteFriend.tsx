import React, { useState } from "react"
import { View, Alert, TouchableOpacity, ScrollView } from "react-native"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { CountryCode } from "react-native-country-picker-modal"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { useI18nContext } from "@app/i18n/i18n-react"
import {
  parsePhoneNumber,
  CountryCode as PhoneNumberCountryCode,
} from "libphonenumber-js/mobile"
import validator from "validator"
import { useCreateInviteMutation, InviteMethod } from "@app/graphql/generated"
import Icon from "react-native-vector-icons/Ionicons"

// components
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { EmailInput, PhoneNumberInput } from "@app/components/input"
import { ContactPicker } from "@app/components/contact-picker"

type Props = StackScreenProps<RootStackParamList, "InviteFriend">
type InputMethod = "contacts" | "phone" | "email"

const InviteFriend: React.FC<Props> = ({ navigation }) => {
  const { LL } = useI18nContext()
  const styles = useStyles()
  const { colors } = useTheme().theme

  // State for input method selection
  const [inputMethod, setInputMethod] = useState<InputMethod>("contacts")

  // State for different input types
  const [countryCode, setCountryCode] = useState<CountryCode | undefined>("JM")
  const [phoneNumber, setPhoneNumber] = useState<string | undefined>()
  const [email, setEmail] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [showContactPicker, setShowContactPicker] = useState(false)

  const [createInvite] = useCreateInviteMutation()

  const handleContactSelect = (selectedValue: string, type: "phone" | "email") => {
    if (type === "email") {
      // Handle email selection
      setEmail(selectedValue)
      setInputMethod("email")
    } else {
      // Handle phone number selection
      try {
        const parsed = parsePhoneNumber(selectedValue)
        if (parsed && parsed.isValid()) {
          setCountryCode(parsed.country as CountryCode)
          setPhoneNumber(parsed.nationalNumber)
          // Automatically switch to phone tab after selecting contact
          setInputMethod("phone")
        } else {
          // If parsing fails, just set the raw number
          const cleanNumber = selectedValue.replace(/[^\d+]/g, "")
          if (cleanNumber.startsWith("+")) {
            // Try to extract country code from international format
            // Handle common Caribbean countries with +1
            if (cleanNumber.startsWith("+1876")) {
              setCountryCode("JM" as CountryCode)
              setPhoneNumber(cleanNumber.replace("+1", ""))
            } else if (cleanNumber.startsWith("+1868")) {
              setCountryCode("TT" as CountryCode)
              setPhoneNumber(cleanNumber.replace("+1", ""))
            } else if (cleanNumber.startsWith("+1246")) {
              setCountryCode("BB" as CountryCode)
              setPhoneNumber(cleanNumber.replace("+1", ""))
            } else if (cleanNumber.startsWith("+1")) {
              // Default to US for other +1 numbers
              setCountryCode("US" as CountryCode)
              setPhoneNumber(cleanNumber.replace("+1", ""))
            } else {
              // Remove + and set as phone number
              setPhoneNumber(cleanNumber.replace("+", ""))
            }
          } else {
            setPhoneNumber(cleanNumber)
          }
          // Switch to phone tab
          setInputMethod("phone")
        }
      } catch (error) {
        console.error("Error parsing contact phone number:", error)
        // Just set the number as-is
        const cleanNumber = selectedValue.replace(/[^\d]/g, "")
        setPhoneNumber(cleanNumber)
        setInputMethod("phone")
      }
    }
    setShowContactPicker(false)
  }

  const onSubmit = async () => {
    // Validate inputs based on selected method
    let contact: string = ""
    let method: InviteMethod = InviteMethod.Email

    if (inputMethod === "email") {
      if (email && validator.isEmail(email)) {
        contact = email
        method = InviteMethod.Email
      } else {
        Alert.alert("Error", "Please enter a valid email address")
        return
      }
    } else if (inputMethod === "phone" || inputMethod === "contacts") {
      if (countryCode && phoneNumber) {
        const parsedPhoneNumber = parsePhoneNumber(
          phoneNumber,
          countryCode as PhoneNumberCountryCode,
        )
        if (parsedPhoneNumber?.isValid()) {
          contact = parsedPhoneNumber.format("E.164")
          method = InviteMethod.Whatsapp
        } else {
          Alert.alert("Error", "Please enter a valid phone number")
          return
        }
      } else {
        Alert.alert("Error", "Please enter a phone number")
        return
      }
    }

    if (!contact) {
      Alert.alert("Error", "Please enter contact information")
      return
    }

    // Send invite
    setLoading(true)
    try {
      const { data } = await createInvite({
        variables: {
          input: {
            contact,
            method,
          },
        },
      })

      if (data?.createInvite?.invite) {
        navigation.navigate("InviteFriendSuccess", {
          contact: data.createInvite.invite.contact,
          method: data.createInvite.invite.method,
        })
      } else if (data?.createInvite?.errors && data.createInvite.errors.length > 0) {
        Alert.alert("Error", data.createInvite.errors[0])
      }
    } catch (error) {
      console.error("Error sending invite:", error)
      Alert.alert("Error", "Unable to send invitation. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const isButtonDisabled = () => {
    if (loading) return true

    if (inputMethod === "email") {
      return !email || !validator.isEmail(email)
    } else if (inputMethod === "phone" || inputMethod === "contacts") {
      return !phoneNumber || phoneNumber.length === 0
    }

    return true
  }

  const renderInputContent = () => {
    switch (inputMethod) {
      case "contacts":
        return (
          <View style={styles.inputContent}>
            <TouchableOpacity
              style={styles.selectContactButton}
              onPress={() => setShowContactPicker(true)}
            >
              <Icon
                name="people-outline"
                size={48}
                color={styles.selectContactIcon.color}
              />
              <Text style={styles.selectContactText}>
                {phoneNumber || email
                  ? phoneNumber
                    ? `Phone: ${phoneNumber}`
                    : `Email: ${email}`
                  : "Tap to select from contacts"}
              </Text>
              <Text style={styles.selectContactSubtext}>
                Choose a friend from your phone's contact list
              </Text>
            </TouchableOpacity>
          </View>
        )

      case "phone":
        return (
          <View style={styles.inputContent}>
            <PhoneNumberInput
              title=""
              countryCode={countryCode}
              phoneNumber={phoneNumber}
              setCountryCode={setCountryCode}
              setPhoneNumber={setPhoneNumber}
            />

            {/* WhatsApp indicator */}
            <View style={styles.whatsappIndicator}>
              <Icon name="logo-whatsapp" size={18} color={colors.success} />
              <Text style={styles.whatsappText}>
                Invitation will be sent via WhatsApp
              </Text>
            </View>
          </View>
        )

      case "email":
        return (
          <View style={styles.inputContent}>
            <EmailInput title="" email={email} setEmail={setEmail} />
            <Text style={styles.inputHint}>
              We'll send an invitation link to this email address
            </Text>
          </View>
        )

      default:
        return null
    }
  }

  return (
    <Screen preset="scroll" style={styles.screenStyle}>
      <View style={styles.main}>
        {/* Header */}
        <View style={styles.header}>
          <Text type="h1" bold style={styles.title}>
            {LL.InviteFriend.title()}
          </Text>
          <Text type="p1" style={styles.subtitle}>
            {LL.InviteFriend.subtitle()}
          </Text>
        </View>

        {/* Icon-based Method Selector */}
        <View style={styles.selectorContainer}>
          <Text style={styles.selectorTitle}>Choose how to invite:</Text>
          <View style={styles.iconSelector}>
            <TouchableOpacity
              style={[
                styles.iconButton,
                inputMethod === "contacts" && styles.iconButtonActive,
              ]}
              onPress={() => setInputMethod("contacts")}
            >
              <View
                style={[
                  styles.iconCircle,
                  inputMethod === "contacts" && styles.iconCircleActive,
                ]}
              >
                <Icon
                  name="people"
                  size={32}
                  color={inputMethod === "contacts" ? "#fff" : colors.grey2}
                />
              </View>
              <Text
                style={[
                  styles.iconLabel,
                  inputMethod === "contacts" && styles.iconLabelActive,
                ]}
              >
                Contacts
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.iconButton,
                inputMethod === "phone" && styles.iconButtonActive,
              ]}
              onPress={() => setInputMethod("phone")}
            >
              <View
                style={[
                  styles.iconCircle,
                  inputMethod === "phone" && styles.iconCircleActive,
                ]}
              >
                <Icon
                  name="logo-whatsapp"
                  size={32}
                  color={inputMethod === "phone" ? "#fff" : colors.grey2}
                />
              </View>
              <Text
                style={[
                  styles.iconLabel,
                  inputMethod === "phone" && styles.iconLabelActive,
                ]}
              >
                WhatsApp
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.iconButton,
                inputMethod === "email" && styles.iconButtonActive,
              ]}
              onPress={() => setInputMethod("email")}
            >
              <View
                style={[
                  styles.iconCircle,
                  inputMethod === "email" && styles.iconCircleActive,
                ]}
              >
                <Icon
                  name="mail"
                  size={32}
                  color={inputMethod === "email" ? "#fff" : colors.grey2}
                />
              </View>
              <Text
                style={[
                  styles.iconLabel,
                  inputMethod === "email" && styles.iconLabelActive,
                ]}
              >
                Email
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Input Content Area */}
        <View style={styles.inputContainer}>{renderInputContent()}</View>
      </View>

      {/* Submit Button */}
      <PrimaryBtn
        label={LL.InviteFriend.invite()}
        onPress={onSubmit}
        loading={loading}
        disabled={isButtonDisabled()}
        btnStyle={styles.submitButton}
      />

      {/* Contact Picker Modal */}
      <ContactPicker
        visible={showContactPicker}
        onClose={() => setShowContactPicker(false)}
        onSelectContact={handleContactSelect}
      />
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  screenStyle: {
    padding: 20,
    flexGrow: 1,
  },
  main: {
    flex: 1,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    marginBottom: 12,
    fontSize: 28,
  },
  subtitle: {
    color: colors.grey3,
    fontSize: 16,
    lineHeight: 22,
  },
  selectorContainer: {
    marginBottom: 32,
  },
  selectorTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.black,
    marginBottom: 20,
    textAlign: "center",
  },
  iconSelector: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 10,
  },
  iconButton: {
    alignItems: "center",
    opacity: 0.7,
  },
  iconButtonActive: {
    opacity: 1,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.grey5,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.grey4,
    marginBottom: 8,
  },
  iconCircleActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  iconLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.grey2,
  },
  iconLabelActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  inputContainer: {
    minHeight: 200,
    marginBottom: 24,
  },
  inputContent: {
    paddingTop: 16,
  },
  selectContactButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: colors.grey5,
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: "dashed",
  },
  selectContactIcon: {
    color: colors.primary,
  },
  selectContactText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: "600",
    color: colors.black,
    textAlign: "center",
  },
  selectContactSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: colors.grey3,
    textAlign: "center",
  },
  whatsappIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.grey5,
    borderRadius: 8,
  },
  whatsappText: {
    fontSize: 14,
    color: colors.grey1,
    marginLeft: 8,
    fontWeight: "500",
  },
  inputHint: {
    marginTop: 12,
    fontSize: 14,
    color: colors.grey3,
    textAlign: "center",
    paddingHorizontal: 16,
  },
  submitButton: {
    marginBottom: 10,
  },
}))

export default InviteFriend
