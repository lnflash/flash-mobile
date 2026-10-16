import { getBalances } from "@app/assistant/registry/read/get-balances"
import { toBtcMoneyAmount, toUsdMoneyAmount } from "@app/types/amounts"
import { fakeCtx, wallet } from "../fakes"

const balancesOf = async (setup: Parameters<typeof fakeCtx>[0] = {}) => {
  const { ctx } = fakeCtx(setup)
  const result = await getBalances.run({}, ctx)
  if (result.kind !== "answer") throw new Error(`expected an answer, got ${result.kind}`)
  return result.payload as { balances: Record<string, unknown>[] }
}

const withWallets = (...wallets: ReturnType<typeof wallet>[]) => {
  const { graphql, btcRail } = fakeCtx()
  graphql.wallets.mockResolvedValue(wallets)
  return { graphql, btcRail }
}

describe("getBalances", () => {
  describe("the USD and USDT wallets, in fractional cents", () => {
    // Fractional cents as the API reports them, converted the way the swap
    // screen does (useSwap.ts): toUsdMoneyAmount(balance ?? NaN).
    const cases: [string, number][] = [
      ["1234.5 cents", 1234.5],
      ["one hundred-millionth of a cent", 0.00000001],
      ["a whole number of cents", 158],
      ["zero", 0],
    ]
    cases.forEach(([name, balance]) =>
      it(`converts ${name} exactly as toUsdMoneyAmount does`, async () => {
        const payload = await balancesOf(withWallets(wallet({ balance })))

        expect(payload.balances[0]).toEqual({
          wallet: "USD",
          walletId: "usd-wallet",
          state: "ok",
          balance: toUsdMoneyAmount(balance),
        })
      }),
    )

    it("reports a missing balance as unavailable, never as a number", async () => {
      const payload = await balancesOf(withWallets(wallet({ balance: null })))

      expect(payload.balances[0]).toEqual({
        wallet: "USD",
        walletId: "usd-wallet",
        state: "unavailable",
        replyKey: "Assistant.balanceUnavailable",
      })
    })

    it("answers the USDT wallet the same way", async () => {
      const payload = await balancesOf(
        withWallets(
          wallet({ id: "usd", walletCurrency: "USD", balance: 100 }),
          wallet({
            __typename: "UsdtWallet",
            id: "usdt",
            walletCurrency: "USDT",
            balance: 2500.1234,
          }),
        ),
      )

      expect(payload.balances.slice(0, 2)).toEqual([
        { wallet: "USD", walletId: "usd", state: "ok", balance: toUsdMoneyAmount(100) },
        {
          wallet: "USDT",
          walletId: "usdt",
          state: "ok",
          balance: toUsdMoneyAmount(2500.1234),
        },
      ])
    })
  })

  describe("the BTC wallet, from the BTC rail", () => {
    it("reports a good read in sats", async () => {
      const { graphql, btcRail } = fakeCtx()
      btcRail.getBalanceSats.mockResolvedValue({ state: "ok", sats: 21000 })

      const payload = await balancesOf({ graphql, btcRail })

      expect(payload.balances).toEqual([
        { wallet: "BTC", state: "ok", balance: toBtcMoneyAmount(21000) },
      ])
    })

    // `failed`: advance mode is on and the wallet's start gave up, so the
    // reply must not send the user to turn advance mode on.
    const notRunning: ["syncing" | "disabled" | "failed", string][] = [
      ["syncing", "Assistant.btcSyncing"],
      ["disabled", "Assistant.btcDisabled"],
      ["failed", "Assistant.btcFailed"],
    ]
    notRunning.forEach(([state, replyKey]) =>
      it(`reports ${state} with no number at all, never zero`, async () => {
        const { graphql, btcRail } = fakeCtx()
        btcRail.getBalanceSats.mockResolvedValue({ state })

        const payload = await balancesOf({ graphql, btcRail })

        expect(payload.balances).toEqual([{ wallet: "BTC", state, replyKey }])
        expect(payload.balances[0]).not.toHaveProperty("balance")
      }),
    )

    it("never reads the server's BTCWallet.balance", async () => {
      // Null for the external BTC wallet (schema BTCWallet.balance). Poisoned
      // here: any read of it throws.
      const reads = jest.fn()
      const btcWallet = wallet({
        __typename: "BTCWallet",
        id: "btc-wallet",
        walletCurrency: "BTC",
        isExternal: true,
      })
      Object.defineProperty(btcWallet, "balance", {
        get: () => {
          reads()
          throw new Error("BTCWallet.balance was read")
        },
      })
      const { graphql, btcRail } = withWallets(wallet({ balance: 100 }), btcWallet)
      btcRail.getBalanceSats.mockResolvedValue({ state: "ok", sats: 5 })

      const payload = await balancesOf({ graphql, btcRail })

      expect(reads).not.toHaveBeenCalled()
      expect(payload.balances).toEqual([
        {
          wallet: "USD",
          walletId: "usd-wallet",
          state: "ok",
          balance: toUsdMoneyAmount(100),
        },
        { wallet: "BTC", state: "ok", balance: toBtcMoneyAmount(5) },
      ])
    })

    it("lets a rail failure reject, for runTool to report", async () => {
      const { ctx, btcRail } = fakeCtx()
      const failure = new Error("connection reset")
      btcRail.getBalanceSats.mockRejectedValue(failure)

      await expect(getBalances.run({}, ctx)).rejects.toBe(failure)
    })
  })

  it("takes no arguments", () => {
    expect(getBalances.validate({}).valid).toBe(true)
    expect(getBalances.validate({ wallet: "USD" }).valid).toBe(false)
  })

  it("projects away the wallet ids", async () => {
    const payload = await balancesOf(withWallets(wallet({ balance: 1 })))

    expect(getBalances.project(payload, {})).toEqual({
      balances: [
        { wallet: "USD", state: "ok", balance: toUsdMoneyAmount(1) },
        { wallet: "BTC", state: "disabled", replyKey: "Assistant.btcDisabled" },
      ],
    })
  })
})
