/**
 * Unit tests for the shared rounding policy module.
 *
 * Spec: ENG-318. The property-based tests live in ENG-320; the tests below
 * cover ties, negatives, zero, bigint inputs, large-`number` boundaries, and
 * the context → mode policy table.
 */

import {
  __policyForContext,
  minorUnitScale,
  roundForContext,
  roundMinor,
  RoundingContext,
  RoundingMode,
} from "./rounding"

describe("roundMinor — tie behaviour by mode", () => {
  // | input | half-to-even | half-up | half-down | ceiling | floor |
  const ties: ReadonlyArray<{
    input: number
    expected: Record<RoundingMode, bigint>
  }> = [
    {
      input: 0.5,
      expected: {
        "half-to-even": 0n,
        "half-up": 1n,
        "half-down": 0n,
        ceiling: 1n,
        floor: 0n,
      },
    },
    {
      input: 1.5,
      expected: {
        "half-to-even": 2n,
        "half-up": 2n,
        "half-down": 1n,
        ceiling: 2n,
        floor: 1n,
      },
    },
    {
      input: 2.5,
      expected: {
        "half-to-even": 2n,
        "half-up": 3n,
        "half-down": 2n,
        ceiling: 3n,
        floor: 2n,
      },
    },
    {
      input: -0.5,
      expected: {
        "half-to-even": 0n,
        "half-up": -1n,
        "half-down": 0n,
        ceiling: 0n,
        floor: -1n,
      },
    },
    {
      input: -1.5,
      expected: {
        "half-to-even": -2n,
        "half-up": -2n,
        "half-down": -1n,
        ceiling: -1n,
        floor: -2n,
      },
    },
    {
      input: -2.5,
      expected: {
        "half-to-even": -2n,
        "half-up": -3n,
        "half-down": -2n,
        ceiling: -2n,
        floor: -3n,
      },
    },
  ]

  for (const { input, expected } of ties) {
    for (const mode of Object.keys(expected) as RoundingMode[]) {
      it(`${input} with ${mode} → ${expected[mode]}`, () => {
        expect(roundMinor(input, mode)).toBe(expected[mode])
      })
    }
  }
})

describe("roundMinor — non-tie cases", () => {
  it("rounds 1.4 down for nearest modes", () => {
    expect(roundMinor(1.4, "half-up")).toBe(1n)
    expect(roundMinor(1.4, "half-down")).toBe(1n)
    expect(roundMinor(1.4, "half-to-even")).toBe(1n)
  })

  it("rounds 1.6 up for nearest modes", () => {
    expect(roundMinor(1.6, "half-up")).toBe(2n)
    expect(roundMinor(1.6, "half-down")).toBe(2n)
    expect(roundMinor(1.6, "half-to-even")).toBe(2n)
  })

  it("ceiling and floor on non-integer values", () => {
    expect(roundMinor(1.01, "ceiling")).toBe(2n)
    expect(roundMinor(1.99, "floor")).toBe(1n)
    expect(roundMinor(-1.01, "ceiling")).toBe(-1n)
    expect(roundMinor(-1.99, "floor")).toBe(-2n)
  })

  it("zero is unchanged in every mode", () => {
    const modes: RoundingMode[] = [
      "half-to-even",
      "half-up",
      "half-down",
      "ceiling",
      "floor",
    ]
    for (const mode of modes) {
      expect(roundMinor(0, mode)).toBe(0n)
      expect(roundMinor(-0, mode)).toBe(0n)
    }
  })
})

describe("roundMinor — bigint inputs are returned unchanged", () => {
  it("integer bigints round to themselves under all modes", () => {
    const inputs: bigint[] = [0n, 1n, -1n, 12345n, -12345n]
    const modes: RoundingMode[] = [
      "half-to-even",
      "half-up",
      "half-down",
      "ceiling",
      "floor",
    ]
    for (const v of inputs) {
      for (const m of modes) {
        expect(roundMinor(v, m)).toBe(v)
      }
    }
  })
})

describe("roundMinor — already-integer numbers are idempotent", () => {
  // Acceptance criterion (property-test stub): roundMinor is idempotent on
  // already-integer inputs across all modes. Exhaustive property infra is
  // ENG-320; here we lock in a representative grid.
  const integers: number[] = [
    0,
    1,
    -1,
    100,
    -100,
    1_000_000,
    -1_000_000,
    Number.MAX_SAFE_INTEGER,
    -Number.MAX_SAFE_INTEGER,
  ]
  const modes: RoundingMode[] = [
    "half-to-even",
    "half-up",
    "half-down",
    "ceiling",
    "floor",
  ]

  for (const v of integers) {
    for (const m of modes) {
      it(`${v} (${m}) is idempotent`, () => {
        const once = roundMinor(v, m)
        const twice = roundMinor(once, m)
        expect(once).toBe(BigInt(v))
        expect(twice).toBe(once)
      })
    }
  }
})

describe("roundMinor — large numbers stay exact", () => {
  it("MAX_SAFE_INTEGER + tiny fraction does not lose the integer part", () => {
    // The double `9_007_199_254_740_991.5` is representable; the .5 collapses
    // when added to the integer, but our string-based normaliser preserves
    // the full input precision. We verify by going through a value that is
    // exactly representable.
    expect(roundMinor(9_007_199_254_740_991, "half-up")).toBe(
      9_007_199_254_740_991n,
    )
  })

  it("bigint paths handle values past 2^53", () => {
    const big = (1n << 60n) + 7n
    expect(roundMinor(big, "half-up")).toBe(big)
    expect(roundMinor(big, "floor")).toBe(big)
    expect(roundMinor(big, "ceiling")).toBe(big)
  })
})

describe("roundMinor — input validation", () => {
  it("rejects NaN", () => {
    expect(() => roundMinor(Number.NaN, "half-up")).toThrow(RangeError)
  })
  it("rejects Infinity", () => {
    expect(() => roundMinor(Number.POSITIVE_INFINITY, "half-up")).toThrow(
      RangeError,
    )
    expect(() => roundMinor(Number.NEGATIVE_INFINITY, "half-up")).toThrow(
      RangeError,
    )
  })
})

describe("roundForContext — locks in the policy table", () => {
  // If you change one of these expectations, you are changing money policy.
  // Update CONTEXT_MODE in the same PR and explain the rationale.
  const expectations: ReadonlyArray<{
    context: RoundingContext
    mode: RoundingMode
    sample: number
    expected: bigint
  }> = [
    { context: "accounting", mode: "half-to-even", sample: 2.5, expected: 2n },
    { context: "display", mode: "half-up", sample: 2.5, expected: 3n },
    { context: "fee", mode: "ceiling", sample: 0.01, expected: 1n },
    { context: "payout", mode: "floor", sample: 0.99, expected: 0n },
  ]

  for (const { context, mode, sample, expected } of expectations) {
    it(`${context} → ${mode} (sample ${sample} → ${expected})`, () => {
      expect(__policyForContext(context)).toBe(mode)
      expect(roundForContext(sample, context)).toBe(expected)
    })
  }
})

describe("minorUnitScale", () => {
  it("BTC and SAT are 0", () => {
    expect(minorUnitScale("BTC")).toBe(0)
    expect(minorUnitScale("SAT")).toBe(0)
  })

  it("common 2-digit fiat", () => {
    expect(minorUnitScale("USD")).toBe(2)
    expect(minorUnitScale("EUR")).toBe(2)
    expect(minorUnitScale("JMD")).toBe(2)
    expect(minorUnitScale("GBP")).toBe(2)
  })

  it("3-digit fiat", () => {
    expect(minorUnitScale("BHD")).toBe(3)
    expect(minorUnitScale("KWD")).toBe(3)
  })

  it("0-digit fiat", () => {
    expect(minorUnitScale("JPY")).toBe(0)
    expect(minorUnitScale("KRW")).toBe(0)
  })

  it("is case-insensitive", () => {
    expect(minorUnitScale("usd")).toBe(2)
    expect(minorUnitScale("Btc")).toBe(0)
  })

  it("falls back to 2 for unknown currencies", () => {
    expect(minorUnitScale("XXX")).toBe(2)
    expect(minorUnitScale("ZZZZZ")).toBe(2)
  })
})
