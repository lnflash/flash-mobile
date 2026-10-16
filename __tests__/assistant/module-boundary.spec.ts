import * as fs from "fs"
import * as path from "path"

import { appDir, sourcesUnder, specifiers } from "./import-scan"

/**
 * app/assistant/ is a leaf (docs/ai-assistant-tool-registry.md §2): it
 * imports the rest of the app, and nothing outside it imports from it. What
 * both sides need lives outside it, as the `assistant_event` parameters live
 * in app/utils/analytics.ts.
 */
describe("app/assistant", () => {
  const assistantDir = path.join(appDir, "assistant")

  const intoAssistant = (file: string, specifier: string): boolean => {
    if (specifier === "@app/assistant" || specifier.startsWith("@app/assistant/")) {
      return true
    }
    if (!specifier.startsWith(".")) return false
    const target = path.resolve(path.dirname(file), specifier)
    return target === assistantDir || target.startsWith(assistantDir + path.sep)
  }

  it("is imported by nothing outside it", () => {
    const sources = sourcesUnder(appDir).filter(
      (file) => !file.startsWith(assistantDir + path.sep),
    )
    // The scan reached the app, not an empty directory.
    expect(sources.length).toBeGreaterThan(100)

    const offenders = sources.flatMap((file) =>
      specifiers(fs.readFileSync(file, "utf8"))
        .filter((specifier) => intoAssistant(file, specifier))
        .map((specifier) => `${path.relative(appDir, file)} imports ${specifier}`),
    )

    expect(offenders).toEqual([])
  })

  it("catches both import forms it is there to catch", () => {
    // A check that can never fail proves nothing: these are the two shapes
    // an import into the assistant takes.
    const utils = path.join(appDir, "utils", "analytics.ts")
    const fromUtils = specifiers(
      'import type { AssistantToolEvent } from "@app/assistant/engine/telemetry"\n' +
        'export * from "../assistant/registry/types"\n',
    )

    expect(fromUtils.map((specifier) => intoAssistant(utils, specifier))).toEqual([
      true,
      true,
    ])
    expect(intoAssistant(utils, "@app/assistant-like")).toBe(false)
    expect(intoAssistant(utils, "./assistant")).toBe(false)
  })
})
