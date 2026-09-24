import { useMemo } from "react"
import { ViewStyle } from "react-native"
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
 * Do NOT stack this on a `coverScreen={true}` (RN Modal-hosted) sheet on
 * Android: RN's dialog root has `fitsSystemWindows` and already pads by the
 * system bars.
 *
 * `useSafeAreaInsets` returns 0 for every edge the window does not extend
 * under, so on a non-edge-to-edge window (Android 14 and older at target 35)
 * this is a no-op and the layout is unchanged.
 */
export type ModalInsetKind =
  /** Anchored to the bottom edge: pad the bottom inset only. */
  | "sheet"
  /** `margin: 0` content that fills the window: pad top and bottom. */
  | "fullScreen"

export const useModalInsetStyle = (kind: ModalInsetKind): ViewStyle => {
  const { top, bottom } = useSafeAreaInsets()
  return useMemo(
    () =>
      kind === "sheet"
        ? { paddingBottom: bottom }
        : { paddingTop: top, paddingBottom: bottom },
    [kind, top, bottom],
  )
}
