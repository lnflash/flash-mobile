import React from "react"
import { TouchableOpacity, View } from "react-native"
import { makeStyles, Text, useTheme } from "@rneui/themed"

import { useI18nContext } from "@app/i18n/i18n-react"
import { CardError, CardFrame, replyText, validCardOf } from "./card-parts"

// A question instead of a guess (spec §3, §4): the templated prompt, then
// one choice per option, each showing the full username under the name.
// A pick hands the option's id to the thread, which asks the tool again
// with it; with no options the prompt asks the user to say it another way.

export const ClarificationCard: React.FC<{
  payload: unknown
  onPick?: (optionId: string) => void
}> = ({ payload, onPick }) => {
  const { LL } = useI18nContext()
  const styles = useStyles()
  const { colors } = useTheme().theme
  const card = validCardOf(payload, "clarification")
  const prompt = card ? replyText(LL, card.prompt) : ""
  // A prompt the dictionary does not have is a payload this card refuses.
  if (!card || !prompt) return <CardError />
  return (
    <CardFrame title={prompt} testID="assistant-card-clarification">
      {card.options.map((option, index) => (
        <TouchableOpacity
          key={option.id}
          style={[styles.option, !onPick && styles.disabled]}
          onPress={() => onPick?.(option.id)}
          disabled={!onPick}
          accessibilityRole="button"
          accessibilityLabel={
            option.sublabel ? `${option.label}, ${option.sublabel}` : option.label
          }
          accessibilityState={{ disabled: !onPick }}
          testID={`assistant-card-option-${index}`}
        >
          <View>
            <Text type="p2" bold>
              {option.label}
            </Text>
            {option.sublabel ? (
              <Text type="p3" color={colors.grey1}>
                {option.sublabel}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>
      ))}
    </CardFrame>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  option: {
    minHeight: 48,
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.grey3,
  },
  disabled: {
    opacity: 0.4,
  },
}))
