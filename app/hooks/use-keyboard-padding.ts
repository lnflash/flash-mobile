import { Platform } from "react-native"
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from "react-native-reanimated"

/**
 * Bottom padding that keeps input-at-bottom content above the Android
 * keyboard, given the bottom safe-area inset an ancestor already applies.
 *
 * Reanimated reports the IME inset measured from the physical window edge
 * (the translucent flags in `useKeyboardPaddingStyle` make it include the
 * navigation-bar band). Any inset already padded by an ancestor -- `Screen`'s
 * SafeAreaView, or a sheet's own `insets.bottom` -- sits inside that band and
 * must be subtracted or the two stack. Clamped at 0 so a closed keyboard
 * contributes nothing and the ancestor's inset alone remains.
 *
 * Pure so the arithmetic can be unit-tested without a worklet runtime.
 */
export const keyboardPaddingFor = (
  keyboardHeight: number,
  appliedBottomInset: number,
): number => Math.max(keyboardHeight - appliedBottomInset, 0)

/**
 * Animated bottom padding that keeps input-at-bottom content (chat composer,
 * bottom-sheet form) above the Android keyboard -- including Gboard's
 * suggestion strip.
 *
 * Why not Keyboard.addListener: Android 15+ enforces edge-to-edge for
 * targetSdk 35 (and Android 16 removes the opt-out for targetSdk 36), which
 * makes the manifest's `adjustResize` a no-op. The first attempt padded by
 * `keyboardDidShow`'s endCoordinates.height, which was close but wrong twice
 * over -- the suggestion strip appears AFTER the show event without firing
 * another one, so the IME grows ~50px and the composer ends up underneath the
 * strip (found on a Pixel during #716 device testing).
 *
 * Reanimated's useAnimatedKeyboard reads the IME window insets continuously
 * on the UI thread, so the padding tracks every keyboard height change,
 * suggestion strip included. The translucent flags match the app's
 * edge-to-edge window; without them the inset math is offset by the bars.
 * (On Android 14 and older reanimated flips the window to edge-to-edge while
 * a subscriber is mounted, and restores it on unmount, so the math is the
 * same on every Android version.)
 *
 * iOS deliberately contributes nothing: the Screen wrapper's
 * KeyboardAvoidingView behavior="padding" already moves content there, and
 * stacking both would double-shift.
 *
 * @param appliedBottomInset Bottom safe-area inset an ancestor already pads
 *   for. Inside `Screen` that is `useSafeAreaInsets().bottom` (Screen's
 *   SafeAreaView applies it on both platforms). See `keyboardPaddingFor`.
 */
export const useKeyboardPaddingStyle = (appliedBottomInset: number) => {
  const keyboard = useAnimatedKeyboard({
    isStatusBarTranslucentAndroid: true,
    isNavigationBarTranslucentAndroid: true,
  })

  return useAnimatedStyle(() => {
    if (Platform.OS !== "android") return { paddingBottom: 0 }
    return {
      paddingBottom: keyboardPaddingFor(keyboard.height.value, appliedBottomInset),
    }
  })
}

export { Animated }
