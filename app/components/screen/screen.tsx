import * as React from "react"
import { KeyboardAvoidingView, ScrollView, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { ScreenProps } from "./screen.props"
import { isNonScrolling, offsets, presets } from "./screen.presets"
import { isIos } from "../../utils/helper"
import { useTheme } from "@rneui/themed"

/**
 * Safe-area handling (ENG-605, Android 16 forced edge-to-edge).
 *
 * The wrapper is react-native-safe-area-context's SafeAreaView, not the core
 * one. The core component is iOS-only (a plain View on Android) and is
 * deprecated in RN 0.77; the context one pads by the system-bar overlap on
 * both platforms. Two properties make it safe to apply unconditionally:
 *
 * - It is position-aware: the native view pads only by the part of the
 *   window insets it actually overlaps. Below a navigation header, or above
 *   a bottom tab bar, the corresponding edge resolves to 0, so screens with
 *   headers do not double-pad.
 * - When the window is not edge-to-edge (Android 14 and older at target 35,
 *   or any window that fits system windows) the overlap is 0, so the layout
 *   is byte-identical to the old plain View. When the window IS edge-to-edge
 *   (Android 15+ today, every Android 16 device once targetSdk moves to 36)
 *   content is pushed out from under the status and navigation bars.
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
function ScreenWithoutScrolling(props: ScreenProps) {
  const {
    theme: { colors },
  } = useTheme()

  const preset = presets.fixed
  const style = props.style || {}
  const backgroundStyle = props.backgroundColor
    ? { backgroundColor: props.backgroundColor }
    : { backgroundColor: colors.white }
  const Wrapper = props.unsafe ? View : SafeAreaView

  return (
    <KeyboardAvoidingView
      style={[preset.outer, backgroundStyle]}
      behavior={isIos ? "padding" : undefined}
      keyboardVerticalOffset={offsets[props.keyboardOffset || "none"]}
    >
      <Wrapper style={[preset.inner, style]}>{props.children}</Wrapper>
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
  const Wrapper = props.unsafe ? View : SafeAreaView

  return (
    <KeyboardAvoidingView
      style={[preset.outer, backgroundStyle]}
      behavior={isIos ? "padding" : undefined}
      keyboardVerticalOffset={offsets[props.keyboardOffset || "none"]}
    >
      <Wrapper style={[preset.outer, backgroundStyle]}>
        <ScrollView
          style={[preset.outer, backgroundStyle]}
          contentContainerStyle={[preset.inner, style]}
          keyboardShouldPersistTaps={props.keyboardShouldPersistTaps}
        >
          {props.children}
        </ScrollView>
      </Wrapper>
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
