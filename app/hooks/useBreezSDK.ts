import { useContext } from "react"
import { BreezSDKContext } from "@app/contexts/BreezSDKContext"

export const useBreezSDK = () => {
  const context = useContext(BreezSDKContext)
  if (context === undefined) {
    throw new Error("useBreezSDK must be used within a BreezSDKProvider")
  }
  return context
}
