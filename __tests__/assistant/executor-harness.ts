// A harness for the executor specs: a fake clock, a fake auth gate, an
// in-memory journal and a scripted reconciler. Not a spec itself.
import {
  createAttemptJournal,
  JournalStorage,
} from "@app/assistant/engine/attempt-journal"
import type { AuthAvailability } from "@app/assistant/engine/auth-gate"
import {
  createAttemptState,
  createExecutor,
  ExecutorDeps,
} from "@app/assistant/engine/executor"
import type { ReconcileVerdict } from "@app/assistant/engine/reconcile"
import type {
  ExecutionOutcome,
  PreparedAction,
  ToolResult,
} from "@app/assistant/registry/types"
import { recordingTelemetry } from "./fakes"

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
