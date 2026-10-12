import * as fs from "fs"
import * as path from "path"

// ENG-639: GitHub Actions is the only CI and owns releases, running the lanes
// in the root ./fastlane/. The old CircleCI pipeline (.circleci/) and the
// legacy ios/fastlane/ it drove were removed because CircleCI kept posting a
// failing `test_in_pr` status on every PR. This spec keeps either from coming
// back quietly.

const repoRoot = path.join(__dirname, "../..")

// A reference to the legacy fastlane dir: the path itself, or fastlane run
// with ios/ as the working directory (which is how CircleCI reached it).
const legacyIosFastlane =
  /ios\/fastlane|cd ios\s*(?:&&|;)\s*(?:bundle exec\s+)?fastlane\b/

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

  it("matches the shapes CircleCI used to reach ios/fastlane", () => {
    // Guards the guard: if this regex stopped matching, the scan below would
    // pass no matter what the repo contains.
    expect(
      legacyIosFastlane.test("cd ios && bundle exec fastlane app_store_upload"),
    ).toBe(true)
    expect(legacyIosFastlane.test("(cd ios && fastlane ios increment)")).toBe(true)
    expect(legacyIosFastlane.test("eval_gemfile('ios/fastlane/Pluginfile')")).toBe(true)
    expect(legacyIosFastlane.test("bundle exec fastlane ios beta")).toBe(false)
    expect(legacyIosFastlane.test("(cd ios; pod install)")).toBe(false)
  })

  it("no workflow, script or build file references ios/fastlane", () => {
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

    const offenders = files.filter((rel) => legacyIosFastlane.test(read(rel)))

    const { scripts } = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>
    }
    const scriptOffenders = Object.entries(scripts)
      .filter(([, command]) => legacyIosFastlane.test(command))
      .map(([name]) => `package.json#scripts.${name}`)

    expect([...offenders, ...scriptOffenders]).toEqual([])
  })
})
