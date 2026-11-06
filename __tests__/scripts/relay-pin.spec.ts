/**
 * ENG-820: the vendored relay engine is pinned by its SHA-256
 * (`utils/check-relay-pin.js`, run by `yarn check-code`). The vendored file
 * passes as it is; an edit to it, or to RELAY_PIN.json, fails.
 */
import * as fs from "fs"
import * as os from "os"
import * as path from "path"

// A plain node script, as utils/check-translation-drift.js is.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { checkRelayPin } = require("../../utils/check-relay-pin.js") as {
  checkRelayPin: (paths?: { relayPath?: string; pinPath?: string }) => {
    ok: boolean
    message: string
  }
}

const RELAY_DIR = path.join(__dirname, "..", "..", "app", "utils", "cashu-card-relay")

const copies = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-pin-"))
  const relayPath = path.join(dir, "relay.js")
  const pinPath = path.join(dir, "RELAY_PIN.json")
  fs.copyFileSync(path.join(RELAY_DIR, "relay.js"), relayPath)
  fs.copyFileSync(path.join(RELAY_DIR, "RELAY_PIN.json"), pinPath)
  return { relayPath, pinPath }
}

describe("check-relay-pin", () => {
  it("passes the vendored relay.js against its pin", () => {
    expect(checkRelayPin()).toEqual(expect.objectContaining({ ok: true }))
    const pin = JSON.parse(
      fs.readFileSync(path.join(RELAY_DIR, "RELAY_PIN.json"), "utf8"),
    )
    expect(pin.commit).toBe("2c954a97b1beedd443149005639d8321d6e06f8c")
  })

  it("fails an edited relay.js, even by one byte", () => {
    const paths = copies()
    fs.appendFileSync(paths.relayPath, "\n")
    expect(checkRelayPin(paths).ok).toBe(false)
    const edited = fs
      .readFileSync(paths.relayPath, "utf8")
      .replace("LIMIT = 32768", "LIMIT = 32769")
    fs.writeFileSync(paths.relayPath, edited)
    expect(checkRelayPin(paths).ok).toBe(false)
  })

  it("fails an edited or malformed RELAY_PIN.json", () => {
    const paths = copies()
    const pin = JSON.parse(fs.readFileSync(paths.pinPath, "utf8"))
    fs.writeFileSync(paths.pinPath, JSON.stringify({ ...pin, sha256: "00".repeat(32) }))
    expect(checkRelayPin(paths).ok).toBe(false)
    fs.writeFileSync(paths.pinPath, JSON.stringify({ ...pin, commit: "main" }))
    expect(checkRelayPin(paths).ok).toBe(false)
    fs.writeFileSync(paths.pinPath, "{")
    expect(checkRelayPin(paths).ok).toBe(false)
  })
})
