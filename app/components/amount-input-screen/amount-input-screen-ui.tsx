import React, { useMemo } from "react"
import { TouchableOpacity, View } from "react-native"
import { Text, Icon, makeStyles, useTheme } from "@rneui/themed"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useWalletOverviewScreenQuery, WalletCurrency } from "@app/graphql/generated"

// components
import { GaloyErrorBox } from "../atomic/galoy-error-box"
import { CurrencyKeyboard } from "../currency-keyboard"
import { Key } from "./number-pad-reducer"
import { PrimaryBtn } from "../buttons"

// hooks
import { useBreez, useDisplayCurrency } from "@app/hooks"

// assets
import Sync from "@app/assets/icons/sync.svg"

// utils
import { toBtcMoneyAmount, toUsdMoneyAmount } from "@app/types/amounts"
import { getCashWallet } from "@app/graphql/wallets-utils"
import { testProps } from "@app/utils/testProps"

export type MaxChipState = "available" | "active" | "disabled"

export type AmountInputScreenUIProps = {
  walletCurrency: WalletCurrency
  primaryCurrencySymbol?: string
  primaryCurrencyFormattedAmount?: string
  primaryCurrencyCode: string
  secondaryCurrencySymbol?: string
  secondaryCurrencyFormattedAmount?: string
  secondaryCurrencyCode?: string
  errorMessage?: string
  infoMessage?: string
  setAmountDisabled?: boolean
  maxChipState?: MaxChipState
  onMaxPress?: () => void
  onKeyPress: (key: Key) => void
  onToggleCurrency?: () => void
  onClearAmount: () => void
  onSetAmountPress?: () => void
  goBack: () => void
}

export const AmountInputScreenUI: React.FC<AmountInputScreenUIProps> = ({
  walletCurrency,
  primaryCurrencySymbol,
  primaryCurrencyFormattedAmount,
  primaryCurrencyCode,
  secondaryCurrencySymbol,
  secondaryCurrencyFormattedAmount,
  secondaryCurrencyCode,
  errorMessage,
  infoMessage,
  onKeyPress,
  onToggleCurrency,
  onSetAmountPress,
  setAmountDisabled,
  maxChipState,
  onMaxPress,
  goBack,
}) => {
  const styles = useStyles()
  const { bottom } = useSafeAreaInsets()
  const { LL } = useI18nContext()
  const { colors } = useTheme().theme
  const { btcWallet } = useBreez()
  const { moneyAmountToDisplayCurrencyString } = useDisplayCurrency()

  const { data } = useWalletOverviewScreenQuery({ fetchPolicy: "cache-only" })

  const balanceText = useMemo(() => {
    if (walletCurrency === WalletCurrency.Btc) {
      return moneyAmountToDisplayCurrencyString({
        moneyAmount: toBtcMoneyAmount(btcWallet?.balance ?? 0),
      })
    }
    const usdWallet = getCashWallet(data?.me?.defaultAccount?.wallets)
    return moneyAmountToDisplayCurrencyString({
      moneyAmount: toUsdMoneyAmount(usdWallet?.balance ?? 0),
    })
  }, [walletCurrency, btcWallet?.balance, data, moneyAmountToDisplayCurrencyString])

  return (
    <View
      style={[styles.amountInputScreenContainer, { marginBottom: !bottom ? 20 : 10 }]}
    >
      <View style={styles.topContainer}>
        <View style={styles.header}>
          <View style={styles.balance}>
            <Text type="p1" bold>
              Balance
            </Text>
            <View style={styles.balanceValueRow}>
              <Text type="p1" bold>
                {balanceText}
              </Text>
              {maxChipState && (
                <TouchableOpacity
                  {...testProps("Max Amount Chip")}
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: maxChipState === "disabled",
                    selected: maxChipState === "active",
                  }}
                  disabled={maxChipState === "disabled"}
                  onPress={onMaxPress}
                  style={[
                    styles.maxChip,
                    maxChipState === "active" && styles.maxChipActive,
                    maxChipState === "disabled" && styles.maxChipDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.maxChipText,
                      maxChipState === "active" && styles.maxChipTextActive,
                      maxChipState === "disabled" && styles.maxChipTextDisabled,
                    ]}
                  >
                    {LL.AmountInputScreen.max()}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          <TouchableOpacity style={styles.close} onPress={goBack}>
            <Icon type="ionicon" name={"close"} size={40} />
          </TouchableOpacity>
        </View>
        <Text
          type={primaryCurrencyCode === "SAT" ? "h03" : "h04"}
          style={styles.primaryAmount}
        >
          {`${primaryCurrencySymbol}${primaryCurrencyFormattedAmount || 0}`}
          {!primaryCurrencySymbol && <Text>{` ${primaryCurrencyCode}`}</Text>}
        </Text>
        {!!secondaryCurrencyCode && (
          <TouchableOpacity style={styles.secondaryAmount} onPress={onToggleCurrency}>
            <Text>{`${secondaryCurrencySymbol}${secondaryCurrencyFormattedAmount} ${
              secondaryCurrencySymbol ? "" : secondaryCurrencyCode
            }`}</Text>
            <Sync color={colors.icon01} />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.bottomContainer}>
        <View style={styles.infoContainer}>
          {errorMessage ? (
            <GaloyErrorBox errorMessage={errorMessage} />
          ) : infoMessage ? (
            <Text {...testProps("Max Amount Note")} style={styles.infoText}>
              {infoMessage}
            </Text>
          ) : null}
        </View>
        <CurrencyKeyboard onPress={onKeyPress} />
        <PrimaryBtn
          disabled={!onSetAmountPress || setAmountDisabled}
          onPress={onSetAmountPress ? onSetAmountPress : () => {}}
          label={LL.AmountInputScreen.setAmount()}
          btnStyle={styles.btnStyle}
        />
      </View>
    </View>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  amountInputScreenContainer: {
    flex: 1,
  },
  balanceValueRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  maxChip: {
    marginLeft: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  maxChipActive: {
    backgroundColor: colors.primary,
  },
  maxChipDisabled: {
    borderColor: colors.grey3,
  },
  maxChipText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "bold",
  },
  maxChipTextActive: {
    color: colors._white,
  },
  maxChipTextDisabled: {
    color: colors.grey3,
  },
  infoText: {
    textAlign: "center",
    color: colors.grey2,
  },
  topContainer: {
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },
  balance: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 80,
  },
  close: {
    paddingHorizontal: 20,
  },
  primaryAmount: {
    marginTop: 50,
  },
  secondaryAmount: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#DDE3E1",
    marginTop: 30,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  infoContainer: {
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  bottomContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  btnStyle: {
    marginHorizontal: 20,
    marginTop: 10,
  },
}))
