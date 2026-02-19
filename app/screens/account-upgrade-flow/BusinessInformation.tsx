import React, { useState } from "react"
import { View } from "react-native"
import { makeStyles } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import {
  GooglePlaceData,
  GooglePlaceDetail,
  PlaceType,
} from "react-native-google-places-autocomplete"

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

const getAddressComponent = (
  details: GooglePlaceDetail | null,
  ...types: string[]
): string | undefined => {
  for (const type of types) {
    const component = details?.address_components?.find((c) =>
      c.types.includes(type as PlaceType),
    )
    if (component) return component.long_name
  }
  return undefined
}

type Props = StackScreenProps<RootStackParamList, "BusinessInformation">

const BusinessInformation: React.FC<Props> = ({ navigation }) => {
  const dispatch = useAppDispatch()
  const styles = useStyles()
  const { LL } = useI18nContext()

  const [businessNameErr, setBusinessNameErr] = useState<string>()
  const [businessAddressErr, setBusinessAddressErr] = useState<string>()
  const { numOfSteps, businessInfo } = useAppSelector((state) => state.accountUpgrade)

  const {
    businessName,
    businessAddress,
    city,
    country,
    line1,
    postalCode,
    state,
    terminalRequested,
  } = businessInfo

  const onPressNext = async () => {
    let hasError = false
    if (businessName && businessName.length < 2) {
      setBusinessNameErr("Business name must be at least 2 characters")
      hasError = true
    }
    if (!(city && country && line1 && state)) {
      setBusinessAddressErr("Please enter a valid address")
      hasError = true
    }
    if (!hasError) {
      navigation.navigate("BankInformation")
    }
  }

  const onAddressSelect = (data: GooglePlaceData, details: GooglePlaceDetail | null) => {
    setBusinessAddressErr(undefined)
    const streetNumber = getAddressComponent(details, "street_number", "premise")
    const route = getAddressComponent(details, "route", "street_address", "neighborhood")
    const line1 = [streetNumber, route].filter(Boolean).join(" ") || undefined
    const line2 = getAddressComponent(details, "subpremise")
    const city = getAddressComponent(
      details,
      "locality",
      "sublocality",
      "sublocality_level_1",
      "postal_town",
      "administrative_area_level_2",
    )
    const state = getAddressComponent(details, "administrative_area_level_1")
    const postalCode =
      getAddressComponent(details, "postal_code", "postal_code_prefix") || "000000"
    const country = getAddressComponent(details, "country")

    dispatch(
      setBusinessInfo({
        businessAddress: data.description,
        line1,
        line2,
        city,
        state,
        postalCode,
        country,
      }),
    )
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
          onAddressSelect={onAddressSelect}
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
        disabled={!businessName || !line1}
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
