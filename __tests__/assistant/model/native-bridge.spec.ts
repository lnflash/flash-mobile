import * as fs from "fs"
import * as path from "path"

import { INTENTS } from "@app/assistant/registry/types"
import { repoDir } from "../import-scan"

// The on-device model's native side (ENG-690), held to the JS side and to the
// one rule that keeps iOS launching (architect decision 9). The app runs on
// iOS 15.1 and Foundation Models only on iOS 26: a use of the framework
// outside `#if canImport(FoundationModels)` and `@available(iOS 26.0, *)`,
// or a strong link to it, is a crash at launch for every user below iOS 26.
// The compiler checks availability; these specs check what it cannot see:
// the link, the guards' extent, the intents the model may name, and that
// both platforms register the module JS reaches by name.

const read = (...parts: string[]) => fs.readFileSync(path.join(repoDir, ...parts), "utf8")

const swift = read("ios", "LNFlash", "AssistantModelBridge.swift")
const objc = read("ios", "LNFlash", "AssistantModelBridge.m")
const pbxproj = read("ios", "LNFlash.xcodeproj", "project.pbxproj")

/** Each line of `source` with whether it sits inside an `#if canImport(FoundationModels)` block. */
const linesWithGuard = (source: string) => {
  let depth = 0
  let guardedAt: number | undefined
  return source.split("\n").map((line) => {
    const trimmed = line.trim()
    if (trimmed.startsWith("#if")) {
      depth += 1
      if (trimmed === "#if canImport(FoundationModels)" && guardedAt === undefined) {
        guardedAt = depth
      }
    }
    const guarded = guardedAt !== undefined
    if (trimmed.startsWith("#endif")) {
      if (guardedAt === depth) guardedAt = undefined
      depth -= 1
    }
    return { line, guarded }
  })
}

/** The LNFlash app target's two build configurations. */
const appConfigs = (): string[] => {
  const ids =
    /13B07F931A680F5B00A75B9A \/\* Build configuration list for PBXNativeTarget "LNFlash" \*\/ = \{[\s\S]*?buildConfigurations = \(([\s\S]*?)\);/.exec(
      pbxproj,
    )?.[1]
  const configIds = [...(ids ?? "").matchAll(/([0-9A-F]{24}) \/\*/g)].map(([, id]) => id)
  return configIds.map((id) => {
    const start = pbxproj.indexOf(
      `\t\t${id} /* `,
      pbxproj.indexOf("/* Begin XCBuildConfiguration section */"),
    )
    return pbxproj.slice(start, pbxproj.indexOf("\n\t\t};", start))
  })
}

describe("the iOS bridge", () => {
  it("uses Foundation Models only inside the canImport guard, each use marked iOS 26", () => {
    const framework =
      /\b(SystemLanguageModel|LanguageModelSession|GenerationOptions|DynamicGenerationSchema|GenerationSchema|Generable|import FoundationModels)\b/
    const lines = linesWithGuard(swift)

    const unguarded = lines.filter(
      ({ line, guarded }) => framework.test(line) && !guarded,
    )
    expect(unguarded.map(({ line }) => line.trim())).toEqual([])
    // A check that can never fail proves nothing: it reached the uses.
    expect(
      lines.some(({ line, guarded }) => guarded && /LanguageModelSession/.test(line)),
    ).toBe(true)
    expect(linesWithGuard("SystemLanguageModel.default")[0].guarded).toBe(false)
    // Every type declared inside the guard is marked iOS 26: each
    // declaration line, with the attribute lines right above it.
    const declarations = lines.flatMap(({ line, guarded }, index) => {
      const name = /^(?:struct|enum|class|extension) (\w+)/.exec(line)?.[1]
      if (name === undefined) return []
      const attributes: string[] = []
      for (let at = index - 1; at >= 0 && lines[at].line.startsWith("@"); at -= 1) {
        attributes.unshift(lines[at].line)
      }
      return [{ name, attributes, guarded }]
    })
    const guardedTypes = declarations.filter(({ guarded }) => guarded)
    expect(guardedTypes.map(({ name }) => name)).toEqual([
      "AssistantAnswerSchema",
      "AssistantOnDeviceModel",
    ])
    guardedTypes.forEach(({ attributes }) =>
      expect(attributes).toContain("@available(iOS 26.0, *)"),
    )
  })

  it("reaches the guarded code only behind a runtime iOS 26 check", () => {
    const calls = swift
      .split("\n")
      .filter((line) => /AssistantOnDeviceModel\.\w+\(/.test(line))
    expect(calls.length).toBeGreaterThan(0)
    // Each call into it sits right inside an `if #available(iOS 26.0, *)`.
    const checks = swift.match(
      /if #available\(iOS 26\.0, \*\) \{\n\s+(resolve\(AssistantOnDeviceModel|AssistantOnDeviceModel)\./g,
    )
    expect(checks).toHaveLength(calls.length)
  })

  it("holds the model to the tools the prompt carries, or none, with no list of its own", () => {
    // The answer's shape is built from ModelPrompt.tools, which lists the
    // model tier's five intents (MODEL_TIER_INTENTS, model-prompt.spec.ts):
    // no intent is written here, so that list stays the one list.
    expect(swift).toContain('let tools = parts["tools"] as? [[String: Any]]')
    expect(swift).toContain("AssistantAnswerSchema.of(tools)")
    expect(swift).toContain('intentProperty("none")')
    expect(swift).toContain("guides: [.constant(intent)]")
    expect(swift).toContain("schema: schema,")
    INTENTS.forEach((intent) => expect(swift).not.toContain(`"${intent}"`))
  })

  it("exports the three methods JS calls, by the names native-model-bridge.ts uses", () => {
    expect(objc).toContain("RCT_EXTERN_MODULE(AssistantModelBridge, NSObject)")
    expect(objc).toMatch(
      /RCT_EXTERN_METHOD\(isAvailable:\(RCTPromiseResolveBlock\)resolve/,
    )
    expect(objc).toMatch(
      /RCT_EXTERN_METHOD\(complete:\(NSString \*\)promptJson\s+timeoutMs:/,
    )
    // ENG-749: the warm-up Ask Flash asks for when it opens, and the model
    // tier after each ask the model reads.
    expect(objc).toMatch(
      /RCT_EXTERN_METHOD\(prewarm:\(NSString \*\)warmupJson\s+resolver:\(RCTPromiseResolveBlock\)resolve\s+rejecter:/,
    )
    expect(swift).toContain("@objc(AssistantModelBridge)")
    expect(swift).toContain("@objc(isAvailable:rejecter:)")
    expect(swift).toContain("@objc(complete:timeoutMs:resolver:rejecter:)")
    expect(swift).toContain("@objc(prewarm:resolver:rejecter:)")
  })

  it("warms one session, which the next request with the same instructions takes once (ENG-749)", () => {
    // The warm-up makes a session for the instructions and warms it,
    // sending no prompt; a request takes it only when it was made for the
    // same instructions, and only once, so no turn carries into another.
    expect(swift).toContain(
      "let session = LanguageModelSession(instructions: instructions)",
    )
    expect(swift).toContain("session.prewarm()")
    expect(swift).toContain("let session = takeSession(instructions: instructions)")
    const take =
      /func take\(for instructions: String\) -> LanguageModelSession\? \{([\s\S]*?)\n {4}\}/.exec(
        swift,
      )?.[1]
    expect(take).toContain("current.instructions == instructions")
    expect(take).toContain("held = nil")
    // Warmed again after each request: a session already held for the
    // same instructions is kept, never replaced by another.
    const prepare = /func prepare\(for instructions: String\) \{([\s\S]*?)\n {4}\}/.exec(
      swift,
    )?.[1]
    expect(prepare).toContain(
      "if let current = held, current.instructions == instructions { return }",
    )
    expect(prepare).toContain("session.prewarm()")
    // The bridge method answers whatever happens: it never rejects.
    const prewarm = /func prewarm\(\n\s+_ warmupJson: String,[\s\S]*?\n {2}\}/.exec(
      swift,
    )?.[0]
    expect(prewarm).toContain("resolve(nil)")
    expect(prewarm).not.toContain("reject(")
  })

  it("is compiled into the app target, which weak-links the framework and stays on iOS 15.1", () => {
    const sources =
      /13B07F871A680F5B00A75B9A \/\* Sources \*\/ = \{[\s\S]*?files = \(([\s\S]*?)\);/.exec(
        pbxproj,
      )?.[1]
    expect(sources).toContain("AssistantModelBridge.swift in Sources")
    expect(sources).toContain("AssistantModelBridge.m in Sources")

    const configs = appConfigs()
    expect(configs).toHaveLength(2)
    configs.forEach((config) => {
      const flags = /OTHER_LDFLAGS = \(([\s\S]*?)\);/
        .exec(config)?.[1]
        .split(",")
        .map((flag) => flag.trim())
      // The flag comes from a setting an SDK without the framework never
      // sets: ld refuses a framework it cannot find, even to weak-link it,
      // so an unconditional -weak_framework fails the link on Xcode 16.
      expect(flags).toEqual(expect.arrayContaining(['"$(FOUNDATION_MODELS_LDFLAGS)"']))
      expect(flags).not.toEqual(expect.arrayContaining(['"-weak_framework"']))
      expect(flags?.join(" ")).not.toContain("FoundationModels,")
      // Set for iOS 26 and later SDKs only (iphoneos26.x, iphonesimulator26.x),
      // and only to weak-link: never on every SDK, never strongly.
      const settings = [
        ...config.matchAll(/^\t+"?FOUNDATION_MODELS_LDFLAGS(\[[^\]]*\])?"? = (.*);$/gm),
      ]
      expect(settings.map(([, condition, value]) => [condition, value])).toEqual([
        ["[sdk=iphoneos2*]", '"-weak_framework FoundationModels"'],
        ["[sdk=iphonesimulator2*]", '"-weak_framework FoundationModels"'],
      ])
      // If the deployment target ever reaches 26, the guards may go; until
      // then they are what keeps iOS 15 to 25 launching.
      expect(config).toContain("IPHONEOS_DEPLOYMENT_TARGET = 15.1;")
    })
    // And nothing links it another way: no Frameworks-phase entry, which
    // would be a strong link.
    expect(pbxproj).not.toContain("FoundationModels.framework")
  })
})

describe("the Android bridge", () => {
  const java = read(
    "android",
    "app",
    "src",
    "main",
    "java",
    "com",
    "lnflash",
    "assistant",
    "AssistantModelBridgeModule.java",
  )
  const application = read(
    "android",
    "app",
    "src",
    "main",
    "java",
    "com",
    "lnflash",
    "MainApplication.kt",
  )
  const gradle = read("android", "app", "build.gradle")

  it("is registered under the name JS reaches, with the same three methods", () => {
    expect(java).toContain('static final String NAME = "AssistantModelBridge"')
    expect(java).toMatch(/@ReactMethod\s+public void isAvailable\(Promise promise\)/)
    expect(java).toMatch(
      /@ReactMethod\s+public void complete\(String promptJson, double timeoutMs, Promise promise\)/,
    )
    expect(java).toMatch(
      /@ReactMethod\s+public void prewarm\(String warmupJson, Promise promise\)/,
    )
    expect(application).toContain(
      "import com.lnflash.assistant.AssistantModelBridgePackage",
    )
    expect(application).toContain("add(AssistantModelBridgePackage())")
  })

  it("counts only a model AICore reports AVAILABLE, and never starts a download", () => {
    expect(java).toContain("status == FeatureStatus.AVAILABLE")
    expect(java).not.toMatch(/\.download\(/)
  })

  it("warms only a model AICore reports AVAILABLE, and answers the warm-up at once (ENG-749)", () => {
    // readyModel() is the AVAILABLE check above; ML Kit's warmup() runs only
    // on what it returns, on the worker, and the promise never waits on it.
    expect(java).toMatch(
      /private void warmUp\(\) \{\s+GenerativeModelFutures ready = readyModel\(\);\s+if \(ready == null\) return;\s+try \{\s+ready\.warmup\(\);/,
    )
    const prewarm =
      /public void prewarm\(String warmupJson, Promise promise\) \{([\s\S]*?)\n {2}\}/.exec(
        java,
      )?.[1]
    expect(prewarm).toContain("worker.execute(this::warmUp)")
    expect(prewarm).toContain("promise.resolve(null)")
    expect(prewarm).not.toContain("reject(")
  })

  it("pins the GenAI Prompt API to one exact version", () => {
    expect(gradle).toMatch(
      /implementation\("com\.google\.mlkit:genai-prompt:\d+\.\d+\.\d+-[a-z]+\d+"\)/,
    )
  })

  it("keeps genai-prompt out of Kotlin, the rule that lets :app skip the metadata check", () => {
    // build.gradle turns off Kotlin's metadata version check for the whole
    // app module, so the Kotlin 2.0 compiler accepts genai-prompt's Kotlin
    // 2.2 classes on its classpath. Kotlin code that used them would compile
    // against metadata that compiler cannot read, silently: the bridge that
    // calls the library stays Java.
    const sourceDir = path.join(repoDir, "android", "app", "src")
    const kotlin = fs
      .readdirSync(sourceDir, { encoding: "utf8", recursive: true })
      .filter((file) => file.endsWith(".kt"))
    expect(kotlin).toEqual(
      expect.arrayContaining([
        path.join("main", "java", "com", "lnflash", "MainApplication.kt"),
      ]),
    )
    const usesGenai = kotlin.filter((file) =>
      /com\.google\.mlkit\.genai/.test(
        fs.readFileSync(path.join(sourceDir, file), "utf8"),
      ),
    )
    expect(usesGenai).toEqual([])
    expect(java).toContain(
      "import com.google.mlkit.genai.prompt.java.GenerativeModelFutures;",
    )

    // The skip is set once, and stays under the comment that states the rule.
    const lines = gradle.split("\n")
    const at = lines.findIndex((line) => line.includes("-Xskip-metadata-version-check"))
    expect(gradle.split("-Xskip-metadata-version-check")).toHaveLength(2)
    const block = lines.findIndex(
      (line, index) => index < at && line.startsWith("tasks.withType("),
    )
    expect(block).toBe(at - 1)
    let start = block
    while (start > 0 && lines[start - 1].startsWith("//")) start -= 1
    const comment = lines.slice(start, block).join(" ")
    expect(comment).toContain("No Kotlin code")
    expect(comment).toContain("may use genai-prompt")
    expect(comment).toContain("AssistantModelBridgeModule.java")
  })
})
