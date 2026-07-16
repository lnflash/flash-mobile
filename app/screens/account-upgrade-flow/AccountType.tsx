import React, { useCallback } from "react"
import { TouchableOpacity, View } from "react-native"
import { StackScreenProps } from "@react-navigation/stack"
import { Icon, makeStyles, Text, useTheme } from "@rneui/themed"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { AccountLevel } from "@app/graphql/generated"
import { useFocusEffect } from "@react-navigation/native"

// components
import { Screen } from "@app/components/screen"
import { BridgeKycModal } from "@app/components/topup-cashout-flow"

// hooks
import { useLevel } from "@app/graphql/level-context"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useBridgeKyc } from "@app/hooks/use-bridge-kyc"
import { useAccountStatus } from "@app/hooks/use-account-status"

// store
import { useAppDispatch } from "@app/store/redux"
import { setAccountUpgrade } from "@app/store/redux/slices/accountUpgradeSlice"

type Props = StackScreenProps<RootStackParamList, "AccountType">

// "locked" = prerequisite not met (unverified) or feature remotely disabled —
// the row stays visible so the capability is discoverable, but can't be tapped.
type CapRowStatus = "available" | "on" | "pending" | "locked"

type CapRow = {
  icon: string
  title: string
  desc: string
  status: CapRowStatus
  onPress: () => void
}

/**
 * "Do more with Flash" capabilities hub (ENG-513).
 *
 * Replaces the old tier ladder (Personal/Pro/Merchant/International) with a
 * menu of independent capabilities. Verify is the only prerequisite; each row
 * routes straight into that one capability's existing setup flow — no interview.
 * The internal L1/L2/L3 level stays hidden; rows key off the `capabilities`
 * object from `useAccountStatus`, falling back to a level derivation for older
 * backends.
 */
const AccountType: React.FC<Props> = ({ navigation }) => {
  const dispatch = useAppDispatch()
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { currentLevel } = useLevel()
  const { statusHeadline, capabilities, refetch: refetchStatus } = useAccountStatus()
  const {
    bridgeTopupEnabled,
    bridgeKycStatus,
    refetchKycStatus,
    kycModalVisible,
    startBridgeKyc,
    closeKycModal,
    submitBridgeKyc,
  } = useBridgeKyc()

  useFocusEffect(
    useCallback(() => {
      refetchStatus()
      if (bridgeTopupEnabled) refetchKycStatus()
    }, [bridgeTopupEnabled, refetchKycStatus, refetchStatus]),
  )

  // `capabilities` already carries the level-derived fallback for older
  // backends — useAccountStatus is the single source of capability truth.
  const verifiedOn = capabilities.verified
  const bankOn = capabilities.bankPayout
  const businessOn = capabilities.business
  const usdOn = capabilities.usdAccount

  // Bridge KYC has an L1 floor, and ENG-465 can remotely disable Bridge —
  // in both cases the row shows locked rather than disappearing.
  const usdStatus: CapRowStatus = usdOn
    ? "on"
    : bridgeKycStatus === "pending"
    ? "pending"
    : !bridgeTopupEnabled || !verifiedOn
    ? "locked"
    : "available"

  const onPress = (accountType: string) => {
    const numOfSteps =
      accountType === AccountLevel.One ? 3 : currentLevel === AccountLevel.Zero ? 5 : 4

    dispatch(setAccountUpgrade({ accountType, numOfSteps }))
    navigation.navigate("PersonalInformation")
  }

  const isTrial = statusHeadline === "TRIAL" || !verifiedOn
  const headlineLabel = isTrial
    ? LL.AccountUpgrade.statusTrial()
    : statusHeadline === "BUSINESS"
    ? LL.AccountUpgrade.statusBusiness()
    : LL.AccountUpgrade.statusVerified()

  const renderCapRow = ({ icon, title, desc, status, onPress: onRowPress }: CapRow) => {
    const on = status === "on"
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={onRowPress}
        disabled={status !== "available"}
      >
        <View style={[styles.rowIcon, on && styles.rowIconOn]}>
          <Icon
            name={icon}
            size={21}
            color={on ? colors._white : colors.primary}
            type="ionicon"
          />
        </View>
        <View style={styles.textWrapper}>
          <Text type="bl" bold>
            {title}
          </Text>
          <Text type="bm" style={styles.desc}>
            {desc}
          </Text>
        </View>
        {on ? (
          <View style={styles.action}>
            <Icon name="checkmark" size={16} color={colors.green} type="ionicon" />
            <Text style={styles.onText}>{LL.AccountUpgrade.enabled()}</Text>
          </View>
        ) : status === "pending" ? (
          <View style={styles.action}>
            <Icon name="time" size={16} color="orange" type="ionicon" />
            <Text style={styles.onText}>{LL.AccountUpgrade.inReview()}</Text>
          </View>
        ) : status === "locked" ? (
          <View style={styles.action}>
            <Icon name="lock-closed" size={14} color={colors.grey2} type="ionicon" />
            <Text style={styles.lockedText}>{LL.AccountUpgrade.setUp()}</Text>
          </View>
        ) : (
          <View style={styles.action}>
            <Text style={styles.setupText}>{LL.AccountUpgrade.setUp()}</Text>
            <Icon
              name="chevron-forward"
              size={16}
              color={colors.primary}
              type="ionicon"
            />
          </View>
        )}
      </TouchableOpacity>
    )
  }

  return (
    <Screen preset="scroll" keyboardShouldPersistTaps="handled">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text type="p2" style={styles.eyebrow}>
            {LL.AccountUpgrade.hubEyebrow()}
          </Text>
          <Text type="h01" bold style={styles.title}>
            {LL.AccountUpgrade.hubTitle()}
          </Text>
          <View style={styles.statusRow}>
            <View style={[styles.pill, isTrial ? styles.pillMuted : styles.pillOn]}>
              {!isTrial && (
                <Icon
                  name="checkmark-circle"
                  size={15}
                  color={colors._white}
                  type="ionicon"
                />
              )}
              <Text
                style={[
                  styles.pillText,
                  isTrial ? styles.pillTextMuted : styles.pillTextOn,
                ]}
              >
                {headlineLabel}
              </Text>
            </View>
          </View>
        </View>

        {!verifiedOn && (
          <TouchableOpacity
            style={styles.verifyCard}
            onPress={() => onPress(AccountLevel.One)}
          >
            <View style={styles.verifyIcon}>
              <Icon
                name="shield-checkmark"
                size={22}
                color={colors._white}
                type="ionicon"
              />
            </View>
            <View style={styles.textWrapper}>
              <Text type="bl" bold>
                {LL.AccountUpgrade.verifyTitle()}
              </Text>
              <Text type="bm" style={styles.desc}>
                {LL.AccountUpgrade.verifyDesc()}
              </Text>
            </View>
            <Icon
              name="chevron-forward"
              size={22}
              color={colors.primary}
              type="ionicon"
            />
          </TouchableOpacity>
        )}

        <Text style={styles.sectionLabel}>{LL.AccountUpgrade.sectionGetPaid()}</Text>
        {renderCapRow({
          icon: "business",
          title: LL.AccountUpgrade.bankCashoutTitle(),
          desc: LL.AccountUpgrade.bankCashoutDesc(),
          status: bankOn ? "on" : "available",
          onPress: () => onPress(AccountLevel.Two),
        })}
        {renderCapRow({
          icon: "logo-usd",
          title: LL.AccountUpgrade.usdAccountTitle(),
          desc: LL.AccountUpgrade.usdAccountDesc(),
          status: usdStatus,
          onPress: () => {
            startBridgeKyc()
          },
        })}

        <Text style={styles.sectionLabel}>{LL.AccountUpgrade.sectionGrow()}</Text>
        {renderCapRow({
          icon: "storefront",
          title: LL.AccountUpgrade.businessTitle(),
          desc: LL.AccountUpgrade.businessDesc(),
          status: businessOn ? "on" : "available",
          onPress: () => onPress(AccountLevel.Three),
        })}
      </View>

      <BridgeKycModal
        visible={kycModalVisible}
        onClose={closeKycModal}
        onSubmit={submitBridgeKyc}
      />
    </Screen>
  )
}

export default AccountType

const useStyles = makeStyles(({ colors }) => ({
  container: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 8,
  },
  eyebrow: {
    color: colors.grey2,
  },
  title: {
    marginTop: 2,
  },
  statusRow: {
    flexDirection: "row",
    marginTop: 14,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  pillOn: {
    backgroundColor: colors.primary,
  },
  pillMuted: {
    backgroundColor: colors.grey4,
  },
  pillText: {
    fontWeight: "600",
  },
  pillTextOn: {
    color: colors._white,
    marginLeft: 6,
  },
  pillTextMuted: {
    color: colors.grey1,
  },
  sectionLabel: {
    color: colors.grey2,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 22,
    marginBottom: 10,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.grey5,
    padding: 14,
    marginVertical: 6,
    borderRadius: 16,
  },
  verifyCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.grey5,
    padding: 15,
    marginTop: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  verifyIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.grey4,
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconOn: {
    backgroundColor: colors.primary,
  },
  textWrapper: {
    flex: 1,
    marginHorizontal: 14,
  },
  desc: {
    marginTop: 2,
    color: colors.grey1,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
  },
  setupText: {
    color: colors.primary,
    fontWeight: "600",
    marginRight: 3,
  },
  lockedText: {
    color: colors.grey2,
    fontWeight: "600",
    marginLeft: 4,
  },
  onText: {
    color: colors.grey1,
    fontWeight: "600",
    marginLeft: 4,
  },
}))
