import React, { useRef } from "react"
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native"
import Modal from "react-native-modal"
import { Icon, makeStyles, Text, useTheme } from "@rneui/themed"

import { useI18nContext } from "@app/i18n/i18n-react"
import { testProps } from "@app/utils/testProps"

import { CashoutAccountSource, useCashoutAccounts } from "./use-cashout-accounts"

// Share of the window the account list may take before it scrolls, so the
// title and the manage link always stay on screen.
const LIST_MAX_HEIGHT_RATIO = 0.6

type Props = {
  visible: boolean
  /** Which rail's accounts to list: local (ERPNext) or Bridge external (US). */
  source?: CashoutAccountSource
  /** The account chosen for this cashout; falls back to the server default. */
  selectedAccountId?: string
  onSelectAccount: (accountId: string) => void
  /** Shown as a link under the list; runs once the sheet has fully hidden. */
  onManageAccounts?: () => void
  onClose: () => void
}

/**
 * Bottom sheet listing the accounts a cashout can be paid to.
 *
 * MUST be rendered as a direct child of the screen root (a sibling of the
 * screen's ScrollView), never inside the "Withdraw to" card: with
 * coverScreen={false} react-native-modal renders inline as an absoluteFill of
 * its parent, so a small parent would clip the sheet to that parent.
 */
const CashoutAccountPicker: React.FC<Props> = ({
  visible,
  source = "local",
  selectedAccountId,
  onSelectAccount,
  onManageAccounts,
  onClose,
}) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { height } = useWindowDimensions()

  const { options, currentId } = useCashoutAccounts({ source, selectedAccountId })

  // Navigating in the same tick as hiding the sheet races the hide animation;
  // the manage link only flags the intent and onModalHide acts on it.
  const manageAfterHide = useRef(false)

  const onPressOption = (id: string) => {
    onSelectAccount(id)
    onClose()
  }

  const onPressManage = () => {
    manageAfterHide.current = true
    onClose()
  }

  const onModalHide = () => {
    if (!manageAfterHide.current) return
    manageAfterHide.current = false
    onManageAccounts?.()
  }

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={onClose}
      onBackButtonPress={onClose}
      onModalHide={onModalHide}
      backdropOpacity={0.3}
      backdropColor={colors.grey3}
      backdropTransitionOutTiming={0}
      style={styles.modal}
      /**
       * Render inline instead of through the native modal host. RCTModalHostView
       * is broken under Fabric/New Architecture on Android (see #545): it
       * wrongly measures the flex:1 content container, so this bottom-anchored
       * (justifyContent: "flex-end") sheet is positioned off-screen while its
       * full-screen backdrop keeps capturing touches — the options become
       * unreachable and the app appears frozen mid-cashout. coverScreen={false}
       * takes react-native-modal's inline render path and measures correctly.
       */
      coverScreen={false}
    >
      <View style={styles.sheet}>
        <Text type="h2" bold style={styles.sheetTitle}>
          {LL.Cashout.chooseAccount()}
        </Text>
        <ScrollView
          style={{ maxHeight: height * LIST_MAX_HEIGHT_RATIO }}
          {...testProps("cashout-account-list")}
        >
          {options.map((option) => {
            const isSelected = option.id === currentId
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
        </ScrollView>
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
  )
}

export default CashoutAccountPicker

const useStyles = makeStyles(({ colors }) => ({
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
