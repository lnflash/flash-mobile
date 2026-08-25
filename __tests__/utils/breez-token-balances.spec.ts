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
      issuerVerified: false,
      balanceMinor: BigInt("12345678"),
      decimals: 6,
    })
  })

  it("marks the result unverified — a lone ticker match proves nothing", () => {
    // The ambiguity check only fires for a user who already holds the real
    // token. Airdrop a spoofed USDT to a user holding none and it is the only
    // match, so it is what comes back. Nothing about a single match is trusted,
    // and the result has to say so.
    const spoofOnly = selectUsdtBalance(
      map(token({ identifier: "tok:spoof", issuerPublicKey: "02spoof" })),
    )

    expect(spoofOnly?.issuerVerified).toBe(false)
    expect(spoofOnly?.issuerPublicKey).toBe("02spoof")
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
    // Silenced, not asserted — the warning itself is covered by its own case
    // below.
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {})

    expect(selectUsdtBalance(new Map())).toBeUndefined()
    expect(selectUsdtBalance(undefined)).toBeUndefined()
    expect(selectUsdtBalance(null)).toBeUndefined()
    // The SDK bridge has changed shapes before; a plain object must not throw.
    expect(
      selectUsdtBalance({} as unknown as Map<string, SparkTokenBalanceLike>),
    ).toBeUndefined()

    warn.mockRestore()
  })

  it("warns when tokenBalances is present but not Map-shaped", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {})

    // Absent is normal and stays quiet; present-but-wrong-shape is the SDK
    // drifting under us, and a silently missing balance with nothing in the
    // logs is how that goes unnoticed for a release.
    selectUsdtBalance(undefined)
    selectUsdtBalance(null)
    expect(warn).not.toHaveBeenCalled()

    expect(
      selectUsdtBalance({} as unknown as Map<string, SparkTokenBalanceLike>),
    ).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("not a Map"))

    warn.mockRestore()
  })

  it("refuses a balance the SDK did not hand over as a bigint", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {})

    // A future Spark bump lowering u128 as a string or a number would leave
    // balanceMinor typed bigint without being one, and the first consumer doing
    // `balanceMinor / 10n ** BigInt(decimals)` throws. Missing beats lying.
    const withBalance = (balance: unknown): SparkTokenBalanceLike =>
      ({ ...token(), balance } as unknown as SparkTokenBalanceLike)

    expect(selectUsdtBalance(map(withBalance("12345678")))).toBeUndefined()
    expect(selectUsdtBalance(map(withBalance(12345678)))).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("not bigint"))

    warn.mockRestore()
  })

  it("refuses a decimals the SDK did not hand over as a non-negative integer", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {})

    // Same failure class as the balance guard, one field over. Nothing upstream
    // vouches for decimals — the ticker filter only reads tokenMetadata.ticker
    // — so an FFI bridge that stops lowering it as a number lands here, and the
    // documented consumer expression `balanceMinor / 10n ** BigInt(decimals)`
    // throws "Cannot convert undefined to a BigInt".
    const withDecimals = (decimals: unknown): SparkTokenBalanceLike =>
      token({ decimals: decimals as number })

    expect(selectUsdtBalance(map(withDecimals(undefined)))).toBeUndefined()
    expect(selectUsdtBalance(map(withDecimals(null)))).toBeUndefined()
    expect(selectUsdtBalance(map(withDecimals("6")))).toBeUndefined()
    expect(selectUsdtBalance(map(withDecimals(6.5)))).toBeUndefined()
    expect(selectUsdtBalance(map(withDecimals(NaN)))).toBeUndefined()
    // BigInt(-2) is fine; 10n ** -2n is a RangeError, so it fails the same way.
    expect(selectUsdtBalance(map(withDecimals(-2)))).toBeUndefined()

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("not a non-negative integer"),
    )

    warn.mockRestore()
  })

  it("accepts 0 decimals — an integer token is not a missing one", () => {
    const result = selectUsdtBalance(map(token({ decimals: 0, balance: BigInt("42") })))

    expect(result?.decimals).toBe(0)
    expect(result?.balanceMinor).toBe(BigInt("42"))
  })

  it("does not throw on a malformed entry with no metadata", () => {
    const malformed = { balance: BigInt("1") } as unknown as SparkTokenBalanceLike

    expect(() => selectUsdtBalance(map(malformed))).not.toThrow()
    expect(selectUsdtBalance(map(malformed))).toBeUndefined()
  })
})
