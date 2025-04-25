import React from "react"
import { ScrollView } from "react-native"
import { makeStyles } from "@rneui/themed"

// components
import {
  DropDownField,
  InputField,
  PhotoUploadField,
} from "@app/components/account-upgrade-flow"
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"

// store
import { useAppDispatch, useAppSelector } from "@app/store/redux"
import { setBankInfo } from "@app/store/redux/slices/accountUpgradeSlice"

const accountTypes = [
  { label: "Select account type", value: null },
  { label: "Checking", value: "checking" },
  { label: "Savings", value: "savings" },
]

const currencies = [
  { label: "Select currency", value: null },
  { label: "USD - US Dollar", value: "usd" },
  { label: "EUR - Euro", value: "eur" },
  { label: "JMD - Jamaican Dollar", value: "jmd" },
  { label: "KYD - Cayman Islands Dollar", value: "kyd" },
  { label: "ANG - Netherlands Antillean Guilder", value: "ang" },
  { label: "XCG - Caribbean Guilder", value: "xcg" },
]

const BankInformation = () => {
  const styles = useStyles()

  const dispatch = useAppDispatch()
  const { bankName, bankBranch, accountType, currency, accountNumber, document } =
    useAppSelector((state) => state.accountUpgrade.bankInfo)

  const onPressNext = () => {}

  return (
    <Screen>
      <ScrollView style={styles.container}>
        <InputField
          label="Bank Name"
          placeholder="Enter your bank name"
          value={bankName}
          onChangeText={(val) => dispatch(setBankInfo({ bankName: val }))}
        />
        <InputField
          label="Bank Branch"
          placeholder="Enter your bank branch"
          value={bankBranch}
          onChangeText={(val) => dispatch(setBankInfo({ bankBranch: val }))}
        />
        <DropDownField
          label="Account Type"
          placeholder={"Select account type"}
          data={accountTypes}
          value={accountType}
          onChange={(val) => dispatch(setBankInfo({ accountType: val }))}
        />
        <DropDownField
          label="Currency"
          placeholder="Select currency"
          data={currencies}
          value={currency}
          onChange={(val) => dispatch(setBankInfo({ currency: val }))}
        />
        <InputField
          label="Account Number"
          placeholder="Enter your account number"
          value={accountNumber}
          onChangeText={(val) => dispatch(setBankInfo({ accountNumber: val }))}
        />
        <PhotoUploadField label="Upload ID Document" />
      </ScrollView>
      <PrimaryBtn label="Next" btnStyle={styles.btn} onPress={onPressNext} />
    </Screen>
  )
}

export default BankInformation

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  btn: {
    marginVertical: 10,
    marginHorizontal: 20,
  },
}))
