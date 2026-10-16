import type { AssistantReplyKey, ToolResult } from "../../types"

// How an action tool ends early with a templated reply from wherever the
// problem is found: a destination that is not payable, a fee the probe could
// not get, a wallet that is not available. A refusal with a card (a shortfall,
// a limit, a gated branch) is a PrepareRefusedError instead (../../refusals).

export class ToolReplyError extends Error {
  readonly replyKey: AssistantReplyKey

  constructor(replyKey: AssistantReplyKey) {
    super(`Tool replied ${replyKey}`)
    this.name = "ToolReplyError"
    this.replyKey = replyKey
  }
}

/**
 * Run a tool's body, answering a ToolReplyError with its reply. Every other
 * throw passes on: runTool and the executor's refresh turn a refusal into
 * its card and anything else into "something went wrong".
 */
export const replyingOnError = async <T>(
  body: () => Promise<ToolResult<T>>,
): Promise<ToolResult<T>> => {
  try {
    return await body()
  } catch (err) {
    if (err instanceof ToolReplyError) return { kind: "error", userMessage: err.replyKey }
    throw err
  }
}
