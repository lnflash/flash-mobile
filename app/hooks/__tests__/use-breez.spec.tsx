import * as React from "react"
import { renderHook } from "@testing-library/react-native"

import { BreezContext, type BreezInterface } from "@app/contexts/BreezContext"
import { useBreez } from "../useBreez"
import type { UnverifiedSparkUsdtWallet } from "@app/utils/breez-sdk/token-balances"

const sparkUsdtWallet: UnverifiedSparkUsdtWallet = {
  identifier: "tok:usdt",
  issuerPublicKey: "02abc",
  issuerVerified: false,
  balanceMinor: BigInt("12345678"),
  decimals: 6,
}

const contextValue: BreezInterface = {
  refreshBreez: () => {},
  retryExternalWalletRegistration: async () => {},
  loading: false,
  externalWalletLoading: false,
  btcWallet: { id: "w1", walletCurrency: "BTC", balance: 500, isExternal: true },
  sparkUsdtWallet,
}

const wrapper = ({ children }: React.PropsWithChildren) => (
  <BreezContext.Provider value={contextValue}>{children}</BreezContext.Provider>
)

describe("useBreez", () => {
  it("passes every provided context field through, sparkUsdtWallet included", () => {
    const { result } = renderHook(() => useBreez(), { wrapper })

    // Every consumer in the app reads Breez through this hook — none call
    // useContext(BreezContext) directly. When the hook annotated its result
    // with a hand-copied interface, a field the provider supplied but the copy
    // omitted was erased right here and `yarn tsc:check` rejected any read of
    // it. The explicit annotation below is the assertion that matters: it is a
    // compile error if the hook's return type ever stops tracking
    // BreezInterface.
    const wallet: UnverifiedSparkUsdtWallet | undefined = result.current.sparkUsdtWallet

    expect(wallet).toEqual(sparkUsdtWallet)
    expect(wallet?.balanceMinor).toBe(BigInt("12345678"))
    expect(result.current.btcWallet.balance).toBe(500)
  })

  it("returns the context default when no provider is mounted", () => {
    const { result } = renderHook(() => useBreez())

    expect(result.current.sparkUsdtWallet).toBeUndefined()
    expect(result.current.btcWallet.balance).toBe(0)
  })
})
