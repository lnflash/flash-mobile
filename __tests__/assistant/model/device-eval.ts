// The on-device model's device eval (ENG-690): the manual run whose numbers
// the PR's test table records, on a phone with a model (an Apple
// Intelligence iPhone on iOS 26; a Pixel whose AICore holds Gemini Nano).
// Not a spec: jest's testRegex never picks it up, so CI never runs it, and
// nothing in CI gates on a model's accuracy.
//
// The bar (ENG-749, the owner's decision of 2026-10-18), before the Remote
// Config key assistantOnDeviceModel is created for a platform: on the
// held-out set, on a real device of that platform, in the shipped order
// (the grammar, then the model on a plain miss), zero wrong prepared actions
// and at most 0.5% wrong reads (MODEL_TIER_BAR, eval-run.ts). A wrong
// prepared action is a prepare* call the label does not expect, or one whose
// payee, amount, currency or wallet differs from the label's; a wrong read
// is any other wrong call. Step 3 prints both numbers on every line and,
// for the held-out set alone, the bar's verdict last: a run of any other set
// says the bar was not judged, and so does a held-out run that began with no
// model, one from a hook that records no sessions or no model tier results,
// and one in which the model never answered an ask the shipped order made.
// Each measured the grammar alone, or cannot show otherwise, and the grammar
// alone can meet the bar (whyBarNotJudged, eval-run.ts). The grammar tier's
// own launch gate (accuracy-gate.spec.ts) is unchanged.
//
// It is the one importer of the held-out corpus besides the launch gate: a
// named, reviewed exception (ENG-690, plan §7; held-out-isolation.spec.ts),
// because a held-out run once per PR is what the device numbers are for.
// Prompts are tuned on the tuning corpus only, and the held-out set runs
// once the prompt is final. The device is handed utterances and accounts,
// never what they mean (eval-run.ts, deviceEntries).
//
// From the repo root, with the jest config the specs run under:
//
//   1. The corpus the device reads:
//        MODEL_EVAL=export MODEL_EVAL_SET=tuning MODEL_EVAL_FILE=/tmp/tuning.json \
//          yarn jest --testRegex '__tests__/assistant/model/device-eval\.ts$'
//   2. On the phone, a development build with assistantEnabled and
//      assistantOnDeviceModel on and Metro attached; in React Native
//      DevTools' console (engine/model-eval-hook.ts):
//        copy(await __flashModelEval(<the file's JSON>))
//      and save what it copied as /tmp/tuning.outcomes.json. Each ask that
//      finds a model finds its session as the app leaves every ask: warmed,
//      then 2 s idle (MODEL_EVAL_WARM_IDLE_MS, outside the ask's time), so a
//      run takes at least 2 s an entry. __flashModelEval(<the JSON>, {
//      sessions: "cold" }) asks back to back instead, for near-cold times.
//      The run records which (ModelEvalSessions) and what the model tier
//      made of each entry (ModelEvalModelResult); step 3 prints both.
//   3. The scores: how the asks found the session, what the model tier made
//      of every entry and of the shipped order's asks, the model alone and
//      the shipped order (the grammar, then the model on what it missed),
//      each overall, English and Jamaican patois, with its wrong prepared
//      actions and wrong reads, the model's p50 and p95 time, and, for the
//      held-out set alone, the bar's verdict:
//        MODEL_EVAL=score MODEL_EVAL_SET=tuning MODEL_EVAL_FILE=/tmp/tuning.outcomes.json \
//          yarn jest --testRegex '__tests__/assistant/model/device-eval\.ts$'
//
// MODEL_EVAL_SET=held-out names the frozen held-out set instead.
import * as fs from "fs"

import type { CorpusEntry } from "../grammar/corpus/entries"
import { HELD_OUT } from "../grammar/corpus/held-out"
import { TUNING } from "../grammar/corpus/tuning"
import {
  describeDeviceRun,
  deviceEntries,
  EvalSet,
  parseDeviceRun,
  scoreDeviceRun,
} from "./eval-run"

export const CORPORA: Record<EvalSet, readonly CorpusEntry[]> = {
  "tuning": TUNING,
  "held-out": HELD_OUT,
}

const setNamed = (name: string | undefined): EvalSet => {
  if (name !== "tuning" && name !== "held-out") {
    throw new Error("MODEL_EVAL_SET is tuning or held-out")
  }
  return name
}

/** One step of the eval, as the environment names it. */
export const runDeviceEval = (env: NodeJS.ProcessEnv): string => {
  const { MODEL_EVAL: step, MODEL_EVAL_FILE: file } = env
  const set = setNamed(env.MODEL_EVAL_SET)
  const entries = CORPORA[set]
  if (!file) throw new Error("MODEL_EVAL_FILE is not set")
  if (step === "export") {
    fs.writeFileSync(file, JSON.stringify(deviceEntries(entries), null, 1))
    return `${entries.length} ${set} utterances written to ${file}`
  }
  if (step === "score") {
    const run = parseDeviceRun(fs.readFileSync(file, "utf8"), entries)
    // The set the run read, so the bar is judged on the held-out set alone.
    return describeDeviceRun(set, scoreDeviceRun(entries, run), set)
  }
  throw new Error("MODEL_EVAL is export or score")
}

/** jest's expect, whose state names the test file it runs (this repo types expect without it). */
type JestExpect = { getState: () => { testPath?: string } }

/** Whether jest is running this file itself, as step 1 or 3 does: never when a spec imports it. */
const runningItself = (): boolean => {
  try {
    return (expect as unknown as JestExpect).getState().testPath === __filename
  } catch {
    return false
  }
}

if (runningItself()) {
  const { MODEL_EVAL: step = "(no step)", MODEL_EVAL_SET: set = "" } = process.env
  describe("the on-device model's device eval", () => {
    it(`${step} ${set}`, () => {
      console.log(runDeviceEval(process.env))
    })
  })
}
