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
import type { BtcReadRail, ReadToolCtx } from "@app/assistant/registry/types"
import type { BtcBalance } from "@app/payments/btc-rail"

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
}: {
  id: string
  timestamp: number
  paymentType?: 0 | 1
  status?: 0 | 1 | 2
  sats?: number
  fees?: number
  description?: string
  lnAddress?: string
}): BtcPayment =>
  ({
    id,
    paymentType,
    status,
    amount: BigInt(sats),
    fees: BigInt(fees),
    timestamp: BigInt(timestamp),
    method: 0,
    details:
      description === undefined && lnAddress === undefined
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
