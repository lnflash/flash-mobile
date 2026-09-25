/*
 * Safe-area handling (ENG-605, Android 16 forced edge-to-edge).
 *
 * The wrapper is react-native-safe-area-context's SafeAreaView, not the core
 * one. The core component is iOS-only (a plain View on Android) and is
 * deprecated in RN 0.77; the context one pads by the system-bar overlap on
 * both platforms. When the window is not edge-to-edge (Android 14 and older
 * at target 35, or any window that fits system windows) the overlap is 0, so
 * the layout matches the old plain View. When the window IS edge-to-edge
 * (Android 15+ today, every Android 16 device at targetSdk 36) content is
 * pushed out from under the status and navigation bars.
 *
 * It is NOT position-aware, which is what `edges` is for (ENG-611).
 * safe-area-context 5.x reads the nearest *provider's* insets verbatim and
 * does no frame math against the view's own position — Android resolves
 * `findProvider()` then `getSafeAreaInsets(providerView)`, iOS reads
 * `_providerView.safeAreaInsets`, and the Fabric shadow node folds
 * `stateData.insets.top` in unchanged. Our provider is the root
 * SafeAreaProvider in app.tsx, which spans the window, so `top` is always
 * the full status bar however deep in the tree this sits.
 *
 * React Navigation's header already reserves the status bar (it renders a
 * spacer of `insets.top` above its content), so on a screen with a header
 * the default additive `top` edge would pad by it a second time and leave a
 * status-bar-high band of dead space under the header. Drop the top edge
 * when a header is shown above us; keep it when there is none, where this
 * wrapper is the only thing holding content out of the status bar.
 * `headerTransparent` breaks this equivalence — the header floats absolutely
 * and reserves nothing (stack: `isFloatHeaderAbsolute` in CardStack; bottom
 * tabs: the header's `styles.absolute`), but HeaderShownContext is still
 * true, so such a route would sit under the status bar. No route uses it
 * today. If one is added, it must reinstate the top inset on its own content
 * (`useSafeAreaInsets().top`). Do NOT reach for `unsafe`: that swaps the
 * whole SafeAreaView for a bare View, dropping left, right and bottom too,
 * which on an edge-to-edge window runs the content under the navigation bar
 * — the very defect this wrapper exists to prevent.
 *
 * The bottom edge has the same defect and is NOT fixed here — see ENG-612.
 * A bottom tab bar also pads itself by `insets.bottom` and is laid out below
 * the scene in normal flow, so on a tab screen this wrapper adds that inset a
 * second time. It is not a one-line change: the routes that hide the tab bar
 * with `tabBarStyle: { display: "none" }` (Chat → `messages`, Scan) still need
 * the bottom inset, and `BottomTabBarHeightContext` cannot be trusted to read
 * 0 for them without a device check. ENG-612 carries the detail.
 *
 * Keyboard: KeyboardAvoidingView is `behavior="padding"` on iOS and
 * `undefined` on Android. With no behavior it renders a plain View, so it
 * contributes nothing on Android and cannot double up with the bottom inset
 * above. Android keyboard avoidance is the caller's job: the manifest's
 * `adjustResize` is ignored under edge-to-edge, so input-at-bottom screens
 * use `useKeyboardPaddingStyle` (app/hooks/use-keyboard-padding.ts), which
 * tracks the IME inset directly and subtracts the inset this wrapper already
 * applies.
 */
import { HeaderShownContext } from "@react-navigation/elements"
import * as React from "react"
import { KeyboardAvoidingView, ScrollView, View } from "react-native"
import { Edge, SafeAreaView } from "react-native-safe-area-context"

import { ScreenProps } from "./screen.props"
import { isNonScrolling, offsets, presets } from "./screen.presets"
import { isIos } from "../../utils/helper"
import { useTheme } from "@rneui/themed"

/** The edges to pad under a navigation header: everything but `top`. */
const EDGES_BELOW_HEADER: Edge[] = ["left", "right", "bottom"]

/**
 * The edges the safe-area wrapper should pad. `undefined` means all four.
 *
 * HeaderShownContext is true when this screen, or any parent screen, shows a
 * navigation header. A header reserves the status bar unless it is
 * `headerTransparent`, which this context cannot distinguish — see the banner
 * at the top of the file.
 */
const useSafeAreaEdges = (): Edge[] | undefined => {
  const isHeaderShown = React.useContext(HeaderShownContext)

  return isHeaderShown ? EDGES_BELOW_HEADER : undefined
}

function ScreenWithoutScrolling(props: ScreenProps) {
  const {
    theme: { colors },
  } = useTheme()

  const preset = presets.fixed
  const style = props.style || {}
  const backgroundStyle = props.backgroundColor
    ? { backgroundColor: props.backgroundColor }
    : { backgroundColor: colors.white }
  const edges = useSafeAreaEdges()

  return (
    <KeyboardAvoidingView
      style={[preset.outer, backgroundStyle]}
      behavior={isIos ? "padding" : undefined}
      keyboardVerticalOffset={offsets[props.keyboardOffset || "none"]}
    >
      {props.unsafe ? (
        <View style={[preset.inner, style]}>{props.children}</View>
      ) : (
        <SafeAreaView edges={edges} style={[preset.inner, style]}>
          {props.children}
        </SafeAreaView>
      )}
    </KeyboardAvoidingView>
  )
}

function ScreenWithScrolling(props: ScreenProps) {
  const {
    theme: { colors },
  } = useTheme()

  const preset = presets.scroll
  const style = props.style || {}
  const backgroundStyle = props.backgroundColor
    ? { backgroundColor: props.backgroundColor }
    : { backgroundColor: colors.white }
  const edges = useSafeAreaEdges()

  const scroller = (
    <ScrollView
      style={[preset.outer, backgroundStyle]}
      contentContainerStyle={[preset.inner, style]}
      keyboardShouldPersistTaps={props.keyboardShouldPersistTaps}
    >
      {props.children}
    </ScrollView>
  )

  return (
    <KeyboardAvoidingView
      style={[preset.outer, backgroundStyle]}
      behavior={isIos ? "padding" : undefined}
      keyboardVerticalOffset={offsets[props.keyboardOffset || "none"]}
    >
      {props.unsafe ? (
        <View style={[preset.outer, backgroundStyle]}>{scroller}</View>
      ) : (
        <SafeAreaView edges={edges} style={[preset.outer, backgroundStyle]}>
          {scroller}
        </SafeAreaView>
      )}
    </KeyboardAvoidingView>
  )
}

/**
 * The starting component on every screen in the app.
 *
 * @param props The screen props
 */
export const Screen: React.FC<ScreenProps> = (props) => {
  if (isNonScrolling(props.preset)) {
    return <ScreenWithoutScrolling {...props} />
  }
  return <ScreenWithScrolling {...props} />
}
