import * as React from "react"
import Toast, {
  SuccessToast,
  ErrorToast,
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
}

export const GaloyToast = () => {
  return <Toast config={toastConfig} />
}
