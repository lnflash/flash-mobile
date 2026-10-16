import { canonicalJson } from "@app/assistant/engine/canonical-json"

describe("canonicalJson", () => {
  it("writes the same data the same way, whatever order its keys were in", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, "x"], c: null } })).toBe(
      canonicalJson({ a: { c: null, d: [1, "x"] }, b: 1 }),
    )
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
  })

  it("tells different data apart, array order included", () => {
    expect(canonicalJson({ amountText: "$5.00" })).not.toBe(
      canonicalJson({ amountText: "$5.01" }),
    )
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]))
    expect(canonicalJson({ a: "1" })).not.toBe(canonicalJson({ a: 1 }))
  })

  it("refuses what JSON cannot hold exactly, instead of dropping it", () => {
    expect(() => canonicalJson({ a: undefined })).toThrow(TypeError)
    expect(() => canonicalJson({ a: () => 1 })).toThrow(TypeError)
    expect(() => canonicalJson(NaN)).toThrow(TypeError)
    expect(() => canonicalJson(Infinity)).toThrow(TypeError)
    expect(() => canonicalJson(BigInt(1))).toThrow(TypeError)
  })

  it("escapes strings as JSON does", () => {
    expect(canonicalJson({ 'k"': 'v"\n' })).toBe(JSON.stringify({ 'k"': 'v"\n' }))
  })
})
