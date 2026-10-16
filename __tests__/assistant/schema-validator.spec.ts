import {
  compileSchema,
  JsonSchema,
  ObjectSchema,
  SchemaDefinitionError,
  SUPPORTED_KEYWORDS,
} from "@app/assistant/engine/schema-validator"

// A schema the type system would refuse, as a cast or plain JS could hand it in.
const loose = (schema: unknown): ObjectSchema => schema as ObjectSchema

const closed = (properties: Record<string, JsonSchema>, required?: string[]) =>
  loose({ type: "object", properties, required, additionalProperties: false })

describe("compileSchema at definition time", () => {
  it("implements exactly the subset the spec names", () => {
    expect([...SUPPORTED_KEYWORDS].sort()).toEqual(
      [
        "additionalProperties",
        "enum",
        "maximum",
        "pattern",
        "properties",
        "required",
        "type",
      ].sort(),
    )
  })

  const unsupported = [
    "maxLength",
    "minimum",
    "oneOf",
    "format",
    "items",
    "default",
    "const",
  ]
  unsupported.forEach((keyword) =>
    it(`refuses the unsupported keyword ${keyword} instead of ignoring it`, () => {
      const schema = closed({ memo: loose({ type: "string", [keyword]: 1 }) })

      expect(() => compileSchema(schema)).toThrow(SchemaDefinitionError)
      expect(() => compileSchema(schema)).toThrow(`unsupported keyword "${keyword}"`)
    }),
  )

  it("refuses an unsupported keyword at the top level too", () => {
    expect(() =>
      compileSchema(
        loose({
          type: "object",
          properties: {},
          additionalProperties: false,
          minProperties: 1,
        }),
      ),
    ).toThrow(SchemaDefinitionError)
  })

  it("refuses an object that is not closed", () => {
    expect(() => compileSchema(loose({ type: "object", properties: {} }))).toThrow(
      `"additionalProperties": false`,
    )
    expect(() =>
      compileSchema(
        loose({ type: "object", properties: {}, additionalProperties: true }),
      ),
    ).toThrow(SchemaDefinitionError)
    expect(() =>
      compileSchema(closed({ nested: loose({ type: "object", properties: {} }) })),
    ).toThrow(SchemaDefinitionError)
  })

  it("refuses a schema that accepts anything", () => {
    expect(() => compileSchema(closed({ anything: loose({}) }))).toThrow(
      `needs "type" or "enum"`,
    )
  })

  it("refuses a top level that is not an object schema", () => {
    expect(() => compileSchema(loose({ type: "string" }))).toThrow(SchemaDefinitionError)
    expect(() => compileSchema(loose(null))).toThrow(SchemaDefinitionError)
  })

  it("refuses keywords on types they do not apply to", () => {
    expect(() =>
      compileSchema(closed({ n: loose({ type: "integer", pattern: "^1$" }) })),
    ).toThrow(SchemaDefinitionError)
    expect(() =>
      compileSchema(closed({ s: loose({ type: "string", maximum: 3 }) })),
    ).toThrow(SchemaDefinitionError)
    expect(() =>
      compileSchema(closed({ s: loose({ type: "string", properties: {} }) })),
    ).toThrow(SchemaDefinitionError)
  })

  it("refuses an unknown type, a pattern that does not compile and a bad enum", () => {
    expect(() => compileSchema(closed({ a: loose({ type: "array" }) }))).toThrow(
      SchemaDefinitionError,
    )
    expect(() => compileSchema(closed({ s: { type: "string", pattern: "([" } }))).toThrow(
      "not a regular expression",
    )
    expect(() => compileSchema(closed({ e: loose({ enum: [] }) }))).toThrow(
      SchemaDefinitionError,
    )
    expect(() => compileSchema(closed({ e: loose({ enum: [{}] }) }))).toThrow(
      SchemaDefinitionError,
    )
    expect(() => compileSchema(closed({ e: { type: "string", enum: [1] } }))).toThrow(
      SchemaDefinitionError,
    )
  })

  it("refuses a required field that is not a property", () => {
    expect(() => compileSchema(closed({ a: { type: "string" } }, ["b"]))).toThrow(
      `"required" names "b"`,
    )
  })
})

describe("a compiled schema", () => {
  const validate = compileSchema(
    closed(
      {
        first: { type: "integer", maximum: 20 },
        ratio: { type: "number", maximum: 1 },
        direction: { enum: ["SEND", "RECEIVE"] },
        query: { type: "string", pattern: "^[\\s\\S]{1,5}$" },
        flag: { type: "boolean" },
        nested: loose({
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
          additionalProperties: false,
        }),
      },
      ["direction"],
    ),
  )

  it("accepts input inside the schema", () => {
    expect(
      validate({ first: 20, ratio: 0.5, direction: "SEND", query: "abc", flag: true }),
    ).toEqual({ valid: true })
    expect(validate({ direction: "RECEIVE", nested: { id: "x" } })).toEqual({
      valid: true,
    })
  })

  const refusals: [string, unknown, string][] = [
    ["an extra property", { direction: "SEND", extra: 1 }, "$.extra"],
    ["a missing required property", { first: 1 }, "$.direction"],
    ["an enum miss", { direction: "BOTH" }, "$.direction"],
    ["a string where an integer goes", { direction: "SEND", first: "5" }, "$.first"],
    ["a fraction where an integer goes", { direction: "SEND", first: 2.5 }, "$.first"],
    ["a value over the maximum", { direction: "SEND", first: 21 }, "$.first"],
    ["a non-finite number", { direction: "SEND", ratio: Infinity }, "$.ratio"],
    ["a string outside the pattern", { direction: "SEND", query: "toolong" }, "$.query"],
    ["a number where a string goes", { direction: "SEND", query: 5 }, "$.query"],
    ["a string where a boolean goes", { direction: "SEND", flag: "true" }, "$.flag"],
    [
      "a nested extra property",
      { direction: "SEND", nested: { id: "x", y: 1 } },
      "$.nested.y",
    ],
    ["a nested missing property", { direction: "SEND", nested: {} }, "$.nested.id"],
    ["an array where an object goes", { direction: "SEND", nested: [] }, "$.nested"],
  ]
  refusals.forEach(([name, value, path]) =>
    it(`refuses ${name}`, () => {
      expect(validate(value)).toMatchObject({ valid: false, path })
    }),
  )

  it("refuses anything that is not a plain object at the top", () => {
    expect(validate(null).valid).toBe(false)
    expect(validate([]).valid).toBe(false)
    expect(validate("SEND").valid).toBe(false)
  })
})
