import { createMigrate } from "redux-persist"

import {
  initialIdentityState,
  UpgradeVerificationStatus,
} from "./slices/accountUpgradeSlice"

import { initialFlashcardV2State } from "./slices/flashcardV2Slice"

/**
 * `accountUpgrade` is persisted to AsyncStorage. Version 1 (ENG-608) replaced
 * `bankInfo.idDocument` (a react-native-image-picker Asset) with `identity`
 * and the raw ERPNext status strings with the verification enum. Any phone
 * that killed the app mid-flow before the update rehydrates the old shape.
 *
 * Version 2 (ENG-616) adds the persisted `flashcardV2` slice: the cards this
 * phone has read. No existing data is transformed; the bump records that a new
 * key is now part of the persisted tree, and the migration gives an older store
 * the empty shape explicitly.
 *
 * A later field on `flashcardV2` itself that starts with a value (a top-up
 * ledger's `{}`, say) needs its own version and migration. The default
 * reconciler, autoMergeLevel1, fills in a missing *top-level* key but hard-sets
 * each persisted one wholesale, so a phone that saved `{ cards }` rehydrates
 * without the new field no matter what the reducer's initial state says. An
 * optional field that starts absent, as `attachedPubkey` does, needs neither:
 * a rehydrated `{ cards }` leaves it absent, which is its initial state.
 *
 * Version 3 (ENG-675, card protocol 2.0) gives every known card `owned`,
 * `needsUpdate` and `limits`. A card recorded before 2.0 is a 0.x card, which
 * this app can no longer use: it reads as needing an update until a 2.0 read
 * says otherwise. Its owner is unknown (a 0.x card had none), and its limits
 * off.
 */
export const PERSIST_VERSION = 3

const LEGACY_STATUS: Record<string, UpgradeVerificationStatus> = {
  Pending: "UNDER_REVIEW",
  Approved: "APPROVED",
  Rejected: "REJECTED",
}

// redux-persist hands migrations the raw persisted tree, hence the loose typing.
/* eslint-disable @typescript-eslint/no-explicit-any */
export const migrateAccountUpgradeV1 = (state: any): any => {
  const upgrade = state?.accountUpgrade
  if (!upgrade) return state

  const { idDocument: _dropped, ...bankInfo } = upgrade.bankInfo ?? {}
  const rawStatus = upgrade.status
  const status: UpgradeVerificationStatus | undefined =
    typeof rawStatus === "string" ? LEGACY_STATUS[rawStatus] ?? undefined : undefined

  return {
    ...state,
    accountUpgrade: {
      ...upgrade,
      status,
      reasonCode: undefined,
      reasonMessage: undefined,
      bankInfo,
      businessInfo: {
        ...upgrade.businessInfo,
        country: upgrade.businessInfo?.country || "Jamaica",
      },
      identity: { ...initialIdentityState, ...(upgrade.identity ?? {}) },
    },
  }
}

export const migrateFlashcardV2 = (state: any): any =>
  state?.flashcardV2 ? state : { ...state, flashcardV2: initialFlashcardV2State }

/** "0.6" or "2.0": the major version, NaN when there is none to read. */
const majorOf = (version: unknown): number =>
  typeof version === "string" ? Number.parseInt(version.split(".")[0], 10) : Number.NaN

export const migrateFlashcardV2Cards = (state: any): any => {
  const cards = state?.flashcardV2?.cards
  if (!cards || typeof cards !== "object") return state
  const migrated = Object.fromEntries(
    Object.entries(cards).map(([pubkey, card]: [string, any]) => [
      pubkey,
      {
        ...card,
        owned: card?.owned ?? false,
        needsUpdate: card?.needsUpdate ?? !(majorOf(card?.version) >= 2),
        limits: card?.limits ?? { day: 0, allowance: 0 },
      },
    ]),
  )
  return { ...state, flashcardV2: { ...state.flashcardV2, cards: migrated } }
}

export const migrations = {
  1: migrateAccountUpgradeV1,
  2: migrateFlashcardV2,
  [PERSIST_VERSION]: migrateFlashcardV2Cards,
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const migrate = createMigrate(migrations, { debug: false })
