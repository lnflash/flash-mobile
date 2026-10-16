// Fake rails, telemetry and fixtures for the assistant specs. Not a spec
// itself: the file name does not end in .spec or .test.
import type {
  AssistantTelemetry,
  AssistantToolEvent,
} from "@app/assistant/engine/telemetry"
import type {
  GraphqlRail,
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

/** A GraphQL rail with an empty account; each case overrides what it reads. */
export const fakeGraphqlRail = (): FakeGraphqlRail => ({
  wallets: jest.fn(async () => []),
  transactions: jest.fn(async () => ({ rows: [], hasNextPage: false, endCursor: null })),
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
