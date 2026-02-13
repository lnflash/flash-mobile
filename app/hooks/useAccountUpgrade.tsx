import { useEffect } from "react"
import { parsePhoneNumber } from "libphonenumber-js"

// hooks
import { useActivityIndicator } from "./useActivityIndicator"
import { useAppDispatch, useAppSelector } from "@app/store/redux"
import {
  useBusinessAccountUpgradeRequestMutation,
  HomeAuthedDocument,
  useIdDocumentUploadUrlGenerateMutation,
  AccountLevel,
  useAccountUpgradeRequestQuery,
  useUserEmailRegistrationInitiateMutation,
  useAuthQuery,
} from "@app/graphql/generated"

// store
import {
  setAccountUpgrade,
  setBankInfo,
  setBusinessInfo,
  setPersonalInfo,
} from "@app/store/redux/slices/accountUpgradeSlice"

type UpgradeResult = {
  success: boolean
  errors?: string[]
}

export const useAccountUpgrade = () => {
  const dispatch = useAppDispatch()
  const { toggleActivityIndicator } = useActivityIndicator()
  const { accountType, status, personalInfo, businessInfo, bankInfo } = useAppSelector(
    (state) => state.accountUpgrade,
  )

  const { data: dataAuthed } = useAuthQuery()
  const { data } = useAccountUpgradeRequestQuery({ fetchPolicy: "cache-and-network" })
  const upgradeData = data?.accountUpgradeRequest.upgradeRequest

  const [registerUserEmail] = useUserEmailRegistrationInitiateMutation()
  const [generateIdDocumentUploadUrl] = useIdDocumentUploadUrlGenerateMutation()
  const [requestAccountUpgrade] = useBusinessAccountUpgradeRequestMutation({
    refetchQueries: [HomeAuthedDocument],
  })

  useEffect(() => {
    if (upgradeData && upgradeData.status !== status) {
      setAccountUpgradeData()
    }
  }, [upgradeData])

  const setAccountUpgradeData = () => {
    if (upgradeData) {
      const parsedPhone = upgradeData.phoneNumber
        ? parsePhoneNumber(upgradeData.phoneNumber)
        : undefined
      dispatch(
        setAccountUpgrade({
          status: upgradeData.status,
        }),
      )
      dispatch(
        setPersonalInfo({
          fullName: upgradeData.fullName,
          countryCode: parsedPhone?.country,
          phoneNumber: parsedPhone?.nationalNumber,
          email: upgradeData.email,
        }),
      )
      dispatch(
        setBusinessInfo({
          businessName: upgradeData.businessName,
          businessAddress: upgradeData.businessAddress,
          terminalRequested: upgradeData.terminalRequested,
        }),
      )
      dispatch(
        setBankInfo({
          idDocumentUploaded: upgradeData.idDocument,
        }),
      )
    }
  }

  const uploadIdDocument = async (): Promise<string | null> => {
    const { idDocument } = bankInfo
    if (!idDocument?.fileName || !idDocument.type || !idDocument.uri) {
      return null
    }

    const { data } = await generateIdDocumentUploadUrl({
      variables: {
        input: {
          filename: idDocument.fileName,
          contentType: idDocument.type,
        },
      },
    })

    if (!data?.idDocumentUploadUrlGenerate.uploadUrl) {
      throw new Error("Failed to generate upload URL to upload ID Document")
    }

    await uploadFileToS3(
      data.idDocumentUploadUrlGenerate.uploadUrl,
      idDocument.uri,
      idDocument.type,
    )

    return data.idDocumentUploadUrlGenerate.fileKey ?? null
  }

  const submitAccountUpgrade = async (): Promise<UpgradeResult> => {
    toggleActivityIndicator(true)

    try {
      const idDocument = await uploadIdDocument()

      const input = {
        accountNumber: Number(bankInfo.accountNumber),
        accountType: bankInfo.bankAccountType,
        bankBranch: bankInfo.bankBranch,
        bankName: bankInfo.bankName,
        businessAddress: businessInfo.businessAddress,
        businessName: businessInfo.businessName,
        currency: bankInfo.currency,
        fullName: personalInfo.fullName || "",
        idDocument: idDocument,
        level: accountType || "ONE",
        terminalRequested: businessInfo.terminalRequested,
      }
      if (!dataAuthed?.me?.email?.address && personalInfo.email) {
        await registerUserEmail({
          variables: { input: { email: personalInfo.email } },
        })
      }

      const { data } = await requestAccountUpgrade({
        variables: { input },
      })

      if (data?.businessAccountUpgradeRequest?.errors?.length) {
        return {
          success: false,
          errors: data.businessAccountUpgradeRequest.errors.map((e) => e.message),
        }
      }
      if (accountType === AccountLevel.Three)
        dispatch(setAccountUpgrade({ status: "Pending" }))

      return {
        success: data?.businessAccountUpgradeRequest?.success ?? false,
      }
    } catch (err) {
      console.error("Account upgrade failed:", err)
      return {
        success: false,
        errors: [err instanceof Error ? err.message : "Unknown error occurred"],
      }
    } finally {
      toggleActivityIndicator(false)
    }
  }

  return { submitAccountUpgrade }
}

const uploadFileToS3 = async (
  uploadUrl: string,
  fileUri: string,
  contentType: string,
): Promise<void> => {
  const blob = await fetch(fileUri).then((res) => res.blob())

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", uploadUrl, true)
    xhr.setRequestHeader("Content-Type", contentType)

    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve()
        } else {
          reject(new Error(`Upload ID Document failed with status ${xhr.status}`))
        }
      }
    }

    xhr.onerror = () => reject(new Error("Network error during upload"))

    xhr.send(blob)
  })
}
