import { WalletCurrency } from "@app/graphql/generated"
import type { BtcBalance } from "@app/payments/btc-rail"
import { toBtcMoneyAmount, toUsdMoneyAmount } from "@app/types/amounts"
import { defineRead } from "../define"
import {
  BalancesPayload,
  BtcBalanceEntry,
  CashBalance,
  CashWallet,
  projectBalances,
} from "../projections"

// getBalances (docs/ai-assistant-tool-registry.md §4). Two rails, two
// sources: the USD and USDT wallets from GraphQL, the BTC wallet from the
// BTC rail. The server's BTCWallet.balance is null for the external BTC
// wallet and is never read here.

const CASH_WALLETS: readonly string[] = [WalletCurrency.Usd, WalletCurrency.Usdt]

const btcEntry = (balance: BtcBalance): BtcBalanceEntry => {
  switch (balance.state) {
    case "ok":
      return { wallet: "BTC", state: "ok", balance: toBtcMoneyAmount(balance.sats) }
    case "syncing":
      return { wallet: "BTC", state: "syncing", replyKey: "Assistant.btcSyncing" }
    case "disabled":
      return { wallet: "BTC", state: "disabled", replyKey: "Assistant.btcDisabled" }
  }
}

export const getBalances = defineRead({
  intent: "getBalances",
  description: "The balance of each of the user's wallets.",
  input: { type: "object", properties: {}, additionalProperties: false },
  run: async (_args: Record<string, never>, ctx) => {
    const [wallets, btc] = await Promise.all([
      ctx.graphql.wallets(),
      ctx.btcRail.getBalanceSats(),
    ])

    // Only walletCurrency is read to pick the wallets: a BTC wallet's
    // balance field is never touched.
    const cash = wallets
      .filter((wallet) => CASH_WALLETS.includes(wallet.walletCurrency))
      .map((wallet): CashBalance => {
        // Fractional US cents, converted as the swap screen converts them
        // (useSwap.ts): no new rounding code. A missing balance becomes NaN
        // there and "unavailable" here, never a number.
        const balance = toUsdMoneyAmount(wallet.balance ?? NaN)
        const base = { wallet: wallet.walletCurrency as CashWallet, walletId: wallet.id }
        return Number.isNaN(balance.amount)
          ? { ...base, state: "unavailable", replyKey: "Assistant.balanceUnavailable" }
          : { ...base, state: "ok", balance }
      })

    const payload: BalancesPayload = { balances: [...cash, btcEntry(btc)] }
    return { kind: "answer", payload }
  },
  project: projectBalances,
})
