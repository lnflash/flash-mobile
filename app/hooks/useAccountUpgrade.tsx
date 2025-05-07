import DeviceInfo from "react-native-device-info"
import { parsePhoneNumber } from "libphonenumber-js"

// hooks
import { useActivityIndicator } from "./useActivityIndicator"

// store
import { useAppDispatch, useAppSelector } from "@app/store/redux"
import {
  setAccountUpgrade,
  setBusinessInfo,
  setPersonalInfo,
} from "@app/store/redux/slices/accountUpgradeSlice"

// supabase
import { fetchUser, insertUser, updateUser } from "@app/supabase"

export const useAccountUpgrade = () => {
  const dispatch = useAppDispatch()
  const { userData } = useAppSelector((state) => state.user)
  const { id, accountType, personalInfo, businessInfo, bankInfo } = useAppSelector(
    (state) => state.accountUpgrade,
  )

  const { toggleActivityIndicator } = useActivityIndicator()

  const fetchAccountUpgrade = async () => {
    if (userData.phone) {
      toggleActivityIndicator(true)
      const res = await fetchUser(userData.phone)
      const parsedPhone = parsePhoneNumber(userData.phone)
      dispatch(setAccountUpgrade({ id: res.id }))
      dispatch(
        setPersonalInfo({
          fullName: res.name,
          countryCode: parsedPhone.country,
          phoneNumber: parsedPhone.nationalNumber,
          email: res.email,
        }),
      )
      dispatch(
        setBusinessInfo({
          businessName: res.business_name,
          businessAddress: res.business_address,
          lat: res.latitude,
          lng: res.longitude,
        }),
      )
      toggleActivityIndicator(false)
    }
  }

  const submitAccountUpgrade = async () => {
    toggleActivityIndicator(true)
    const readableVersion = DeviceInfo.getReadableVersion()
    const parsedPhoneNumber = parsePhoneNumber(
      personalInfo.phoneNumber || "",
      personalInfo.countryCode,
    )

    const data = {
      account_type: accountType,
      name: personalInfo.fullName,
      phone: parsedPhoneNumber.number,
      email: personalInfo.email,
      business_name: businessInfo.businessName,
      business_address: businessInfo.businessAddress,
      latitude: businessInfo.lat,
      longitude: businessInfo.lng,
      bank_name: bankInfo.bankName,
      bank_branch: bankInfo.bankBranch,
      bank_account_type: bankInfo.bankAccountType,
      account_currency: bankInfo.currency,
      bank_account_number: bankInfo.accountNumber,
      id_image_url: "",
      terms_accepted: true,
      terminal_requested: undefined,
      client_version: readableVersion,
      device_info: undefined,
      signup_completed: undefined,
    }

    let res = null
    if (!id) {
      res = await insertUser(data)
    } else {
      res = await updateUser(id, data)
    }
    toggleActivityIndicator(false)
    return res
  }

  return { fetchAccountUpgrade, submitAccountUpgrade }
}
