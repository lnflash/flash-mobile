import React, { useMemo, useState } from "react"
import { Alert, ScrollView } from "react-native"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"

import { DropDownField, InputField } from "@app/components/account-upgrade-flow"
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { useI18nContext } from "@app/i18n/i18n-react"
import { toastShow } from "@app/utils/toast"
import {
  useBankAccountUpdateRequestMutation,
  useSupportedBanksQuery,
} from "@app/graphql/generated"

const accountTypes = [
  { label: "Select account type", value: null },
  { label: "Chequing", value: "Chequing" },
  { label: "Savings", value: "Savings" },
]

type Props = StackScreenProps<RootStackParamList, "EditBankAccount">

// Lets a user propose changes to an already-approved bank account. The change is
// NOT applied immediately: it is submitted for admin review, and cash-outs keep
// settling to the account's current details until it is approved. Currency is
// locked (it drives the payout rail), so it is shown read-only.
export const EditBankAccountScreen: React.FC<Props> = ({ route, navigation }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()

  const { accountId, currency } = route.params

  const [bankName, setBankName] = useState(route.params.bankName)
  const [bankBranch, setBankBranch] = useState(route.params.bankBranch)
  const [accountType, setAccountType] = useState(route.params.accountType)
  const [accountNumber, setAccountNumber] = useState(route.params.accountNumber)

  const [nameErr, setNameErr] = useState<string>()
  const [branchErr, setBranchErr] = useState<string>()
  const [accountTypeErr, setAccountTypeErr] = useState<string>()
  const [accountNumErr, setAccountNumErr] = useState<string>()

  const { data } = useSupportedBanksQuery()
  const supportedBanks = useMemo(
    () => data?.supportedBanks.map((el) => ({ label: el.name, value: el.name })) ?? [],
    [data?.supportedBanks],
  )

  const [submit, { loading }] = useBankAccountUpdateRequestMutation()

  const validate = () => {
    let ok = true
    if (!bankName || bankName.length < 2) {
      setNameErr("Bank name is required")
      ok = false
    }
    if (!bankBranch || bankBranch.length < 2) {
      setBranchErr("Branch is required")
      ok = false
    }
    if (!accountType) {
      setAccountTypeErr("Account type is required")
      ok = false
    }
    if (!accountNumber || accountNumber.length < 4) {
      setAccountNumErr("Account number is required")
      ok = false
    }
    return ok
  }

  const onSubmit = async () => {
    try {
      const res = await submit({
        variables: {
          input: {
            bankAccountId: accountId,
            bankName,
            bankBranch,
            accountType,
            currency,
            accountNumber,
          },
        },
      })
      const errors = res.data?.bankAccountUpdateRequest.errors ?? []
      if (errors.length) {
        Alert.alert(
          "",
          errors
            .map((e) => e?.message ?? "")
            .filter(Boolean)
            .join(", "),
        )
        return
      }
      toastShow({ type: "success", message: LL.BankAccountsScreen.updateSubmitted() })
      navigation.goBack()
    } catch (err) {
      Alert.alert("", err instanceof Error ? err.message : String(err))
    }
  }

  const onPressSubmit = () => {
    if (loading) return
    if (!validate()) return
    Alert.alert(
      LL.BankAccountsScreen.confirmTitle(),
      LL.BankAccountsScreen.confirmMessage(),
      [
        { text: LL.common.cancel(), style: "cancel" },
        { text: LL.BankAccountsScreen.submitUpdate(), onPress: onSubmit },
      ],
    )
  }

  return (
    <Screen>
      <ScrollView style={styles.container}>
        <Text type="p3" color={colors.grey2} style={styles.subtitle}>
          {LL.BankAccountsScreen.editSubtitle()}
        </Text>
        <DropDownField
          label={LL.AccountUpgrade.bankName()}
          placeholder={LL.AccountUpgrade.bankNamePlaceholder()}
          data={supportedBanks}
          value={bankName}
          errorMsg={nameErr}
          onChange={(val) => {
            setNameErr(undefined)
            setBankName(val)
          }}
        />
        <InputField
          label={LL.AccountUpgrade.bankBranch()}
          placeholder={LL.AccountUpgrade.bankBranchPlaceholder()}
          value={bankBranch}
          errorMsg={branchErr}
          onChangeText={(val) => {
            setBranchErr(undefined)
            setBankBranch(val)
          }}
          autoCapitalize="words"
        />
        <DropDownField
          label={LL.AccountUpgrade.bankAccountType()}
          placeholder={LL.AccountUpgrade.selectBankAccountType()}
          data={accountTypes}
          value={accountType}
          errorMsg={accountTypeErr}
          onChange={(val) => {
            setAccountTypeErr(undefined)
            setAccountType(val)
          }}
        />
        <InputField
          label={LL.AccountUpgrade.currency()}
          value={currency}
          editable={false}
        />
        <Text type="caption" color={colors.grey2} style={styles.lockNote}>
          {LL.BankAccountsScreen.currencyLocked()}
        </Text>
        <InputField
          label={LL.AccountUpgrade.accountNum()}
          placeholder={LL.AccountUpgrade.accountNumPlaceholder()}
          value={accountNumber}
          errorMsg={accountNumErr}
          onChangeText={(val) => {
            setAccountNumErr(undefined)
            setAccountNumber(val)
          }}
          keyboardType="number-pad"
        />
      </ScrollView>
      <PrimaryBtn
        label={LL.BankAccountsScreen.submitUpdate()}
        btnStyle={styles.btn}
        onPress={onPressSubmit}
      />
    </Screen>
  )
}

export default EditBankAccountScreen

const useStyles = makeStyles(() => ({
  container: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  subtitle: {
    marginBottom: 16,
  },
  lockNote: {
    marginTop: -8,
    marginBottom: 15,
  },
  btn: {
    marginVertical: 10,
    marginHorizontal: 20,
  },
}))
