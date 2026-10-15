// A harness for the executor specs: a fake clock, a fake auth gate, an
// in-memory journal and a scripted reconciler, or (setupSendingExecutor) the
// real journal, reconciler and sendPayment. Not a spec itself.
import {
  createAttemptJournal,
  journalMutations,
  JournalStorage,
} from "@app/assistant/engine/attempt-journal"
import type { AuthAvailability } from "@app/assistant/engine/auth-gate"
import {
  createAttemptState,
  createExecutor,
  ExecutorDeps,
} from "@app/assistant/engine/executor"
import {
  createTransactionListReconciler,
  ReconcileVerdict,
} from "@app/assistant/engine/reconcile"
import type { GraphqlRail } from "@app/assistant/rails/graphql-rail"
import type {
  ExecuteContext,
  ExecutionOutcome,
  PreparedAction,
  ToolResult,
} from "@app/assistant/registry/types"
import { PaymentSendResult } from "@app/graphql/generated"
import { breezBtcRail } from "@app/payments/btc-rail"
import { GraphqlMutationFns, sendPayment } from "@app/payments/send-payment"
import type { SendPaymentMutation } from "@app/screens/send-bitcoin-screen/payment-details/index.types"
import { fakeGraphqlRail, recordingTelemetry } from "./fakes"

export const T0 = 1_760_000_000_000

export const memoryStorage = (): JournalStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value)
    },
  }
}

export const SUMMARY = {
  payeeLabel: "Alice",
  payeeUsername: "alice",
  amountText: "$5.00",
  feeText: "$0.00",
  totalText: "$5.00",
  sourceWalletLabel: "Cash",
}

export const DISPATCH = {
  paymentDetailHash: "hash:alice:500:USD",
  match: {
    kind: "intraledger" as const,
    counterPartyWalletId: "alice-wallet",
    settlementCurrency: "USD" as const,
    amount: 500,
  },
}

type ActionOverrides = Partial<Omit<PreparedAction, "execute" | "refresh">> & {
  execute?: jest.Mock
  refresh?: jest.Mock
}

let nextId = 0

/** A prepared send of $5 to alice, valid for a minute from `createdAt`. */
export const makeAction = (overrides: ActionOverrides = {}) => {
  nextId += 1
  const createdAt = overrides.createdAt ?? T0
  const action = {
    id: `action-${nextId}`,
    intent: "prepareSend" as const,
    threadId: "thread-1",
    createdAt,
    expiresAt: createdAt + 60_000,
    summary: SUMMARY,
    attempt: createAttemptState(),
    dispatch: DISPATCH,
    execute: jest.fn(async (): Promise<ExecutionOutcome> => ({ status: "succeeded" })),
    refresh: jest.fn(
      async (): Promise<ToolResult<unknown>> => ({
        kind: "error",
        userMessage: "Assistant.toolFailed",
      }),
    ),
    ...overrides,
  }
  return action as PreparedAction & { execute: jest.Mock; refresh: jest.Mock }
}

/** A refresh that prepares `next` from the same inputs. */
export const refreshingTo = (next: PreparedAction) =>
  jest.fn(
    async (): Promise<ToolResult<unknown>> => ({
      kind: "prepared",
      preparedAction: next,
    }),
  )

export const setupExecutor = (
  options: {
    availability?: AuthAvailability
    authenticates?: boolean
    verdict?: ReconcileVerdict
    storage?: JournalStorage
  } = {},
) => {
  let clock = T0
  const now = () => clock
  const advance = (ms: number) => {
    clock += ms
  }
  const auth = {
    availability: jest.fn(
      async (): Promise<AuthAvailability> => options.availability ?? "biometric",
    ),
    authenticate: jest.fn(async () => options.authenticates ?? true),
  }
  const storage = options.storage ?? memoryStorage()
  const journal = createAttemptJournal({ storage })
  const reconcile = jest.fn(
    async (): Promise<ReconcileVerdict> => options.verdict ?? "unknown",
  )
  const recorded = recordingTelemetry()
  const deps: ExecutorDeps = {
    auth,
    journal,
    reconcile,
    telemetry: recorded.telemetry,
    now,
  }
  const executor = createExecutor(deps)
  return { executor, auth, journal, reconcile, storage, now, advance, ...recorded }
}

/** The send closure a payment-details builder returns, for $5 to alice. */
export const sendToAlice: SendPaymentMutation = async ({
  intraLedgerUsdPaymentSend,
  idempotencyKey,
}) => {
  const result = await intraLedgerUsdPaymentSend({
    variables: {
      input: {
        walletId: "my-usd",
        recipientWalletId: "alice-wallet",
        amount: 500,
        idempotencyKey,
      },
    },
  })
  return {
    status: result.data?.intraLedgerUsdPaymentSend.status,
    errors: result.data?.intraLedgerUsdPaymentSend.errors,
  }
}

/** The server's answer to a send that went through. */
export const SENT = {
  data: {
    intraLedgerUsdPaymentSend: { status: PaymentSendResult.Success, errors: [] },
  },
}

/** A dropped response: the send may or may not have landed. */
export const lostResponse = () => Promise.reject(new Error("Network request failed"))

/**
 * An executor over the real dispatch journal and the real transaction-list
 * reconciler, whose actions pay alice $5 through the real sendPayment and
 * journaled triggers. A case scripts the one trigger they call,
 * `intraLedgerUsdPaymentSend`, and what the list shows, `graphql.transactions`
 * (empty and read in full unless it says otherwise). A trigger that rejects
 * is a lost response: execute() reports an unknown outcome to retry under
 * the same key, as prepareSend's will (ENG-688).
 */
export const setupSendingExecutor = ({
  storage = memoryStorage(),
}: { storage?: JournalStorage } = {}) => {
  let clock = T0
  const now = () => clock
  const advance = (ms: number) => {
    clock += ms
  }
  const journal = createAttemptJournal({ storage })
  const graphql = fakeGraphqlRail()
  const reconcile = jest.fn(
    createTransactionListReconciler({
      graphql: graphql as unknown as GraphqlRail,
      now,
    }),
  )
  const intraLedgerUsdPaymentSend = jest.fn()
  const executor = createExecutor({
    auth: { availability: async () => "none", authenticate: async () => false },
    journal,
    reconcile,
    telemetry: recordingTelemetry().telemetry,
    now,
  })
  const execute = async (ctx: ExecuteContext): Promise<ExecutionOutcome> => {
    try {
      const outcome = await sendPayment(
        { sendPaymentMutation: sendToAlice },
        {
          mutations: journalMutations(
            { intraLedgerUsdPaymentSend } as unknown as GraphqlMutationFns,
            ctx.journalDispatch,
          ),
          btcRail: breezBtcRail,
          graphqlUri: "https://api.example/graphql",
          lnAddressHostname: "flashapp.me",
        },
        ctx.attempt,
      )
      return outcome.status === PaymentSendResult.Success
        ? { status: "succeeded" }
        : { status: "failed", replyKey: "Assistant.toolFailed", next: "confirmAgain" }
    } catch {
      return {
        status: "unknown",
        replyKey: "Assistant.checkHistory",
        next: "retrySameAttempt",
      }
    }
  }
  /** $5 to alice, prepared now: an intraledger USD send, valid 10 minutes (spec §5). */
  const prepare = (threadId = "thread-1") =>
    makeAction({
      threadId,
      createdAt: clock,
      expiresAt: clock + 10 * 60_000,
      dispatch: DISPATCH,
      execute: jest.fn(execute),
    })
  /** The idempotency key of every send that went out, in order. */
  const keysSent = (): string[] =>
    intraLedgerUsdPaymentSend.mock.calls.map(
      ([options]) => options.variables.input.idempotencyKey,
    )
  return {
    executor,
    journal,
    graphql,
    reconcile,
    intraLedgerUsdPaymentSend,
    prepare,
    advance,
    now,
    keysSent,
  }
}
