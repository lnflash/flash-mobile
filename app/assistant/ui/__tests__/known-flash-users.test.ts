import { similarUsernames } from "../../registry/read/similar-usernames"
import { knownFlashUsernames } from "../known-flash-users"

describe("Ask Flash contact username hints", () => {
  const tags = [["p", "contact-key"]]
  const profiles = new Map([["contact-key", { nip05: "dreadmax@flashapp.me" }]])

  it("uses the Chat contact's Flash address as a verified lookup hint", () => {
    const names = knownFlashUsernames(tags, profiles, "flashapp.me")
    expect(names).toEqual(["dreadmax"])
    expect(similarUsernames("dread max", names)).toEqual(["dreadmax"])
    expect(similarUsernames("dreadma", names)).toEqual(["dreadmax"])
    expect(similarUsernames("treadmarks", names)).toEqual(["dreadmax"])
  })

  it("does not suggest profiles from another Flash address host", () => {
    expect(knownFlashUsernames(tags, profiles, "other.example")).toEqual([])
  })
})
