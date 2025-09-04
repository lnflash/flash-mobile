import React, { useState } from "react"
import { View } from "react-native"
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

  const onSubmit = () => {
    navigation.navigate("InviteFriendSuccess")
    return
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
