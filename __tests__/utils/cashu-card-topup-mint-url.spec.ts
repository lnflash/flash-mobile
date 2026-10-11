import { mintKey, sameMint } from "../../app/utils/cashu-card-topup"

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
