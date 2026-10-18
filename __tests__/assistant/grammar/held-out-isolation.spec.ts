import * as fs from "fs"
import * as path from "path"

import { appDir, resolveSpecifier, sourcesUnder, specifiers } from "../import-scan"

// The held-out corpus measures the grammar only while nothing was tuned on
// it (docs/ai-assistant-tool-registry.md §7.2): nothing in the app, and no
// spec but the launch gate, may import it. The scan is the module-boundary
// spec's own.
//
// One named, reviewed exception (ENG-690, plan §7): the on-device model's
// device eval, which scores a phone's run on the held-out set once per PR.
// It is not a spec, so CI never runs it, and nothing is tuned on it.

const testsDir = path.join(__dirname, "../..")
const heldOut = path.join(__dirname, "corpus", "held-out")
const gate = path.join(__dirname, "accuracy-gate.spec.ts")
const deviceEval = path.join(__dirname, "..", "model", "device-eval.ts")

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

  it("is imported by no spec but the launch gate and the device eval: not the tuning specs, not their helpers", () => {
    const specs = sourcesUnder(testsDir)
    // The scan reached the grammar's specs and the device eval.
    expect(specs).toEqual(
      expect.arrayContaining([
        gate,
        deviceEval,
        path.join(__dirname, "corpus", "tuning.ts"),
      ]),
    )

    expect(importersOfHeldOut(specs).sort()).toEqual([gate, deviceEval].sort())
  })

  it("lets the device eval import it only as a script CI never runs", () => {
    // jest.config.js runs files named .spec or .test only.
    expect(path.basename(deviceEval)).not.toMatch(/\.(spec|test)\.[jt]sx?$/)
    // The device eval's scoring, which the specs do run, is apart from it
    // and imports no corpus.
    const evalRun = path.join(__dirname, "..", "model", "eval-run.ts")
    expect(importersOfHeldOut([evalRun])).toEqual([])
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
