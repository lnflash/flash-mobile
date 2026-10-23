import { bitcoinWalletAvailable } from "@app/hooks/bitcoin-wallet-availability"

describe("Bitcoin wallet availability", () => {
  it("accepts dotted iOS versions supported by the wallet", () => {
    expect(bitcoinWalletAvailable("ios", "26.1")).toBe(true)
    expect(bitcoinWalletAvailable("ios", 13)).toBe(true)
  })

  it("keeps older iOS versions unavailable", () => {
    expect(bitcoinWalletAvailable("ios", "12.5")).toBe(false)
  })
})
