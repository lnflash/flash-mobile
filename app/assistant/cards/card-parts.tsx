import React from "react"
import { ActivityIndicator, TouchableOpacity, View } from "react-native"
import { makeStyles, Text, useTheme } from "@rneui/themed"

import type { TranslationFunctions } from "@app/i18n/i18n-types"
import { useI18nContext } from "@app/i18n/i18n-react"
import type { AssistantReplyKey } from "../registry/types"
import { ActionCard, CardType, CardWallet, validateCard } from "./types"

// The pieces every card is built from. A card renders the text its payload
// holds and formats nothing (spec §6); what it says itself comes from LL.

/** A reply key's text, through LL. Empty for a key the dictionary does not have. */
export const replyText = (LL: TranslationFunctions, key: AssistantReplyKey): string => {
  const reply = (LL.Assistant as unknown as Record<string, unknown>)[
    key.slice("Assistant.".length)
  ]
  return typeof reply === "function" ? (reply as () => string)() : ""
}

/** A wallet's name, as the wallet screens call it. */
export const walletName = (LL: TranslationFunctions, wallet: CardWallet): string =>
  wallet === "BTC" ? LL.common.btcAccount() : LL.common.usdAccount()

/**
 * The payload as a card of `type`, checked by the render-time validator, or
 * undefined: the caller then renders the error card. A failure is logged in
 * development, with the path that failed.
 */
export const validCardOf = <T extends CardType>(
  payload: unknown,
  type: T,
): Extract<ActionCard, { type: T }> | undefined => {
  const validation = validateCard(payload)
  if (validation.valid && validation.card.type === type) {
    return validation.card as Extract<ActionCard, { type: T }>
  }
  if (__DEV__) {
    console.warn(
      `[assistant] the ${type} card refused its payload`,
      validation.valid
        ? `type ${validation.card.type}`
        : `${validation.path} ${validation.problem}`,
    )
  }
  return undefined
}

export const CardFrame: React.FC<
  React.PropsWithChildren<{ title: string; testID?: string }>
> = ({ title, testID, children }) => {
  const styles = useStyles()
  return (
    <View style={styles.frame} testID={testID}>
      <Text type="p1" bold accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {children}
    </View>
  )
}

/**
 * One labeled line. A screen reader reads it as one element, label then
 * value ("Total, J$785.00 ($5.00)"); text wraps rather than truncates, so
 * large dynamic type still shows every figure.
 */
export const CardRow: React.FC<{
  label: string
  value: string
  /** A second line under the value: a payee's full username. */
  detail?: string
  testID?: string
}> = ({ label, value, detail, testID }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={detail ? `${label}, ${value}, ${detail}` : `${label}, ${value}`}
      testID={testID}
    >
      <Text type="p3" color={colors.grey1} style={styles.rowLabel}>
        {label}
      </Text>
      <View style={styles.rowValue}>
        <Text type="p2" bold style={styles.rowValueText}>
          {value}
        </Text>
        {detail ? (
          <Text type="p3" color={colors.grey1} style={styles.rowValueText}>
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

/** A card's button, announced as one, with its own label and state. */
export const CardButton: React.FC<{
  label: string
  accessibilityLabel?: string
  disabled?: boolean
  loading?: boolean
  outline?: boolean
  onPress: () => void
  testID?: string
}> = ({
  label,
  accessibilityLabel,
  disabled = false,
  loading = false,
  outline,
  onPress,
  testID,
}) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const inactive = disabled || loading
  return (
    <TouchableOpacity
      style={[
        styles.button,
        outline ? styles.buttonOutline : styles.buttonSolid,
        inactive && styles.buttonDisabled,
      ]}
      onPress={onPress}
      disabled={inactive}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator color={outline ? colors.primary : colors.textInverse} />
      ) : (
        <Text type="p2" bold color={outline ? colors.text01 : colors.textInverse}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  )
}

/** A line the card says: a reply after a Confirm, or why Confirm is not available. */
export const CardNotice: React.FC<{
  text: string
  tone?: "error" | "info"
  testID?: string
}> = ({ text, tone = "info", testID }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  if (!text) return null
  return (
    <Text
      type="p3"
      color={tone === "error" ? colors.error : colors.grey1}
      style={styles.notice}
      accessibilityLiveRegion="polite"
      testID={testID}
    >
      {text}
    </Text>
  )
}

/** The templated error card, for a payload that fails validation: never part of a card. */
export const CardError: React.FC = () => {
  const { LL } = useI18nContext()
  const styles = useStyles()
  const { colors } = useTheme().theme
  return (
    <View
      style={styles.frame}
      testID="assistant-card-error"
      accessible
      accessibilityRole="alert"
    >
      <Text type="p2" color={colors.error}>
        {LL.AssistantCards.cardUnavailable()}
      </Text>
    </View>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  frame: {
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    backgroundColor: colors.grey5,
  },
  title: {
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  rowLabel: {
    flexShrink: 0,
    marginRight: 12,
  },
  rowValue: {
    flexShrink: 1,
    alignItems: "flex-end",
  },
  rowValueText: {
    textAlign: "right",
  },
  button: {
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 12,
    borderRadius: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonSolid: {
    backgroundColor: colors.button01,
  },
  buttonOutline: {
    borderWidth: 1,
    borderColor: colors.button01,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  notice: {
    marginTop: 8,
  },
}))
