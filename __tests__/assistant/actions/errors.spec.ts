import {
  replyingOnError,
  ToolReplyError,
} from "@app/assistant/registry/actions/shared/errors"
import { PrepareRefusedError } from "@app/assistant/registry/refusals"

describe("replyingOnError", () => {
  it("passes a tool's result through", async () => {
    await expect(
      replyingOnError(async () => ({ kind: "answer" as const, payload: 1 })),
    ).resolves.toEqual({ kind: "answer", payload: 1 })
  })

  it("answers a ToolReplyError with its templated reply", async () => {
    await expect(
      replyingOnError(async () => {
        throw new ToolReplyError("Assistant.feeUnavailable")
      }),
    ).resolves.toEqual({ kind: "error", userMessage: "Assistant.feeUnavailable" })
  })

  it("lets a refusal and anything else through, for runTool and the executor to answer", async () => {
    await expect(
      replyingOnError(async () => {
        throw new PrepareRefusedError("limitExceeded")
      }),
    ).rejects.toBeInstanceOf(PrepareRefusedError)
    await expect(
      replyingOnError(async () => {
        throw new Error("bug")
      }),
    ).rejects.toThrow("bug")
  })
})
