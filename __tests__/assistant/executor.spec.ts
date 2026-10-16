import { MAX_PREPARED_PER_THREAD } from "@app/assistant/engine/action-store"
import type { AuthOrigin } from "@app/assistant/engine/auth-policy"
import type { ExecuteContext, ExecutionOutcome } from "@app/assistant/registry/types"
import { PrepareRefusedError } from "@app/assistant/registry/refusals"
import {
  DISPATCH,
  makeAction,
  refreshingTo,
  setupExecutor,
  SUMMARY,
  T0,
} from "./executor-harness"

const executed = (outcome: ExecutionOutcome) => jest.fn(async () => outcome)

describe("executor", () => {
  describe("the pending-action store", () => {
    it(`holds at most ${MAX_PREPARED_PER_THREAD} per thread, evicting the oldest`, async () => {
      const { executor } = setupExecutor()
      const actions = [makeAction(), makeAction(), makeAction(), makeAction()]

      const evicted = actions.map((action) => executor.addPrepared(action, "text"))

      expect(evicted).toEqual([[], [], [], [actions[0].id]])
      // The evicted card's Confirm finds nothing, and nothing runs.
      await expect(executor.executePreparedAction(actions[0].id)).resolves.toEqual({
        kind: "notFound",
        actionId: actions[0].id,
        replyKey: "Assistant.actionNotFound",
      })
      expect(actions[0].execute).not.toHaveBeenCalled()
      await expect(executor.executePreparedAction(actions[3].id)).resolves.toMatchObject({
        kind: "executed",
      })
    })

    it("counts each thread on its own", () => {
      const { executor } = setupExecutor()
      ;[1, 2, 3].forEach(() =>
        executor.addPrepared(makeAction({ threadId: "a" }), "text"),
      )

      expect(executor.addPrepared(makeAction({ threadId: "b" }), "text")).toEqual([])
    })

    it("drops a dismissed card's action", async () => {
      const { executor } = setupExecutor()
      const action = makeAction()
      executor.addPrepared(action, "text")

      executor.dismiss(action.id)

      await expect(executor.executePreparedAction(action.id)).resolves.toMatchObject({
        kind: "notFound",
      })
      expect(action.execute).not.toHaveBeenCalled()
      await expect(executor.canConfirm(action.id)).resolves.toEqual({
        enabled: false,
        replyKey: "Assistant.actionNotFound",
      })
    })

    it("drops a thread's actions when the user leaves it", async () => {
      const { executor } = setupExecutor()
      const here = makeAction({ threadId: "here" })
      const elsewhere = makeAction({ threadId: "elsewhere" })
      executor.addPrepared(here, "text")
      executor.addPrepared(elsewhere, "text")

      executor.leaveThread("here")

      await expect(executor.executePreparedAction(here.id)).resolves.toMatchObject({
        kind: "notFound",
      })
      await expect(executor.executePreparedAction(elsewhere.id)).resolves.toMatchObject({
        kind: "executed",
      })
    })
  })

  describe("expiry (spec §5.1)", () => {
    it("re-prepares silently and executes when the refreshed numbers are identical", async () => {
      const { executor, advance } = setupExecutor()
      const fresh = makeAction({ createdAt: T0 + 61_000, summary: { ...SUMMARY } })
      const stale = makeAction({ refresh: refreshingTo(fresh) })
      executor.addPrepared(stale, "text")
      advance(61_000)

      const result = await executor.executePreparedAction(stale.id)

      expect(stale.execute).not.toHaveBeenCalled()
      expect(fresh.execute).toHaveBeenCalledTimes(1)
      expect(result).toEqual({
        kind: "executed",
        actionId: fresh.id,
        replacedActionId: stale.id,
        outcome: { status: "succeeded" },
      })
    })

    it("shows the refreshed card, executing nothing, when the numbers changed", async () => {
      const { executor, advance } = setupExecutor()
      const fresh = makeAction({
        createdAt: T0 + 61_000,
        summary: { ...SUMMARY, feeText: "$0.01", totalText: "$5.01" },
      })
      const stale = makeAction({ refresh: refreshingTo(fresh) })
      executor.addPrepared(stale, "text")
      advance(61_000)

      const result = await executor.executePreparedAction(stale.id)

      expect(result).toEqual({
        kind: "refreshed",
        actionId: fresh.id,
        replacedActionId: stale.id,
        preparedAction: fresh,
        replyKey: "Assistant.refreshed",
      })
      expect(stale.execute).not.toHaveBeenCalled()
      expect(fresh.execute).not.toHaveBeenCalled()
      // The refreshed action is a new one with a new id; the old id is gone.
      expect(fresh.id).not.toBe(stale.id)
      await expect(executor.executePreparedAction(stale.id)).resolves.toMatchObject({
        kind: "notFound",
      })
      await expect(executor.executePreparedAction(fresh.id)).resolves.toMatchObject({
        kind: "executed",
        actionId: fresh.id,
      })
    })

    it("compares the numbers whatever order the summary's fields were written in", async () => {
      const { executor, advance } = setupExecutor()
      const reordered = Object.fromEntries(Object.entries(SUMMARY).reverse())
      const fresh = makeAction({ createdAt: T0 + 61_000, summary: reordered })
      const stale = makeAction({ refresh: refreshingTo(fresh) })
      executor.addPrepared(stale, "text")
      advance(61_000)

      await expect(executor.executePreparedAction(stale.id)).resolves.toMatchObject({
        kind: "executed",
      })
    })

    it("reports a refusal at re-prepare with the templated error card and ends the action", async () => {
      const { executor, advance } = setupExecutor()
      const stale = makeAction({
        refresh: jest.fn(async () => {
          throw new PrepareRefusedError("insufficientBalance")
        }),
      })
      executor.addPrepared(stale, "text")
      advance(61_000)

      const result = await executor.executePreparedAction(stale.id)

      expect(result).toEqual({
        kind: "expired",
        actionId: stale.id,
        replyKey: "Assistant.insufficientBalance",
        refresh: {
          kind: "error",
          userMessage: "Assistant.insufficientBalance",
          card: { type: "prepareRefused", reason: "insufficientBalance" },
        },
      })
      expect(stale.execute).not.toHaveBeenCalled()
      await expect(executor.canConfirm(stale.id)).resolves.toMatchObject({
        enabled: false,
      })
    })

    it("keeps an action whose refresh failed, expired, for another try", async () => {
      const { executor, advance } = setupExecutor()
      const stale = makeAction()
      executor.addPrepared(stale, "text")
      advance(61_000)

      await expect(executor.executePreparedAction(stale.id)).resolves.toMatchObject({
        kind: "expired",
        replyKey: "Assistant.expired",
      })
      expect(stale.execute).not.toHaveBeenCalled()

      const fresh = makeAction({ createdAt: T0 + 62_000 })
      stale.refresh.mockImplementation(refreshingTo(fresh))
      await expect(executor.executePreparedAction(stale.id)).resolves.toMatchObject({
        kind: "executed",
        actionId: fresh.id,
      })
    })

    it("shows a refreshed action that makes another payment, though its numbers match", async () => {
      // Confirms queue, and earlier dispatches are checked, by the payment
      // the approved card makes. A refreshed action for another payment was
      // checked for neither, so it is a new card to confirm.
      const { executor, advance } = setupExecutor()
      const fresh = makeAction({
        createdAt: T0 + 61_000,
        dispatch: { ...DISPATCH, paymentDetailHash: "hash:bob:500:USD" },
      })
      const stale = makeAction({ refresh: refreshingTo(fresh) })
      executor.addPrepared(stale, "text")
      advance(61_000)

      await expect(executor.executePreparedAction(stale.id)).resolves.toMatchObject({
        kind: "refreshed",
        actionId: fresh.id,
      })
      expect(fresh.execute).not.toHaveBeenCalled()
    })

    it("never executes a refreshed action that is itself already past expiry", async () => {
      const { executor, advance } = setupExecutor()
      const alsoStale = makeAction({ createdAt: T0 - 120_000 })
      const stale = makeAction({ refresh: refreshingTo(alsoStale) })
      executor.addPrepared(stale, "text")
      advance(61_000)

      await expect(executor.executePreparedAction(stale.id)).resolves.toMatchObject({
        kind: "refreshed",
      })
      expect(alsoStale.execute).not.toHaveBeenCalled()
    })

    it("checks expiry again after the auth prompt, which can outlast the TTL", async () => {
      const { executor, auth, advance } = setupExecutor()
      const fresh = makeAction({
        createdAt: T0 + 90_000,
        summary: { ...SUMMARY, totalText: "$5.02" },
      })
      const action = makeAction({ refresh: refreshingTo(fresh) })
      executor.addPrepared(action, "voice")
      auth.authenticate.mockImplementation(async () => {
        advance(90_000) // the user took a minute and a half at the prompt
        return true
      })

      const result = await executor.executePreparedAction(action.id)

      expect(result).toMatchObject({ kind: "refreshed", actionId: fresh.id })
      expect(action.execute).not.toHaveBeenCalled()
    })

    it("does not prompt twice when the numbers refreshed after the prompt are the same", async () => {
      const { executor, auth, advance } = setupExecutor()
      const fresh = makeAction({ createdAt: T0 + 90_000 })
      const action = makeAction({ refresh: refreshingTo(fresh) })
      executor.addPrepared(action, "voice")
      auth.authenticate.mockImplementation(async () => {
        advance(90_000)
        return true
      })

      await expect(executor.executePreparedAction(action.id)).resolves.toMatchObject({
        kind: "executed",
        actionId: fresh.id,
      })
      expect(auth.authenticate).toHaveBeenCalledTimes(1)
    })

    it("retries an unresolved dispatch with its own attempt past expiry, never re-preparing it", async () => {
      // A re-prepared action would mint a new idempotency key for a payment
      // whose first dispatch may have gone (ENG-533).
      const { executor, advance } = setupExecutor()
      const action = makeAction({
        execute: executed({
          status: "unknown",
          replyKey: "Assistant.checkHistory",
          next: "retrySameAttempt",
        }),
      })
      executor.addPrepared(action, "text")
      await executor.executePreparedAction(action.id)
      advance(61_000)
      action.execute.mockResolvedValue({ status: "succeeded" })

      await expect(executor.executePreparedAction(action.id)).resolves.toMatchObject({
        kind: "executed",
        outcome: { status: "succeeded" },
      })
      expect(action.refresh).not.toHaveBeenCalled()
      expect(action.execute).toHaveBeenCalledTimes(2)
    })

    it("reports the expired outcome once per prepared action", async () => {
      const { executor, advance, toolEvents } = setupExecutor()
      const stale = makeAction()
      executor.addPrepared(stale, "text")
      advance(61_000)

      await executor.executePreparedAction(stale.id)
      await executor.executePreparedAction(stale.id)

      expect(toolEvents().filter(({ outcome }) => outcome === "expired")).toHaveLength(1)
    })
  })

  describe("the auth policy (ENG-684 decision 1)", () => {
    it("lets a text action confirm on a device with no biometrics, without asking the gate", async () => {
      const { executor, auth } = setupExecutor({ availability: "none" })
      const action = makeAction()
      executor.addPrepared(action, "text")

      await expect(executor.canConfirm(action.id)).resolves.toEqual({ enabled: true })
      await expect(executor.executePreparedAction(action.id)).resolves.toMatchObject({
        kind: "executed",
      })
      expect(auth.availability).not.toHaveBeenCalled()
      expect(auth.authenticate).not.toHaveBeenCalled()
    })

    it("refuses an action with no stated origin rather than read it as text", async () => {
      // The origin is the one input the policy decides on. Defaulting it to
      // text would let a voice action that forgot to say so skip biometrics.
      const { executor, auth } = setupExecutor({ availability: "none" })
      const action = makeAction()

      // @ts-expect-error -- the origin is required: the type says so too
      expect(() => executor.addPrepared(action)).toThrow(/origin/)
      expect(() => executor.addPrepared(action, "smoke-signal" as AuthOrigin)).toThrow(
        /origin/,
      )

      // Nothing was held, so nothing can run.
      await expect(executor.executePreparedAction(action.id)).resolves.toMatchObject({
        kind: "notFound",
      })
      expect(auth.authenticate).not.toHaveBeenCalled()
      expect(action.execute).not.toHaveBeenCalled()
    })

    it("fails a voice action closed where the device has no way to authenticate", async () => {
      const { executor, auth } = setupExecutor({ availability: "none" })
      const action = makeAction()
      executor.addPrepared(action, "voice")

      // The card still renders for review; Confirm is disabled and says why.
      await expect(executor.canConfirm(action.id)).resolves.toEqual({
        enabled: false,
        replyKey: "Assistant.authUnavailable",
      })
      await expect(executor.executePreparedAction(action.id)).resolves.toEqual({
        kind: "denied",
        actionId: action.id,
        replyKey: "Assistant.authUnavailable",
      })
      expect(auth.authenticate).not.toHaveBeenCalled()
      expect(action.execute).not.toHaveBeenCalled()
    })

    it("denies a voice action the user does not authenticate", async () => {
      const { executor } = setupExecutor({ authenticates: false })
      const action = makeAction()
      executor.addPrepared(action, "voice")

      await expect(executor.executePreparedAction(action.id)).resolves.toEqual({
        kind: "denied",
        actionId: action.id,
        replyKey: "Assistant.authDenied",
      })
      expect(action.execute).not.toHaveBeenCalled()
    })

    it("runs a voice action the user authenticates", async () => {
      const { executor, auth } = setupExecutor()
      const action = makeAction()
      executor.addPrepared(action, "voice")

      await expect(executor.executePreparedAction(action.id)).resolves.toMatchObject({
        kind: "executed",
      })
      expect(auth.authenticate).toHaveBeenCalledTimes(1)
    })

    it("fails closed when the gate itself throws", async () => {
      const { executor, auth } = setupExecutor()
      auth.authenticate.mockRejectedValue(new Error("native module gone"))
      const action = makeAction()
      executor.addPrepared(action, "voice")

      await expect(executor.executePreparedAction(action.id)).resolves.toMatchObject({
        kind: "denied",
        replyKey: "Assistant.authUnavailable",
      })
      expect(action.execute).not.toHaveBeenCalled()
    })

    it("runs nothing for a card dismissed while the prompt was up", async () => {
      const { executor, auth } = setupExecutor()
      const action = makeAction()
      executor.addPrepared(action, "voice")
      auth.authenticate.mockImplementation(async () => {
        executor.dismiss(action.id)
        return true
      })

      await expect(executor.executePreparedAction(action.id)).resolves.toMatchObject({
        kind: "notFound",
      })
      expect(action.execute).not.toHaveBeenCalled()
    })
  })

  describe("execution", () => {
    it("runs execute() once for two Confirms in flight together", async () => {
      const { executor } = setupExecutor()
      let finish: (outcome: ExecutionOutcome) => void = () => undefined
      const action = makeAction({
        execute: jest.fn(
          () =>
            new Promise<ExecutionOutcome>((resolve) => {
              finish = resolve
            }),
        ),
      })
      executor.addPrepared(action, "text")

      const first = executor.executePreparedAction(action.id)
      const second = executor.executePreparedAction(action.id)
      expect(second).toBe(first)
      await new Promise((resolve) => {
        setImmediate(resolve)
      })
      finish({ status: "succeeded" })

      await expect(first).resolves.toMatchObject({ kind: "executed" })
      expect(action.execute).toHaveBeenCalledTimes(1)
    })

    it("hands every Confirm of an action its same AttemptState, and a refreshed one its own", async () => {
      const { executor, advance } = setupExecutor()
      const seen: ExecuteContext["attempt"][] = []
      const recordAttempt = jest.fn(
        async (ctx: ExecuteContext): Promise<ExecutionOutcome> => {
          seen.push(ctx.attempt)
          return {
            status: "failed",
            replyKey: "Assistant.toolFailed",
            next: "confirmAgain",
          }
        },
      )
      const fresh = makeAction({ createdAt: T0 + 61_000, execute: recordAttempt })
      const action = makeAction({ execute: recordAttempt, refresh: refreshingTo(fresh) })
      executor.addPrepared(action, "text")

      await executor.executePreparedAction(action.id)
      await executor.executePreparedAction(action.id)
      advance(61_000)
      await executor.executePreparedAction(action.id)

      expect(seen[0]).toBe(action.attempt)
      expect(seen[1]).toBe(action.attempt)
      expect(seen[2]).toBe(fresh.attempt)
      expect(fresh.attempt).not.toBe(action.attempt)
    })

    it("retires an action that succeeded", async () => {
      const { executor } = setupExecutor()
      const action = makeAction()
      executor.addPrepared(action, "text")

      await expect(executor.executePreparedAction(action.id)).resolves.toEqual({
        kind: "executed",
        actionId: action.id,
        outcome: { status: "succeeded" },
      })
      await expect(executor.executePreparedAction(action.id)).resolves.toMatchObject({
        kind: "notFound",
      })
      expect(action.execute).toHaveBeenCalledTimes(1)
    })

    it("re-arms a known failure that may be confirmed again", async () => {
      const { executor } = setupExecutor()
      const action = makeAction({
        execute: executed({
          status: "failed",
          replyKey: "Assistant.toolFailed",
          next: "confirmAgain",
        }),
      })
      executor.addPrepared(action, "text")

      await executor.executePreparedAction(action.id)
      await expect(executor.canConfirm(action.id)).resolves.toEqual({ enabled: true })
      await executor.executePreparedAction(action.id)

      expect(action.execute).toHaveBeenCalledTimes(2)
    })

    it("retires a known failure that needs a fresh prepare", async () => {
      const { executor } = setupExecutor()
      const action = makeAction({
        execute: executed({
          status: "failed",
          replyKey: "Assistant.toolFailed",
          next: "reprepare",
        }),
      })
      executor.addPrepared(action, "text")

      await executor.executePreparedAction(action.id)

      await expect(executor.executePreparedAction(action.id)).resolves.toMatchObject({
        kind: "notFound",
      })
    })

    it("disarms an unknown outcome that cannot be retried, and points to the history", async () => {
      const { executor } = setupExecutor()
      const action = makeAction({
        execute: executed({
          status: "unknown",
          replyKey: "Assistant.checkHistory",
          next: "checkHistory",
        }),
      })
      executor.addPrepared(action, "text")

      await executor.executePreparedAction(action.id)

      await expect(executor.canConfirm(action.id)).resolves.toEqual({
        enabled: false,
        replyKey: "Assistant.checkHistory",
      })
      await expect(executor.executePreparedAction(action.id)).resolves.toEqual({
        kind: "disarmed",
        actionId: action.id,
        replyKey: "Assistant.checkHistory",
      })
      expect(action.execute).toHaveBeenCalledTimes(1)
      expect(action.refresh).not.toHaveBeenCalled()
    })

    it("treats an execute() that throws as an unknown outcome, never a failure", async () => {
      const { executor } = setupExecutor()
      const action = makeAction({
        execute: jest.fn(async () => {
          throw new Error("socket closed")
        }),
      })
      executor.addPrepared(action, "text")

      await expect(executor.executePreparedAction(action.id)).resolves.toMatchObject({
        kind: "executed",
        outcome: { status: "unknown", next: "checkHistory" },
      })
      await expect(executor.executePreparedAction(action.id)).resolves.toMatchObject({
        kind: "disarmed",
      })
    })

    it("hands an outcome's summary to the card as it is, and follows only `next` (ENG-688)", async () => {
      // A group send reports each leg's status in the summary. The executor
      // reads nothing in it: the state it leaves is what `next` says.
      const { executor } = setupExecutor()
      const legs = {
        legs: [
          { payeeLabel: "Alice", status: "success" },
          { payeeLabel: "Bob", status: "failed" },
        ],
      }
      const outcome: ExecutionOutcome = {
        status: "unknown",
        replyKey: "Assistant.groupSendPartial",
        next: "retrySameAttempt",
        summary: legs,
      }
      const action = makeAction({ execute: executed(outcome) })
      executor.addPrepared(action, "text")

      await expect(executor.executePreparedAction(action.id)).resolves.toEqual({
        kind: "executed",
        actionId: action.id,
        outcome,
      })
      // Unresolved, so a second Confirm runs execute() again.
      await executor.executePreparedAction(action.id)
      expect(action.execute).toHaveBeenCalledTimes(2)
    })
  })

  describe("telemetry", () => {
    it("reports each outcome per path, for the action tier", async () => {
      const { executor, toolEvents, advance } = setupExecutor({ availability: "none" })
      const confirmed = makeAction()
      const failed = makeAction({
        execute: executed({
          status: "failed",
          replyKey: "Assistant.toolFailed",
          next: "reprepare",
        }),
      })
      const unknown = makeAction({
        execute: executed({
          status: "unknown",
          replyKey: "Assistant.checkHistory",
          next: "checkHistory",
        }),
      })
      const denied = makeAction({ threadId: "other" })
      const changed = makeAction({
        createdAt: T0 + 61_000,
        threadId: "other",
        summary: { ...SUMMARY, feeText: "$1.00" },
      })
      const stale = makeAction({ threadId: "other", refresh: refreshingTo(changed) })
      ;[confirmed, failed, unknown].forEach((action) =>
        executor.addPrepared(action, "text"),
      )
      executor.addPrepared(denied, "voice")
      executor.addPrepared(stale, "text")

      for (const action of [confirmed, failed, unknown, denied]) {
        await executor.executePreparedAction(action.id)
      }
      advance(61_000)
      await executor.executePreparedAction(stale.id)

      expect(
        toolEvents().map(({ outcome, tier, intent }) => [outcome, tier, intent]),
      ).toEqual([
        ["confirmed", "action", "prepareSend"],
        ["failed", "action", "prepareSend"],
        ["unknown", "action", "prepareSend"],
        ["denied", "action", "prepareSend"],
        ["expired", "action", "prepareSend"],
        ["refreshed", "action", "prepareSend"],
      ])
    })

    it("carries no payload text: no memo, payee or amount", async () => {
      const { executor, events, advance } = setupExecutor()
      const secret = {
        payeeLabel: "SECRET-PAYEE",
        amountText: "$9,876.54",
        memo: "SECRET-MEMO",
      }
      const fresh = makeAction({ createdAt: T0 + 61_000, summary: { ...secret, x: "1" } })
      const action = makeAction({ summary: secret, refresh: refreshingTo(fresh) })
      executor.openThread("thread-1")
      executor.addPrepared(action, "voice")
      advance(61_000)

      await executor.executePreparedAction(action.id)
      await executor.executePreparedAction(fresh.id)

      expect(events.length).toBeGreaterThan(2)
      expect(JSON.stringify(events)).not.toMatch(/SECRET|9,876|9876/)
    })
  })

  describe("experience metrics (spec §8)", () => {
    it("reports thread opens, for weekly active users", () => {
      const { executor, events } = setupExecutor()

      executor.openThread("thread-1")

      expect(events).toEqual([{ type: "threadOpened" }])
    })

    it("reports the time from opening a thread to its first confirmed send, once", async () => {
      const { executor, events, advance } = setupExecutor()
      executor.openThread("thread-1")
      advance(42_000)
      const first = makeAction()
      const second = makeAction()
      executor.addPrepared(first, "text")
      executor.addPrepared(second, "text")

      await executor.executePreparedAction(first.id)
      advance(5_000)
      await executor.executePreparedAction(second.id)

      expect(events.filter(({ type }) => type === "openToConfirm")).toEqual([
        { type: "openToConfirm", openToConfirmMs: 42_000 },
      ])
    })

    it("reports no open-to-confirm time for a send that did not go through", async () => {
      const { executor, events } = setupExecutor()
      executor.openThread("thread-1")
      const action = makeAction({
        execute: executed({
          status: "unknown",
          replyKey: "Assistant.checkHistory",
          next: "checkHistory",
        }),
      })
      executor.addPrepared(action, "text")

      await executor.executePreparedAction(action.id)

      expect(events.filter(({ type }) => type === "openToConfirm")).toEqual([])
    })

    it("reports a thread left with clarifications unanswered", () => {
      const { executor, events } = setupExecutor()
      const clarification = {
        kind: "clarification" as const,
        card: {
          type: "clarification" as const,
          prompt: "Assistant.pickContact" as const,
          options: [],
        },
      }
      executor.openThread("thread-1")
      executor.noteToolResult("thread-1", clarification)
      executor.noteToolResult("thread-1", clarification)

      executor.leaveThread("thread-1")

      expect(events).toContainEqual({
        type: "clarificationAbandoned",
        clarificationCount: 2,
      })
    })

    it("does not report a clarification the user answered", () => {
      const { executor, events } = setupExecutor()
      executor.openThread("thread-1")
      executor.noteToolResult("thread-1", {
        kind: "clarification",
        card: { type: "clarification", prompt: "Assistant.pickContact", options: [] },
      })
      executor.noteToolResult("thread-1", { kind: "answer", payload: {} })

      executor.leaveThread("thread-1")

      expect(events.map(({ type }) => type)).not.toContain("clarificationAbandoned")
    })
  })
})
