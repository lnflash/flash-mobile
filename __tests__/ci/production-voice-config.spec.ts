import fs from "fs"
import os from "os"
import path from "path"
import { spawnSync } from "child_process"

const repoRoot = path.resolve(__dirname, "../..")
const configure = path.join(repoRoot, "scripts/ci/configure-voice-pack.py")
const source = "https://voices.flashapp.me/kokoro-en-v1"
const assignment = `FLASH_VOICE_PACK_BASE_URL=${source}\n`

const runConfigure = (content: string): { output: string; status: number | null } => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-voice-config-"))
  const envFile = path.join(dir, ".env")
  try {
    fs.writeFileSync(envFile, content, { mode: 0o600 })
    const result = spawnSync("python3", [configure, envFile], {
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
    })
    return {
      output: fs.readFileSync(envFile, "utf8"),
      status: result.status,
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

describe("production voice source", () => {
  it("preserves unrelated build settings and replaces an older source", () => {
    const original =
      "API_KEY=synthetic-fixture\n" +
      "# a commented URL is not an assignment\n" +
      "export FLASH_VOICE_PACK_BASE_URL=https://old.example/pack\n" +
      "ANOTHER_SETTING=hello world\n"
    const result = runConfigure(original)

    expect(result.status).toBe(0)
    expect(result.output).toBe(
      "API_KEY=synthetic-fixture\n" +
        "# a commented URL is not an assignment\n" +
        "ANOTHER_SETTING=hello world\n" +
        assignment,
    )
  })

  it("is idempotent and adds a final newline when needed", () => {
    const first = runConfigure("API_KEY=synthetic-fixture")
    const second = runConfigure(first.output)

    expect(first.status).toBe(0)
    expect(second.status).toBe(0)
    expect(second.output).toBe("API_KEY=synthetic-fixture\n" + assignment)
  })

  for (const file of ["android-deploy.yml", "ios-deploy.yml", "ios-alt-deploy.yml"]) {
    it(`${file} configures the source after the env guard and before building`, () => {
      const workflow = fs.readFileSync(
        path.join(repoRoot, ".github/workflows", file),
        "utf8",
      )
      const steps = workflow.split(/\n(?=[ \t]+- (?:name|uses|run):)/)
      const guard = steps.findIndex((step) =>
        step.includes("run: bash scripts/ci/check-store-env.sh .env"),
      )
      const configured = steps.findIndex((step) =>
        step.includes("run: python3 scripts/ci/configure-voice-pack.py .env"),
      )
      const build = steps.findIndex((step) =>
        /bundle exec fastlane|gradlew|xcodebuild/.test(step),
      )

      expect(guard).toBeGreaterThan(-1)
      expect(configured).toBeGreaterThan(guard)
      expect(build).toBeGreaterThan(configured)
      expect(steps[configured]).not.toMatch(/continue-on-error|\bif:/)
    })
  }
})
