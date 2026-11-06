/**
 * ENG-820: the relay's mint transport and mint policy.
 *   - only GET /v1/keysets, GET /v1/keys/{NUT-02 id} and POST /v1/restore,
 *     /v1/checkstate, /v1/swap are called; any other route or id is refused
 *     before a request is made
 *   - https only, but for the dev bridge's own mint; routes go only onto the
 *     approved URL; a non-2xx or non-JSON answer is a RelayNetworkError
 *   - a 33-byte keyset id passes the relay path and is still refused by the
 *     top-up's activeKeyset (a card slot holds 8 bytes)
 *   - the packet's mint is relayed only when it is a mint this app knows,
 *     and the card's record mint counts only when it is one too
 */
import { Mint } from "@cashu/cashu-ts"

import {
  RelayNetworkError,
  RelayRouteError,
  TopUpMintError,
  createRelayRequest,
  createTopUpMint,
} from "../../app/utils/cashu-card-topup/mint"
import { knownRelayMint } from "../../app/utils/cashu-card-topup/mint-url"

jest.mock("@cashu/cashu-ts", () => ({
  ...jest.requireActual("@cashu/cashu-ts"),
  Mint: jest.fn(),
}))

const V1 = "00ad268c4d1f5826"
const V2 = "01" + "ab".repeat(32)

const okJson = (value: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => (typeof value === "string" ? value : JSON.stringify(value)),
  } as unknown as Response)

describe("createRelayRequest", () => {
  it("calls the five routes on the approved mint, raw JSON in and out", async () => {
    const fetchImpl = jest.fn(async () =>
      okJson({ keysets: [{ id: V2, input_fee_ppk: 1 }] }),
    )
    const request = createRelayRequest("https://mint.test/", { fetchImpl })

    await expect(request("/v1/keysets")).resolves.toEqual({
      keysets: [{ id: V2, input_fee_ppk: 1 }],
    })
    await request(`/v1/keys/${V1}`)
    await request(`/v1/keys/${V2}`)
    await request("/v1/restore", { outputs: [] })
    await request("/v1/checkstate", { Ys: ["02aa"] })
    await request("/v1/swap", { inputs: [], outputs: [] })

    const calls = fetchImpl.mock.calls as unknown as [string, RequestInit][]
    expect(calls.map(([url, init]) => `${init.method} ${url}`)).toEqual([
      "GET https://mint.test/v1/keysets",
      `GET https://mint.test/v1/keys/${V1}`,
      `GET https://mint.test/v1/keys/${V2}`,
      "POST https://mint.test/v1/restore",
      "POST https://mint.test/v1/checkstate",
      "POST https://mint.test/v1/swap",
    ])
    expect(calls[4][1].body).toBe(JSON.stringify({ Ys: ["02aa"] }))
  })

  it("refuses any other route or keyset id before a request is made", async () => {
    const fetchImpl = jest.fn(async () => okJson({}))
    const request = createRelayRequest("https://mint.test", { fetchImpl })
    for (const [route, body] of [
      ["/v1/info", undefined],
      ["/v1/mint/quote/bolt11", { amount: 1 }],
      ["/v1/melt/bolt11", { quote: "q" }],
      ["/v1/keys/../../admin", undefined],
      ["/v1/keys/00AD268C4D1F5826", undefined],
      ["/v1/keys/00ad268c4d1f58", undefined],
      ["/v1/keys/02" + "ab".repeat(32), undefined],
      ["https://evil.test/v1/keysets", undefined],
      ["/v1/keysets?x=1", undefined],
      ["/v1/keysets", { a: 1 }],
      ["/v1/swap", undefined],
    ] as [string, unknown][]) {
      await expect(request(route, body)).rejects.toBeInstanceOf(RelayRouteError)
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("is https only, but for an http mint the dev bridge allows, and takes no credentials or query", () => {
    expect(() => createRelayRequest("http://mint.test")).toThrow(RelayRouteError)
    expect(() => createRelayRequest("https://u:p@mint.test")).toThrow(RelayRouteError)
    expect(() => createRelayRequest("https://mint.test/?a=1")).toThrow(RelayRouteError)
    expect(() => createRelayRequest("not a url")).toThrow(RelayRouteError)
    expect(() =>
      createRelayRequest("http://127.0.0.1:3338", { allowInsecure: true }),
    ).not.toThrow()
  })

  it("reads a non-2xx, a non-JSON, an oversized or a failed answer as a RelayNetworkError", async () => {
    const answers = [
      async () => okJson({ detail: "no" }, 400),
      async () => okJson("<html>"),
      async () => okJson("x".repeat(1024 * 1024 + 1)),
      async () => {
        throw new Error("offline")
      },
    ]
    for (const fetchImpl of answers) {
      const request = createRelayRequest("https://mint.test", {
        fetchImpl: fetchImpl as unknown as (
          u: string,
          i: RequestInit,
        ) => Promise<Response>,
      })
      await expect(request("/v1/keysets")).rejects.toBeInstanceOf(RelayNetworkError)
    }
  })

  it("gives up on a mint that does not answer within its timeout", async () => {
    const fetchImpl = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted")))
        }),
    )
    const request = createRelayRequest("https://mint.test", { fetchImpl, timeoutMs: 10 })
    await expect(request("/v1/keysets")).rejects.toBeInstanceOf(RelayNetworkError)
  })

  it("passes a 33-byte keyset id that the top-up's activeKeyset still refuses", async () => {
    const fetchImpl = jest.fn(async () => okJson({ keysets: [] }))
    await expect(
      createRelayRequest("https://mint.test", { fetchImpl })(`/v1/keys/${V2}`),
    ).resolves.toEqual({ keysets: [] })

    const getKeySets = jest.fn(async () => ({
      keysets: [{ id: V2, unit: "sat", active: true, input_fee_ppk: 0 }],
    }))
    ;(Mint as unknown as jest.Mock).mockImplementation(() => ({ getKeySets }))
    await expect(
      createTopUpMint("https://mint.test").activeKeyset("sat"),
    ).rejects.toThrow(TopUpMintError)
  })
})

describe("knownRelayMint", () => {
  const KNOWN = ["https://forge.flashapp.me", "https://dev.mint.test/"]

  it("answers the known mint the packet names, as configured, however the packet spells it", () => {
    expect(knownRelayMint("https://forge.flashapp.me", undefined, KNOWN)).toBe(
      "https://forge.flashapp.me",
    )
    expect(knownRelayMint("https://FORGE.flashapp.me/", undefined, KNOWN)).toBe(
      "https://forge.flashapp.me",
    )
    expect(knownRelayMint("https://dev.mint.test", undefined, KNOWN)).toBe(
      "https://dev.mint.test/",
    )
  })

  it("answers nothing for a mint this app does not know", () => {
    expect(knownRelayMint("https://evil.test", undefined, KNOWN)).toBeUndefined()
    expect(
      knownRelayMint("https://forge.flashapp.me.evil.test", undefined, KNOWN),
    ).toBeUndefined()
  })

  it("counts the card's record mint only when it is known and the packet's own", () => {
    expect(
      knownRelayMint("https://forge.flashapp.me", "https://forge.flashapp.me", KNOWN),
    ).toBe("https://forge.flashapp.me")
    // A record mint this app does not know: the policy does not take it.
    expect(
      knownRelayMint("https://forge.flashapp.me", "https://evil.test", KNOWN),
    ).toBeUndefined()
    // Both known, but the packet is not the record's mint.
    expect(
      knownRelayMint("https://forge.flashapp.me", "https://dev.mint.test", KNOWN),
    ).toBeUndefined()
  })
})
