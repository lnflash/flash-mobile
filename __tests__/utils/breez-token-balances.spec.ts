import {
  selectUsdtBalance,
  USDT_TICKER,
  type SparkTokenBalanceLike,
} from "@app/utils/breez-sdk/token-balances"

const token = (
  overrides: Partial<SparkTokenBalanceLike["tokenMetadata"]> & { balance?: bigint } = {},
): SparkTokenBalanceLike => {
  const { balance = BigInt("1000000"), ...metadata } = overrides
  return {
    balance,
    tokenMetadata: {
      identifier: "tok:usdt",
      issuerPublicKey: "02abc",
      ticker: USDT_TICKER,
      decimals: 6,
      ...metadata,
    },
  }
}

const map = (...entries: SparkTokenBalanceLike[]) =>
  new Map(entries.map((entry, i) => [entry?.tokenMetadata?.identifier || `k${i}`, entry]))

describe("selectUsdtBalance", () => {
  it("returns the USDT token's balance in minor units, undivided", () => {
    const result = selectUsdtBalance(map(token({ balance: BigInt("12345678") })))

    expect(result).toEqual({
      identifier: "tok:usdt",
      issuerPublicKey: "02abc",
      balanceMinor: BigInt("12345678"),
      decimals: 6,
    })
  })

  it("carries decimals from metadata rather than assuming 6", () => {
    const result = selectUsdtBalance(map(token({ decimals: 8, balance: BigInt("100") })))

    expect(result?.decimals).toBe(8)
    // The raw balance is untouched — 100 minor units at 8 decimals, not at 6.
    expect(result?.balanceMinor).toBe(BigInt("100"))
  })

  it("keeps full precision on balances beyond Number.MAX_SAFE_INTEGER", () => {
    const huge = BigInt("9007199254740993") // MAX_SAFE_INTEGER + 2

    const result = selectUsdtBalance(map(token({ balance: huge })))

    expect(result?.balanceMinor).toBe(huge)
    // The value a Number round-trip would have silently produced instead.
    expect(result?.balanceMinor).not.toBe(BigInt(Number(huge)))
  })

  it("matches the ticker case-insensitively", () => {
    expect(selectUsdtBalance(map(token({ ticker: "usdt" })))?.balanceMinor).toBe(
      BigInt("1000000"),
    )
  })

  it("ignores other tokens and picks the USDT one", () => {
    const result = selectUsdtBalance(
      map(
        token({ identifier: "tok:other", ticker: "SPRK", balance: BigInt("42") }),
        token({ identifier: "tok:usdt", balance: BigInt("7") }),
      ),
    )

    expect(result?.identifier).toBe("tok:usdt")
    expect(result?.balanceMinor).toBe(BigInt("7"))
  })

  it("refuses to guess when two tokens both claim the USDT ticker", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {})

    const result = selectUsdtBalance(
      map(
        token({ identifier: "tok:real", issuerPublicKey: "02real" }),
        token({ identifier: "tok:spoof", issuerPublicKey: "02spoof" }),
      ),
    )

    // Surfacing a spoofed issuer's balance as the user's money is worse than
    // surfacing nothing.
    expect(result).toBeUndefined()
    expect(warn).toHaveBeenCalled()

    warn.mockRestore()
  })

  it("returns undefined when no token carries the USDT ticker", () => {
    expect(selectUsdtBalance(map(token({ ticker: "SPRK" })))).toBeUndefined()
  })

  it("returns undefined for an empty, missing, or non-Map balance set", () => {
    expect(selectUsdtBalance(new Map())).toBeUndefined()
    expect(selectUsdtBalance(undefined)).toBeUndefined()
    expect(selectUsdtBalance(null)).toBeUndefined()
    // The SDK bridge has changed shapes before; a plain object must not throw.
    expect(
      selectUsdtBalance({} as unknown as Map<string, SparkTokenBalanceLike>),
    ).toBeUndefined()
  })

  it("does not throw on a malformed entry with no metadata", () => {
    const malformed = { balance: BigInt("1") } as unknown as SparkTokenBalanceLike

    expect(() => selectUsdtBalance(map(malformed))).not.toThrow()
    expect(selectUsdtBalance(map(malformed))).toBeUndefined()
  })
})
