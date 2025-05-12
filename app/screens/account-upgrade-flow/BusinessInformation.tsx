import React, { useState } from "react"
import { View } from "react-native"
import { makeStyles } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import {
  AddressField,
  InputField,
  ProgressSteps,
} from "@app/components/account-upgrade-flow"

// hooks
import { useAccountUpgrade } from "@app/hooks"

// store
import { useAppDispatch, useAppSelector } from "@app/store/redux"
import { setBusinessInfo } from "@app/store/redux/slices/accountUpgradeSlice"

type Props = StackScreenProps<RootStackParamList, "BusinessInformation">

const BusinessInformation: React.FC<Props> = ({ navigation }) => {
  const dispatch = useAppDispatch()
  const styles = useStyles()
  const { submitAccountUpgrade } = useAccountUpgrade()

  const [businessNameErr, setBusinessNameErr] = useState<string>()
  const [businessAddressErr, setBusinessAddressErr] = useState<string>()
  const {
    accountType,
    numOfSteps,
    businessInfo: { businessName, businessAddress, lat, lng },
  } = useAppSelector((state) => state.accountUpgrade)

  const onPressNext = async () => {
    let hasError = false

    if (businessName && businessName.length < 2) {
      setBusinessNameErr("Business name must be at least 2 characters")
      hasError = true
    }
    if (businessAddress && businessAddress.length < 2) {
      setBusinessAddressErr("Please enter a valid address")
      hasError = true
    }
    if (!hasError) {
      if (accountType === "business") {
        const res = await submitAccountUpgrade()
        if (res) navigation.navigate("AccountUpgradeSuccess")
        else alert("Something went wrong. Please, try again later.")
      } else {
        navigation.navigate("BankInformation")
      }
    }
  }

  return (
    <Screen>
      <ProgressSteps
        numOfSteps={numOfSteps}
        currentStep={accountType === "business" ? numOfSteps : numOfSteps - 1}
      />
      <View style={styles.container}>
        <InputField
          label="Business Name"
          placeholder={"Your business name"}
          value={businessName}
          errorMsg={businessNameErr}
          onChangeText={(val) => {
            setBusinessNameErr(undefined)
            dispatch(setBusinessInfo({ businessName: val }))
          }}
        />
        <AddressField
          label="Business address"
          placeholder={"Enter your business address"}
          value={businessAddress}
          errorMsg={businessAddressErr}
          onAddressSelect={(val, lat, lng) =>
            dispatch(setBusinessInfo({ businessAddress: val, lat, lng }))
          }
        />
      </View>
      <PrimaryBtn
        label="Next"
        disabled={!businessName || !businessAddress}
        btnStyle={styles.btn}
        onPress={onPressNext}
      />
    </Screen>
  )
}

export default BusinessInformation

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
