import { Platform } from "react-native"
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from "react-native-reanimated"

/**
 * Animated bottom padding that keeps the chat composer above the Android
 * keyboard — including Gboard's suggestion strip.
 *
 * Why not Keyboard.addListener: this app targets SDK 35, so Android 15+
 * enforces edge-to-edge and ignores the manifest's `adjustResize`. The first
 * attempt padded by `keyboardDidShow`'s endCoordinates.height, which was
 * close but wrong twice over — the suggestion strip appears AFTER the show
 * event without firing another one, so the IME grows ~50px and the composer
 * ends up underneath the strip (found on a Pixel during #716 device testing).
 *
 * Reanimated's useAnimatedKeyboard reads the IME window insets continuously
 * on the UI thread, so the padding tracks every keyboard height change,
 * suggestion strip included. The translucent flags match the app's
 * edge-to-edge window; without them the inset math is offset by the bars.
 *
 * iOS deliberately contributes nothing: the Screen wrapper's
 * KeyboardAvoidingView behavior="padding" already moves content there, and
 * stacking both would double-shift.
 */
export const useKeyboardPaddingStyle = (fallback: number) => {
  const keyboard = useAnimatedKeyboard({
    isStatusBarTranslucentAndroid: true,
    isNavigationBarTranslucentAndroid: true,
  })

  return useAnimatedStyle(() => {
    if (Platform.OS !== "android") return { paddingBottom: 0 }
    return {
      paddingBottom: Math.max(keyboard.height.value, fallback),
    }
  })
}

export { Animated }
