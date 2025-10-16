import { Platform } from "react-native"
import DeviceInfo from "react-native-device-info"
import { parsePhoneNumber } from "libphonenumber-js"
import RNFS from "react-native-fs"

// hooks
import { useActivityIndicator } from "./useActivityIndicator"

// store
import { useAppDispatch, useAppSelector } from "@app/store/redux"
import {
  setAccountUpgrade,
  setBankInfo,
  setBusinessInfo,
  setPersonalInfo,
} from "@app/store/redux/slices/accountUpgradeSlice"

import { useBusinessAccountUpgradeRequestMutation, HomeAuthedDocument } from "@app/graphql/generated"

export const useAccountUpgrade = () => {
  const dispatch = useAppDispatch()
  const { userData } = useAppSelector((state) => state.user)
  const { id, accountType, personalInfo, businessInfo, bankInfo } = useAppSelector(
    (state) => state.accountUpgrade,
  )
  const { toggleActivityIndicator } = useActivityIndicator()

  const [businessAccountUpgradeRequestMutation] = useBusinessAccountUpgradeRequestMutation({
    refetchQueries: [HomeAuthedDocument],
  })

  const fetchAccountUpgrade = async (phone?: string) => {
    // Note: This function previously fetched from Supabase
    // Now we rely on the GraphQL backend data from queries
    // This function may no longer be needed, but keeping for compatibility
    console.log("fetchAccountUpgrade called - functionality moved to GraphQL queries")
  }

  const submitAccountUpgrade = async () => {
    toggleActivityIndicator(true)
    const readableVersion = DeviceInfo.getReadableVersion()
    const parsedPhoneNumber = parsePhoneNumber(
      personalInfo.phoneNumber || "",
      personalInfo.countryCode,
    )

    let idDocumentBase64 = undefined
    if (accountType === "merchant" && bankInfo.idDocument) {
      try {
        // Convert image file to base64
        const base64String = await RNFS.readFile(
          bankInfo.idDocument.uri,
          "base64",
        )
        idDocumentBase64 = `data:${bankInfo.idDocument.type};base64,${base64String}`
      } catch (err) {
        console.log("Error converting ID document to base64:", err)
      }
    }

    const input = {
      accountType: accountType,
      fullName: personalInfo.fullName,
      phone: parsedPhoneNumber.number,
      email: personalInfo.email,
      businessName: businessInfo.businessName,
      businessAddress: businessInfo.businessAddress,
      latitude: businessInfo.lat,
      longitude: businessInfo.lng,
      terminalRequested: businessInfo.terminalRequested,
      bankName: bankInfo.bankName,
      bankBranch: bankInfo.bankBranch,
      bankAccountType: bankInfo.bankAccountType,
      accountCurrency: bankInfo.currency,
      bankAccountNumber: bankInfo.accountNumber,
      idDocumentBase64: idDocumentBase64,
      clientVersion: readableVersion,
      deviceInfo: Platform.OS,
    }

    try {
      const { data } = await businessAccountUpgradeRequestMutation({
        variables: { input },
      })

      toggleActivityIndicator(false)

      if (data?.businessAccountUpgradeRequest?.errors?.length) {
        console.error("Upgrade request errors:", data.businessAccountUpgradeRequest.errors)
        return false
      }

      return data?.businessAccountUpgradeRequest?.success ?? false
    } catch (err) {
      console.log("BUSINESS ACCOUNT UPGRADE REQUEST ERR: ", err)
      toggleActivityIndicator(false)
      return false
    }
  }

  return { fetchAccountUpgrade, submitAccountUpgrade }
}
