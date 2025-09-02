import React, { useState } from "react"
import { View } from "react-native"
import { makeStyles, Text } from "@rneui/themed"
import { CountryCode } from "react-native-country-picker-modal"
import {
  parsePhoneNumber,
  CountryCode as PhoneNumberCountryCode,
} from "libphonenumber-js/mobile"
import validator from "validator"

// components
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { EmailInput, PhoneNumberInput } from "@app/components/input"

export const InviteFriend = () => {
  const styles = useStyles()

  const [countryCode, setCountryCode] = useState<CountryCode | undefined>()
  const [phoneNumber, setPhoneNumber] = useState<string | undefined>()
  const [email, setEmail] = useState<string>()

  const onSubmit = () => {
    console.log(">>>>>>>>????", countryCode, phoneNumber)
    if (countryCode && phoneNumber) {
      const parsedPhoneNumber = parsePhoneNumber(
        phoneNumber,
        countryCode as PhoneNumberCountryCode,
      )
      if (parsedPhoneNumber.isValid()) {
        // send email parsedPhoneNumber.number
        console.log("$$$$$$$$$$$$$$$$$", parsedPhoneNumber)
      }
    }
    if (email && validator.isEmail(email)) {
      console.log(">>>>>>>>>>>", email)
    } else {
      console.log(">>>>>>>INVALID EMAIL")
    }
  }

  return (
    <Screen preset="scroll" style={styles.screenStyle}>
      <View style={styles.main}>
        <Text type="h1" bold style={styles.title}>
          Invite a friend to Flash via phone number or email address!
        </Text>
        <PhoneNumberInput
          title={"Enter phone number"}
          countryCode={countryCode}
          phoneNumber={phoneNumber}
          setCountryCode={setCountryCode}
          setPhoneNumber={setPhoneNumber}
        />
        <EmailInput title={"Enter email address"} email={email} setEmail={setEmail} />
      </View>
      <PrimaryBtn label="Invite" onPress={onSubmit} />
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
