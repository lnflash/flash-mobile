import React from "react"
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native"
import { useTheme } from "@rneui/themed"

import { CARD_ART, CARD_PALETTE, CardArtV2 } from "./cardArtV2"

/**
 * The Cashu card (Flashcard v2, "Bearer") as the app shows it: the card art
 * flash-pos draws (cardArtV2.tsx, shared byte-for-byte), as a still. It is
 * the printed card's face and nothing more: the chip-side contactless arcs
 * sit in the art at their resting 60 %, and no id is drawn on it (the screen
 * lists the card's id, and the physical card prints none).
 */

/** Kept either side of the card on a phone too narrow for the full 320 dp. */
const SIDE_MARGIN = 24

/**
 * The card's width on a window this wide: one art unit per dp (320), narrower
 * only to keep SIDE_MARGIN either side. FlashcardV2Art takes its height from
 * it, at the card's aspect.
 */
export const flashcardV2ArtWidth = (windowWidth: number) =>
  Math.min(CARD_ART.width, windowWidth - 2 * SIDE_MARGIN)

type Props = {
  width: number
  /** What a screen reader says for the card; the art itself has no text. */
  accessibilityLabel: string
  style?: StyleProp<ViewStyle>
  testID?: string
}

export const FlashcardV2Art: React.FC<Props> = ({
  width,
  accessibilityLabel,
  style,
  testID,
}) => {
  const { mode, colors } = useTheme().theme
  const k = width / CARD_ART.width
  // The art's own ISO corner at this size: a fixed radius would crop the
  // slash's corner or show the base around the art's.
  const borderRadius = CARD_ART.radius * k
  const size = { width, height: CARD_ART.height * k, borderRadius }
  return (
    // The shadow is on this view and the clip on the inner one: on iOS a view
    // that clips its content clips its own shadow too.
    <View
      style={[styles.card, size, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <View style={[styles.clip, { borderRadius }]}>
        <CardArtV2 />
      </View>
      {/* On the dark theme's black page the card has no edge of its own: its
          base is near-black, the art's lift fades out before the corners, its
          hairline is 2 % white, and a black shadow cannot show on black. This
          outline draws one, over the art: a border on either view above would
          inset the art by its width and squash it. */}
      {mode === "dark" && (
        <View
          pointerEvents="none"
          style={[styles.outline, { borderRadius, borderColor: colors.grey4 }]}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    // The art's base under it, so an anti-aliased corner never fringes the
    // screen's colour.
    backgroundColor: CARD_PALETTE.base,
    shadowColor: CARD_PALETTE.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  clip: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    backgroundColor: CARD_PALETTE.base,
  },
  outline: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
  },
})
