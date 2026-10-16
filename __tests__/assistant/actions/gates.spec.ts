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

  it("lets the on-chain branch through: ENG-714 is done (spec v0.2.10 §5.1)", () => {
    expect(BREEZ_SEND_GATES.onchain).toBeNull()
    expect(() => assertBreezSendOpen("onchain")).not.toThrow()
  })

  it("refuses bolt11 until ENG-720, with the not-available card", () => {
    expect(BREEZ_SEND_GATES.lightning).toBe("ENG-720")
    let refused: unknown
    try {
      assertBreezSendOpen("lightning")
    } catch (err) {
      refused = err
    }
    expect(refused).toBeInstanceOf(PrepareRefusedError)
    expect(refused).toMatchObject({ reason: "notAvailableYet" })
  })

  it("refuses a payment type it has no gate for", () => {
    expect(() => assertBreezSendOpen("unified")).toThrow(PrepareRefusedError)
  })
})
