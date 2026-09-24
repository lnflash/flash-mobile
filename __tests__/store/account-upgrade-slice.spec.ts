/**
 * ENG-608 — accountUpgrade slice: identity captures, upload bookkeeping and
 * the redux-persist migration from the pre-identity shape.
 */
import reducer, {
  resetIdentity,
  setIdentity,
  setIdentityCapture,
  setIdentityUploaded,
} from "@app/store/redux/slices/accountUpgradeSlice"
import { migrateAccountUpgradeV1, PERSIST_VERSION } from "@app/store/redux/migrations"

const image = {
  uri: "file:///tmp/front.jpg",
  width: 4032,
  height: 3024,
  fileName: "front.jpg",
  type: "image/jpeg",
}

describe("accountUpgrade slice — identity", () => {
  it("starts with Jamaica as the issuing country and no captures", () => {
    const state = reducer(undefined, { type: "@@init" })
    expect(state.identity).toEqual({
      documentType: undefined,
      issuingCountry: "JM",
      front: undefined,
      back: undefined,
      selfie: undefined,
      uploaded: {},
    })
    expect(state.businessInfo.country).toBe("Jamaica")
    expect("idDocument" in state.bankInfo).toBe(false)
  })

  it("a retake drops the storage key recorded for that side only", () => {
    let state = reducer(undefined, { type: "@@init" })
    state = reducer(state, setIdentity({ documentType: "national_id" }))
    state = reducer(state, setIdentityCapture({ side: "front", image }))
    state = reducer(
      state,
      setIdentityUploaded({
        side: "front",
        evidence: { uri: image.uri, fileKey: "k1", sha256: "h1" },
      }),
    )
    state = reducer(
      state,
      setIdentityUploaded({
        side: "selfie",
        evidence: { uri: "file:///tmp/selfie.jpg", fileKey: "k2", sha256: "h2" },
      }),
    )

    state = reducer(
      state,
      setIdentityCapture({
        side: "front",
        image: { ...image, uri: "file:///tmp/new.jpg" },
      }),
    )

    expect(state.identity.front?.uri).toBe("file:///tmp/new.jpg")
    expect(state.identity.uploaded.front).toBeUndefined()
    expect(state.identity.uploaded.selfie?.fileKey).toBe("k2")
  })

  it("resetIdentity clears captures but keeps the rest of the request", () => {
    let state = reducer(undefined, { type: "@@init" })
    state = reducer(state, setIdentityCapture({ side: "front", image }))
    state = reducer(state, resetIdentity())
    expect(state.identity.front).toBeUndefined()
    expect(state.identity.issuingCountry).toBe("JM")
  })
})

describe("persist migration v1", () => {
  it("is the current persist version", () => {
    expect(PERSIST_VERSION).toBe(1)
  })

  it("drops bankInfo.idDocument, maps legacy status strings and adds identity", () => {
    const legacy = {
      accountUpgrade: {
        accountType: "TWO",
        status: "Pending",
        personalInfo: { fullName: "Jane" },
        businessInfo: { businessName: "Shop", terminalRequested: false },
        bankInfo: {
          bankName: "NCB",
          idDocument: { uri: "file:///tmp/old.jpg", type: "image/jpeg" },
        },
        numOfSteps: 4,
        loading: false,
      },
    }

    const migrated = migrateAccountUpgradeV1(legacy)

    expect(migrated.accountUpgrade.status).toBe("UNDER_REVIEW")
    expect(migrated.accountUpgrade.bankInfo).toEqual({ bankName: "NCB" })
    expect(migrated.accountUpgrade.identity).toMatchObject({
      issuingCountry: "JM",
      uploaded: {},
    })
    expect(migrated.accountUpgrade.businessInfo.country).toBe("Jamaica")
    expect(migrated.accountUpgrade.personalInfo).toEqual({ fullName: "Jane" })
  })

  it("maps Approved/Rejected and clears anything unknown", () => {
    const at = (status: unknown) =>
      migrateAccountUpgradeV1({ accountUpgrade: { status, bankInfo: {} } }).accountUpgrade
        .status
    expect(at("Approved")).toBe("APPROVED")
    expect(at("Rejected")).toBe("REJECTED")
    expect(at("Something")).toBeUndefined()
    expect(at(undefined)).toBeUndefined()
  })

  it("leaves a state without the slice alone", () => {
    expect(migrateAccountUpgradeV1({})).toEqual({})
    expect(migrateAccountUpgradeV1(undefined)).toBeUndefined()
  })
})
