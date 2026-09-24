import { useMemo } from "react"
import { StyleProp, StyleSheet, ViewStyle } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

/**
 * Safe-area padding for react-native-modal content (ENG-605, Android 16
 * forced edge-to-edge).
 *
 * react-native-modal positions its content with plain flex, so a sheet with
 * `justifyContent: "flex-end", margin: 0` sits on the physical bottom edge of
 * the window. Under edge-to-edge that edge is behind the navigation bar
 * (48dp with 3-button nav). On iOS it was always behind the home indicator.
 *
 * Every bottom sheet in the app renders inline (`coverScreen={false}`, the
 * #545 Fabric workaround). Inline means an `absoluteFill` sibling in the
 * parent tree; Yoga sizes an inset-positioned absolute child against the
 * parent's padding box, so the sheet reaches the window edge even when the
 * parent (typically `Screen`'s SafeAreaView) pads by the inset itself. The
 * inset therefore has to be applied on the sheet, and applying it here never
 * double-counts the parent's padding.
 *
 * The hook is ADDITIVE: pass the sheet's own base style and the returned
 * padding is the base padding plus the inset. It has to be, because every
 * consumer places the result after its base style (`[styles.sheet, inset]`),
 * and a bare `{ paddingBottom: inset }` would replace the designed padding
 * rather than extend it -- with 0 on a window that is not edge-to-edge, which
 * silently stripped `paddingBottom: 32` and friends. A specific edge
 * (`paddingBottom`) also beats the `padding` shorthand in Yoga regardless of
 * order, so the shorthand is folded in too.
 *
 * Do NOT use this on a sheet whose bottom edge is a bottom tab bar (the Home
 * tab's `AccountCreateModal`, `CashWalletCutoverModal`): the sheet's
 * absoluteFill is the tab screen, which ends at the tab bar, and
 * `BottomTabView` already pads `insets.bottom` itself. `useSafeAreaInsets` is
 * the raw window inset, not position-aware, so padding there stacks a second
 * inset band above the tab bar.
 *
 * Do NOT stack this on a `coverScreen={true}` (RN Modal-hosted) sheet on
 * Android: RN's dialog root has `fitsSystemWindows` and already pads by the
 * system bars.
 *
 * `useSafeAreaInsets` returns 0 for every edge the window does not extend
 * under, so on a non-edge-to-edge window (Android 14 and older at target 35,
 * until the first `useAnimatedKeyboard` subscriber flips the window; see
 * `use-keyboard-padding.ts`) the result equals the base padding and the
 * layout is unchanged.
 */
export type ModalInsetKind =
  /** Anchored to the bottom edge: pad the bottom inset only. */
  | "sheet"
  /** `margin: 0` content that fills the window: pad top and bottom. */
  | "fullScreen"

const numberOr = (value: unknown, fallback: number): number =>
  typeof value === "number" ? value : fallback

/**
 * The bottom padding a style resolves to, following Yoga precedence:
 * `paddingBottom` > `paddingVertical` > `padding`. Non-numeric (percentage)
 * values are treated as 0.
 */
export const basePaddingBottom = (base: StyleProp<ViewStyle>): number => {
  const flat = StyleSheet.flatten(base) ?? {}
  return numberOr(
    flat.paddingBottom,
    numberOr(flat.paddingVertical, numberOr(flat.padding, 0)),
  )
}

/** Top counterpart of `basePaddingBottom`. */
export const basePaddingTop = (base: StyleProp<ViewStyle>): number => {
  const flat = StyleSheet.flatten(base) ?? {}
  return numberOr(
    flat.paddingTop,
    numberOr(flat.paddingVertical, numberOr(flat.padding, 0)),
  )
}

/**
 * @param kind Which window edges the modal content touches.
 * @param base The content container's own style; its padding on the padded
 *   edges is preserved and the inset added on top. Place the result AFTER
 *   `base` in the style array: `style={[styles.sheet, insetStyle]}`.
 */
export const useModalInsetStyle = (
  kind: ModalInsetKind,
  base?: StyleProp<ViewStyle>,
): ViewStyle => {
  const { top, bottom } = useSafeAreaInsets()
  const baseBottom = basePaddingBottom(base)
  const baseTop = basePaddingTop(base)
  return useMemo(
    () =>
      kind === "sheet"
        ? { paddingBottom: baseBottom + bottom }
        : { paddingTop: baseTop + top, paddingBottom: baseBottom + bottom },
    [kind, top, bottom, baseTop, baseBottom],
  )
}
