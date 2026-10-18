import { spawnSync } from "child_process"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"

// ENG-734: ASSISTANT_DEV_LINK=true makes a production-mode bundle honour the
// assistant's dev link (app/config/assistant-dev-override.ts). It is for local
// phone builds only. scripts/ci/check-store-env.sh fails a store build, before
// anything is built, while the key is in .env, the other env files
// react-native-dotenv reads, or the environment. The deploy workflows run it
// right after writing .env from the DOT_ENV secret; the Fastfile's store lanes
// and `yarn aab-android` / `apk-android` run it first, since run by hand they
// read a developer's own .env.

const repoRoot = path.join(__dirname, "../..")
const guard = "scripts/ci/check-store-env.sh"

type GuardRun = {
  /** Other files beside .env, by name. */
  files?: Record<string, string>
  /** Directories beside .env, by name: paths that exist but are no file. */
  dirs?: string[]
  /** The guard's environment, over nothing but PATH. */
  env?: Record<string, string>
}

const runGuard = (
  envFile: string | undefined,
  { files = {}, dirs = [], env = {} }: GuardRun = {},
) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "store-env-"))
  try {
    if (envFile !== undefined) fs.writeFileSync(path.join(dir, ".env"), envFile)
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), content)
    }
    for (const name of dirs) fs.mkdirSync(path.join(dir, name))
    return spawnSync("bash", [path.join(repoRoot, guard), ".env"], {
      cwd: dir,
      encoding: "utf8",
      // Only what a test sets: jest's NODE_ENV, or an ASSISTANT_DEV_LINK a
      // developer exported, must not decide the result.
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", ...env },
    })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

const clean = "API_KEY=abc\nBREEZ_LNURL_DOMAIN=flashapp.me\n"

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

  // react-native-dotenv reads .env.local, .env.<mode> and .env.<mode>.local
  // over .env, and a release bundle's mode is production unless APP_ENV,
  // BABEL_ENV or NODE_ENV names another.
  for (const name of [".env.local", ".env.production", ".env.production.local"]) {
    it(`fails when ${name} carries it, though .env does not`, () => {
      const result = runGuard(clean, { files: { [name]: "ASSISTANT_DEV_LINK=true\n" } })

      expect(result.status).toBe(1)
      expect(result.stdout).toContain(`::error file=${name}::ASSISTANT_DEV_LINK`)
    })
  }

  for (const variable of ["APP_ENV", "BABEL_ENV", "NODE_ENV"]) {
    for (const name of [".env.staging", ".env.staging.local"]) {
      it(`fails when ${name} carries it and ${variable} names that mode`, () => {
        const result = runGuard(clean, {
          files: { [name]: "ASSISTANT_DEV_LINK=true\n" },
          env: { [variable]: "staging" },
        })

        expect(result.status).toBe(1)
        expect(result.stdout).toContain(`::error file=${name}::ASSISTANT_DEV_LINK`)
      })
    }
  }

  it("passes when only the templates mention it: the bundle never reads them", () => {
    // Every checkout carries .env.example with the key commented out, so a
    // guard that read it would fail every deploy.
    const template = fs.readFileSync(path.join(repoRoot, ".env.example"), "utf8")
    expect(template).toContain("ASSISTANT_DEV_LINK")

    const result = runGuard(clean, {
      files: {
        ".env.example": template,
        ".env.fastlane.example": "# ASSISTANT_DEV_LINK=true\n",
      },
    })

    expect(result.status).toBe(0)
  })

  // The process environment goes over every file.
  for (const value of ["true", ""]) {
    it(`fails when its environment sets ASSISTANT_DEV_LINK, to ${JSON.stringify(
      value,
    )} or anything else`, () => {
      const result = runGuard(clean, { env: { ASSISTANT_DEV_LINK: value } })

      expect(result.status).toBe(1)
      expect(result.stdout).toContain(
        "::error::ASSISTANT_DEV_LINK is set in the environment",
      )
    })
  }

  it("names every place that carries it, and prints none of their lines", () => {
    const result = runGuard("API_KEY=very-secret-value\nASSISTANT_DEV_LINK=true\n", {
      files: {
        ".env.local": "OTHER_SECRET=also-secret\nASSISTANT_DEV_LINK=true\n",
        ".env.production": "# ASSISTANT_DEV_LINK=true\n",
      },
      env: { ASSISTANT_DEV_LINK: "true" },
    })
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(1)
    expect(result.stdout).toContain("::error file=.env::ASSISTANT_DEV_LINK")
    expect(result.stdout).toContain("::error file=.env.local::ASSISTANT_DEV_LINK")
    expect(result.stdout).toContain("::error file=.env.production::ASSISTANT_DEV_LINK")
    expect(result.stdout).toContain("set in the environment")
    expect(output).not.toContain("very-secret-value")
    expect(output).not.toContain("also-secret")
    expect(output).not.toContain("ASSISTANT_DEV_LINK=true")
  })

  it("fails when a file the bundle would read cannot be read", () => {
    const result = runGuard(clean, { dirs: [".env.local"] })

    expect(result.status).toBe(1)
    expect(result.stdout).toContain("cannot read .env.local")
  })
})

describe("the Fastfile's store lanes", () => {
  // Run by hand, a lane reads the developer's own .env, so every lane that
  // builds for a store runs the guard before anything else.
  const fastfile = fs.readFileSync(path.join(repoRoot, "fastlane/Fastfile"), "utf8")
  // A platform block starts at the first column and a lane at two spaces;
  // each ends at an `end` with its own indent.
  const lanes = [...fastfile.matchAll(/^platform :(\w+) do\n([\s\S]*?)^end$/gm)].flatMap(
    ([, platform, body]) =>
      [...body.matchAll(/^ {2}lane :(\w+) do\n([\s\S]*?)^ {2}end$/gm)].map(
        ([, name, lane]) => ({
          lane: `${platform} ${name}`,
          statements: lane
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line !== "" && !line.startsWith("#")),
        }),
      ),
  )
  const storeLanes = lanes.filter(({ statements }) =>
    statements.some((statement) => /^(build_app|gradle)\(/.test(statement)),
  )

  it("are the six that build for a store", () => {
    // Guards the guard: if the patterns matched nothing, the checks below
    // would pass whatever the lanes do.
    expect(storeLanes.map(({ lane }) => lane).sort()).toEqual(
      [
        "android beta",
        "android release",
        "ios beta",
        "ios beta_alt",
        "ios release",
        "ios release_alt",
      ].sort(),
    )
  })

  it("run the guard on the repo's .env from fastlane/, where lanes run", () => {
    expect(fastfile).toMatch(
      /^def check_store_env\n {2}sh\("bash", "\.\.\/scripts\/ci\/check-store-env\.sh", "\.\.\/\.env"\)\nend$/m,
    )
  })

  for (const { lane, statements } of storeLanes) {
    it(`${lane} runs the guard before anything else`, () => {
      expect(statements[0]).toBe("check_store_env")
    })
  }
})

describe("package.json's release builds", () => {
  // `yarn aab-android` is the documented local store build (docs/release.md),
  // and reads the developer's own .env.
  const { scripts } = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  ) as { scripts: Record<string, string> }
  const releaseBuilds = Object.entries(scripts).filter(([, command]) =>
    /\b(bundleRelease|assembleRelease)\b/.test(command),
  )
  const prefix = `bash ${guard} .env && `

  it("are aab-android and apk-android", () => {
    expect(releaseBuilds.map(([name]) => name).sort()).toEqual([
      "aab-android",
      "apk-android",
    ])
  })

  // Runs each script's own command against a stand-in gradlew, which records
  // that it ran.
  const runScript = (command: string, envFile: string) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "store-script-"))
    try {
      fs.mkdirSync(path.join(dir, "scripts/ci"), { recursive: true })
      fs.copyFileSync(path.join(repoRoot, guard), path.join(dir, guard))
      fs.mkdirSync(path.join(dir, "android"))
      fs.writeFileSync(
        path.join(dir, "android/gradlew"),
        '#!/bin/sh\necho "$@" > ../ran\n',
        {
          mode: 0o755,
        },
      )
      fs.writeFileSync(path.join(dir, ".env"), envFile)
      const result = spawnSync("sh", ["-c", command], {
        cwd: dir,
        encoding: "utf8",
        env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
      })
      const ran = path.join(dir, "ran")
      return {
        status: result.status,
        gradle: fs.existsSync(ran) ? fs.readFileSync(ran, "utf8") : undefined,
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }

  for (const [name, command] of releaseBuilds) {
    it(`${name} runs the guard first and builds nothing when .env carries the key`, () => {
      expect(command.startsWith(prefix)).toBe(true)

      const refused = runScript(command, `${clean}ASSISTANT_DEV_LINK=true\n`)
      expect(refused.status).not.toBe(0)
      expect(refused.gradle).toBeUndefined()

      const built = runScript(command, clean)
      expect(built.status).toBe(0)
      expect(built.gradle).toMatch(/Release/)
    })
  }
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
