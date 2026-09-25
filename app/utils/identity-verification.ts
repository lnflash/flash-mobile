/**
 * ENG-608 ID verification, phase 1 — pure helpers shared by the capture
 * screens, the upgrade hook and the status UI. No React, no I/O, so every
 * rule here is unit-testable.
 */
import { UpgradeEvidenceInput, UpgradeEvidenceType } from "@app/graphql/generated"
import type {
  IdentityDocumentType,
  IdentitySide,
  IdentityState,
  UploadedEvidence,
  UpgradeVerificationStatus,
} from "@app/store/redux/slices/accountUpgradeSlice"

export const IDENTITY_DOCUMENT_TYPES: readonly IdentityDocumentType[] = [
  "passport",
  "national_id",
  "drivers_licence",
]

/** Sides the user must capture for a document kind. Passports have no back. */
export const requiredSides = (documentType?: IdentityDocumentType): IdentitySide[] =>
  documentType === "passport" ? ["front", "selfie"] : ["front", "back", "selfie"]

/** The side to capture after `side`, or null when the set is complete. */
export const nextSide = (
  side: IdentitySide,
  documentType?: IdentityDocumentType,
): IdentitySide | null => {
  const sides = requiredSides(documentType)
  const i = sides.indexOf(side)
  return i >= 0 && i < sides.length - 1 ? sides[i + 1] : null
}

/** True once every required side has a capture. */
export const hasAllCaptures = (identity: IdentityState): boolean =>
  requiredSides(identity.documentType).every((side) => Boolean(identity[side]?.path))

// --- capture quality gate ---------------------------------------------------

/** Long edge below this is too small for a reviewer to read an ID. */
export const MIN_LONG_EDGE_PX = 1200

export type CaptureGateResult = { ok: true } | { ok: false; reason: "small" }

/**
 * `takePhoto` returns the full sensor frame, not the overlay window, so the
 * only thing worth checking here is that a real still came back. An aspect
 * check on the frame could never fire on hardware and was removed.
 */
export const captureGate = (dims: {
  width: number
  height: number
}): CaptureGateResult => {
  const long = Math.max(dims.width, dims.height)
  const short = Math.min(dims.width, dims.height)
  if (!long || !short) return { ok: false, reason: "small" }
  if (long < MIN_LONG_EDGE_PX) return { ok: false, reason: "small" }
  return { ok: true }
}

// --- evidence -------------------------------------------------------------

const EVIDENCE_TYPE: Record<IdentitySide, UpgradeEvidenceType> = {
  front: UpgradeEvidenceType.IdFront,
  back: UpgradeEvidenceType.IdBack,
  selfie: UpgradeEvidenceType.Selfie,
}

export type UploadPlan = {
  /** Sides whose local file is not yet in storage (or was retaken). */
  toUpload: IdentitySide[]
  /** Sides whose recorded key still matches the local file. */
  reuse: IdentitySide[]
  /** Required sides with no capture at all. */
  missing: IdentitySide[]
}

/** Decide, per required side, whether an upload is needed or a key can be reused. */
export const planUploads = (identity: IdentityState): UploadPlan => {
  const plan: UploadPlan = { toUpload: [], reuse: [], missing: [] }
  for (const side of requiredSides(identity.documentType)) {
    const image = identity[side]
    if (!image?.path) {
      plan.missing.push(side)
    } else if (identity.uploaded[side]?.path === image.path) {
      plan.reuse.push(side)
    } else {
      plan.toUpload.push(side)
    }
  }
  return plan
}

export type EvidenceSet = {
  evidence: UpgradeEvidenceInput[]
  /** Front image key, also sent as the legacy `idDocument` for older backends. */
  legacyIdDocument: string
}

/**
 * Build the `evidence[]` input in front → back → selfie order. Document
 * metadata rides on the ID sides only; the selfie carries just its key.
 * `issuingCountry` is deliberately not sent: it is optional in the schema
 * and the app has no picker for it, so a guess would be wrong for every
 * passport and foreign licence. Throws if a required side has not been
 * uploaded.
 */
export const buildEvidence = (
  identity: Pick<IdentityState, "documentType">,
  uploaded: Partial<Record<IdentitySide, UploadedEvidence>>,
): EvidenceSet => {
  const evidence: UpgradeEvidenceInput[] = []
  for (const side of requiredSides(identity.documentType)) {
    const item = uploaded[side]
    if (!item?.fileKey) throw new Error(`Missing upload for ${side}`)
    const meta = side === "selfie" ? {} : { documentType: identity.documentType }
    evidence.push({
      type: EVIDENCE_TYPE[side],
      fileKey: item.fileKey,
      sha256: item.sha256,
      ...meta,
    })
  }
  const front = uploaded.front
  if (!front?.fileKey) throw new Error("Missing upload for front")
  return { evidence, legacyIdDocument: front.fileKey }
}

// --- address ---------------------------------------------------------------

export type UpgradeAddressFields = {
  line1?: string
  line2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
}

export type AddressField = "line1" | "city" | "state" | "country"

const trimmed = (v?: string) => (v ?? "").trim()

/**
 * Required: line1, city, state (parish), country. line2 and postal code are
 * optional. There is no default address; a blank field is an error.
 */
export const validateUpgradeAddress = (address: UpgradeAddressFields): AddressField[] => {
  const errors: AddressField[] = []
  if (trimmed(address.line1).length < 2) errors.push("line1")
  if (trimmed(address.city).length < 2) errors.push("city")
  if (trimmed(address.state).length < 2) errors.push("state")
  if (trimmed(address.country).length < 2) errors.push("country")
  return errors
}

// --- verification status ----------------------------------------------------

export const VERIFICATION_STATUSES: readonly UpgradeVerificationStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "MORE_INFO_NEEDED",
  "APPROVED",
  "REJECTED",
]

export const isVerificationStatus = (v: unknown): v is UpgradeVerificationStatus =>
  typeof v === "string" && (VERIFICATION_STATUSES as readonly string[]).includes(v)

/** Received or with a reviewer: nothing for the customer to do yet. */
export const isUpgradePending = (status?: UpgradeVerificationStatus): boolean =>
  status === "SUBMITTED" || status === "UNDER_REVIEW"

/** A reviewer sent it back; the customer has to capture again. */
export const needsResubmit = (status?: UpgradeVerificationStatus): boolean =>
  status === "MORE_INFO_NEEDED"

export type VerificationTone = "pending" | "action" | "success" | "error"

export type VerificationPresentation = {
  /** Key under `LL.AccountUpgrade` for the headline. */
  labelKey:
    | "statusSubmitted"
    | "statusUnderReview"
    | "statusMoreInfoNeeded"
    | "statusApproved"
    | "statusRejected"
  tone: VerificationTone
  /** Whether the reviewer's reasonMessage should be shown under the headline. */
  showReason: boolean
  /** Key under `LL.AccountUpgrade` for the call to action, if any. */
  ctaKey?: "resubmit"
}

export const verificationPresentation = (
  status: UpgradeVerificationStatus,
): VerificationPresentation => {
  switch (status) {
    case "SUBMITTED":
      return { labelKey: "statusSubmitted", tone: "pending", showReason: false }
    case "UNDER_REVIEW":
      return { labelKey: "statusUnderReview", tone: "pending", showReason: false }
    case "MORE_INFO_NEEDED":
      return {
        labelKey: "statusMoreInfoNeeded",
        tone: "action",
        showReason: true,
        ctaKey: "resubmit",
      }
    case "APPROVED":
      return { labelKey: "statusApproved", tone: "success", showReason: false }
    case "REJECTED":
      return { labelKey: "statusRejected", tone: "error", showReason: true }
  }
}
