import { ToolReplyError } from "@app/assistant/registry/actions/shared/errors"
import { readWallet, walletIdsOf } from "@app/assistant/registry/actions/shared/wallets"
import { toBtcMoneyAmount } from "@app/types/amounts"
import { fakeActionCtx, wallet } from "../fakes"

const BTC_ROW = wallet({
  __typename: "BTCWallet",
  id: "btc-1",
  walletCurrency: "BTC",
  balance: null as never,
  isExternal: true,
})

const replyOf = async (read: Promise<unknown>) => {
  try {
    await read
  } catch (err) {
    if (err instanceof ToolReplyError) return err.replyKey
    throw err
  }
  return undefined
}

describe("readWallet", () => {
  it("reads the cash wallet, USDT before USD as the screens pick it, raw fractional cents and all", async () => {
    const { ctx, graphql } = fakeActionCtx()
    graphql.wallets.mockResolvedValue([
      wallet({ id: "usd-1", walletCurrency: "USD", balance: 100 }),
      wallet({
        __typename: "UsdtWallet",
        id: "usdt-1",
        walletCurrency: "USDT",
        balance: 1234.56,
      }),
      BTC_ROW,
    ])

    for (const choice of [undefined, "USD", "USDT"] as const) {
      await expect(readWallet(ctx, choice)).resolves.toEqual({
        id: "usdt-1",
        currency: "USDT",
        balance: { amount: 1234.56, currency: "USDT", currencyCode: "USDT" },
      })
    }
  })

  it("reads the BTC wallet's balance from the BTC rail, never from the server", async () => {
    const { ctx, graphql, btcRail } = fakeActionCtx()
    graphql.wallets.mockResolvedValue([wallet({ id: "usd-1" }), BTC_ROW])
    btcRail.getBalanceSats.mockResolvedValue({ state: "ok", sats: 21_000 })

    await expect(readWallet(ctx, "BTC")).resolves.toEqual({
      id: "btc-1",
      currency: "BTC",
      balance: toBtcMoneyAmount(21_000),
    })
  })

  it("answers a BTC wallet that is not ok with its own reply, never a zero", async () => {
    const replies: ["syncing" | "disabled" | "failed", string][] = [
      ["syncing", "Assistant.btcSyncing"],
      ["disabled", "Assistant.btcDisabled"],
      ["failed", "Assistant.btcFailed"],
    ]
    for (const [state, reply] of replies) {
      const { ctx, graphql, btcRail } = fakeActionCtx()
      graphql.wallets.mockResolvedValue([BTC_ROW])
      btcRail.getBalanceSats.mockResolvedValue({ state })

      await expect(replyOf(readWallet(ctx, "BTC"))).resolves.toBe(reply)
    }
  })

  it("says so when the account has no such wallet, or no cash balance to read", async () => {
    const { ctx, graphql } = fakeActionCtx()
    graphql.wallets.mockResolvedValueOnce([wallet({ id: "usd-1" })])
    await expect(replyOf(readWallet(ctx, "BTC"))).resolves.toBe(
      "Assistant.walletUnavailable",
    )

    graphql.wallets.mockResolvedValueOnce([BTC_ROW])
    await expect(replyOf(readWallet(ctx, "USD"))).resolves.toBe(
      "Assistant.walletUnavailable",
    )

    graphql.wallets.mockResolvedValueOnce([
      wallet({ id: "usd-1", balance: null as never }),
    ])
    await expect(replyOf(readWallet(ctx, undefined))).resolves.toBe(
      "Assistant.balanceUnavailable",
    )
  })

  it("lists every wallet id on the account", async () => {
    const { ctx, graphql } = fakeActionCtx()
    graphql.wallets.mockResolvedValue([wallet({ id: "usd-1" }), BTC_ROW])

    await expect(walletIdsOf(ctx)).resolves.toEqual(["usd-1", "btc-1"])
  })
})
