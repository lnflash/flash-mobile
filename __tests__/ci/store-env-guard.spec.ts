import { spawnSync } from "child_process"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"

// ENG-734: ASSISTANT_DEV_LINK=true makes a production-mode bundle honour the
// assistant's dev link (app/config/assistant-dev-override.ts). It is for local
// phone builds only. The deploy workflows write .env from the DOT_ENV secret,
// and scripts/ci/check-store-env.sh fails the deploy, before anything is
// built, if that file carries the key.

const repoRoot = path.join(__dirname, "../..")
const guard = "scripts/ci/check-store-env.sh"

const runGuard = (envFile: string | undefined) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "store-env-"))
  try {
    if (envFile !== undefined) fs.writeFileSync(path.join(dir, ".env"), envFile)
    return spawnSync("bash", [path.join(repoRoot, guard), ".env"], {
      cwd: dir,
      encoding: "utf8",
    })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

describe("check-store-env.sh", () => {
  it("passes a .env without ASSISTANT_DEV_LINK", () => {
    const result = runGuard("API_KEY=abc\nBREEZ_LNURL_DOMAIN=flashapp.me\n")

    expect(result.status).toBe(0)
  })

  // Plain loops rather than it.each: this repo's tsconfig pulls in the
  // wdio/mocha globals, whose `it` has no `.each`.
  for (const line of [
    "ASSISTANT_DEV_LINK=true",
    "ASSISTANT_DEV_LINK=false",
    "ASSISTANT_DEV_LINK=",
    'ASSISTANT_DEV_LINK="true"',
    "export ASSISTANT_DEV_LINK=true",
    "# ASSISTANT_DEV_LINK=true",
  ]) {
    it(`fails a .env with ${line}, whatever its value`, () => {
      const result = runGuard(`API_KEY=abc\n${line}\nBREEZ_LNURL_DOMAIN=flashapp.me\n`)

      expect(result.status).toBe(1)
      expect(result.stdout).toContain("::error file=.env::ASSISTANT_DEV_LINK")
    })
  }

  it("prints none of the file's lines: they hold the store build's secrets", () => {
    const result = runGuard("API_KEY=very-secret-value\nASSISTANT_DEV_LINK=true\n")
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).not.toContain("very-secret-value")
    expect(output).not.toContain("ASSISTANT_DEV_LINK=true")
  })

  it("fails when there is no .env to check", () => {
    expect(runGuard(undefined).status).toBe(1)
  })
})

describe("the workflows that write .env from the DOT_ENV secret", () => {
  const workflowsDir = path.join(repoRoot, ".github/workflows")
  const read = (file: string) => fs.readFileSync(path.join(workflowsDir, file), "utf8")
  // One chunk per step: each starts at a list item under steps:.
  const stepsOf = (workflow: string) => workflow.split(/\n(?=[ \t]+- (?:name|uses|run):)/)
  const writesStoreEnv = /DOT_ENV.*>\s*\.env\s*$/m
  const builds = /bundle exec fastlane|gradlew|xcodebuild/

  const writers = fs
    .readdirSync(workflowsDir)
    .filter((file) => /\.ya?ml$/.test(file) && writesStoreEnv.test(read(file)))
    .sort()

  it("include the three deploy workflows", () => {
    // Guards the guard: if the pattern matched nothing, the check below would
    // pass whatever the workflows do.
    expect(writers).toEqual(
      expect.arrayContaining([
        "android-deploy.yml",
        "ios-alt-deploy.yml",
        "ios-deploy.yml",
      ]),
    )
  })

  for (const file of writers) {
    it(`${file} checks the .env it writes before building anything`, () => {
      const steps = stepsOf(read(file))
      const write = steps.findIndex((step) => writesStoreEnv.test(step))
      const check = steps.findIndex((step) => step.includes(`run: bash ${guard} .env`))
      const build = steps.findIndex((step) => builds.test(step))

      expect(write).toBeGreaterThan(-1)
      expect(check).toBeGreaterThan(write)
      expect(build).toBeGreaterThan(check)
      // Nothing lets the deploy skip the check or carry on past a failed one.
      expect(steps[check]).not.toMatch(/continue-on-error|\bif:/)
    })
  }
})
