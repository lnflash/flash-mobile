import { useEffect } from "react"
import { parsePhoneNumber } from "libphonenumber-js"

// hooks
import { useActivityIndicator } from "./useActivityIndicator"
import { normalizeContentType } from "@app/utils/image-content-type"
import { fileSha256Hex } from "@app/utils/file-sha256"
import {
  buildEvidence,
  isVerificationStatus,
  planUploads,
  validateUpgradeAddress,
} from "@app/utils/identity-verification"
import { useAppDispatch, useAppSelector } from "@app/store/redux"
import {
  useBusinessAccountUpgradeRequestMutation,
  HomeAuthedDocument,
  useIdDocumentUploadUrlGenerateMutation,
  useLatestAccountUpgradeRequestQuery,
  useUserEmailRegistrationInitiateMutation,
  useAuthQuery,
  BusinessAccountUpgradeRequestInput,
} from "@app/graphql/generated"

// store
import {
  IdentitySide,
  setAccountUpgrade,
  setBankInfo,
  setBusinessInfo,
  setIdentityUploaded,
  setPersonalInfo,
  UploadedEvidence,
} from "@app/store/redux/slices/accountUpgradeSlice"

const sanitizeMessage = (msg: string): string => {
  // UInexpectedError is an internal GraphQL error wrapper — not useful to end users
  if (
    msg.includes("UInexpectedError") ||
    msg.includes("Internal server error") ||
    msg.includes("internal error") ||
    msg.includes("Unexpected error")
  ) {
    return "An unexpected error occurred. Please try again."
  }
  return msg
}

type UpgradeResult = {
  success: boolean
  errors?: string[]
}

export type UploadEvidenceResult =
  | { success: true; uploaded: Record<IdentitySide, UploadedEvidence | undefined> }
  | { success: false; failedSide?: IdentitySide; error: string }

export class EvidenceUploadError extends Error {
  side: IdentitySide
  constructor(side: IdentitySide, message: string) {
    super(message)
    this.name = "EvidenceUploadError"
    this.side = side
  }
}

export const useAccountUpgrade = () => {
  const dispatch = useAppDispatch()
  const { toggleActivityIndicator } = useActivityIndicator()
  const { accountType, status, personalInfo, businessInfo, bankInfo, identity } =
    useAppSelector((state) => state.accountUpgrade)

  const { data: dataAuthed } = useAuthQuery()
  const { data, refetch: refetchUpgradeRequest } = useLatestAccountUpgradeRequestQuery({
    fetchPolicy: "cache-and-network",
  })
  const upgradeData = data?.latestAccountUpgradeRequest.upgradeRequest

  const [registerUserEmail] = useUserEmailRegistrationInitiateMutation()
  const [generateIdDocumentUploadUrl] = useIdDocumentUploadUrlGenerateMutation()
  const [requestAccountUpgrade] = useBusinessAccountUpgradeRequestMutation({
    refetchQueries: [HomeAuthedDocument],
  })

  useEffect(() => {
    if (upgradeData && upgradeData.verification.status !== status) {
      setAccountUpgradeData()
    } else if (dataAuthed?.me?.phone) {
      const parsed = parsePhoneNumber(dataAuthed.me.phone)
      if (parsed?.country && parsed?.nationalNumber) {
        dispatch(
          setPersonalInfo({
            countryCode: parsed.country,
            phoneNumber: parsed.nationalNumber,
          }),
        )
      }
    }
  }, [upgradeData, dataAuthed?.me?.phone])

  const setAccountUpgradeData = () => {
    if (upgradeData) {
      const parsedPhone = upgradeData.phoneNumber
        ? parsePhoneNumber(upgradeData.phoneNumber)
        : undefined
      const verification = upgradeData.verification
      dispatch(
        setAccountUpgrade({
          status: isVerificationStatus(verification.status)
            ? verification.status
            : undefined,
          reasonCode: verification.reasonCode ?? undefined,
          reasonMessage: verification.reasonMessage ?? undefined,
          accountType: upgradeData.requestedLevel,
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
          businessName: upgradeData.address.title,
          businessAddress: upgradeData.address.line1,
          city: upgradeData.address.city,
          country: upgradeData.address.country,
          line1: upgradeData.address.line1,
          line2: upgradeData.address.line2,
          postalCode: upgradeData.address.postalCode,
          state: upgradeData.address.state,
          terminalRequested: upgradeData.terminalsRequested,
        }),
      )
      dispatch(
        setBankInfo({
          bankName: upgradeData.bankAccount?.bankName,
          bankBranch: upgradeData.bankAccount?.bankBranch,
          bankAccountType: upgradeData.bankAccount?.accountType,
          currency: upgradeData.bankAccount?.currency,
          accountNumber: upgradeData.bankAccount?.accountNumber,
        }),
      )
    }
  }

  /** Presigned PUT of one capture; returns its storage key and hash. */
  const uploadOne = async (side: IdentitySide): Promise<UploadedEvidence> => {
    const image = identity[side]
    if (!image?.uri || !image.fileName || !image.type) {
      throw new EvidenceUploadError(side, "Photo is missing. Please take it again.")
    }

    // Normalize content type: Android returns "image/jpg" for some JPEGs,
    // but the backend only accepts "image/jpeg" (ENG-291)
    const contentType = normalizeContentType(image.type)

    let uploadUrl: string | null | undefined
    let fileKey: string | null | undefined
    try {
      const result = await generateIdDocumentUploadUrl({
        variables: { input: { filename: image.fileName, contentType } },
      })
      uploadUrl = result.data?.idDocumentUploadUrlGenerate.uploadUrl
      fileKey = result.data?.idDocumentUploadUrlGenerate.fileKey
    } catch (err) {
      const message = err instanceof Error ? err.message : ""
      if (message.includes("InvalidFileType")) {
        throw new EvidenceUploadError(
          side,
          "Unsupported file type. Please take the photo again.",
        )
      }
      throw new EvidenceUploadError(side, "Failed to upload photo. Please try again.")
    }

    if (!uploadUrl || !fileKey) {
      throw new EvidenceUploadError(side, "Failed to upload photo. Please try again.")
    }

    let sha256: string
    try {
      sha256 = await fileSha256Hex(image.uri)
    } catch {
      throw new EvidenceUploadError(
        side,
        "Could not read the photo. Please take it again.",
      )
    }

    try {
      await uploadFileToS3(uploadUrl, image.uri, contentType)
    } catch {
      throw new EvidenceUploadError(side, "Failed to upload photo. Please try again.")
    }

    return { uri: image.uri, fileKey, sha256 }
  }

  /**
   * Upload every required capture that is not already in storage. Keys are
   * recorded in the slice per side as each PUT completes, so a failure on the
   * second file leaves the first reusable and a retry only sends what is left.
   */
  const uploadEvidence = async (): Promise<UploadEvidenceResult> => {
    const plan = planUploads(identity)
    if (plan.missing.length) {
      return {
        success: false,
        failedSide: plan.missing[0],
        error: "Please take all the required photos before continuing.",
      }
    }

    const uploaded: Record<IdentitySide, UploadedEvidence | undefined> = {
      front: identity.uploaded.front,
      back: identity.uploaded.back,
      selfie: identity.uploaded.selfie,
    }

    for (const side of plan.toUpload) {
      try {
        const evidence = await uploadOne(side)
        uploaded[side] = evidence
        dispatch(setIdentityUploaded({ side, evidence }))
      } catch (err) {
        const side_ = err instanceof EvidenceUploadError ? err.side : side
        const message =
          err instanceof Error ? err.message : "Failed to upload photo. Please try again."
        return { success: false, failedSide: side_, error: sanitizeMessage(message) }
      }
    }

    return { success: true, uploaded }
  }

  const submitAccountUpgrade = async (): Promise<UpgradeResult> => {
    const { fullName } = personalInfo
    const isProUpgrade = accountType === "TWO"
    const username = dataAuthed?.me?.username

    const businessName =
      businessInfo.businessName ||
      (isProUpgrade ? `${username || "Flash"} - Pro Account` : undefined)
    const { line1, line2, city, state, postalCode, country } = businessInfo

    if (!fullName) return { success: false, errors: ["Full name is required"] }
    if (!businessName) return { success: false, errors: ["Business name is required"] }
    if (
      validateUpgradeAddress(businessInfo).length ||
      !line1 ||
      !city ||
      !state ||
      !country
    ) {
      return { success: false, errors: ["Please complete all address fields"] }
    }

    toggleActivityIndicator(true)

    try {
      const upload = await uploadEvidence()
      if (!upload.success) {
        return { success: false, errors: [upload.error] }
      }
      const { evidence, legacyIdDocument } = buildEvidence(identity, upload.uploaded)

      let bankAccount = undefined
      if (
        bankInfo.accountNumber &&
        bankInfo.bankAccountType &&
        bankInfo.bankBranch &&
        bankInfo.bankName &&
        bankInfo.currency
      ) {
        bankAccount = {
          accountNumber: bankInfo.accountNumber,
          accountType: bankInfo.bankAccountType,
          bankBranch: bankInfo.bankBranch,
          bankName: bankInfo.bankName,
          currency: bankInfo.currency,
        }
      }

      const input: BusinessAccountUpgradeRequestInput = {
        address: {
          city,
          country,
          line1,
          line2: line2 || undefined,
          postalCode: postalCode || undefined,
          state,
          title: businessName,
        },
        bankAccount,
        level: accountType,
        // Legacy field kept for backends that predate `evidence`; the server
        // folds it into the ID_FRONT row when both are present.
        idDocument: legacyIdDocument,
        evidence,
        fullName,
        terminalsRequested: businessInfo.terminalRequested ? 1 : 0,
      }

      if (!dataAuthed?.me?.email?.address && personalInfo.email) {
        await registerUserEmail({
          variables: { input: { email: personalInfo.email } },
        })
      }

      const { data } = await requestAccountUpgrade({
        variables: { input },
      })

      const upgradeResponse = data?.businessAccountUpgradeRequest
      const errors = upgradeResponse?.errors?.filter(Boolean) ?? []

      if (errors.length) {
        return {
          success: false,
          errors: errors.map((e) => sanitizeMessage(e!.message)),
        }
      }

      dispatch(
        setAccountUpgrade({
          status: "SUBMITTED",
          reasonCode: undefined,
          reasonMessage: undefined,
        }),
      )
      refetchUpgradeRequest().catch(() => undefined)

      return {
        success: !!upgradeResponse?.id,
      }
    } catch (err) {
      console.error("Account upgrade failed:", err instanceof Error ? err.message : err)
      return {
        success: false,
        errors: [
          sanitizeMessage(err instanceof Error ? err.message : "Unknown error occurred"),
        ],
      }
    } finally {
      toggleActivityIndicator(false)
    }
  }

  return { submitAccountUpgrade, uploadEvidence }
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
