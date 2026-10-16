import { WalletCurrency } from "@app/graphql/generated"
import { getBtcWallet, getCashWallet } from "@app/graphql/wallets-utils"
import { toBtcMoneyAmount, toWalletAmount, WalletAmount } from "@app/types/amounts"
import { btcUnavailable } from "../../projections"
import type { ActionToolCtx } from "../../types"
import { ToolReplyError } from "./errors"

/** Which wallet a call names: BTC, or USD or USDT for the cash wallet. */
export type WalletChoice = "BTC" | "USD" | "USDT"

export type SourceWallet = {
  id: string
  currency: WalletCurrency
  /** Raw, as the server or the BTC rail gives it: fractional cents stay. */
  balance: WalletAmount<WalletCurrency>
}

/** The account's wallet rows, and the cash wallet among them (USDT before USD, as the screens pick it). */
export const cashWalletOf = (
  wallets: Awaited<ReturnType<ActionToolCtx["graphql"]["wallets"]>>,
) => getCashWallet(wallets)

/**
 * The wallet a payment comes from (or goes to) and its balance. USD and USDT
 * both name the cash wallet, as the conversion and settle screens treat it.
 * The BTC wallet's balance comes from the BTC rail, never from the server
 * (spec §2.1): a wallet that is syncing, off or failed answers its own reply,
 * never a zero.
 */
export const readWallet = async (
  ctx: Pick<ActionToolCtx, "graphql" | "btcRail">,
  choice: WalletChoice | undefined,
): Promise<SourceWallet> => {
  const wallets = await ctx.graphql.wallets()
  if (choice === "BTC") {
    const row = getBtcWallet(wallets)
    if (!row) throw new ToolReplyError("Assistant.walletUnavailable")
    const balance = await ctx.btcRail.getBalanceSats()
    if (balance.state !== "ok") {
      throw new ToolReplyError(btcUnavailable(balance.state).replyKey)
    }
    return {
      id: row.id,
      currency: WalletCurrency.Btc,
      balance: toBtcMoneyAmount(balance.sats),
    }
  }
  const row = cashWalletOf(wallets)
  if (!row) throw new ToolReplyError("Assistant.walletUnavailable")
  if (row.balance === null || row.balance === undefined || Number.isNaN(row.balance)) {
    throw new ToolReplyError("Assistant.balanceUnavailable")
  }
  return {
    id: row.id,
    currency: row.walletCurrency,
    balance: toWalletAmount({ amount: row.balance, currency: row.walletCurrency }),
  }
}

/** The ids of every wallet on the account, so a payment to one of them is refused. */
export const walletIdsOf = async (
  ctx: Pick<ActionToolCtx, "graphql">,
): Promise<string[]> => (await ctx.graphql.wallets()).map((wallet) => wallet.id)
