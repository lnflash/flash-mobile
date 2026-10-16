import type { RegisteredTool } from "../define"
import { prepareGroupSend } from "./prepare-group-send"
import { prepareReceive } from "./prepare-receive"
import { prepareSend } from "./prepare-send"

// The action-tier tools (docs/ai-assistant-tool-registry.md §5), registered
// with the read tools in ../index.ts.

export const ACTION_TOOLS: readonly RegisteredTool[] = [
  prepareSend,
  prepareReceive,
  prepareGroupSend,
]
