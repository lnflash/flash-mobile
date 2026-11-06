#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires -- a plain node script, as utils/check-translation-drift.js is */
/**
 * ENG-820: the vendored assisted-settlement engine
 * (app/utils/cashu-card-relay/relay.js) is cashucard's
 * tools/assisted-relay/relay.js byte for byte, at the commit RELAY_PIN.json
 * names. Any edit to either file fails here: the engine is changed upstream
 * and vendored again, never patched in place.
 */
const crypto = require("crypto")
const fs = require("fs")
const path = require("path")

const RELAY_DIR = path.join(__dirname, "..", "app", "utils", "cashu-card-relay")

function checkRelayPin({
  relayPath = path.join(RELAY_DIR, "relay.js"),
  pinPath = path.join(RELAY_DIR, "RELAY_PIN.json"),
} = {}) {
  let pin
  try {
    pin = JSON.parse(fs.readFileSync(pinPath, "utf8"))
  } catch (err) {
    return { ok: false, message: `cannot read the relay pin ${pinPath}: ${err.message}` }
  }
  if (
    !pin ||
    typeof pin.commit !== "string" ||
    !/^[0-9a-f]{40}$/.test(pin.commit) ||
    typeof pin.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(pin.sha256)
  ) {
    return {
      ok: false,
      message: `the relay pin ${pinPath} needs a 40-hex commit and a 64-hex sha256`,
    }
  }
  const actual = crypto
    .createHash("sha256")
    .update(fs.readFileSync(relayPath))
    .digest("hex")
  if (actual !== pin.sha256) {
    return {
      ok: false,
      message: `${relayPath} is not cashucard's relay.js at ${pin.commit}: sha256 ${actual}, pinned ${pin.sha256}`,
    }
  }
  return {
    ok: true,
    message: `relay.js matches cashucard ${pin.commit} (sha256 ${actual})`,
  }
}

module.exports = { checkRelayPin }

if (require.main === module) {
  const result = checkRelayPin()
  if (!result.ok) {
    console.error(`Error: ${result.message}`)
    process.exit(1)
  }
  console.log(result.message)
}
