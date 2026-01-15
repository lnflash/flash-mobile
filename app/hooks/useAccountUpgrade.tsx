import { useActivityIndicator } from "./useActivityIndicator"
import { useAppSelector } from "@app/store/redux"
import {
  useBusinessAccountUpgradeRequestMutation,
  HomeAuthedDocument,
  useFileUploadUrlGenerateMutation,
} from "@app/graphql/generated"

type UpgradeResult = {
  success: boolean
  errors?: string[]
}

export const useAccountUpgrade = () => {
  const { toggleActivityIndicator } = useActivityIndicator()
  const { accountType, personalInfo, businessInfo, bankInfo } = useAppSelector(
    (state) => state.accountUpgrade,
  )

  const [generateFileUploadUrl] = useFileUploadUrlGenerateMutation()
  const [requestAccountUpgrade] = useBusinessAccountUpgradeRequestMutation({
    refetchQueries: [HomeAuthedDocument],
  })

  const uploadIdDocument = async (): Promise<string | null> => {
    const { idDocument } = bankInfo
    if (!idDocument?.fileName || !idDocument.type || !idDocument.uri) {
      return null
    }

    const { data } = await generateFileUploadUrl({
      variables: {
        input: {
          filename: idDocument.fileName,
          contentType: idDocument.type,
        },
      },
    })

    if (!data?.fileUploadUrlGenerate.uploadUrl) {
      throw new Error("Failed to generate upload URL to upload ID Document")
    }

    await uploadFileToS3(
      data.fileUploadUrlGenerate.uploadUrl,
      idDocument.uri,
      idDocument.type,
    )

    return data.fileUploadUrlGenerate.fileUrl ?? null
  }

  const submitAccountUpgrade = async (): Promise<UpgradeResult> => {
    toggleActivityIndicator(true)

    try {
      const idDocumentUrl = await uploadIdDocument()

      const input = {
        accountNumber: Number(bankInfo.accountNumber),
        accountType: bankInfo.bankAccountType,
        bankBranch: bankInfo.bankBranch,
        bankName: bankInfo.bankName,
        businessAddress: businessInfo.businessAddress,
        businessName: businessInfo.businessName,
        currency: bankInfo.currency,
        email: personalInfo.email,
        fullName: personalInfo.fullName || "",
        idDocument: idDocumentUrl,
        level: accountType || "ONE",
        terminalRequested: businessInfo.terminalRequested,
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
