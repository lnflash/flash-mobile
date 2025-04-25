import React from "react"
import { View } from "react-native"
import { makeStyles } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { InputField, PhoneNumber } from "@app/components/business-account-flow"

// store
import { useAppDispatch, useAppSelector } from "@app/store/redux"
import { setPersonalInfo } from "@app/store/redux/slices/businessAccountSlice"

type Props = StackScreenProps<RootStackParamList, "PersonalInformation">

const PersonalInformation: React.FC<Props> = ({ navigation }) => {
  const styles = useStyles()

  const dispatch = useAppDispatch()
  const { fullName, countryCode, phoneNumber, email } = useAppSelector(
    (state) => state.businessAccount.personalInfo,
  )

  const onPressNext = () => {
    navigation.navigate("BusinessInformation")
  }

  return (
    <Screen>
      <View style={styles.container}>
        <InputField
          label="Full Name"
          placeholder="John Doe"
          value={fullName}
          onChangeText={(val) => dispatch(setPersonalInfo({ fullName: val }))}
        />
        <PhoneNumber
          countryCode={countryCode}
          phoneNumber={phoneNumber}
          setCountryCode={(val) => dispatch(setPersonalInfo({ countryCode: val }))}
          setPhoneNumber={(val) => dispatch(setPersonalInfo({ phoneNumber: val }))}
        />
        <InputField
          label="Email Address"
          placeholder="your.email@example.com"
          value={email}
          onChangeText={(val) => dispatch(setPersonalInfo({ email: val }))}
        />
      </View>
      <PrimaryBtn label="Next" btnStyle={styles.btn} onPress={onPressNext} />
    </Screen>
  )
}

export default PersonalInformation

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  btn: {
    marginBottom: 10,
    marginHorizontal: 20,
  },
}))
