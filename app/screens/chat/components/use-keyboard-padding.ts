import { useEffect, useState } from "react"
import { Keyboard, Platform } from "react-native"

/**
 * Bottom padding that keeps the chat composer above the Android keyboard.
 *
 * This app targets SDK 35, so Android 15+ enforces edge-to-edge and IGNORES
 * the manifest's `adjustResize` — the window no longer shrinks when the
 * keyboard opens. The `Screen` wrapper's KeyboardAvoidingView only sets a
 * `behavior` on iOS (Android historically relied on adjustResize), so on
 * modern Android the keyboard simply covers the composer.
 *
 * iOS is untouched on purpose: Screen's `behavior="padding"` already moves
 * the content there, and adding this padding on top would double-shift it.
 */
export const useKeyboardPadding = (fallback: number): number => {
  const [keyboardHeight, setKeyboardHeight] = useState(0)

  useEffect(() => {
    if (Platform.OS !== "android") return undefined
    const show = Keyboard.addListener("keyboardDidShow", (e) =>
      setKeyboardHeight(e.endCoordinates?.height ?? 0),
    )
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  if (Platform.OS !== "android") return 0
  return keyboardHeight > 0 ? keyboardHeight : fallback
}
