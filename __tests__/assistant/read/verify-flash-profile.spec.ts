import { verifyFlashProfile } from "@app/assistant/rails/verify-flash-profile"
import { lookupFlashUsername } from "@app/assistant/registry/read/lookup-flash-username"

const pubkey = "a".repeat(64)
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })

afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
})

it("verifies the requested mapping through fetch, including encoded international names", async () => {
  const transfer = jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(response({ names: { alice: pubkey, other: "b".repeat(64) } }))
    .mockResolvedValueOnce(response({ names: { álvaro: pubkey } }))
  await expect(verifyFlashProfile("ALICE", "flashapp.me")).resolves.toBe(pubkey)
  await expect(verifyFlashProfile("Álvaro", "flashapp.me")).resolves.toBe(pubkey)
  expect(transfer.mock.calls[0][0]).toBe(
    "https://flashapp.me/.well-known/nostr.json?name=alice",
  )
  expect(transfer.mock.calls[1][0]).toContain("name=%C3%A1lvaro")
  expect(transfer.mock.calls[0][1]).toMatchObject({ redirect: "manual" })
})
;(
  [
    [200, { names: {} }],
    [200, { names: { other: pubkey } }],
    [404, { error: "User not found" }],
  ] as [number, unknown][]
).forEach(([status, body]) => {
  it(`treats only an explicit missing mapping as absent (${status})`, async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(response(body, status as number))
    await expect(verifyFlashProfile("alice", "flashapp.me")).resolves.toBeNull()
  })
})
;(
  [
    [400, { error: "Invalid name parameter" }],
    [401, { error: "Unauthenticated" }],
    [429, { error: "Too Many Requests" }],
    [502, { error: "Upstream lookup failed" }],
    [404, { error: "Wrong endpoint" }],
    [200, {}],
    [200, { names: [] }],
    [200, { names: { alice: "not-a-pubkey" } }],
    [200, { names: { alice: null } }],
  ] as [number, unknown][]
).forEach(([status, body]) => {
  it(`preserves HTTP/protocol failure for retry (${status} ${JSON.stringify(
    body,
  )})`, async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(response(body, status as number))
    await expect(verifyFlashProfile("alice", "flashapp.me")).rejects.toThrow()
  })
})

it("does not convert transport or malformed JSON failures into a missing username", async () => {
  const transfer = jest
    .spyOn(globalThis, "fetch")
    .mockRejectedValueOnce(new Error("NIP-05 unavailable"))
    .mockResolvedValueOnce(new Response("{", { status: 200 }))
  await expect(verifyFlashProfile("alice", "flashapp.me")).rejects.toThrow(
    "NIP-05 unavailable",
  )
  await expect(verifyFlashProfile("alice", "flashapp.me")).rejects.toThrow()
  expect(transfer).toHaveBeenCalledTimes(2)
})

it("never falls through to directory suggestions after verification fails", async () => {
  jest.spyOn(globalThis, "fetch").mockResolvedValue(response({}, 502))
  const search = jest.fn(async () => ["alice"])
  await expect(
    lookupFlashUsername("alice", ["alicia"], {
      verify: (name) => verifyFlashProfile(name, "flashapp.me"),
      search,
    }),
  ).rejects.toThrow()
  expect(search).not.toHaveBeenCalled()
})

it("bounds a stalled verification and allows a fresh attempt", async () => {
  jest.useFakeTimers()
  const transfer = jest.spyOn(globalThis, "fetch").mockImplementationOnce(
    (_input, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => reject(new Error("aborted")))
      }),
  )
  const pending = verifyFlashProfile("alice", "flashapp.me").catch((error) => error)
  jest.advanceTimersByTime(15000)
  expect(await pending).toEqual(new Error("aborted"))
  transfer.mockResolvedValueOnce(response({ names: { alice: pubkey } }))
  await expect(verifyFlashProfile("alice", "flashapp.me")).resolves.toBe(pubkey)
  expect(jest.getTimerCount()).toBe(0)
})
