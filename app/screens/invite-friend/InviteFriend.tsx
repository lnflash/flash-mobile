import React, { useState } from "react"
import { View, Alert } from "react-native"
import { makeStyles, Text } from "@rneui/themed"
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

// components
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { EmailInput, PhoneNumberInput } from "@app/components/input"

type Props = StackScreenProps<RootStackParamList, "InviteFriend">

const InviteFriend: React.FC<Props> = ({ navigation }) => {
  const { LL } = useI18nContext()
  const styles = useStyles()

  const [countryCode, setCountryCode] = useState<CountryCode | undefined>()
  const [phoneNumber, setPhoneNumber] = useState<string | undefined>()
  const [email, setEmail] = useState<string>()
  const [loading, setLoading] = useState(false)
  
  const [createInvite] = useCreateInviteMutation()

  const onSubmit = async () => {
    // Validate inputs
    let contact: string = ""
    let method: InviteMethod = InviteMethod.Email
    
    if (email && validator.isEmail(email)) {
      contact = email
      method = InviteMethod.Email
    } else if (countryCode && phoneNumber) {
      const parsedPhoneNumber = parsePhoneNumber(
        phoneNumber,
        countryCode as PhoneNumberCountryCode,
      )
      if (parsedPhoneNumber?.isValid()) {
        contact = parsedPhoneNumber.format("E.164")
        method = InviteMethod.Sms
      } else {
        Alert.alert("Error", "Please enter a valid phone number")
        return
      }
    } else {
      Alert.alert("Error", "Please enter a phone number or email address")
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

  return (
    <Screen preset="scroll" style={styles.screenStyle}>
      <View style={styles.main}>
        <Text type="h1" bold style={styles.title}>
          {LL.InviteFriend.title()}
        </Text>
        <Text type="h2" style={{ marginBottom: 40 }}>
          {LL.InviteFriend.subtitle()}
        </Text>
        <PhoneNumberInput
          title={LL.InviteFriend.phoneNumber()}
          countryCode={countryCode}
          phoneNumber={phoneNumber}
          setCountryCode={setCountryCode}
          setPhoneNumber={setPhoneNumber}
        />
        <Text type="h2" style={{ marginVertical: 20, alignSelf: "center" }}>
          {LL.InviteFriend.or()}
        </Text>
        <EmailInput title={LL.InviteFriend.email()} email={email} setEmail={setEmail} />
      </View>
      <PrimaryBtn
        label={LL.InviteFriend.invite()}
        onPress={onSubmit}
        loading={loading}
        disabled={loading || (!email && (!countryCode || !phoneNumber))}
        btnStyle={{ marginBottom: 10 }}
      />
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  screenStyle: {
    padding: 20,
    flexGrow: 1,
  },
  title: {
    marginBottom: 30,
  },
  main: {
    flex: 1,
  },
}))

export default InviteFriend
