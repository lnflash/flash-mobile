import { createMigrate } from "redux-persist"

import {
  initialIdentityState,
  UpgradeVerificationStatus,
} from "./slices/accountUpgradeSlice"

/**
 * `accountUpgrade` is persisted to AsyncStorage. Version 1 (ENG-608) replaced
 * `bankInfo.idDocument` (a react-native-image-picker Asset) with `identity`
 * and the raw ERPNext status strings with the verification enum. Any phone
 * that killed the app mid-flow before the update rehydrates the old shape.
 */
export const PERSIST_VERSION = 1

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

export const migrations = {
  [PERSIST_VERSION]: migrateAccountUpgradeV1,
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const migrate = createMigrate(migrations, { debug: false })
