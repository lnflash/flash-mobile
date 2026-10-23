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
  it("does not offer unrelated contacts after an unrelated transcription", async () => {
    const verify = jest.fn(async () => null)
    await expect(
      lookupFlashUsername("flashbacks", ["dreadmax", "alice", "bob"], verify),
    ).resolves.toEqual({ kind: "suggestions", matches: [] })
    expect(verify.mock.calls).toEqual([["flashbacks"]])
  })
  it("searches for similar public usernames outside contacts and verifies each choice", async () => {
    const verify = jest.fn(async (name: string) => (name === "dreadmax" ? "key" : null))
    const search = jest.fn(async () => ["dreadmax", "dreadmark", "unrelated"])
    await expect(lookupFlashUsername("dreadma", [], { verify, search })).resolves.toEqual(
      {
        kind: "suggestions",
        matches: [{ username: "dreadmax", value: "key" }],
      },
    )
    expect(search).toHaveBeenCalledWith("dreadma")
    expect(verify).toHaveBeenCalledWith("dreadmark")
    expect(verify).not.toHaveBeenCalledWith("unrelated")
  })
  it("does not search after an exact match or disguise directory outages as no matches", async () => {
    const search = jest.fn(async () => {
      throw new Error("directory outage")
    })
    await expect(
      lookupFlashUsername("alice", [], { verify: async () => "key", search }),
    ).resolves.toMatchObject({ kind: "exact" })
    expect(search).not.toHaveBeenCalled()
    await expect(
      lookupFlashUsername("alic", [], { verify: async () => null, search }),
    ).rejects.toThrow("directory outage")
  })
})
