import * as React from "react"
import { TouchableOpacity, View } from "react-native"
import { Text, Icon, makeStyles, useTheme } from "@rneui/themed"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useI18nContext } from "@app/i18n/i18n-react"
import { WalletCurrency } from "@app/graphql/generated"

// components
import { GaloyErrorBox } from "../atomic/galoy-error-box"
import { CurrencyKeyboard } from "../currency-keyboard"
import { Key } from "./number-pad-reducer"
import { PrimaryBtn } from "../buttons"

// assets
import Sync from "@app/assets/icons/sync.svg"

export type AmountInputScreenUIProps = {
  walletCurrency: WalletCurrency
  primaryCurrencySymbol?: string
  primaryCurrencyFormattedAmount?: string
  primaryCurrencyCode: string
  secondaryCurrencySymbol?: string
  secondaryCurrencyFormattedAmount?: string
  secondaryCurrencyCode?: string
  errorMessage?: string
  setAmountDisabled?: boolean
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
  onKeyPress,
  onToggleCurrency,
  onSetAmountPress,
  setAmountDisabled,
  goBack,
}) => {
  const { bottom } = useSafeAreaInsets()
  const { LL } = useI18nContext()
  const { colors } = useTheme().theme
  const styles = useStyles()

  return (
    <View
      style={[styles.amountInputScreenContainer, { marginBottom: !bottom ? 20 : 10 }]}
    >
      <View style={styles.topContainer}>
        <View style={styles.header}>
          <Text type={"h01"} style={styles.headerTxt}>
            {`Receive ${walletCurrency}`}
          </Text>
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
        {!!secondaryCurrencySymbol && (
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
          {errorMessage && <GaloyErrorBox errorMessage={errorMessage} />}
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

const useStyles = makeStyles(() => ({
  amountInputScreenContainer: {
    flex: 1,
  },
  topContainer: {
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },
  headerTxt: {
    flex: 1,
    textAlign: "center",
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
