/**
 * Card fixture loader for the Flashcard e2e flows (ENG-634; card protocol 2.0, ENG-675).
 *
 *   node_modules/.bin/tsx scripts/e2e/card-fixtures.ts serve [--port 9877] [--bridge URL] [--mint URL]
 *   node_modules/.bin/tsx scripts/e2e/card-fixtures.ts load <fresh|owned|loaded|spent|full|blocked|limited> [--bridge URL] [--mint URL]
 *
 * `serve` answers `POST /load/<name>` with the fixture's summary (the Maestro
 * flows and the developer screen call it); `load` provisions one and exits.
 * The bridge is cardsim (lnflash/cashu-javacard tools/cardsim, default
 * http://127.0.0.1:9876) and the mint a local Nutshell on FakeWallet
 * (default http://127.0.0.1:3338). The production mint is refused: its quotes
 * are only paid by real payments. See `card-fixtures-lib.ts` for what each
 * fixture holds.
 */
import { RequestListener, createServer } from "http"
import { Mint } from "@cashu/cashu-ts"

import { toHex } from "../../app/utils/cashu-card"
import { createTopUpMint } from "../../app/utils/cashu-card-topup/mint"
import {
  FIXTURE_NAMES,
  FIXTURE_TIP_HEADER,
  FixtureCard,
  FixtureDeps,
  FixtureMint,
  PRODUCTION_MINT_HOST,
  isFixtureName,
  loadFixture,
} from "./card-fixtures-lib"

const BRIDGE_TIMEOUT_MS = 5_000

const fromHex = (hex: string): number[] =>
  (hex.match(/../g) ?? []).map((h) => parseInt(h, 16))

const bridgeRequest = async (bridge: string, path: string, body?: unknown) => {
  const response = await fetch(`${bridge}${path}`, {
    method: "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS),
  })
  const text = await response.text()
  if (!response.ok)
    throw new Error(`cardsim ${path} answered ${response.status}: ${text}`)
  return JSON.parse(text) as { hex?: string }
}

/**
 * cardsim over HTTP, as tools/cardsim/client.cjs speaks it. An APDU is never
 * retried: a replayed LOAD_PROOF burns a second slot.
 */
export const bridgeCard = (bridge: string): FixtureCard => ({
  reset: async () => {
    await bridgeRequest(bridge, "/reset")
  },
  transceive: async (apdu) => {
    const { hex } = await bridgeRequest(bridge, "/apdu", { hex: toHex(apdu) })
    if (typeof hex !== "string" || !/^([0-9a-fA-F]{2}){2,}$/.test(hex)) {
      throw new Error("cardsim /apdu answered no status word")
    }
    return fromHex(hex)
  },
})

export const fixtureMint = (url: string): FixtureMint => {
  const topUpMint = createTopUpMint(url)
  const mint = new Mint(url)
  return {
    url,
    activeKeyset: topUpMint.activeKeyset,
    createQuote: topUpMint.createQuote,
    quoteState: topUpMint.quoteState,
    mint: topUpMint.mint,
    proofStates: topUpMint.proofStates,
    swap: async (inputs, outputs) => (await mint.swap({ inputs, outputs })).signatures,
  }
}

/**
 * The `serve` endpoints: `GET /health`; `POST /load/<fixture>`, which answers
 * the fixture's summary, or 500 `{error: "fixture failed", fixture}` with the
 * detail in the log only (one fixture at a time: the card is one card); and
 * the header stub the app's dev bridge points at (`headers=`), in Esplora's
 * shape: `GET /headers/blocks/tip/hash` and `GET /headers/block/<hash>/header`
 * answer `FIXTURE_TIP_HEADER` as text.
 */
export const fixtureHandler = (
  deps: FixtureDeps,
  health: { bridge: string; mint: string },
): RequestListener => {
  let queue: Promise<unknown> = Promise.resolve()
  return (req, res) => {
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" })
      res.end(JSON.stringify(body))
    }
    const text = (status: number, body: string) => {
      res.writeHead(status, { "content-type": "text/plain" })
      res.end(body)
    }
    const match = /^\/load\/([a-z0-9.-]+)$/.exec(req.url ?? "")
    if (req.method === "GET" && req.url === "/health") {
      reply(200, { ok: true, ...health })
      return
    }
    if (req.method === "GET" && req.url === "/headers/blocks/tip/hash") {
      text(200, FIXTURE_TIP_HEADER.hash)
      return
    }
    if (
      req.method === "GET" &&
      req.url === `/headers/block/${FIXTURE_TIP_HEADER.hash}/header`
    ) {
      text(200, FIXTURE_TIP_HEADER.header)
      return
    }
    if (req.method !== "POST" || !match) {
      reply(404, { error: "POST /load/<fixture>" })
      return
    }
    const name = match[1]
    if (!isFixtureName(name)) {
      reply(404, { error: "no such fixture", fixtures: FIXTURE_NAMES })
      return
    }
    queue = queue.then(
      () =>
        loadFixture(name, deps).then(
          (summary) => reply(200, summary),
          (err) => {
            // The detail goes to the log (uploaded by CI), not to the caller:
            // a constant format string, and no error text in the reply.
            console.error("card-fixtures: %s failed:", name, err)
            reply(500, { error: "fixture failed", fixture: name })
          },
        ),
      () => undefined,
    )
  }
}

const hostOf = (url: string) => new URL(url).hostname.toLowerCase()

const option = (args: string[], name: string, fallback: string): string => {
  const at = args.indexOf(name)
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback
}

const usage = () => {
  console.error(
    `usage: card-fixtures.ts serve [--port 9877] [--bridge URL] [--mint URL]\n` +
      `       card-fixtures.ts load <${FIXTURE_NAMES.join(
        "|",
      )}> [--bridge URL] [--mint URL]`,
  )
  process.exit(1)
}

const main = async () => {
  const [command, ...args] = process.argv.slice(2)
  const bridge = option(args, "--bridge", "http://127.0.0.1:9876").replace(/\/+$/, "")
  const mintUrl = option(args, "--mint", "http://127.0.0.1:3338").replace(/\/+$/, "")
  if (hostOf(mintUrl) === PRODUCTION_MINT_HOST) {
    console.error("card-fixtures: the production mint is not a fixture mint")
    process.exit(1)
  }
  const deps: FixtureDeps = {
    card: bridgeCard(bridge),
    mint: fixtureMint(mintUrl),
    log: (line) => console.log(`card-fixtures: ${line}`),
  }

  if (command === "load") {
    const name = args[0]
    if (!name || !isFixtureName(name)) usage()
    await loadFixture(name as (typeof FIXTURE_NAMES)[number], deps)
    return
  }
  if (command !== "serve") usage()

  const port = Number(option(args, "--port", "9877"))
  const server = createServer(fixtureHandler(deps, { bridge, mint: mintUrl }))
  // Loopback only, like cardsim: nothing off this machine provisions its card.
  server.listen(port, "127.0.0.1", () => {
    console.log(
      `card-fixtures listening on http://127.0.0.1:${port} (bridge ${bridge}, mint ${mintUrl})`,
    )
  })
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
