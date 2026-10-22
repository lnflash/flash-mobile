import { contactTagsFor } from "../contact-tags"

describe("Chat contact updates", () => {
  const tags = [
    ["relay", "wss://example.com"],
    ["p", "alice"],
    ["p", "bob", "wss://bob.example", "Bob"],
  ]

  it("adds only one tag without changing the original event", () => {
    expect(contactTagsFor(tags, "add", "carol")).toEqual([...tags, ["p", "carol"]])
    expect(contactTagsFor(tags, "add", "alice")).toEqual(tags)
    expect(tags).toHaveLength(3)
  })

  it("removes only the exact public key and keeps metadata", () => {
    expect(contactTagsFor(tags, "remove", "bob")).toEqual(tags.slice(0, 2))
    expect(contactTagsFor(tags, "remove", "other")).toEqual(tags)
  })
})
