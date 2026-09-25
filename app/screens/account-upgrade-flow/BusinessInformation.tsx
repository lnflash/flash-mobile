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
import { AccountLevel } from "@app/graphql/generated"

// utils
import {
  AddressField as AddressFieldName,
  validateUpgradeAddress,
} from "@app/utils/identity-verification"

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

type AddressErrors = Partial<Record<AddressFieldName, string>>

/**
 * Business name plus a real address. Since ENG-608 the address is required for
 * every level (a bank cash-out request needs it for the reviewer); the Google
 * Places search prefills the fields, all of which stay editable.
 */
const BusinessInformation: React.FC<Props> = ({ navigation }) => {
  const dispatch = useAppDispatch()
  const styles = useStyles()
  const { LL } = useI18nContext()

  const [businessNameErr, setBusinessNameErr] = useState<string>()
  const [addressErrs, setAddressErrs] = useState<AddressErrors>({})
  const { numOfSteps, accountType, businessInfo } = useAppSelector(
    (state) => state.accountUpgrade,
  )
  const isProUpgrade = accountType === AccountLevel.Two

  const {
    businessName,
    businessAddress,
    city,
    country,
    line1,
    line2,
    postalCode,
    state,
    terminalRequested,
  } = businessInfo

  const clearAddressErr = (field: AddressFieldName) =>
    setAddressErrs((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev))

  const onPressNext = async () => {
    let hasError = false
    if (businessName && businessName.length < 2) {
      setBusinessNameErr("Business name must be at least 2 characters")
      hasError = true
    }
    if (!isProUpgrade && !businessName) {
      setBusinessNameErr("Business name is required")
      hasError = true
    }
    const missing = validateUpgradeAddress(businessInfo)
    if (missing.length) {
      const errs: AddressErrors = {}
      for (const field of missing) errs[field] = LL.AccountUpgrade.addressFieldRequired()
      setAddressErrs(errs)
      hasError = true
    }
    if (!hasError) {
      navigation.navigate("BankInformation")
    }
  }

  const onAddressSelect = (data: GooglePlaceData, details: GooglePlaceDetail | null) => {
    setAddressErrs({})
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
    const postalCode = getAddressComponent(details, "postal_code", "postal_code_prefix")
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

  const addressComplete = validateUpgradeAddress(businessInfo).length === 0

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
          isOptional={isProUpgrade}
          onChangeText={(val) => {
            setBusinessNameErr(undefined)
            dispatch(setBusinessInfo({ businessName: val }))
          }}
          autoCapitalize="words"
        />
        <AddressField
          label={
            isProUpgrade
              ? LL.AccountUpgrade.address()
              : LL.AccountUpgrade.businessAddress()
          }
          placeholder={LL.AccountUpgrade.addressSearch()}
          value={businessAddress}
          onAddressSelect={onAddressSelect}
        />
        <InputField
          label={LL.AccountUpgrade.addressLine1()}
          placeholder={LL.AccountUpgrade.addressLine1Placeholder()}
          value={line1}
          errorMsg={addressErrs.line1}
          onChangeText={(val) => {
            clearAddressErr("line1")
            dispatch(setBusinessInfo({ line1: val }))
          }}
          autoCapitalize="words"
        />
        <InputField
          label={LL.AccountUpgrade.addressLine2()}
          placeholder={LL.AccountUpgrade.addressLine2Placeholder()}
          value={line2}
          isOptional
          onChangeText={(val) => dispatch(setBusinessInfo({ line2: val }))}
          autoCapitalize="words"
        />
        <InputField
          label={LL.AccountUpgrade.city()}
          placeholder={LL.AccountUpgrade.cityPlaceholder()}
          value={city}
          errorMsg={addressErrs.city}
          onChangeText={(val) => {
            clearAddressErr("city")
            dispatch(setBusinessInfo({ city: val }))
          }}
          autoCapitalize="words"
        />
        <InputField
          label={LL.AccountUpgrade.state()}
          placeholder={LL.AccountUpgrade.statePlaceholder()}
          value={state}
          errorMsg={addressErrs.state}
          onChangeText={(val) => {
            clearAddressErr("state")
            dispatch(setBusinessInfo({ state: val }))
          }}
          autoCapitalize="words"
        />
        <InputField
          label={LL.AccountUpgrade.postalCode()}
          placeholder={LL.AccountUpgrade.postalCodePlaceholder()}
          value={postalCode}
          isOptional
          onChangeText={(val) => dispatch(setBusinessInfo({ postalCode: val }))}
          autoCapitalize="characters"
        />
        <InputField
          label={LL.AccountUpgrade.country()}
          placeholder={LL.AccountUpgrade.countryPlaceholder()}
          value={country}
          errorMsg={addressErrs.country}
          onChangeText={(val) => {
            clearAddressErr("country")
            dispatch(setBusinessInfo({ country: val }))
          }}
          autoCapitalize="words"
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
        disabled={(!isProUpgrade && !businessName) || !addressComplete}
        btnStyle={styles.btn}
        onPress={onPressNext}
      />
    </Screen>
  )
}

export default BusinessInformation

const useStyles = makeStyles(() => ({
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
