/**
 * ENG-608 ID verification phase 1 — pure rules behind the capture flow.
 */
import {
  buildEvidence,
  captureGate,
  hasAllCaptures,
  isUpgradePending,
  isVerificationStatus,
  MIN_LONG_EDGE_PX,
  needsResubmit,
  nextSide,
  planUploads,
  requiredSides,
  validateUpgradeAddress,
  verificationPresentation,
} from "@app/utils/identity-verification"
import type {
  CapturedImage,
  IdentityState,
  UploadedEvidence,
} from "@app/store/redux/slices/accountUpgradeSlice"

const img = (side: string): CapturedImage => ({
  path: `idv/${side}-1.jpg`,
  width: 4032,
  height: 3024,
  fileName: `${side}.jpg`,
  type: "image/jpeg",
})

const up = (side: string): UploadedEvidence => ({
  path: `idv/${side}-1.jpg`,
  fileKey: `id-documents/${side}-key`,
  sha256: `${side}hash`,
})

const identity = (over: Partial<IdentityState> = {}): IdentityState => ({
  documentType: "national_id",
  front: img("front"),
  back: img("back"),
  selfie: img("selfie"),
  uploaded: {},
  ...over,
})

describe("requiredSides / nextSide", () => {
  it("asks for front, back and selfie on a card document", () => {
    expect(requiredSides("national_id")).toEqual(["front", "back", "selfie"])
    expect(requiredSides("drivers_licence")).toEqual(["front", "back", "selfie"])
  })

  it("skips the back side for a passport", () => {
    expect(requiredSides("passport")).toEqual(["front", "selfie"])
    expect(nextSide("front", "passport")).toBe("selfie")
  })

  it("walks front -> back -> selfie -> done for a card", () => {
    expect(nextSide("front", "national_id")).toBe("back")
    expect(nextSide("back", "national_id")).toBe("selfie")
    expect(nextSide("selfie", "national_id")).toBeNull()
  })

  it("falls back to the full set when no document type is chosen yet", () => {
    expect(requiredSides(undefined)).toEqual(["front", "back", "selfie"])
  })
})

describe("hasAllCaptures", () => {
  it("is false until every required side is captured", () => {
    expect(hasAllCaptures(identity({ selfie: undefined }))).toBe(false)
    expect(hasAllCaptures(identity())).toBe(true)
  })

  it("does not require a back for a passport", () => {
    expect(hasAllCaptures(identity({ documentType: "passport", back: undefined }))).toBe(
      true,
    )
  })
})

describe("captureGate", () => {
  it("accepts a normal 4:3 still", () => {
    expect(captureGate({ width: 4032, height: 3024 })).toEqual({ ok: true })
    expect(captureGate({ width: 3024, height: 4032 })).toEqual({ ok: true })
  })

  it("rejects a still whose long edge is under the minimum", () => {
    expect(captureGate({ width: MIN_LONG_EDGE_PX - 1, height: 800 })).toEqual({
      ok: false,
      reason: "small",
    })
    expect(captureGate({ width: 0, height: 0 })).toEqual({ ok: false, reason: "small" })
  })

  it("accepts exactly the minimum long edge", () => {
    expect(captureGate({ width: MIN_LONG_EDGE_PX, height: 900 })).toEqual({ ok: true })
  })

  it("does not judge the frame's shape: takePhoto returns the full sensor frame", () => {
    // An aspect gate on the sensor frame could never fire on hardware (every
    // phone still is ~4:3 or ~16:9), so it was removed rather than shipped as
    // dead code with a message nobody would ever see.
    expect(captureGate({ width: 2000, height: 2000 })).toEqual({ ok: true })
    expect(captureGate({ width: 6000, height: 1500 })).toEqual({ ok: true })
  })
})

describe("planUploads", () => {
  it("uploads everything on a fresh set", () => {
    expect(planUploads(identity())).toEqual({
      toUpload: ["front", "back", "selfie"],
      reuse: [],
      missing: [],
    })
  })

  it("reuses keys whose local file is unchanged and re-sends a retaken side", () => {
    const state = identity({
      uploaded: {
        front: up("front"),
        back: { ...up("back"), path: "idv/back-0.jpg" },
      },
    })
    expect(planUploads(state)).toEqual({
      toUpload: ["back", "selfie"],
      reuse: ["front"],
      missing: [],
    })
  })

  it("reports missing captures instead of planning them", () => {
    expect(planUploads(identity({ selfie: undefined })).missing).toEqual(["selfie"])
  })

  it("never plans a back upload for a passport", () => {
    const plan = planUploads(identity({ documentType: "passport", back: undefined }))
    expect(plan.missing).toEqual([])
    expect(plan.toUpload).toEqual(["front", "selfie"])
  })
})

describe("buildEvidence", () => {
  const uploaded = { front: up("front"), back: up("back"), selfie: up("selfie") }

  it("emits ID_FRONT, ID_BACK, SELFIE in that order with document metadata on the ID sides", () => {
    const { evidence, legacyIdDocument } = buildEvidence(
      { documentType: "drivers_licence" },
      uploaded,
    )
    expect(evidence).toEqual([
      {
        type: "ID_FRONT",
        fileKey: "id-documents/front-key",
        sha256: "fronthash",
        documentType: "drivers_licence",
      },
      {
        type: "ID_BACK",
        fileKey: "id-documents/back-key",
        sha256: "backhash",
        documentType: "drivers_licence",
      },
      { type: "SELFIE", fileKey: "id-documents/selfie-key", sha256: "selfiehash" },
    ])
    expect(legacyIdDocument).toBe("id-documents/front-key")
  })

  it("never guesses an issuing country: the field is optional and there is no picker", () => {
    // A hard-coded "JM" was stamped on every ID row, passports and foreign
    // licences included. Absent beats confidently wrong.
    const { evidence } = buildEvidence({ documentType: "passport" }, uploaded)
    for (const row of evidence) {
      expect(row).not.toHaveProperty("issuingCountry")
    }
  })

  it("has no ID_BACK row for a passport even if a stale back key exists", () => {
    const { evidence } = buildEvidence({ documentType: "passport" }, uploaded)
    expect(evidence.map((e) => e.type)).toEqual(["ID_FRONT", "SELFIE"])
  })

  it("throws when a required side was never uploaded", () => {
    expect(() =>
      buildEvidence(
        { documentType: "national_id" },
        { front: up("front"), selfie: up("selfie") },
      ),
    ).toThrow(/back/)
  })
})

describe("validateUpgradeAddress", () => {
  const full = {
    line1: "12 Hope Road",
    city: "Kingston",
    state: "St. Andrew",
    country: "Jamaica",
  }

  it("passes a complete address; line2 and postal code are optional", () => {
    expect(validateUpgradeAddress(full)).toEqual([])
    expect(validateUpgradeAddress({ ...full, line2: undefined, postalCode: "" })).toEqual(
      [],
    )
  })

  it("has no default address: every required field must be typed", () => {
    expect(validateUpgradeAddress({})).toEqual(["line1", "city", "state", "country"])
    expect(validateUpgradeAddress({ ...full, city: "  " })).toEqual(["city"])
  })

  it("a blank line1 is an error rather than silently filled in", () => {
    // The old fallback ("1 Grenada Way", "Kingston 5", "000000") is gone from
    // the hook; a blank line1 is now an error rather than silently filled in.
    expect(validateUpgradeAddress({ ...full, line1: "" })).toEqual(["line1"])
  })
})

describe("verification status", () => {
  it("recognises only the schema enum", () => {
    expect(isVerificationStatus("UNDER_REVIEW")).toBe(true)
    expect(isVerificationStatus("Pending")).toBe(false)
    expect(isVerificationStatus(undefined)).toBe(false)
  })

  it("counts SUBMITTED and UNDER_REVIEW as pending", () => {
    expect(isUpgradePending("SUBMITTED")).toBe(true)
    expect(isUpgradePending("UNDER_REVIEW")).toBe(true)
    expect(isUpgradePending("MORE_INFO_NEEDED")).toBe(false)
    expect(isUpgradePending("APPROVED")).toBe(false)
    expect(isUpgradePending(undefined)).toBe(false)
  })

  it("only MORE_INFO_NEEDED asks for a resubmit", () => {
    expect(needsResubmit("MORE_INFO_NEEDED")).toBe(true)
    expect(needsResubmit("REJECTED")).toBe(false)
  })

  it("maps each status to a label, tone and CTA", () => {
    expect(verificationPresentation("SUBMITTED")).toEqual({
      labelKey: "statusSubmitted",
      tone: "pending",
      showReason: false,
    })
    expect(verificationPresentation("UNDER_REVIEW")).toEqual({
      labelKey: "statusUnderReview",
      tone: "pending",
      showReason: false,
    })
    expect(verificationPresentation("MORE_INFO_NEEDED")).toEqual({
      labelKey: "statusMoreInfoNeeded",
      tone: "action",
      showReason: true,
      ctaKey: "resubmit",
    })
    expect(verificationPresentation("APPROVED")).toEqual({
      labelKey: "statusApproved",
      tone: "success",
      showReason: false,
    })
    expect(verificationPresentation("REJECTED")).toEqual({
      labelKey: "statusRejected",
      tone: "error",
      showReason: true,
    })
  })
})
