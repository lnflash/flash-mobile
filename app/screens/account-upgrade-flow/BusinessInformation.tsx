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
  CheckBoxField,
  InputField,
  ProgressSteps,
} from "@app/components/account-upgrade-flow"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"

// store
import { useAppDispatch, useAppSelector } from "@app/store/redux"
import { setBusinessInfo } from "@app/store/redux/slices/accountUpgradeSlice"

type Props = StackScreenProps<RootStackParamList, "BusinessInformation">

const BusinessInformation: React.FC<Props> = ({ navigation }) => {
  const dispatch = useAppDispatch()
  const styles = useStyles()
  const { LL } = useI18nContext()

  const [businessNameErr, setBusinessNameErr] = useState<string>()
  const [businessAddressErr, setBusinessAddressErr] = useState<string>()
  const {
    numOfSteps,
    businessInfo: { businessName, businessAddress, terminalRequested },
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
      navigation.navigate("BankInformation")
    }
  }

  return (
    <Screen
      preset="scroll"
      keyboardOffset="navigationHeader"
      keyboardShouldPersistTaps="handled"
      style={{ flexGrow: 1 }}
    >
      <ProgressSteps numOfSteps={numOfSteps} currentStep={numOfSteps - 1} />
      <View style={styles.container}>
        <InputField
          label={LL.AccountUpgrade.businessName()}
          placeholder={LL.AccountUpgrade.businessNamePlaceholder()}
          value={businessName}
          errorMsg={businessNameErr}
          onChangeText={(val) => {
            setBusinessNameErr(undefined)
            dispatch(setBusinessInfo({ businessName: val }))
          }}
          autoCapitalize="words"
        />
        <AddressField
          label={LL.AccountUpgrade.businessAddress()}
          placeholder={LL.AccountUpgrade.businessAddressPlaceholder()}
          value={businessAddress}
          errorMsg={businessAddressErr}
          onAddressSelect={(val, lat, lng) =>
            dispatch(setBusinessInfo({ businessAddress: val, lat, lng }))
          }
        />
        <CheckBoxField
          isChecked={terminalRequested}
          onCheck={() =>
            dispatch(setBusinessInfo({ terminalRequested: !terminalRequested }))
          }
        />
      </View>
      <PrimaryBtn
        label={LL.common.next()}
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
  terminalRequest: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 15,
  },
}))
