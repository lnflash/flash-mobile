import { runTool, RunToolDeps } from "@app/assistant/engine/run-tool"
import { createRegistry, defineRead } from "@app/assistant/registry/define"
import { assistantRegistry } from "@app/assistant/registry"
import { PrepareRefusedError } from "@app/assistant/registry/refusals"
import type { ReadToolCtx } from "@app/assistant/registry/types"
import { toUsdMoneyAmount } from "@app/types/amounts"
import {
  fakeBtcRail,
  fakeGraphqlRail,
  graphqlTx,
  page,
  recordingTelemetry,
  wallet,
} from "./fakes"

const setup = (registry = assistantRegistry) => {
  const graphql = fakeGraphqlRail()
  const btcRail = fakeBtcRail()
  const { telemetry, toolEvents, events } = recordingTelemetry()
  let clock = 1_000
  const deps: RunToolDeps = {
    registry,
    graphql: graphql as unknown as RunToolDeps["graphql"],
    btcRail,
    displayCurrency: "USD",
    now: () => clock,
    telemetry,
  }
  const advance = (ms: number) => {
    clock += ms
  }
  return { deps, graphql, btcRail, toolEvents, events, advance }
}

const emptyInput = {
  type: "object" as const,
  properties: {},
  additionalProperties: false as const,
}

describe("runTool", () => {
  it("routes, runs and answers with the projection, never the raw payload", async () => {
    const { deps, graphql } = setup()
    graphql.wallets.mockResolvedValue([wallet({ id: "usd-1", balance: 1234.5 })])

    const result = await runTool({ intent: "getBalances" }, deps)

    expect(result).toEqual({
      kind: "answer",
      payload: {
        balances: [
          { wallet: "USD", state: "ok", balance: toUsdMoneyAmount(1234.5) },
          { wallet: "BTC", state: "disabled", replyKey: "Assistant.btcDisabled" },
        ],
      },
    })
    // The wallet id was in the payload, and the projection dropped it.
    expect(JSON.stringify(result)).not.toMatch(/usd-1/)
  })

  it("turns a throwing rail into a templated error, and never rejects", async () => {
    const { deps, graphql } = setup()
    graphql.wallets.mockRejectedValue(new Error("Network request failed"))

    await expect(runTool({ intent: "getBalances" }, deps)).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.toolFailed",
    })
  })

  it("never rejects, whatever throws: the tool, its projection or the telemetry", async () => {
    const throwing = defineRead({
      intent: "getPrice",
      description: "test",
      input: emptyInput,
      run: async () => ({ kind: "answer", payload: 1 }),
      project: () => {
        throw new Error("projection bug")
      },
    })
    const { deps } = setup(createRegistry([throwing]))
    deps.telemetry.tool = () => {
      throw new Error("analytics down")
    }

    await expect(runTool({ intent: "getPrice" }, deps)).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.toolFailed",
    })
    await expect(runTool(undefined, deps)).resolves.toMatchObject({ kind: "error" })
  })

  it("answers the router's refusals with their reply keys", async () => {
    const { deps } = setup()

    await expect(runTool({ intent: "wireMoney" }, deps)).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.unknownIntent",
    })
    await expect(runTool({ intent: "prepareSend", args: {} }, deps)).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.notYetAvailable",
    })
    await expect(
      runTool({ intent: "getTransactions", args: { first: "ten" } }, deps),
    ).resolves.toEqual({ kind: "error", userMessage: "Assistant.invalidArguments" })
  })

  it("turns a prepare-time refusal into the templated error card", async () => {
    const refusing = defineRead({
      intent: "getPrice",
      description: "test",
      input: emptyInput,
      run: async () => {
        throw new PrepareRefusedError("insufficientBalance")
      },
      project: (payload) => payload,
    })
    const { deps } = setup(createRegistry([refusing]))

    await expect(runTool({ intent: "getPrice" }, deps)).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.insufficientBalance",
      card: { type: "prepareRefused", reason: "insufficientBalance" },
    })
  })

  it("hands a read tool the BTC rail's reads only, even when given the whole rail", async () => {
    let seen: ReadToolCtx | undefined
    const spying = defineRead({
      intent: "getPrice",
      description: "test",
      input: emptyInput,
      run: async (_args, ctx) => {
        seen = ctx
        return { kind: "answer", payload: null }
      },
      project: (payload) => payload,
    })
    const { deps, btcRail } = setup(createRegistry([spying]))
    btcRail.getBalanceSats.mockResolvedValue({ state: "ok", sats: 1 })

    await runTool({ intent: "getPrice" }, deps)

    expect(Object.keys(seen?.btcRail ?? {}).sort()).toEqual([
      "getBalanceSats",
      "listPayments",
    ])
    // The two reads still reach the rail.
    await expect(seen?.btcRail.getBalanceSats()).resolves.toEqual({
      state: "ok",
      sats: 1,
    })
  })

  describe("telemetry", () => {
    it("reports intent, tier, outcome and latency for each call", async () => {
      const { deps, graphql, toolEvents, advance } = setup()
      graphql.wallets.mockImplementation(async () => {
        advance(350)
        return []
      })

      await runTool({ intent: "getBalances" }, deps)
      await runTool({ intent: "transferEverything" }, deps)
      await runTool({ intent: "prepareCashout" }, deps)

      expect(toolEvents()).toEqual([
        {
          intent: "getBalances",
          tier: "read",
          outcome: "answered",
          latencyMs: 350,
          onDeviceModelAvailable: false,
        },
        {
          intent: "unknown",
          tier: "none",
          outcome: "rejected",
          latencyMs: 0,
          onDeviceModelAvailable: false,
        },
        {
          intent: "prepareCashout",
          tier: "action",
          outcome: "rejected",
          latencyMs: 0,
          onDeviceModelAvailable: false,
        },
      ])
    })

    it("reports clarifications and failures as such", async () => {
      const { deps, graphql, toolEvents } = setup()
      graphql.contacts.mockResolvedValue([])
      graphql.accountLimits.mockRejectedValue(new Error("down"))

      await runTool({ intent: "resolveContact", args: { hint: "mom" } }, deps)
      await runTool({ intent: "getAccountLimits" }, deps)

      expect(toolEvents().map(({ outcome }) => outcome)).toEqual([
        "clarification",
        "error",
      ])
    })

    it("carries no payload text: no memo, payee or amount", async () => {
      const { deps, graphql, events } = setup()
      graphql.transactions.mockResolvedValue(
        page([
          graphqlTx({
            id: "tx-1",
            createdAt: 5,
            memo: "SECRET-MEMO",
            settlementAmount: -987654,
            initiationVia: {
              __typename: "InitiationViaIntraLedger",
              counterPartyWalletId: "w",
              counterPartyUsername: "SECRET-PAYEE",
            },
          }),
        ]),
      )
      graphql.contacts.mockResolvedValue([
        {
          __typename: "UserContact",
          id: "SECRET-PAYEE",
          username: "SECRET-PAYEE",
          alias: "SECRET-ALIAS",
          transactionsCount: 1,
        },
      ])

      await runTool({ intent: "getTransactions", args: { query: "SECRET-MEMO" } }, deps)
      await runTool({ intent: "resolveContact", args: { hint: "SECRET-ALIAS" } }, deps)
      await runTool({ intent: "SECRET-MEMO" }, deps)

      expect(events).toHaveLength(3)
      expect(JSON.stringify(events)).not.toMatch(/SECRET|987654|9876\.54/)
    })
  })
})
