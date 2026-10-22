/** Change only the named person's p-tag; keep relay and metadata tags untouched. */
export const contactTagsFor = (
  tags: readonly (readonly string[])[],
  operation: "add" | "remove",
  pubkey: string,
): string[][] => {
  const copy = tags.map((tag) => [...tag])
  if (operation === "add")
    return copy.some((tag) => tag[0] === "p" && tag[1] === pubkey)
      ? copy
      : [...copy, ["p", pubkey]]
  return copy.filter((tag) => !(tag[0] === "p" && tag[1] === pubkey))
}
