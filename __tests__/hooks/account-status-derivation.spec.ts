/**
 * ENG-516 — light headline status fallbacks.
 *
 * `headlineFromLevel` / `capabilitiesFromLevel` are the client-side stand-ins
 * for backends that don't expose `statusHeadline` / `capabilities` yet
 * (lnflash/flash#452). They must match the backend derivation exactly:
 * verified=L1+, bankPayout=L2+, business=L3, usdAccount orthogonal (Bridge KYC).
 */

import { AccountLevel } from "@app/graphql/level-context"
import {
  capabilitiesFromLevel,
  headlineFromLevel,
} from "@app/hooks/account-status-derivation"

describe("headlineFromLevel", () => {
  it("maps NonAuth and ZERO to TRIAL", () => {
    expect(headlineFromLevel(AccountLevel.NonAuth)).toBe("TRIAL")
    expect(headlineFromLevel(AccountLevel.Zero)).toBe("TRIAL")
  })

  it("maps ONE and TWO to VERIFIED (L2 has no headline of its own)", () => {
    expect(headlineFromLevel(AccountLevel.One)).toBe("VERIFIED")
    expect(headlineFromLevel(AccountLevel.Two)).toBe("VERIFIED")
  })

  it("maps THREE to BUSINESS", () => {
    expect(headlineFromLevel(AccountLevel.Three)).toBe("BUSINESS")
  })
})

describe("capabilitiesFromLevel", () => {
  it("derives nothing for an unverified account", () => {
    expect(capabilitiesFromLevel(AccountLevel.Zero, false)).toEqual({
      verified: false,
      bankPayout: false,
      business: false,
      usdAccount: false,
    })
  })

  it("derives verified only at L1", () => {
    expect(capabilitiesFromLevel(AccountLevel.One, false)).toEqual({
      verified: true,
      bankPayout: false,
      business: false,
      usdAccount: false,
    })
  })

  it("adds bankPayout at L2", () => {
    expect(capabilitiesFromLevel(AccountLevel.Two, false)).toEqual({
      verified: true,
      bankPayout: true,
      business: false,
      usdAccount: false,
    })
  })

  it("adds business (keeping bankPayout) at L3", () => {
    expect(capabilitiesFromLevel(AccountLevel.Three, false)).toEqual({
      verified: true,
      bankPayout: true,
      business: true,
      usdAccount: false,
    })
  })

  it("keeps usdAccount orthogonal to level", () => {
    expect(capabilitiesFromLevel(AccountLevel.Zero, true).usdAccount).toBe(true)
    expect(capabilitiesFromLevel(AccountLevel.Three, false).usdAccount).toBe(false)
  })
})
