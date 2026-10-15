/**
 * JSON with object keys in sorted order at every depth, so two values that
 * hold the same data serialize to the same string whatever order their keys
 * were written in. The executor compares action summaries this way ("byte
 * for byte", spec §5.1), and the dispatch journal hashes payments with it.
 *
 * Only JSON data is accepted. A value JSON cannot represent exactly (a
 * function, undefined, a non-finite number, a bigint) throws instead of
 * being dropped or turned into null, since a comparison that silently lost a
 * field could call two different payments equal.
 */
export const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value)
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`Not JSON data: ${value}`)
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`
  }
  if (typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(
            (value as Record<string, unknown>)[key],
          )}`,
      )
    return `{${entries.join(",")}}`
  }
  throw new TypeError(`Not JSON data: ${typeof value}`)
}
