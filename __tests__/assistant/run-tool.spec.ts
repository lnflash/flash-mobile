import { ActionDeps, runTool, RunToolDeps } from "@app/assistant/engine/run-tool"
import { SchemaDefinitionError } from "@app/assistant/engine/schema-validator"
import {
  createRegistry,
  defineAction,
  defineRead,
  RegisteredTool,
} from "@app/assistant/registry/define"
import { assistantRegistry, READ_TOOLS } from "@app/assistant/registry"
import { PrepareRefusedError } from "@app/assistant/registry/refusals"
import {
  ActionToolCtx,
  INTENTS,
  ReadToolCtx,
  tierOf,
} from "@app/assistant/registry/types"
import { toUsdMoneyAmount } from "@app/types/amounts"
import {
  fakeActionCtx,
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
    lnAddressHostname: "flashapp.me",
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
    // A known intent with no tool registered. Since ENG-688 every intent
    // has one in the assistant's registry, so a registry of the read tools
    // alone stands in.
    await expect(
      runTool(
        { intent: "prepareSend", args: {} },
        setup(createRegistry(READ_TOOLS)).deps,
      ),
    ).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.notYetAvailable",
    })
    // With the tool registered, its schema refuses the call first.
    await expect(runTool({ intent: "prepareSend", args: {} }, deps)).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.invalidArguments",
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

    it("says an on-device model served the call only when its caller says so (ENG-690)", async () => {
      const { deps, toolEvents } = setup()

      await runTool({ intent: "getBalances" }, deps)
      await runTool({ intent: "getBalances" }, { ...deps, servedByOnDeviceModel: false })
      await runTool({ intent: "getBalances" }, { ...deps, servedByOnDeviceModel: true })
      // A refused call the model emitted says so too.
      await runTool(
        { intent: "transferEverything" },
        { ...deps, servedByOnDeviceModel: true },
      )

      expect(
        toolEvents().map(({ onDeviceModelAvailable }) => onDeviceModelAvailable),
      ).toEqual([false, false, true, true])
    })

    it("never hands the model's flag to a tool", async () => {
      let seen: unknown
      const spy = defineRead({
        intent: "getBalances",
        description: "Watches its context.",
        input: emptyInput,
        run: async (_args, ctx) => {
          seen = ctx
          return { kind: "answer", payload: {} }
        },
        project: (payload) => payload,
      })
      const { deps } = setup(createRegistry([spy]))

      await runTool({ intent: "getBalances" }, { ...deps, servedByOnDeviceModel: true })

      expect(Object.keys(seen as object)).not.toContain("servedByOnDeviceModel")
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

describe("runTool with action tools (ENG-688)", () => {
  /** The action deps runTool adds to the shared ones, from the fake action context. */
  const fakeActionDeps = (): ActionDeps => {
    const { ctx } = fakeActionCtx()
    const {
      graphql: _graphql,
      displayCurrency: _currency,
      now: _now,
      ...actionDeps
    } = ctx
    return actionDeps
  }

  const answeringAction = (payload: unknown, spy?: (ctx: ActionToolCtx) => void) =>
    defineAction({
      intent: "prepareReceive",
      description: "test",
      input: emptyInput,
      run: async (_args, ctx) => {
        spy?.(ctx)
        return { kind: "answer", payload }
      },
    })

  it("hands an action tool the action context: its thread, the whole BTC rail, the action rails", async () => {
    let seen: ActionToolCtx | undefined
    const { deps, graphql } = setup(
      createRegistry([answeringAction(null, (ctx) => (seen = ctx))]),
    )
    const actionDeps = fakeActionDeps()

    await runTool({ intent: "prepareReceive" }, { ...deps, actionDeps })

    expect(seen?.threadId).toBe("thread-1")
    expect(seen?.graphqlActions).toBe(actionDeps.graphqlActions)
    expect(seen?.send).toBe(actionDeps.send)
    expect(seen?.display).toBe(actionDeps.display)
    expect(seen?.requestLnurlInvoice).toBe(actionDeps.requestLnurlInvoice)
    // The action context's BTC rail is the whole rail, sends and prepare
    // members included; the shared deps supply the rest.
    expect(seen?.btcRail).toBe(actionDeps.btcRail)
    expect(Object.keys(seen?.btcRail ?? {})).toEqual(
      expect.arrayContaining(["payInvoice", "probeFee", "createInvoice"]),
    )
    expect(seen?.graphql).toBe(graphql)
    expect(seen?.displayCurrency).toBe("USD")
  })

  it("answers an action intent notYetAvailable, and runs nothing, without action deps", async () => {
    const run = jest.fn()
    const tool = answeringAction(null, run)
    const { deps, toolEvents } = setup(createRegistry([tool]))

    await expect(runTool({ intent: "prepareReceive" }, deps)).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.notYetAvailable",
    })
    expect(run).not.toHaveBeenCalled()
    expect(toolEvents()).toEqual([expect.objectContaining({ tier: "action" })])
  })

  it("lets an action tool's answer out as it is when it has no projection", async () => {
    const invoice = { type: "invoice", paymentRequest: "lnbc1...", shareText: "lnbc1..." }
    const { deps } = setup(createRegistry([answeringAction(invoice)]))

    await expect(
      runTool({ intent: "prepareReceive" }, { ...deps, actionDeps: fakeActionDeps() }),
    ).resolves.toEqual({ kind: "answer", payload: invoice })
  })

  it("still hands a read tool only the read context when action deps are there", async () => {
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
    const { deps } = setup(createRegistry([spying]))

    await runTool({ intent: "getPrice" }, { ...deps, actionDeps: fakeActionDeps() })

    expect(Object.keys(seen ?? {}).sort()).toEqual([
      "btcRail",
      "displayCurrency",
      "graphql",
      "lnAddressHostname",
      "now",
    ])
    // The instance's Lightning-address host, which a history search reads.
    expect(seen?.lnAddressHostname).toBe("flashapp.me")
    expect(Object.keys(seen?.btcRail ?? {}).sort()).toEqual([
      "getBalanceSats",
      "listPayments",
    ])
  })

  it("turns a gated branch's refusal into the error card with the not-available reply", async () => {
    const gated = defineAction({
      intent: "prepareSend",
      description: "test",
      input: emptyInput,
      run: async () => {
        throw new PrepareRefusedError("notAvailableYet")
      },
    })
    const { deps } = setup(createRegistry([gated]))

    await expect(
      runTool({ intent: "prepareSend" }, { ...deps, actionDeps: fakeActionDeps() }),
    ).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.notYetAvailable",
      card: { type: "prepareRefused", reason: "notAvailableYet" },
    })
  })
})

describe("the assistant's registry (ENG-688)", () => {
  it("registers a tool for every intent, each in its own tier", () => {
    expect([...assistantRegistry.keys()].sort()).toEqual([...INTENTS].sort())
    assistantRegistry.forEach((tool, intent) => expect(tool.tier).toBe(tierOf(intent)))
  })

  it("answers a valid prepare call notYetAvailable, preparing nothing, without action deps", async () => {
    const { deps, graphql } = setup()

    await expect(
      runTool(
        { intent: "prepareSend", args: { payee: "Alice", amount: "5", currency: "USD" } },
        deps,
      ),
    ).resolves.toEqual({ kind: "error", userMessage: "Assistant.notYetAvailable" })
    expect(graphql.contacts).not.toHaveBeenCalled()
  })
})

describe("defineAction and createRegistry (ENG-688)", () => {
  it("checks an action tool's schema when it is defined", () => {
    expect(() =>
      defineAction({
        intent: "prepareSend",
        description: "test",
        input: { type: "object", properties: {} } as never,
        run: async () => ({ kind: "error", userMessage: "Assistant.toolFailed" }),
      }),
    ).toThrow(SchemaDefinitionError)
  })

  it("refuses a tool registered in the other tier", () => {
    const readAsAction = defineAction({
      intent: "getPrice" as never,
      description: "test",
      input: emptyInput,
      run: async () => ({ kind: "answer", payload: null }),
    })
    const actionAsRead = {
      ...readAsAction,
      intent: "prepareSend",
      tier: "read",
    } as unknown as RegisteredTool

    expect(() => createRegistry([readAsAction])).toThrow(
      "getPrice belongs to the read tier",
    )
    expect(() => createRegistry([actionAsRead])).toThrow(
      "prepareSend belongs to the action tier",
    )
  })
})
