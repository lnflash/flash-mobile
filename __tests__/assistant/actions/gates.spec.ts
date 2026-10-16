import {
  assertBreezSendOpen,
  BREEZ_SEND_GATES,
} from "@app/assistant/registry/actions/shared/gates"
import { PrepareRefusedError } from "@app/assistant/registry/refusals"

describe("the Breez send gates (ENG-688 addendum)", () => {
  it("lets the LNURL and intraledger branches through: ENG-694 and ENG-711 are done", () => {
    expect(() => assertBreezSendOpen("lnurl")).not.toThrow()
    expect(() => assertBreezSendOpen("intraledger")).not.toThrow()
  })

  it("refuses bolt11 until ENG-720, and on-chain until ENG-714, with the not-available card", () => {
    expect(BREEZ_SEND_GATES.lightning).toBe("ENG-720")
    expect(BREEZ_SEND_GATES.onchain).toBe("ENG-714")
    for (const paymentType of ["lightning", "onchain"]) {
      let refused: unknown
      try {
        assertBreezSendOpen(paymentType)
      } catch (err) {
        refused = err
      }
      expect(refused).toBeInstanceOf(PrepareRefusedError)
      expect(refused).toMatchObject({ reason: "notAvailableYet" })
    }
  })

  it("refuses a payment type it has no gate for", () => {
    expect(() => assertBreezSendOpen("unified")).toThrow(PrepareRefusedError)
  })
})
