import { estimateJmdReceiveCents } from "@app/screens/topup-cashout-flow/cashout-estimate"

describe("estimateJmdReceiveCents", () => {
  // Mirrors backend math: fee (bps) off the USD amount first, then convert at
  // the settlement rate (JMD cents per USD, integer division).
  it("matches the backend quote math for a round amount", () => {
    // $100.00 at 2% fee and $1 = J$152.70:
    // fee = 200c, payout = 9800c, receive = 9800 * 15270 / 100 = 1,496,460 JMD cents
    expect(estimateJmdReceiveCents(10_000, 15_270, 200)).toBe(1_496_460)
  })

  it("floors like the backend integer math instead of rounding up", () => {
    // $0.99 at 2%: fee = floor(99*200/10000) = 1c, payout 98c
    // receive = floor(98 * 15333 / 100) = floor(15026.34) = 15026
    expect(estimateJmdReceiveCents(99, 15_333, 200)).toBe(15_026)
  })

  it("applies no fee when feeBasisPoints is zero", () => {
    expect(estimateJmdReceiveCents(10_000, 15_000, 0)).toBe(1_500_000)
  })

  it("returns 0 for empty or invalid inputs instead of NaN", () => {
    expect(estimateJmdReceiveCents(0, 15_270, 200)).toBe(0)
    expect(estimateJmdReceiveCents(NaN, 15_270, 200)).toBe(0)
    expect(estimateJmdReceiveCents(10_000, NaN, 200)).toBe(0)
    expect(estimateJmdReceiveCents(10_000, 15_270, -1)).toBe(0)
  })
})
