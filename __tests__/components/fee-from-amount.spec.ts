import { PaymentType } from "@galoymoney/client"

import { GALOY_INSTANCES } from "@app/config"
import { WalletCurrency } from "../../app/graphql/generated"
import {
  payeeNodePubkey,
  shouldDiscloseFeeFromAmount,
} from "../../app/components/send-flow/fee-from-amount.logic"

// A real bolt11 minted by the Test instance (2026-08-24, $1.10 USD receive
// invoice, long expired — expiry is irrelevant to decoding). Its payee is the
// instance's node (IBEX_SB), the pubkey pinned in galoy-instances.ts.
const FLASH_TEST_INVOICE =
  "lnbc14060n1p4gclcjpp555k59jc4xn0x3mej3gzmuj7lg66u0rtkq73vtvwqtrmd8luemprqdpvvejk2ttswfhkyefqwejhy6txd93kzarfdahzqgek8y6qcqzzsxqzpusp5rprrqnqhclwmc7au9vqf306mg6wndelar076yu6f8nr7md6kzv9q9qxpqysgqnpc09nfh90rew3z7d06pu3056nu24e809j5sj6qn0ytquu252h0sp2dkd6gc3qudwduecfvxw7m6vlt6mc0s3seqv0nvet4u9xpq6wsqfhuttw"
const FLASH_TEST_NODE_PUBKEY =
  "02004d8933df4f002fa95d8c37ca43eb9c175d310aad55cc6d442e4accc3740029"

// A real bolt11 minted live on PROD (Main) 2026-08-24 via the LNURL-pay
// callback (21-sat receive invoice, long expired — expiry is irrelevant to
// decoding). Its payee is IBEX_Ops1, the node prod mints from. Five prod
// invoices across two accounts and four amounts all decoded to this one node.
const FLASH_MAIN_INVOICE =
  "lnbc210n1p4gepdqpp55t3rkvgg6ng47c0dn0qkfscld09y36fa5khnmntclu227t542u4shp5lg2dp2w8957pyf6p38kufsyjxclwzc9kyg5ysp68er2fc4rpmpwqcqzzsxqzpusp5958p7zlqhexkeh0326fr3rjtahg5a3ffzeszk93yku6x6smq6r0s9qxpqysgq89pkzd8c94jv9sckdwjce78q0qzdlgnukljkpq8pptruexhhwl8ndypwde5k87zummne4ze7pcvug2ampawzzpajsmsdhsw5t0ztnyspvlk2w2"
const FLASH_MAIN_NODE_PUBKEY =
  "03501a74753e0f6ae270a1e4e2ffbbc37f7a796360e650c1121c18e116b22ac106"

const base = {
  paymentType: PaymentType.Lightning,
  sendingWalletCurrency: WalletCurrency.Usd,
  feeStatus: "set" as const,
  feeAmount: 0,
}

describe("shouldDiscloseFeeFromAmount", () => {
  it("discloses on the repro: external USD send, probed fee of zero", () => {
    // #694: $1.10 sent, "$0.00" fee displayed, $1.07 delivered. The probed
    // zero is the untrustworthy case — IBEX deducts the real routing fee from
    // the amount on these routes and its pre-send estimate says nothing.
    expect(shouldDiscloseFeeFromAmount(base)).toBe(true)
    expect(
      shouldDiscloseFeeFromAmount({
        ...base,
        sendingWalletCurrency: WalletCurrency.Usdt,
      }),
    ).toBe(true)
  })

  it("stays silent when the probe returned a real nonzero fee", () => {
    // A priced fee is already on screen; the caveat would dilute it.
    expect(shouldDiscloseFeeFromAmount({ ...base, feeAmount: 3 })).toBe(false)
  })

  it("stays silent on intraledger — free is TRUE there, and crying wolf teaches users to ignore the caveat", () => {
    expect(
      shouldDiscloseFeeFromAmount({ ...base, paymentType: PaymentType.Intraledger }),
    ).toBe(false)
  })

  it("stays silent for BTC-wallet sends — their probes price the actual route", () => {
    // A zero from the BTC fee probe means a genuinely free route (e.g. direct
    // channel), not an IBEX shrug.
    expect(
      shouldDiscloseFeeFromAmount({
        ...base,
        sendingWalletCurrency: WalletCurrency.Btc,
      }),
    ).toBe(false)
  })

  it("stays silent while loading/error/unset — those states carry their own caveats", () => {
    for (const feeStatus of ["loading", "error", "unset"] as const) {
      expect(shouldDiscloseFeeFromAmount({ ...base, feeStatus })).toBe(false)
    }
  })

  it("stays silent when the amount is undefined — that is the error path, not a probed zero", () => {
    expect(shouldDiscloseFeeFromAmount({ ...base, feeAmount: undefined })).toBe(false)
  })

  it("stays silent when the invoice pays this instance's own node — Flash-to-Flash delivery is full-amount", () => {
    // Verified 2026-08-24: probing a Flash-internal invoice returns a SET
    // zero, so without this exclusion the caveat would fire on every
    // Flash-to-Flash invoice payment — crying wolf on the most common send.
    expect(
      shouldDiscloseFeeFromAmount({
        ...base,
        destinationPayeePubkey: FLASH_TEST_NODE_PUBKEY,
        flashNodePubkeys: [FLASH_TEST_NODE_PUBKEY],
      }),
    ).toBe(false)
  })

  it("matches node pubkeys case-insensitively", () => {
    expect(
      shouldDiscloseFeeFromAmount({
        ...base,
        destinationPayeePubkey: FLASH_TEST_NODE_PUBKEY.toUpperCase(),
        flashNodePubkeys: [FLASH_TEST_NODE_PUBKEY],
      }),
    ).toBe(false)
  })

  it("still discloses when the payee is some other node (another instance's, even)", () => {
    expect(
      shouldDiscloseFeeFromAmount({
        ...base,
        destinationPayeePubkey: FLASH_MAIN_NODE_PUBKEY,
        flashNodePubkeys: [FLASH_TEST_NODE_PUBKEY],
      }),
    ).toBe(true)
  })

  it("still discloses when the payee is unknown or the node list is empty — suppression must fail open", () => {
    // No decoded payee (onchain, undecodable invoice) or an unpopulated
    // lnNodePubkeys (prod today) must never swallow the #694 warning.
    expect(
      shouldDiscloseFeeFromAmount({
        ...base,
        destinationPayeePubkey: undefined,
        flashNodePubkeys: [FLASH_TEST_NODE_PUBKEY],
      }),
    ).toBe(true)
    expect(
      shouldDiscloseFeeFromAmount({
        ...base,
        destinationPayeePubkey: FLASH_TEST_NODE_PUBKEY,
        flashNodePubkeys: [],
      }),
    ).toBe(true)
    expect(
      shouldDiscloseFeeFromAmount({
        ...base,
        destinationPayeePubkey: FLASH_TEST_NODE_PUBKEY,
        flashNodePubkeys: undefined,
      }),
    ).toBe(true)
  })
})

describe("Main instance suppression — live on prod, not just in test config", () => {
  // Round-2 review finding: Main shipped with lnNodePubkeys: [], which made
  // the Flash-to-Flash suppression inert on the only instance users run —
  // every prod Flash-to-Flash payment showed the caveat on a full-amount
  // transfer. This suite fails if Main's pin ever regresses to empty or
  // drifts from what prod invoices actually decode to.
  const mainInstance = GALOY_INSTANCES.find((instance) => instance.id === "Main")

  it("decodes the real prod invoice to the pinned Main node", () => {
    expect(payeeNodePubkey(FLASH_MAIN_INVOICE)).toBe(FLASH_MAIN_NODE_PUBKEY)
  })

  it("Main pins a non-empty lnNodePubkeys list containing the prod node", () => {
    expect(mainInstance?.lnNodePubkeys).toContain(FLASH_MAIN_NODE_PUBKEY)
    mainInstance?.lnNodePubkeys?.forEach((pubkey) =>
      expect(pubkey).toMatch(/^0[23][0-9a-f]{64}$/),
    )
  })

  it("suppresses the caveat for a prod Flash-to-Flash invoice end to end", () => {
    expect(
      shouldDiscloseFeeFromAmount({
        ...base,
        destinationPayeePubkey: payeeNodePubkey(FLASH_MAIN_INVOICE),
        flashNodePubkeys: mainInstance?.lnNodePubkeys,
      }),
    ).toBe(false)
  })
})

describe("payeeNodePubkey", () => {
  it("decodes the payee node from a real Flash invoice", () => {
    expect(payeeNodePubkey(FLASH_TEST_INVOICE)).toBe(FLASH_TEST_NODE_PUBKEY)
  })

  it("returns undefined when there is no invoice or it cannot be decoded", () => {
    expect(payeeNodePubkey(undefined)).toBeUndefined()
    expect(payeeNodePubkey("")).toBeUndefined()
    expect(payeeNodePubkey("bc1qexampledestination")).toBeUndefined()
    expect(payeeNodePubkey("lnbc-not-an-invoice")).toBeUndefined()
  })
})
