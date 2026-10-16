import * as fs from "fs"
import * as path from "path"

import { appDir, sourcesUnder, specifiers } from "./import-scan"

/**
 * app/assistant/ is a leaf (docs/ai-assistant-tool-registry.md §2): it
 * imports the rest of the app, and nothing outside it imports from it. What
 * both sides need lives outside it, as the `assistant_event` parameters live
 * in app/utils/analytics.ts.
 *
 * One exception, on purpose (ENG-689): the root navigator registers the Ask
 * Flash screen, so it imports `@app/assistant/ui`, whose index exports that
 * screen alone. The allowlist names that file and that specifier, and
 * nothing else: another importer, or another specifier from the navigator
 * (a deeper path, the same module by a relative path), still fails.
 */
describe("app/assistant", () => {
  const assistantDir = path.join(appDir, "assistant")
  const rootNavigator = path.join(appDir, "navigation", "root-navigator.tsx")

  /** The one import from outside the assistant into it that the app may make. */
  const ALLOWED = [{ file: rootNavigator, specifier: "@app/assistant/ui" }] as const

  const isAllowed = (file: string, specifier: string): boolean =>
    ALLOWED.some((pair) => pair.file === file && pair.specifier === specifier)

  const intoAssistant = (file: string, specifier: string): boolean => {
    if (specifier === "@app/assistant" || specifier.startsWith("@app/assistant/")) {
      return true
    }
    if (!specifier.startsWith(".")) return false
    const target = path.resolve(path.dirname(file), specifier)
    return target === assistantDir || target.startsWith(assistantDir + path.sep)
  }

  it("is imported by nothing outside it but the root navigator's one screen", () => {
    const sources = sourcesUnder(appDir).filter(
      (file) => !file.startsWith(assistantDir + path.sep),
    )
    // The scan reached the app, not an empty directory.
    expect(sources.length).toBeGreaterThan(100)

    const offenders = sources.flatMap((file) =>
      specifiers(fs.readFileSync(file, "utf8"))
        .filter((specifier) => intoAssistant(file, specifier))
        .filter((specifier) => !isAllowed(file, specifier))
        .map((specifier) => `${path.relative(appDir, file)} imports ${specifier}`),
    )

    expect(offenders).toEqual([])
  })

  it("is imported by the root navigator once, for the Ask Flash screen and nothing else", () => {
    const fromNavigator = specifiers(fs.readFileSync(rootNavigator, "utf8")).filter(
      (specifier) => intoAssistant(rootNavigator, specifier),
    )

    expect(fromNavigator).toEqual(["@app/assistant/ui"])
    // What that specifier hands out: the screen, and only the screen.
    const index = fs.readFileSync(path.join(assistantDir, "ui", "index.ts"), "utf8")
    const exported = index.split("\n").filter((line) => /^\s*export\b/.test(line))
    expect(exported).toEqual(['export { AskFlashScreen } from "./ask-flash-screen"'])
  })

  it("allows exactly its one pair: any other importer, or specifier, still fails", () => {
    const buttons = path.join(appDir, "components", "home-screen", "Buttons.tsx")

    expect(isAllowed(rootNavigator, "@app/assistant/ui")).toBe(true)
    // Another specifier from the navigator.
    expect(isAllowed(rootNavigator, "@app/assistant/ui/ask-flash-screen")).toBe(false)
    expect(isAllowed(rootNavigator, "@app/assistant/registry")).toBe(false)
    expect(isAllowed(rootNavigator, "@app/assistant")).toBe(false)
    expect(isAllowed(rootNavigator, "../assistant/ui")).toBe(false)
    // Another importer of the same specifier.
    expect(isAllowed(buttons, "@app/assistant/ui")).toBe(false)
    expect(
      isAllowed(path.join(appDir, "navigation", "app-state.tsx"), "@app/assistant/ui"),
    ).toBe(false)
    // And each of those is an import into the assistant the scan reports.
    expect(intoAssistant(rootNavigator, "../assistant/ui")).toBe(true)
    expect(intoAssistant(buttons, "@app/assistant/ui")).toBe(true)
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
