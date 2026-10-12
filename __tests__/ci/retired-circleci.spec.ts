import * as fs from "fs"
import * as path from "path"

// ENG-639: GitHub Actions is the only CI and owns releases, running the lanes
// in the root ./fastlane/. The old CircleCI pipeline (.circleci/) and the
// legacy ios/fastlane/ and android/fastlane/ it drove were removed because
// CircleCI kept posting a failing `test_in_pr` status on every PR. The android
// lanes share names with the live root lanes but behave differently (its
// promote_to_beta promoted internal to alpha with a stale key file), so running
// fastlane from android/ would silently pick them up. This spec keeps any of
// these from coming back quietly.

const repoRoot = path.join(__dirname, "../..")

// A reference to a legacy fastlane dir: the path itself, or fastlane run with
// ios/ or android/ as the working directory (which is how CircleCI reached it).
const legacyFastlane =
  /(?:ios|android)\/fastlane|cd (?:ios|android)\s*(?:&&|;)\s*(?:bundle exec\s+)?fastlane\b/

const listFiles = (dir: string): string[] => {
  const abs = path.join(repoRoot, dir)
  if (!fs.existsSync(abs)) return []
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name)
    return entry.isDirectory() ? listFiles(rel) : [rel]
  })
}

const read = (rel: string): string => fs.readFileSync(path.join(repoRoot, rel), "utf8")

describe("retired CircleCI pipeline (ENG-639)", () => {
  it("has no .circleci/ config", () => {
    expect(fs.existsSync(path.join(repoRoot, ".circleci"))).toBe(false)
  })

  it("has no legacy ios/fastlane/ directory", () => {
    expect(fs.existsSync(path.join(repoRoot, "ios/fastlane"))).toBe(false)
  })

  it("has no legacy android/fastlane/ directory", () => {
    expect(fs.existsSync(path.join(repoRoot, "android/fastlane"))).toBe(false)
  })

  it("matches the shapes CircleCI used to reach ios/fastlane and android/fastlane", () => {
    // Guards the guard: if this regex stopped matching, the scan below would
    // pass no matter what the repo contains.
    expect(legacyFastlane.test("cd ios && bundle exec fastlane app_store_upload")).toBe(
      true,
    )
    expect(legacyFastlane.test("(cd ios && fastlane ios increment)")).toBe(true)
    expect(legacyFastlane.test("eval_gemfile('ios/fastlane/Pluginfile')")).toBe(true)
    expect(legacyFastlane.test("cd android && bundle exec fastlane browserstack")).toBe(
      true,
    )
    expect(legacyFastlane.test("cd android && bundle exec fastlane android build")).toBe(
      true,
    )
    expect(legacyFastlane.test("eval_gemfile('android/fastlane/Pluginfile')")).toBe(true)
    expect(legacyFastlane.test("bundle exec fastlane ios beta")).toBe(false)
    expect(legacyFastlane.test("bundle exec fastlane android promote_to_beta")).toBe(
      false,
    )
    expect(legacyFastlane.test("(cd android && ./gradlew assembleRelease)")).toBe(false)
    expect(legacyFastlane.test("(cd ios; pod install)")).toBe(false)
  })

  it("no workflow, script or build file references ios/fastlane or android/fastlane", () => {
    const files = [
      ...listFiles(".github/workflows"),
      ...listFiles("scripts"),
      ...listFiles("fastlane"),
      "Gemfile",
      "Makefile",
      "deploy-ios.sh",
      "deploy-android.sh",
    ].filter((rel) => fs.existsSync(path.join(repoRoot, rel)))
    expect(files.some((rel) => rel.startsWith(".github/workflows/"))).toBe(true)

    const offenders = files.filter((rel) => legacyFastlane.test(read(rel)))

    const { scripts } = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>
    }
    const scriptOffenders = Object.entries(scripts)
      .filter(([, command]) => legacyFastlane.test(command))
      .map(([name]) => `package.json#scripts.${name}`)

    expect([...offenders, ...scriptOffenders]).toEqual([])
  })
})
