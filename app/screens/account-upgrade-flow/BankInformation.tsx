import React, { useState } from "react"
import { ScrollView } from "react-native"
import { makeStyles } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import {
  DropDownField,
  InputField,
  PhotoUploadField,
  ProgressSteps,
} from "@app/components/account-upgrade-flow"
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"

// hooks
import { useAccountUpgrade } from "@app/hooks"

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

type Props = StackScreenProps<RootStackParamList, "BankInformation">

const BankInformation: React.FC<Props> = ({ navigation }) => {
  const dispatch = useAppDispatch()
  const styles = useStyles()
  const { submitAccountUpgrade } = useAccountUpgrade()

  const [nameErr, setNameErr] = useState<string>()
  const [branchErr, setBranchErr] = useState<string>()
  const [accountTypeErr, setAccountTypeErr] = useState<string>()
  const [currencyErr, setCurrencyErr] = useState<string>()
  const [accountNumErr, setAccountNumErr] = useState<string>()
  const [idDocumentErr, setIdDocumentErr] = useState<string>()
  const {
    accountType,
    numOfSteps,
    bankInfo: {
      bankName,
      bankBranch,
      bankAccountType,
      currency,
      accountNumber,
      idDocument,
    },
  } = useAppSelector((state) => state.accountUpgrade)

  const onPressNext = async () => {
    let hasError = false
    if (bankName && bankName.length < 2) {
      setNameErr("Bank name is required")
      hasError = true
    }
    if (bankBranch && bankBranch.length < 2) {
      setBranchErr("Branch is required")
      hasError = true
    }
    if (!accountType) {
      setAccountTypeErr("Account type is required")
      hasError = true
    }
    if (!currency) {
      setCurrencyErr("Currency is required")
      hasError = true
    }
    if (accountNumber && accountNumber.length < 4) {
      setAccountNumErr("Account number is required")
      hasError = true
    }
    if (!idDocument) {
      setIdDocumentErr("You must upload an ID document before proceeding")
      hasError = true
    }
    if (!hasError) {
      const res = await submitAccountUpgrade()
      if (res) navigation.navigate("AccountUpgradeSuccess")
      else alert("Something went wrong. Please, try again later.")
    }
  }

  return (
    <Screen>
      <ProgressSteps numOfSteps={numOfSteps} currentStep={numOfSteps} />
      <ScrollView style={styles.container}>
        <InputField
          label="Bank Name"
          placeholder="Enter your bank name"
          value={bankName}
          errorMsg={nameErr}
          onChangeText={(val) => {
            setNameErr(undefined)
            dispatch(setBankInfo({ bankName: val }))
          }}
        />
        <InputField
          label="Bank Branch"
          placeholder="Enter your bank branch"
          value={bankBranch}
          errorMsg={branchErr}
          onChangeText={(val) => {
            setBranchErr(undefined)
            dispatch(setBankInfo({ bankBranch: val }))
          }}
        />
        <DropDownField
          label="Account Type"
          placeholder={"Select account type"}
          data={accountTypes}
          value={bankAccountType || ""}
          errorMsg={accountTypeErr}
          onChange={(val) => {
            setAccountTypeErr(undefined)
            dispatch(setBankInfo({ bankAccountType: val }))
          }}
        />
        <DropDownField
          label="Currency"
          placeholder="Select currency"
          data={currencies}
          value={currency || ""}
          errorMsg={currencyErr}
          onChange={(val) => {
            setCurrencyErr(undefined)
            dispatch(setBankInfo({ currency: val }))
          }}
        />
        <InputField
          label="Account Number"
          placeholder="Enter your account number"
          value={accountNumber}
          errorMsg={accountNumErr}
          onChangeText={(val) => {
            setAccountNumErr(undefined)
            dispatch(setBankInfo({ accountNumber: val }))
          }}
        />
        <PhotoUploadField
          label="Upload ID Document"
          photo={idDocument}
          errorMsg={idDocumentErr}
          onPhotoUpload={(val) => dispatch(setBankInfo({ idDocument: val }))}
          setErrorMsg={setIdDocumentErr}
        />
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
