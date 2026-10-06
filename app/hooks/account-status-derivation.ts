import { AccountLevel } from "@app/graphql/level-context"

export type AccountStatusHeadline = "TRIAL" | "VERIFIED" | "BUSINESS"

export type AccountCapabilities = {
  verified: boolean
  bankPayout: boolean
  business: boolean
  usdAccount: boolean
}

// Fallbacks for older backends that don't expose statusHeadline/capabilities
// yet: the same derivations the backend uses (lnflash/flash#452), from the
// stored level. usdAccount is orthogonal to level — it comes from Bridge KYC.
// bankPayout is only implied at Level 3: Level 2 no longer means a bank account
// is on file (Bridge KYC upgrades accounts to Level 2 without one).

export const headlineFromLevel = (level: AccountLevel): AccountStatusHeadline => {
  if (level === AccountLevel.Three) return "BUSINESS"
  if (level === AccountLevel.One || level === AccountLevel.Two) return "VERIFIED"
  return "TRIAL"
}

export const capabilitiesFromLevel = (
  level: AccountLevel,
  bridgeKycApproved: boolean,
): AccountCapabilities => ({
  verified:
    level === AccountLevel.One ||
    level === AccountLevel.Two ||
    level === AccountLevel.Three,
  bankPayout: level === AccountLevel.Three,
  business: level === AccountLevel.Three,
  usdAccount: bridgeKycApproved,
})
