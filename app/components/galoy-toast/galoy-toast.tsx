import * as React from "react"
import { StyleSheet, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Toast, {
  SuccessToast,
  ErrorToast,
  BaseToast,
  BaseToastProps,
} from "react-native-toast-message"

// Same palette the success/error presets above use inline (grandfathered);
// new entries go through StyleSheet + named colors to satisfy lint.
const warningAccentColor = "#ffb020"
const toastTextColor = "#2a2a2a"

const styles = StyleSheet.create({
  text1: { fontSize: 16 },
  text2: { color: toastTextColor, fontSize: 14 },
  warning: { borderLeftColor: warningAccentColor },
  // The host's own layer. Without it, a top toast on iOS is drawn behind any
  // stack screen that shows a navigation header (react-native-screens puts
  // the active screen above a later sibling that has no zIndex), while the
  // same toast on a header-less screen, or at the bottom, shows. Seen on the
  // Flashcard screen after Remove PIN: the title hid under the header. The
  // layer takes no touches itself (box-none), so the toast's own gestures
  // still work and taps fall through to the screen.
  layer: { ...StyleSheet.absoluteFillObject, zIndex: 9999, elevation: 9999 },
})

const toastConfig = {
  success: (props: BaseToastProps) => (
    <SuccessToast
      {...props}
      text2NumberOfLines={2}
      text1Style={{ fontSize: 16 }}
      text2Style={{ fontSize: 14, color: "#2a2a2a" }}
    />
  ),
  error: (props: BaseToastProps) => (
    <ErrorToast
      {...props}
      text2NumberOfLines={2}
      text1Style={{ fontSize: 16 }}
      text2Style={{ fontSize: 14, color: "#2a2a2a" }}
    />
  ),
  // toastShow's type union includes "warning"; react-native-toast-message
  // THROWS in render on any type missing from this config (tearing the app
  // down to the root ErrorBoundary), so every advertised type must be here.
  warning: (props: BaseToastProps) => (
    <BaseToast
      {...props}
      style={styles.warning}
      text2NumberOfLines={2}
      text1Style={styles.text1}
      text2Style={styles.text2}
    />
  ),
}

export const GaloyToast = () => {
  const { top, bottom } = useSafeAreaInsets()

  return (
    <View testID="toast-layer" pointerEvents="box-none" style={styles.layer}>
      <Toast config={toastConfig} topOffset={top + 10} bottomOffset={bottom + 50} />
    </View>
  )
}
