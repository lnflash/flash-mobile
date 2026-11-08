import { mintKey, sameMint } from "../../app/utils/cashu-card-topup"
import { normalizeCardMint } from "../../app/utils/cashu-card-topup/mint-url"

describe("sameMint", () => {
  it("reads case and trailing slashes as the same mint", () => {
    expect(sameMint("https://forge.flashapp.me", "https://Forge.flashapp.me/")).toBe(true)
    expect(sameMint("https://forge.flashapp.me", "HTTPS://FORGE.FLASHAPP.ME//")).toBe(
      true,
    )
    expect(sameMint("http://localhost:3338/", "http://localhost:3338")).toBe(true)
  })

  it("tells apart another host, port, scheme or path", () => {
    expect(sameMint("https://forge.flashapp.me", "https://other.flashapp.me")).toBe(false)
    expect(sameMint("http://localhost:3338", "http://localhost:4448")).toBe(false)
    expect(sameMint("https://forge.flashapp.me", "http://forge.flashapp.me")).toBe(false)
    expect(sameMint("https://mint.test/a", "https://mint.test/b")).toBe(false)
  })

  it("compares a string that is not a URL as written, less trailing slashes and case", () => {
    expect(mintKey("not a url/")).toBe("not a url")
    expect(sameMint("Not A URL", "not a url/")).toBe(true)
  })
})

describe("normalizeCardMint (ENG-787)", () => {
  const ok = (url: string) => ({ ok: true, url })
  const invalid = { ok: false, reason: "invalid" }

  it("keeps an https mint's path, less trailing slashes, and lowercases its host", () => {
    expect(normalizeCardMint("https://forge.flashapp.me")).toEqual(
      ok("https://forge.flashapp.me"),
    )
    expect(normalizeCardMint("https://Mint.Minibits.cash/Bitcoin/")).toEqual(
      ok("https://mint.minibits.cash/Bitcoin"),
    )
    expect(normalizeCardMint("https://mint.test:3338//")).toEqual(
      ok("https://mint.test:3338"),
    )
  })

  it("takes http only when the caller allows it (a dev bridge's local mint)", () => {
    expect(normalizeCardMint("http://localhost:3338")).toEqual(invalid)
    expect(normalizeCardMint("http://localhost:3338", { allowHttp: true })).toEqual(
      ok("http://localhost:3338"),
    )
  })

  it("refuses credentials, a query, a fragment, whitespace and non-ASCII", () => {
    ;[
      "https://user:pw@mint.test",
      "https://user@mint.test",
      "https://mint.test/?a=1",
      "https://mint.test#x",
      "https://mint.test/ path",
      " https://mint.test",
      "https://mïnt.test",
      "https://xn--mnt-ela.test​",
      "ftp://mint.test",
      "mint.test",
      "https://",
      "",
    ].forEach((input) => expect(normalizeCardMint(input)).toEqual(invalid))
  })

  it("refuses an address longer than a card holds, and never cuts it", () => {
    const at77 = `https://${"a".repeat(77 - "https://.test".length)}.test`
    expect(at77).toHaveLength(77)
    expect(normalizeCardMint(at77)).toEqual(ok(at77))
    const at78 = `https://${"a".repeat(78 - "https://.test".length)}.test`
    expect(normalizeCardMint(at78)).toEqual({ ok: false, reason: "too-long" })
  })

  it("judges the length after the trailing slashes go", () => {
    const at77 = `https://${"a".repeat(77 - "https://.test".length)}.test`
    expect(normalizeCardMint(`${at77}///`)).toEqual(ok(at77))
  })
})

describe("mintKey keeps the path (ENG-787)", () => {
  it("tells a mint's root from a mint under a path on the same host", () => {
    expect(
      sameMint("https://mint.minibits.cash", "https://mint.minibits.cash/Bitcoin"),
    ).toBe(false)
    expect(mintKey("https://mint.minibits.cash/Bitcoin/")).toBe(
      "https://mint.minibits.cash/bitcoin",
    )
  })
})
