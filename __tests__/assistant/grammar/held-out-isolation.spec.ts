import * as fs from "fs"
import * as path from "path"

import { appDir, resolveSpecifier, sourcesUnder, specifiers } from "../import-scan"

// The held-out corpus measures the grammar only while nothing was tuned on
// it (docs/ai-assistant-tool-registry.md §7.2): nothing in the app, and no
// spec but the launch gate, may import it. The scan is the module-boundary
// spec's own.

const testsDir = path.join(__dirname, "../..")
const heldOut = path.join(__dirname, "corpus", "held-out")
const gate = path.join(__dirname, "accuracy-gate.spec.ts")

/** Whether `specifier`, imported from `file`, is the held-out corpus. */
const isHeldOut = (file: string, specifier: string): boolean => {
  const target = resolveSpecifier(file, specifier)
  return target !== undefined && target.replace(/\.tsx?$/, "") === heldOut
}

const importersOfHeldOut = (files: readonly string[]): string[] =>
  files.filter((file) =>
    specifiers(fs.readFileSync(file, "utf8")).some((specifier) =>
      isHeldOut(file, specifier),
    ),
  )

describe("the held-out corpus", () => {
  it("is imported by nothing in the app", () => {
    const sources = sourcesUnder(appDir)
    expect(sources.length).toBeGreaterThan(100)

    expect(importersOfHeldOut(sources)).toEqual([])
  })

  it("is imported by no spec but the launch gate: not the tuning specs, not their helpers", () => {
    const specs = sourcesUnder(testsDir)
    // The scan reached the grammar's specs.
    expect(specs).toEqual(
      expect.arrayContaining([gate, path.join(__dirname, "corpus", "tuning.ts")]),
    )

    expect(importersOfHeldOut(specs)).toEqual([gate])
  })

  it("is caught however it is imported", () => {
    // A check that can never fail proves nothing: the shapes an import of
    // the corpus takes, from the grammar's specs and from the app.
    // Built from parts, so this spec's own source imports nothing.
    const corpus = ["./corpus", "held-out"].join("/")
    const tuningSpec = path.join(__dirname, "prepare-send.spec.ts")
    const fromSpecs = specifiers(
      `import { HELD_OUT } from "${corpus}"\n` +
        `const corpus = require("${corpus}.ts")\n` +
        `export * from "${corpus}"\n`,
    )
    expect(fromSpecs.map((specifier) => isHeldOut(tuningSpec, specifier))).toEqual([
      true,
      true,
      true,
    ])
    const appFile = path.join(appDir, "assistant", "grammar", "index.ts")
    expect(isHeldOut(appFile, `../../../__tests__/assistant/grammar/${corpus}`)).toBe(
      true,
    )
    expect(isHeldOut(tuningSpec, "./corpus/tuning")).toBe(false)
    expect(isHeldOut(tuningSpec, `${corpus}-notes`)).toBe(false)
  })
})
