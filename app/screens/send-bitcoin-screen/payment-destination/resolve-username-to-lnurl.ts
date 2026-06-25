import { PaymentType } from "@galoymoney/client"
import { Network as NetworkGaloyClient, parsePaymentDestination } from "@flash/client"
import { requestPayServiceParams } from "lnurl-pay"

import { LNURL_DOMAINS } from "@app/config"
import {
  AccountDefaultWalletLazyQueryHookResult,
  WalletCurrency,
} from "@app/graphql/generated"

import { createLnurlPaymentDestination } from "./lnurl"
import { InvalidDestinationReason, ParseDestinationResult } from "./index.types"

/**
 * When a bare Flash username / intraledger handle resolves to a recipient whose
 * default wallet is BTC/Breez, an intraledger send from a USD wallet fails. In
 * that case we instead route the payment through the recipient's lightning
 * address (`handle@lnAddressHostname`) so the USD wallet pays the generated
 * LNURL invoice.
 *
 * Returns:
 *  - an LNURL `ParseDestinationResult` when the username should be re-routed,
 *  - an invalid result for self-payment or an unreachable lightning address,
 *  - `null` when this helper does not apply (not a username, or the recipient's
 *    default wallet is not BTC), so the caller falls back to `parseDestination`.
 *
 * Shared by every send entry point that can receive a bare username (manual
 * entry and QR scan) so the routing decision is not duplicated. See ENG-399.
 */
export const maybeResolveManualUsernameToLnurl = async ({
  rawInput,
  myWalletIds,
  lnAddressHostname,
  accountDefaultWalletQuery,
}: {
  rawInput: string
  myWalletIds: string[]
  lnAddressHostname: string
  accountDefaultWalletQuery: AccountDefaultWalletLazyQueryHookResult[0]
}): Promise<ParseDestinationResult | null> => {
  const parsedDestination = parsePaymentDestination({
    destination: rawInput,
    network: "mainnet" as NetworkGaloyClient,
    lnAddressDomains: LNURL_DOMAINS,
  })

  if (
    parsedDestination.paymentType !== PaymentType.Intraledger ||
    !parsedDestination.valid
  ) {
    return null
  }

  const { handle } = parsedDestination
  const { data } = await accountDefaultWalletQuery({ variables: { username: handle } })
  const wallet = data?.accountDefaultWallet

  if (!wallet || wallet.walletCurrency !== WalletCurrency.Btc) {
    return null
  }

  if (myWalletIds.includes(wallet.id)) {
    return {
      valid: false,
      invalidReason: InvalidDestinationReason.SelfPayment,
      invalidPaymentDestination: parsedDestination,
    } as const
  }

  const lnurl = `${handle}@${lnAddressHostname}`

  try {
    const lnurlParams = await requestPayServiceParams({
      lnUrlOrAddress: lnurl,
    })

    return createLnurlPaymentDestination({
      paymentType: PaymentType.Lnurl,
      valid: true,
      lnurl,
      lnurlParams,
    })
  } catch {
    return {
      valid: false,
      invalidReason: InvalidDestinationReason.LnurlError,
      invalidPaymentDestination: {
        paymentType: PaymentType.Lnurl,
        valid: false,
        invalidReason: "unknown",
      },
    } as const
  }
}
