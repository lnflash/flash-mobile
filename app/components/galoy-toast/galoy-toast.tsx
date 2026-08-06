import * as React from "react"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Toast, {
  SuccessToast,
  ErrorToast,
  BaseToast,
  BaseToastProps,
} from "react-native-toast-message"

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
      style={{ borderLeftColor: "#ffb020" }}
      text2NumberOfLines={2}
      text1Style={{ fontSize: 16 }}
      text2Style={{ fontSize: 14, color: "#2a2a2a" }}
    />
  ),
}

export const GaloyToast = () => {
  const { top, bottom } = useSafeAreaInsets()

  return <Toast config={toastConfig} topOffset={top + 10} bottomOffset={bottom + 50} />
}
