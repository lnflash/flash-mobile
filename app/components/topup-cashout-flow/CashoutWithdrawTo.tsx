import React, { useState } from "react"
import { Pressable, TouchableOpacity, View } from "react-native"
import Modal from "react-native-modal"
import { Icon, makeStyles, Text, useTheme } from "@rneui/themed"

import { useI18nContext } from "@app/i18n/i18n-react"
import {
  useBankAccountsQuery,
  useBridgeExternalAccountsQuery,
} from "@app/graphql/generated"
import {
  pickDefaultBankAccount,
  pickDefaultExternalAccount,
} from "@app/screens/topup-cashout-flow/cashout-estimate"
import { displayCurrencyCode } from "@app/utils/currency-display"
import { testProps } from "@app/utils/testProps"

type Props = {
  /** Which rail's accounts to show: local (ERPNext) or Bridge external (US). */
  source?: "local" | "bridge"
  /** Payout currency already fixed by an offer; narrows the local selection. */
  preferredCurrency?: string
  /** The account chosen for this cashout; falls back to the server default. */
  selectedAccountId?: string
  /**
   * Makes the card a picker: tapping it lists the eligible accounts. Without
   * it the card is display-only (the confirmation screen, where the offer is
   * already locked to an account) and tapping expands the account details.
   */
  onSelectAccount?: (accountId: string) => void
  /** Shown as a link at the bottom of the picker. */
  onManageAccounts?: () => void
}

type Option = {
  id: string
  bankName: string
  last4: string
  currency: string
  isDefault: boolean
}

const last4Of = (value: string) => String(value).slice(-4)

const CashoutWithdrawTo: React.FC<Props> = ({
  source = "local",
  preferredCurrency,
  selectedAccountId,
  onSelectAccount,
  onManageAccounts,
}) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const [expanded, setExpanded] = useState(false)
  const [pickerVisible, setPickerVisible] = useState(false)

  const isBridge = source === "bridge"
  const isPicker = Boolean(onSelectAccount)

  // cache-first: the cash-out screen's own query (or a Settings mutation's
  // refetch) fills the cache, and a cold cache still loads from the network.
  const { data: bankData } = useBankAccountsQuery({
    fetchPolicy: "cache-first",
    skip: isBridge,
  })
  const { data: externalData } = useBridgeExternalAccountsQuery({
    fetchPolicy: "cache-first",
    skip: !isBridge,
  })

  const bankAccounts = bankData?.me?.bankAccounts ?? []
  const externalAccounts =
    externalData?.bridgeExternalAccounts?.flatMap((account) =>
      account ? [account] : [],
    ) ?? []

  // Same selection functions the cash-out screen sends with — never re-derive.
  const bankAccount = isBridge
    ? undefined
    : pickDefaultBankAccount(bankAccounts, {
        selectedId: selectedAccountId,
        preferredCurrency,
      })
  const externalAccount = isBridge
    ? pickDefaultExternalAccount(externalAccounts, selectedAccountId)
    : undefined

  const options: Option[] = isBridge
    ? externalAccounts.map((account) => ({
        id: account.id,
        bankName: account.bankName,
        last4: last4Of(account.accountNumberLast4),
        currency: "USD",
        isDefault: account.isDefault,
      }))
    : bankAccounts.flatMap((account) =>
        account.id
          ? [
              {
                id: account.id,
                bankName: account.bankName,
                last4: last4Of(account.accountNumber),
                currency: displayCurrencyCode(account.currency),
                isDefault: account.isDefault,
              },
            ]
          : [],
      )

  const current = bankAccount ?? externalAccount
  // Display-only mode has nothing to show without an account; the picker still
  // renders so the user can reach "Manage bank accounts" and add one.
  if (!current && !isPicker) return null

  const maskedAccount = bankAccount
    ? `**********${last4Of(bankAccount.accountNumber)}`
    : externalAccount
    ? `${externalAccount.bankName} ••${externalAccount.accountNumberLast4}`
    : isBridge
    ? LL.Cashout.noExternalAccountFound()
    : LL.Cashout.noBankAccountFound()

  const onPressCard = () => {
    if (isPicker) {
      setPickerVisible(true)
      return
    }
    setExpanded(!expanded)
  }

  const onPressOption = (id: string) => {
    setPickerVisible(false)
    onSelectAccount?.(id)
  }

  const onPressManage = () => {
    setPickerVisible(false)
    onManageAccounts?.()
  }

  return (
    <View>
      <Text type="bl" bold>
        {LL.Cashout.withdrawTo()}
      </Text>
      <TouchableOpacity
        style={styles.card}
        onPress={onPressCard}
        activeOpacity={0.7}
        {...testProps("cashout-withdraw-to")}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text type="bl">{maskedAccount}</Text>
            {isPicker && bankAccount && (
              <Text type="caption" color={colors.grey3}>
                {bankAccount.bankName} · {displayCurrencyCode(bankAccount.currency)}
              </Text>
            )}
          </View>
          <Icon
            name={expanded ? "chevron-down" : "chevron-forward"}
            type="ionicon"
            size={20}
            color={colors.grey3}
          />
        </View>
        {expanded && bankAccount && (
          <View style={styles.details}>
            <DetailRow label={LL.Cashout.bankName()} value={bankAccount.bankName} />
            <DetailRow label={LL.Cashout.bankBranch()} value={bankAccount.bankBranch} />
            <DetailRow
              label={LL.Cashout.accountNumber()}
              value={String(bankAccount.accountNumber)}
            />
            <DetailRow label={LL.Cashout.accountType()} value={bankAccount.accountType} />
            <DetailRow
              label={LL.Cashout.currency()}
              value={displayCurrencyCode(bankAccount.currency)}
            />
          </View>
        )}
      </TouchableOpacity>

      {isPicker && (
        <Modal
          isVisible={pickerVisible}
          onBackdropPress={() => setPickerVisible(false)}
          onBackButtonPress={() => setPickerVisible(false)}
          backdropOpacity={0.3}
          backdropColor={colors.grey3}
          style={styles.modal}
        >
          <View style={styles.sheet}>
            <Text type="h2" bold style={styles.sheetTitle}>
              {LL.Cashout.chooseAccount()}
            </Text>
            {options.map((option) => {
              const isSelected = option.id === current?.id
              return (
                <Pressable
                  key={option.id}
                  style={styles.option}
                  onPress={() => onPressOption(option.id)}
                  accessibilityState={{ selected: isSelected }}
                  {...testProps(`cashout-account-${option.id}`)}
                >
                  <Icon
                    name={isSelected ? "radio-button-on" : "radio-button-off"}
                    type="ionicon"
                    size={22}
                    color={isSelected ? colors.primary : colors.grey3}
                  />
                  <View style={styles.optionText}>
                    <Text type="p1" bold>
                      {option.bankName}
                    </Text>
                    <Text type="p3" color={colors.grey1}>
                      ••••{option.last4} · {option.currency}
                    </Text>
                  </View>
                  {option.isDefault && (
                    <View style={styles.defaultBadge}>
                      <Text type="p4" bold color={colors.white}>
                        {LL.Cashout.defaultAccount()}
                      </Text>
                    </View>
                  )}
                </Pressable>
              )
            })}
            {onManageAccounts && (
              <Pressable
                style={styles.manageLink}
                onPress={onPressManage}
                {...testProps("cashout-manage-bank-accounts")}
              >
                <Icon
                  name="settings-outline"
                  type="ionicon"
                  size={18}
                  color={colors.primary}
                />
                <Text type="p2" bold color={colors.primary}>
                  {LL.Cashout.manageBankAccounts()}
                </Text>
              </Pressable>
            )}
          </View>
        </Modal>
      )}
    </View>
  )
}

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const styles = useStyles()
  return (
    <View style={styles.detailRow}>
      <Text type="bm" style={styles.detailLabel}>
        {label}
      </Text>
      <Text type="bm">{value}</Text>
    </View>
  )
}

export default CashoutWithdrawTo

const useStyles = makeStyles(({ colors }) => ({
  card: {
    borderRadius: 10,
    marginTop: 5,
    marginBottom: 15,
    padding: 15,
    backgroundColor: colors.grey5,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerText: {
    flex: 1,
    rowGap: 2,
    paddingRight: 12,
  },
  details: {
    marginTop: 12,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  detailLabel: {
    color: colors.grey3,
  },
  modal: {
    justifyContent: "flex-end",
    margin: 0,
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
    backgroundColor: colors.white,
  },
  sheetTitle: {
    marginBottom: 8,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 12,
    minHeight: 64,
    borderBottomWidth: 1,
    borderBottomColor: colors.grey4,
  },
  optionText: {
    flex: 1,
    rowGap: 4,
  },
  defaultBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: colors.primary,
  },
  manageLink: {
    minHeight: 48,
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    columnGap: 8,
  },
}))
