import {
  cashAccountCanPay,
  ONCHAIN_MIN_SEND_SATS,
  planOnchainSpeeds,
  resolveSelectedSpeed,
} from "../../app/screens/send-bitcoin-screen/onchain-speed-options"

// The reported case: 7,000 sats in the Bitcoin Account, 6,000 to send.
const fees = { fast: 1_230, medium: 810, slow: 420 }

describe("planOnchainSpeeds", () => {
  it("dims the speeds the balance cannot cover and pre-selects the fastest that fits", () => {
    const plan = planOnchainSpeeds({ fees, amountSats: 6_000, balanceSats: 7_000 })

    expect(plan.options).toEqual({
      fast: { feeSats: 1_230, fits: false },
      medium: { feeSats: 810, fits: true },
      slow: { feeSats: 420, fits: true },
    })
    expect(plan.defaultSpeed).toBe("medium")
    expect(plan.fastestFittingSpeed).toBe("medium")
    expect(plan.noSpeedFits).toBe(false)
    expect(plan.shortfallSats).toBe(0)
  })

  it("fits when amount + fee equals the balance exactly", () => {
    const plan = planOnchainSpeeds({ fees, amountSats: 7_000 - 810, balanceSats: 7_000 })
    expect(plan.options.medium.fits).toBe(true)
    expect(plan.defaultSpeed).toBe("medium")
  })

  it("does not fit one sat over the balance", () => {
    const plan = planOnchainSpeeds({
      fees,
      amountSats: 7_000 - 810 + 1,
      balanceSats: 7_000,
    })
    expect(plan.options.medium.fits).toBe(false)
    expect(plan.options.slow.fits).toBe(true)
    // Medium no longer fits, so the default falls to the fastest that does.
    expect(plan.defaultSpeed).toBe("slow")
  })

  it("defaults to Medium when every speed fits", () => {
    const plan = planOnchainSpeeds({ fees, amountSats: 1_000, balanceSats: 100_000 })
    expect(plan.defaultSpeed).toBe("medium")
    expect(plan.fastestFittingSpeed).toBe("fast")
  })

  it("defaults to the fastest that fits when Medium does not, even if it is not the cheapest", () => {
    // Fees are not guaranteed to fall with speed; only the order of speeds is.
    const plan = planOnchainSpeeds({
      fees: { fast: 500, medium: 900, slow: 400 },
      amountSats: 6_000,
      balanceSats: 6_500,
    })
    expect(plan.options.fast.fits).toBe(true)
    expect(plan.options.medium.fits).toBe(false)
    expect(plan.defaultSpeed).toBe("fast")
    expect(plan.cheapestFeeSats).toBe(400)
  })

  it("names the cheapest fee, the most that can be sent and the shortfall when no speed fits", () => {
    const plan = planOnchainSpeeds({ fees, amountSats: 6_800, balanceSats: 7_000 })

    expect(plan.noSpeedFits).toBe(true)
    expect(plan.defaultSpeed).toBeUndefined()
    expect(plan.fastestFittingSpeed).toBeUndefined()
    expect(plan.cheapestFeeSats).toBe(420)
    expect(plan.maxSendSats).toBe(6_580)
    expect(plan.canSendMax).toBe(true)
    expect(plan.shortfallSats).toBe(220)
  })

  it("the max it offers fits at the cheapest speed, and one sat more does not", () => {
    const { maxSendSats } = planOnchainSpeeds({
      fees,
      amountSats: 6_800,
      balanceSats: 7_000,
    })
    expect(
      planOnchainSpeeds({ fees, amountSats: maxSendSats, balanceSats: 7_000 }).options
        .slow.fits,
    ).toBe(true)
    expect(
      planOnchainSpeeds({ fees, amountSats: maxSendSats + 1, balanceSats: 7_000 })
        .noSpeedFits,
    ).toBe(true)
  })

  it("never offers a max of zero or below", () => {
    const plan = planOnchainSpeeds({ fees, amountSats: 300, balanceSats: 400 })
    expect(plan.maxSendSats).toBe(0)
    expect(plan.canSendMax).toBe(false)

    const exact = planOnchainSpeeds({ fees, amountSats: 300, balanceSats: 420 })
    expect(exact.maxSendSats).toBe(0)
    expect(exact.canSendMax).toBe(false)
  })

  it("does not offer a max below the send flow's minimum", () => {
    const below = planOnchainSpeeds({
      fees,
      amountSats: 5_600,
      balanceSats: ONCHAIN_MIN_SEND_SATS + 420 - 1,
      minSendSats: ONCHAIN_MIN_SEND_SATS,
    })
    expect(below.maxSendSats).toBe(ONCHAIN_MIN_SEND_SATS - 1)
    expect(below.canSendMax).toBe(false)

    const atMin = planOnchainSpeeds({
      fees,
      amountSats: 5_600,
      balanceSats: ONCHAIN_MIN_SEND_SATS + 420,
      minSendSats: ONCHAIN_MIN_SEND_SATS,
    })
    expect(atMin.maxSendSats).toBe(ONCHAIN_MIN_SEND_SATS)
    expect(atMin.canSendMax).toBe(true)
  })

  it("floors a fractional balance so the max stays a whole sat", () => {
    const plan = planOnchainSpeeds({ fees, amountSats: 6_800, balanceSats: 7_000.9 })
    expect(plan.maxSendSats).toBe(6_580)
  })
})

describe("resolveSelectedSpeed", () => {
  const fitsMediumAndSlow = planOnchainSpeeds({
    fees,
    amountSats: 6_000,
    balanceSats: 7_000,
  })
  const fitsSlowOnly = planOnchainSpeeds({ fees, amountSats: 6_500, balanceSats: 7_000 })
  const fitsNone = planOnchainSpeeds({ fees, amountSats: 6_800, balanceSats: 7_000 })

  it("pre-selects the default when nothing is selected", () => {
    expect(resolveSelectedSpeed(fitsMediumAndSlow, undefined)).toBe("medium")
    expect(resolveSelectedSpeed(fitsSlowOnly, undefined)).toBe("slow")
  })

  it("keeps a selection that still fits", () => {
    expect(resolveSelectedSpeed(fitsMediumAndSlow, "slow")).toBe("slow")
    expect(resolveSelectedSpeed(fitsMediumAndSlow, "medium")).toBe("medium")
  })

  it("moves a selection that stopped fitting to the fastest that fits", () => {
    expect(resolveSelectedSpeed(fitsMediumAndSlow, "fast")).toBe("medium")
    expect(resolveSelectedSpeed(fitsSlowOnly, "medium")).toBe("slow")
  })

  it("selects nothing when no speed fits", () => {
    expect(resolveSelectedSpeed(fitsNone, undefined)).toBeUndefined()
    expect(resolveSelectedSpeed(fitsNone, "slow")).toBeUndefined()
  })
})

describe("cashAccountCanPay", () => {
  const base = { amountSats: 6_000, amountCents: 600, balanceCents: 10_000 }

  it("offers the Cash Account when its balance covers the amount", () => {
    expect(cashAccountCanPay(base)).toBe(true)
    expect(cashAccountCanPay({ ...base, balanceCents: 600 })).toBe(true)
  })

  it("does not offer it one cent short", () => {
    expect(cashAccountCanPay({ ...base, balanceCents: 599 })).toBe(false)
  })

  it("does not offer it without a Cash wallet", () => {
    expect(cashAccountCanPay({ ...base, balanceCents: undefined })).toBe(false)
  })

  it("does not offer it below the 5,500 sats the server takes on-chain", () => {
    expect(cashAccountCanPay({ ...base, amountSats: ONCHAIN_MIN_SEND_SATS })).toBe(true)
    expect(cashAccountCanPay({ ...base, amountSats: ONCHAIN_MIN_SEND_SATS - 1 })).toBe(
      false,
    )
  })

  it("does not offer it when the amount cannot be priced", () => {
    expect(cashAccountCanPay({ ...base, amountCents: NaN })).toBe(false)
  })
})
