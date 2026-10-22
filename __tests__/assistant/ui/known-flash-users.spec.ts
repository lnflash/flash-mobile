import { knownFlashUsernames } from "@app/assistant/ui/known-flash-users"
import { similarUsernames } from "@app/assistant/registry/read/similar-usernames"

describe("known Flash usernames", () => {
  it("searches Chat contacts on the current Flash host without treating every profile as a contact", () => {
    const profiles = new Map<string, unknown>([
      ["saved", { nip05: "DreadMax@flashapp.me" }],
      ["other-host", { nip05: "dreadlocks@example.com" }],
      ["unsaved", { nip05: "another@flashapp.me" }],
    ])
    const known = knownFlashUsernames(
      [
        ["p", "saved"],
        ["p", "other-host"],
        ["e", "unsaved"],
      ],
      profiles,
      "flashapp.me",
    )

    expect(known).toEqual(["dreadmax"])
    expect(similarUsernames("dreadlocks", known)).toEqual(["dreadmax"])
  })
})
