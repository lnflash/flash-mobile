// Fake rails, telemetry and fixtures for the assistant specs. Not a spec
// itself: the file name does not end in .spec or .test.
import { createHash } from "crypto"
import { encode, sign } from "bolt11"
import type {
  AssistantTelemetry,
  AssistantToolEvent,
} from "@app/assistant/engine/telemetry"
import type {
  GraphqlRail,
  TransactionPage,
  TransactionRow,
  WalletRow,
} from "@app/assistant/rails/graphql-rail"
import type { GraphqlActionRail } from "@app/assistant/rails/graphql-action-rail"
import type {
  ActionToolCtx,
  BtcReadRail,
  DisplayFormatter,
  ReadToolCtx,
} from "@app/assistant/registry/types"
import type { BtcBalance } from "@app/payments/btc-rail"
import type { GraphqlMutationFns } from "@app/payments/send-payment"
import type { GetFeeParams } from "@app/screens/send-bitcoin-screen/payment-details/index.types"
import { DisplayCurrency, MoneyAmount, WalletOrDisplayCurrency } from "@app/types/amounts"

export type BtcPayment = Awaited<ReturnType<BtcReadRail["listPayments"]>>[number]

export type FakeGraphqlRail = { [K in keyof GraphqlRail]: jest.Mock }

/**
 * A GraphQL rail with an empty account; each case overrides what it reads.
 * The transaction list has no default: lnflash/flash serves an empty list
 * both for a wallet with no rows and for one it could not read (ENG-725), so
 * an empty list proves nothing, and a case says what the list shows.
 */
export const fakeGraphqlRail = (): FakeGraphqlRail => ({
  wallets: jest.fn(async () => []),
  transactions: jest.fn(async () => {
    throw new Error("transactions not stubbed")
  }),
  transactionDetails: jest.fn(async () => null),
  contacts: jest.fn(async () => []),
  accountDefaultWallet: jest.fn(async () => null),
  realtimePrice: jest.fn(async () => {
    throw new Error("realtimePrice not stubbed")
  }),
  businessMapMarkers: jest.fn(async () => []),
  accountLimits: jest.fn(async () => ({ withdrawal: [], internalSend: [], convert: [] })),
})

/** The whole BTC rail, sends included, so a spec can show they are never called. */
export const fakeBtcRail = () => ({
  getBalanceSats: jest.fn(async (): Promise<BtcBalance> => ({ state: "disabled" })),
  listPayments: jest.fn(async (): Promise<BtcPayment[]> => []),
  payInvoice: jest.fn(),
  payLnurl: jest.fn(),
  payOnchain: jest.fn(),
  createInvoice: jest.fn(),
  getOnchainAddress: jest.fn(),
  probeFee: jest.fn(),
})

export const NOW_MS = 1_760_000_000_000

export const fakeCtx = (
  overrides: { graphql?: FakeGraphqlRail; btcRail?: ReturnType<typeof fakeBtcRail> } = {},
) => {
  const graphql = overrides.graphql ?? fakeGraphqlRail()
  const btcRail = overrides.btcRail ?? fakeBtcRail()
  const ctx: ReadToolCtx = {
    graphql: graphql as unknown as GraphqlRail,
    btcRail,
    displayCurrency: "JMD",
    now: () => NOW_MS,
  }
  return { ctx, graphql, btcRail }
}

export type RecordedEvent =
  | { type: "tool"; event: AssistantToolEvent }
  | { type: "threadOpened" }
  | { type: "clarificationAbandoned"; clarificationCount: number }
  | { type: "openToConfirm"; openToConfirmMs: number }

export const recordingTelemetry = () => {
  const events: RecordedEvent[] = []
  const telemetry: AssistantTelemetry = {
    tool: (event) => {
      events.push({ type: "tool", event })
    },
    threadOpened: () => {
      events.push({ type: "threadOpened" })
    },
    clarificationAbandoned: ({ clarificationCount }) => {
      events.push({ type: "clarificationAbandoned", clarificationCount })
    },
    openToConfirm: ({ openToConfirmMs }) => {
      events.push({ type: "openToConfirm", openToConfirmMs })
    },
  }
  const toolEvents = () =>
    events.flatMap((recorded) => (recorded.type === "tool" ? [recorded.event] : []))
  return { telemetry, events, toolEvents }
}

export const wallet = (overrides: Partial<WalletRow>): WalletRow =>
  ({
    __typename: "UsdWallet",
    id: "usd-wallet",
    balance: 0,
    walletCurrency: "USD",
    isExternal: false,
    ...overrides,
  } as WalletRow)

/** A GraphQL transaction: an intraledger USD send to bob unless overridden. */
export const graphqlTx = (
  overrides: Partial<TransactionRow> & { id: string; createdAt: number },
): TransactionRow => ({
  __typename: "Transaction",
  status: "SUCCESS",
  direction: "SEND",
  memo: null,
  settlementAmount: -500,
  settlementFee: 0,
  settlementDisplayFee: "0.00",
  settlementCurrency: "USD",
  settlementDisplayAmount: "-5.00",
  settlementDisplayCurrency: "USD",
  settlementPrice: {
    __typename: "PriceOfOneSettlementMinorUnitInDisplayMinorUnit",
    base: 1,
    offset: 0,
    currencyUnit: "USDCENT",
    formattedAmount: "0.01",
  },
  initiationVia: {
    __typename: "InitiationViaIntraLedger",
    counterPartyWalletId: "bob-wallet",
    counterPartyUsername: "bob",
  },
  settlementVia: {
    __typename: "SettlementViaIntraLedger",
    counterPartyWalletId: "bob-wallet",
    counterPartyUsername: "bob",
  },
  ...overrides,
})

/** A Breez payment, as listPaymentsBreezSDK hands it back. */
export const btcPayment = ({
  id,
  timestamp,
  paymentType = 0,
  status = 0,
  sats = 2100,
  fees = 3,
  description,
  lnAddress,
  method = 0,
}: {
  id: string
  timestamp: number
  paymentType?: 0 | 1
  status?: 0 | 1 | 2
  /** The amount: sats, or a token's base units for a token payment. */
  sats?: number
  fees?: number
  description?: string
  lnAddress?: string
  /** PaymentMethod: 0 Lightning, 1 Spark, 2 Token, 3 Deposit, 4 Withdraw, 5 Unknown. */
  method?: 0 | 1 | 2 | 3 | 4 | 5
}): BtcPayment =>
  ({
    id,
    paymentType,
    status,
    amount: BigInt(sats),
    fees: BigInt(fees),
    timestamp: BigInt(timestamp),
    method,
    details:
      method === 2
        ? {
            tag: "Token",
            inner: {
              metadata: { identifier: "usdt-token", ticker: "USDT", decimals: 6 },
              txHash: `tx-${id}`,
            },
          }
        : description === undefined && lnAddress === undefined
        ? undefined
        : {
            tag: "Lightning",
            inner: {
              description,
              invoice: "lnbc1...",
              destinationPubkey: "02ab",
              htlcDetails: {
                paymentHash: `hash-${id}`,
                preimage: "pre",
                expiryTime: BigInt(0),
              },
              lnurlPayInfo: lnAddress === undefined ? undefined : { lnAddress },
            },
          },
    conversionDetails: undefined,
  } as unknown as BtcPayment)

/** A page of GraphQL transactions, newest first. */
export const page = (
  rows: TransactionRow[],
  next?: string,
): { rows: TransactionRow[]; hasNextPage: boolean; endCursor: string | null } => ({
  rows,
  hasNextPage: next !== undefined,
  endCursor: next ?? null,
})

/**
 * The deposit that funded a wallet, a day before `beforeMs`, as lnflash/flash
 * lists it: an IBEX Lightning receipt with its hash blank. It is a row of that
 * wallet's, in its currency, that settled before a dispatch at `beforeMs`, so
 * the list shows the wallet's rows read back past it (reconcile.ts).
 */
export const fundedBefore = (
  beforeMs: number,
  currency: TransactionRow["settlementCurrency"] = "USD",
): TransactionRow =>
  graphqlTx({
    id: `funded-${currency}`,
    createdAt: Math.floor(beforeMs / 1000) - 86_400,
    direction: "RECEIVE",
    settlementAmount: 10_000,
    settlementCurrency: currency,
    initiationVia: { __typename: "InitiationViaLn", paymentHash: "" },
    settlementVia: { __typename: "SettlementViaLn", paymentSecret: null },
  })

/** The cursors lnflash/flash takes as `after` (src/graphql/connections.ts:9). */
export const FLASH_CURSOR = /^[A-Fa-f0-9]{24}$/

/** What lnflash/flash answers an `after` it refuses (connections.ts:171-175). */
export const FLASH_CURSOR_REFUSED = 'Argument "after" must be a valid cursor'

/**
 * Account.transactions over a list of `pages`, as lnflash/flash (d1cca3767)
 * serves it: the first page, with hasNextPage when more follow and its last
 * row's id as the cursor. That id is an IBEX transaction id, never the 24
 * hex characters checkedConnectionArgs takes (connections.ts:9,171-175,
 * consumer-account.ts:185), so a read of the next page is refused as flash
 * refuses it, until ENG-724.
 */
export const flashTransactions =
  (pages: readonly (readonly TransactionRow[])[]) =>
  async ({ after }: { first: number; after?: string }): Promise<TransactionPage> => {
    if (after !== undefined) {
      if (!FLASH_CURSOR.test(after)) throw new Error(FLASH_CURSOR_REFUSED)
      throw new Error(`the fake hands out no 24-hex cursor such as ${after}`)
    }
    const rows = pages[0] ?? []
    const last = rows[rows.length - 1]
    return { rows, hasNextPage: pages.length > 1, endCursor: last ? last.id : null }
  }

/** Page `index`'s cursor, which asks for the page after it: 24 hex characters. */
const servedCursor = (index: number): string => index.toString(16).padStart(24, "0")

/**
 * Account.transactions over a list of `pages`, every page served, as
 * lnflash/flash would serve it with a cursor it takes (ENG-724): each page
 * says hasNextPage when more follow, and its cursor is 24 hex characters,
 * which checkedConnectionArgs accepts (connections.ts:9). An `after` that is
 * not one is refused as flash refuses it (connections.ts:171-175).
 */
export const servedTransactions =
  (pages: readonly (readonly TransactionRow[])[]) =>
  async ({ after }: { first: number; after?: string }): Promise<TransactionPage> => {
    if (after !== undefined && !FLASH_CURSOR.test(after)) {
      throw new Error(FLASH_CURSOR_REFUSED)
    }
    const index = after === undefined ? 0 : parseInt(after, 16) + 1
    if (index > 0 && index >= pages.length) {
      throw new Error(`the fake handed out no cursor such as ${after}`)
    }
    const rows = pages[index] ?? []
    return {
      rows,
      hasNextPage: index < pages.length - 1,
      endCursor: rows.length > 0 ? servedCursor(index) : null,
    }
  }

// ---------------------------------------------------------------------------
// The action tier (ENG-688)
// ---------------------------------------------------------------------------

const notStubbed = (name: string) =>
  jest.fn(async () => {
    throw new Error(`${name} not stubbed`)
  })

export type FakeActionRail = {
  [K in Exclude<keyof GraphqlActionRail, "feeProbes">]: jest.Mock
} & { feeProbes: { [K in keyof GetFeeParams]: jest.Mock } }

/** The custodial action rail; each case stubs what it calls. */
export const fakeActionRail = (): FakeActionRail => ({
  feeProbes: {
    lnInvoiceFeeProbe: notStubbed("lnInvoiceFeeProbe"),
    lnNoAmountInvoiceFeeProbe: notStubbed("lnNoAmountInvoiceFeeProbe"),
    lnNoAmountUsdInvoiceFeeProbe: notStubbed("lnNoAmountUsdInvoiceFeeProbe"),
    lnUsdInvoiceFeeProbe: notStubbed("lnUsdInvoiceFeeProbe"),
    onChainTxFee: notStubbed("onChainTxFee"),
    onChainUsdTxFee: notStubbed("onChainUsdTxFee"),
    onChainUsdTxFeeAsBtcDenominated: notStubbed("onChainUsdTxFeeAsBtcDenominated"),
  },
  lnUsdInvoiceCreate: notStubbed("lnUsdInvoiceCreate"),
  onChainAddressCurrent: notStubbed("onChainAddressCurrent"),
  accountCapabilities: jest.fn(async () => ({ bankPayout: false })),
  bankAccounts: jest.fn(async () => []),
  requestCashout: notStubbed("requestCashout"),
  initiateCashout: notStubbed("initiateCashout"),
})

export type FakeSendTriggers = { [K in keyof GraphqlMutationFns]: jest.Mock }

/** The nine GraphQL send triggers; a case scripts the one its send calls. */
export const fakeSendTriggers = (): FakeSendTriggers => ({
  intraLedgerPaymentSend: notStubbed("intraLedgerPaymentSend"),
  intraLedgerUsdPaymentSend: notStubbed("intraLedgerUsdPaymentSend"),
  lnInvoicePaymentSend: notStubbed("lnInvoicePaymentSend"),
  lnNoAmountInvoicePaymentSend: notStubbed("lnNoAmountInvoicePaymentSend"),
  lnNoAmountUsdInvoicePaymentSend: notStubbed("lnNoAmountUsdInvoicePaymentSend"),
  onChainPaymentSend: notStubbed("onChainPaymentSend"),
  onChainPaymentSendAll: notStubbed("onChainPaymentSendAll"),
  onChainUsdPaymentSend: notStubbed("onChainUsdPaymentSend"),
  onChainUsdPaymentSendAsBtcDenominated: notStubbed(
    "onChainUsdPaymentSendAsBtcDenominated",
  ),
})

/** "USD 500", "JMD 78000", "BTC 2100": a money amount as the fake formatter writes it. */
export const fmt = (moneyAmount: MoneyAmount<WalletOrDisplayCurrency>): string =>
  `${moneyAmount.currencyCode} ${moneyAmount.amount}`

/**
 * A display formatter with useDisplayCurrency's shape and a format a spec
 * can predict: the primary amount (the display amount by default), then the
 * wallet amount in brackets when its currency differs from the display one.
 */
export const fakeDisplay = (fractionDigits = 2): DisplayFormatter => ({
  fractionDigits,
  formatMoneyAmount: ({ moneyAmount }) => fmt(moneyAmount),
  formatDisplayAndWalletAmount: ({ primaryAmount, displayAmount, walletAmount }) => {
    const primary = primaryAmount ?? displayAmount
    if (walletAmount.currency === displayAmount.currencyCode) return fmt(primary)
    const secondary = primary.currency === DisplayCurrency ? walletAmount : displayAmount
    return `${fmt(primary)} (${fmt(secondary)})`
  },
})

/** An action context over fakes: the thread, both rails, the triggers, the formatter. */
export const fakeActionCtx = (
  overrides: {
    graphql?: FakeGraphqlRail
    btcRail?: ReturnType<typeof fakeBtcRail>
    actions?: FakeActionRail
    mutations?: FakeSendTriggers
    displayCurrency?: string
    fractionDigits?: number
    now?: () => number
  } = {},
) => {
  const graphql = overrides.graphql ?? fakeGraphqlRail()
  const btcRail = overrides.btcRail ?? fakeBtcRail()
  const actions = overrides.actions ?? fakeActionRail()
  const mutations = overrides.mutations ?? fakeSendTriggers()
  const requestLnurlInvoice = jest.fn(async (): Promise<{ invoice: string }> => {
    throw new Error("requestLnurlInvoice not stubbed")
  })
  const ctx: ActionToolCtx = {
    threadId: "thread-1",
    graphql: graphql as unknown as ActionToolCtx["graphql"],
    graphqlActions: actions as unknown as ActionToolCtx["graphqlActions"],
    btcRail: btcRail as unknown as ActionToolCtx["btcRail"],
    send: {
      mutations: mutations as unknown as GraphqlMutationFns,
      graphqlUri: "https://api.example/graphql",
      lnAddressHostname: "flashapp.me",
    },
    requestLnurlInvoice,
    displayCurrency: overrides.displayCurrency ?? "USD",
    display: fakeDisplay(overrides.fractionDigits),
    now: overrides.now ?? (() => NOW_MS),
  }
  return { ctx, graphql, btcRail, actions, mutations, requestLnurlInvoice }
}

const NODE_KEY = "11".repeat(32)

/** The payment hash a fixture invoice made from `id` carries. */
export const paymentHashOf = (id: string): string =>
  createHash("sha256").update(id).digest("hex")

/**
 * A real, signed mainnet bolt11, so the decoders the tools use read it: its
 * amount (none when `sats` is absent), its issue time and lifetime, and the
 * payment hash paymentHashOf(id).
 */
export const bolt11 = ({
  id = "invoice",
  sats,
  timestampMs = NOW_MS,
  expirySeconds = 300,
}: {
  id?: string
  sats?: number
  timestampMs?: number
  expirySeconds?: number
} = {}): string => {
  const unsigned = encode({
    ...(sats === undefined ? {} : { satoshis: sats }),
    timestamp: Math.floor(timestampMs / 1000),
    tags: [
      { tagName: "payment_hash", data: paymentHashOf(id) },
      { tagName: "description", data: "assistant spec" },
      { tagName: "expire_time", data: expirySeconds },
    ],
  })
  return sign(unsigned, NODE_KEY).paymentRequest as string
}

/**
 * A realtimePrice answer: J$157 to the dollar and $63,000 a bitcoin, so a
 * sat is 0.063 US cents and J$0.09891.
 */
export const JMD_PRICE = {
  __typename: "RealtimePrice" as const,
  timestamp: 1_760_000_000,
  denominatorCurrency: "JMD",
  btcSatPrice: {
    __typename: "PriceOfOneSatInMinorUnit" as const,
    base: 9_891_000,
    offset: 6,
  },
  usdCentPrice: {
    __typename: "PriceOfOneUsdCentInMinorUnit" as const,
    base: 157_000_000,
    offset: 6,
  },
}

/** The same rates for an account whose display currency is USD. */
export const USD_PRICE = {
  ...JMD_PRICE,
  denominatorCurrency: "USD",
  btcSatPrice: { ...JMD_PRICE.btcSatPrice, base: 63_000, offset: 6 },
  usdCentPrice: { ...JMD_PRICE.usdCentPrice, base: 1_000_000, offset: 6 },
}
