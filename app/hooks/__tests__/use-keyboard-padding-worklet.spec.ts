// Regression test for the Android crash this hook caused on the flashcard
// limits screen, chat, support chat, and the Bridge external-account flow:
// "[Reanimated] Tried to synchronously call a non-worklet anonymous
// function on the UI thread."
//
// `useAnimatedStyle`'s callback in `use-keyboard-padding.ts` calls
// `keyboardPaddingFor`, a plain exported function. Reanimated's babel plugin
// auto-workletizes the function passed directly to `useAnimatedStyle`, but
// it does NOT reach into a *helper that worklet calls* -- that helper only
// runs on the UI thread if it carries its own "worklet" directive. Without
// one, Reanimated's UI-thread copy of the style callback tries to
// synchronously call the (non-workletized) JS-thread `keyboardPaddingFor`
// and throws.
//
// A render-based test can't catch this here: `.ts`/`.tsx` sources go
// through ts-jest (plain tsc) per jest.config.js, not babel-jest, so the
// `react-native-reanimated/plugin` babel transform that stamps workletized
// functions with `__workletHash`/`__initData` never runs under this repo's
// jest config. Confirmed directly -- importing `keyboardPaddingFor` under
// this jest config and inspecting it shows both markers `undefined` even
// with the directive present, so asserting on them would always read as
// "not a worklet" and the test could never pass. (The repo already works
// around the same gap by mocking out real reanimated animations in
// app/screens/conversion-flow/__tests__/conversion-success-screen.test.tsx
// -- "worklet setup jest does not have".)
//
// So this is a static source check instead: parse the hook file's AST and
// assert every locally-declared helper called from inside
// `useKeyboardPaddingStyle`'s `useAnimatedStyle(...)` callback carries the
// "worklet" directive as its first statement. This fails without the fix
// and passes with it.
import * as fs from "fs"
import * as path from "path"
import * as ts from "typescript"

const sourcePath = path.join(__dirname, "../use-keyboard-padding.ts")
const source = fs.readFileSync(sourcePath, "utf8")
const sourceFile = ts.createSourceFile(
  sourcePath,
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
)

const hasWorkletDirective = (body: ts.Block): boolean => {
  const first = body.statements[0]
  return (
    first !== undefined &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === "worklet"
  )
}

// Every top-level `const name = (...) => {...}` / `function name(...) {...}`
// in the file, keyed by name, so a call site can be resolved back to a body.
const declaredFunctions = new Map<string, ts.Block>()
const collectDeclarations = (node: ts.Node) => {
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.initializer &&
    (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) &&
    node.initializer.body &&
    ts.isBlock(node.initializer.body)
  ) {
    declaredFunctions.set(node.name.text, node.initializer.body)
  }
  if (ts.isFunctionDeclaration(node) && node.name && node.body) {
    declaredFunctions.set(node.name.text, node.body)
  }
  ts.forEachChild(node, collectDeclarations)
}
collectDeclarations(sourceFile)

// The `useAnimatedStyle(() => { ... })` callback body inside
// `useKeyboardPaddingStyle`.
let styleCallbackBody: ts.Block | undefined
const findStyleCallback = (node: ts.Node) => {
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "useAnimatedStyle" &&
    node.arguments.length > 0
  ) {
    const callback = node.arguments[0]
    if (
      (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) &&
      callback.body &&
      ts.isBlock(callback.body)
    ) {
      styleCallbackBody = callback.body
    }
  }
  ts.forEachChild(node, findStyleCallback)
}
findStyleCallback(sourceFile)

describe("useKeyboardPaddingStyle worklet safety", () => {
  it("locates the useAnimatedStyle callback to check (sanity: check isn't vacuous)", () => {
    expect(styleCallbackBody).toBeDefined()
  })

  it("every locally-declared helper the style callback calls is itself a worklet", () => {
    expect(styleCallbackBody).toBeDefined()

    const calledNames = new Set<string>()
    const collectCalls = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        calledNames.add(node.expression.text)
      }
      ts.forEachChild(node, collectCalls)
    }
    collectCalls(styleCallbackBody as ts.Block)

    // Scope to helpers declared in this file -- that's the exact bug class:
    // a local/imported plain function silently invoked on the UI thread.
    // Reanimated's own exports (useAnimatedKeyboard, etc.) aren't in
    // declaredFunctions and are correctly skipped.
    const localHelperCalls = [...calledNames].filter((name) =>
      declaredFunctions.has(name),
    )

    // Sanity: the style callback must call at least one local helper, or
    // this test would vacuously pass no matter what the file contains.
    expect(localHelperCalls.length).toBeGreaterThan(0)

    for (const name of localHelperCalls) {
      const body = declaredFunctions.get(name) as ts.Block
      expect(hasWorkletDirective(body)).toBe(true)
    }
  })

  it("keyboardPaddingFor itself carries the worklet directive", () => {
    const body = declaredFunctions.get("keyboardPaddingFor")
    expect(body).toBeDefined()
    expect(hasWorkletDirective(body as ts.Block)).toBe(true)
  })
})
