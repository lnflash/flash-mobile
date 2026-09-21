import React, { useMemo, useState } from "react"
import { Alert, ScrollView, Switch, View } from "react-native"
import { useApolloClient } from "@apollo/client"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"

import { DropDownField, InputField } from "@app/components/account-upgrade-flow"
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { useI18nContext } from "@app/i18n/i18n-react"
import { toastShow } from "@app/utils/toast"
import { testProps } from "@app/utils/testProps"
import {
  BankAccountsDocument,
  useBankAccountAddMutation,
  useBankAccountUpdateMutation,
  useSupportedBanksQuery,
} from "@app/graphql/generated"

import {
  BANK_ACCOUNT_UPGRADE_REQUIRED,
  bankAccountErrorMessage,
} from "./bank-account-errors"

const ALLOWED_ACCOUNT_TYPES = ["Chequing", "Savings"]

// Accounts added here are Jamaican (JMD) accounts. Currency drives the payout
// rail and cannot change after the account exists, so it is shown read-only in
// both modes.
const ADD_CURRENCY = "JMD"

type Props = StackScreenProps<RootStackParamList, "EditBankAccount">

// Add a Jamaican bank account, or edit an existing one. Both apply instantly
// (bankAccountAdd / bankAccountUpdate) and refetch BankAccounts so the hub and
// the cash-out picker see the change.
export const EditBankAccountScreen: React.FC<Props> = ({ route, navigation }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()

  const params = route.params
  const isAdd = params.mode === "add"
  const initial = params.mode === "add" ? undefined : params
  const currency = initial?.currency ?? ADD_CURRENCY

  const [bankName, setBankName] = useState(initial?.bankName ?? "")
  const [bankBranch, setBankBranch] = useState(initial?.bankBranch ?? "")
  const [accountType, setAccountType] = useState(
    initial && ALLOWED_ACCOUNT_TYPES.includes(initial.accountType)
      ? initial.accountType
      : "",
  )
  const [accountNumber, setAccountNumber] = useState(initial?.accountNumber ?? "")
  const [makeDefault, setMakeDefault] = useState(false)

  const [nameErr, setNameErr] = useState<string>()
  const [branchErr, setBranchErr] = useState<string>()
  const [accountTypeErr, setAccountTypeErr] = useState<string>()
  const [accountNumErr, setAccountNumErr] = useState<string>()

  const { data } = useSupportedBanksQuery()
  const supportedBanks = useMemo(
    () => data?.supportedBanks.map((el) => ({ label: el.name, value: el.name })) ?? [],
    [data?.supportedBanks],
  )
  const accountTypes = useMemo(
    () => [
      { label: LL.BankAccountsScreen.chequing(), value: "Chequing" },
      { label: LL.BankAccountsScreen.savings(), value: "Savings" },
    ],
    [LL],
  )

  const client = useApolloClient()
  const [addAccount, { loading: adding }] = useBankAccountAddMutation()
  const [updateAccount, { loading: updating }] = useBankAccountUpdateMutation()
  const [refreshing, setRefreshing] = useState(false)
  const loading = adding || updating || refreshing

  const validate = () => {
    let ok = true
    // The backend only accepts a bank from supportedBanks. An edited account
    // whose stored bank is no longer supported must pick a current one.
    if (!bankName || !supportedBanks.some((bank) => bank.value === bankName)) {
      setNameErr(LL.BankAccountsScreen.bankRequired())
      ok = false
    }
    if (bankBranch.trim().length < 2) {
      setBranchErr(LL.BankAccountsScreen.branchRequired())
      ok = false
    }
    if (!ALLOWED_ACCOUNT_TYPES.includes(accountType)) {
      setAccountTypeErr(LL.BankAccountsScreen.accountTypeRequired())
      ok = false
    }
    if (!/^\d{4,}$/.test(accountNumber.trim())) {
      setAccountNumErr(LL.BankAccountsScreen.accountNumberRequired())
      ok = false
    }
    return ok
  }

  const showError = (error?: { code?: string | null; message?: string | null }) => {
    const message = bankAccountErrorMessage(LL, error)
    if (error?.code === BANK_ACCOUNT_UPGRADE_REQUIRED) {
      // No ERPNext customer yet: the account upgrade creates one.
      Alert.alert(LL.BankAccountsScreen.upgradeRequiredTitle(), message, [
        { text: LL.common.cancel(), style: "cancel" },
        {
          text: LL.BankAccountsScreen.upgradeYourAccount(),
          onPress: () => navigation.navigate("AccountType"),
        },
      ])
      return
    }
    Alert.alert("", message)
  }

  const onSubmit = async () => {
    const details = {
      bankName,
      bankBranch: bankBranch.trim(),
      accountType,
      accountNumber: accountNumber.trim(),
    }
    try {
      const payload = initial
        ? (
            await updateAccount({
              variables: { input: { bankAccountId: initial.accountId, ...details } },
            })
          ).data?.bankAccountUpdate
        : (
            await addAccount({
              variables: {
                input: { ...details, currency: ADD_CURRENCY, setDefault: makeDefault },
              },
            })
          ).data?.bankAccountAdd
      const errors = payload?.errors ?? []
      if (errors.length || !payload?.bankAccount) {
        showError(errors[0])
        return
      }
      // Refresh the shared list (hub + cash-out picker) before leaving. Best
      // effort: the change IS saved, so a failed refetch must never read as a
      // failed save (a retry would hit BANK_ACCOUNT_DUPLICATE_NUMBER).
      setRefreshing(true)
      try {
        await client.query({ query: BankAccountsDocument, fetchPolicy: "network-only" })
      } catch {
        // The hub refetches on focus.
      } finally {
        setRefreshing(false)
      }
      toastShow({
        type: "success",
        message: isAdd
          ? LL.BankAccountsScreen.accountAdded()
          : LL.BankAccountsScreen.accountUpdated(),
      })
      navigation.goBack()
    } catch (err) {
      showError({ message: err instanceof Error ? err.message : String(err) })
    }
  }

  const onPressSubmit = () => {
    if (loading) return
    if (!validate()) return
    if (isAdd) {
      onSubmit()
      return
    }
    Alert.alert(
      LL.BankAccountsScreen.confirmTitle(),
      LL.BankAccountsScreen.confirmMessage(),
      [
        { text: LL.common.cancel(), style: "cancel" },
        { text: LL.BankAccountsScreen.saveChanges(), onPress: onSubmit },
      ],
    )
  }

  return (
    <Screen>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <Text type="p3" color={colors.grey2} style={styles.subtitle}>
          {isAdd
            ? LL.BankAccountsScreen.addSubtitle()
            : LL.BankAccountsScreen.editSubtitle()}
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
          {isAdd
            ? LL.BankAccountsScreen.currencyFixedOnAdd()
            : LL.BankAccountsScreen.currencyLocked()}
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
        {isAdd && (
          <View style={styles.defaultRow}>
            <View style={styles.defaultText}>
              <Text type="bl" bold>
                {LL.BankAccountsScreen.setAsDefault()}
              </Text>
              <Text type="caption" color={colors.grey2}>
                {LL.BankAccountsScreen.setAsDefaultHint()}
              </Text>
            </View>
            <Switch
              {...testProps("bank-account-set-default")}
              value={makeDefault}
              onValueChange={setMakeDefault}
            />
          </View>
        )}
      </ScrollView>
      <PrimaryBtn
        label={
          isAdd ? LL.BankAccountsScreen.addAccount() : LL.BankAccountsScreen.saveChanges()
        }
        btnStyle={styles.btn}
        loading={loading}
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
  defaultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: 12,
    marginBottom: 24,
  },
  defaultText: {
    flex: 1,
    rowGap: 2,
  },
  btn: {
    marginVertical: 10,
    marginHorizontal: 20,
  },
}))
