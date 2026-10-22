import { lookupFlashUsername } from "@app/assistant/registry/read/lookup-flash-username"

describe("shared Flash username lookup", () => {
  it("uses an exact verified name without substituting a similar known name", async () => {
    const verify = jest.fn(async (name: string) =>
      name === "dreadma" ? "other-user" : "dreadmax-user",
    )
    await expect(lookupFlashUsername("dreadma", ["dreadmax"], verify)).resolves.toEqual({
      kind: "exact",
      match: { username: "dreadma", value: "other-user" },
    })
    expect(verify.mock.calls).toEqual([["dreadma"]])
  })

  for (const hint of ["dread marks", "dread max", "dreadma", "treadmarks"]) {
    it(`offers a verified choice for ${hint} instead of treating it as an exact name`, async () => {
      const verify = jest.fn(async (name: string) =>
        name === "dreadmax" ? "user-key" : null,
      )
      await expect(lookupFlashUsername(hint, ["dreadmax"], verify)).resolves.toEqual({
        kind: "suggestions",
        matches: [{ username: "dreadmax", value: "user-key" }],
      })
      expect(verify).toHaveBeenCalledWith("dreadmax")
      if (hint.includes(" ")) expect(verify).not.toHaveBeenCalledWith(hint)
    })
  }

  it("does not offer a candidate that verification cannot find", async () => {
    await expect(
      lookupFlashUsername("dread marks", ["dreadmax"], async () => null),
    ).resolves.toEqual({ kind: "suggestions", matches: [] })
  })

  it("reports lookup failures as errors rather than claiming a user is missing", async () => {
    await expect(
      lookupFlashUsername("dreadmax", [], async () => {
        throw new Error("offline")
      }),
    ).rejects.toThrow("offline")
  })
})
