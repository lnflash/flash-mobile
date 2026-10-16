import type { RegisteredTool } from "../define"
import { prepareSend } from "./prepare-send"

// The action-tier tools (docs/ai-assistant-tool-registry.md §5), registered
// with the read tools in ../index.ts.

export const ACTION_TOOLS: readonly RegisteredTool[] = [prepareSend]
