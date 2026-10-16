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
        "items",
        "maxItems",
        "maximum",
        "minItems",
        "pattern",
        "properties",
        "required",
        "type",
      ].sort(),
    )
  })

  // `items` left this list when ENG-688 made arrays part of the subset; the
  // array keywords the validator still does not implement took its place.
  const unsupported = [
    "maxLength",
    "minimum",
    "oneOf",
    "format",
    "uniqueItems",
    "contains",
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
      compileSchema(closed({ s: loose({ type: "string", items: { type: "string" } }) })),
    ).toThrow(`"items" needs type "array"`)
    expect(() =>
      compileSchema(
        closed({
          o: loose({
            type: "object",
            properties: {},
            additionalProperties: false,
            maxItems: 2,
          }),
        }),
      ),
    ).toThrow(`"maxItems" needs type "array"`)
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
    expect(() => compileSchema(closed({ a: loose({ type: "tuple" }) }))).toThrow(
      `unsupported type "tuple"`,
    )
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

  it("refuses an array that does not say what its items are", () => {
    // An array of anything is as open as an object that is not closed.
    expect(() => compileSchema(closed({ a: loose({ type: "array" }) }))).toThrow(
      `arrays must declare "items"`,
    )
    expect(() =>
      compileSchema(closed({ a: loose({ type: "array", items: {} }) })),
    ).toThrow(`needs "type" or "enum"`)
    expect(() =>
      compileSchema(
        closed({
          a: loose({ type: "array", items: { type: "object", properties: {} } }),
        }),
      ),
    ).toThrow(`"additionalProperties": false`)
  })

  it("refuses item counts that are not whole numbers or cannot both hold", () => {
    const array = (counts: Record<string, unknown>) =>
      closed({ a: loose({ type: "array", items: { type: "string" }, ...counts }) })

    expect(() => compileSchema(array({ minItems: -1 }))).toThrow(
      `"minItems" must be a whole number`,
    )
    expect(() => compileSchema(array({ maxItems: 1.5 }))).toThrow(
      `"maxItems" must be a whole number`,
    )
    expect(() => compileSchema(array({ maxItems: "3" }))).toThrow(SchemaDefinitionError)
    expect(() => compileSchema(array({ minItems: 3, maxItems: 2 }))).toThrow(
      `"minItems" is above "maxItems"`,
    )
    expect(() => compileSchema(array({ minItems: 2, maxItems: 2 }))).not.toThrow()
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

describe("a compiled schema with arrays", () => {
  const validate = compileSchema(
    closed(
      {
        payees: loose({
          type: "array",
          items: { type: "string", pattern: "^[a-z]{1,8}$" },
          minItems: 2,
          maxItems: 3,
        }),
        legs: loose({
          type: "array",
          items: loose({
            type: "object",
            properties: { label: { type: "string" }, status: { enum: ["ok", "no"] } },
            required: ["label"],
            additionalProperties: false,
          }),
        }),
      },
      ["payees"],
    ),
  )

  it("accepts arrays inside their bounds, empty ones where nothing bounds them", () => {
    expect(validate({ payees: ["alice", "bob"] })).toEqual({ valid: true })
    expect(validate({ payees: ["alice", "bob", "carol"], legs: [] })).toEqual({
      valid: true,
    })
    expect(
      validate({
        payees: ["alice", "bob"],
        legs: [{ label: "A" }, { label: "B", status: "ok" }],
      }),
    ).toEqual({ valid: true })
  })

  const refusals: [string, unknown, string][] = [
    ["a string where an array goes", { payees: "alice,bob" }, "$.payees"],
    ["an object where an array goes", { payees: { 0: "alice" } }, "$.payees"],
    ["too few items", { payees: ["alice"] }, "$.payees"],
    ["too many items", { payees: ["a", "b", "c", "d"] }, "$.payees"],
    ["an item outside its pattern", { payees: ["alice", "Bob"] }, "$.payees[]"],
    ["an item of the wrong type", { payees: ["alice", 7] }, "$.payees[]"],
    [
      "an item object with an extra property",
      { payees: ["a", "b"], legs: [{ label: "A", amount: 5 }] },
      "$.legs[].amount",
    ],
    [
      "an item object missing a required property",
      { payees: ["a", "b"], legs: [{ status: "ok" }] },
      "$.legs[].label",
    ],
    [
      "an item object with an enum miss",
      { payees: ["a", "b"], legs: [{ label: "A", status: "maybe" }] },
      "$.legs[].status",
    ],
  ]
  refusals.forEach(([name, value, path]) =>
    it(`refuses ${name}`, () => {
      expect(validate(value)).toMatchObject({ valid: false, path })
    }),
  )

  it("checks every item, not only the first", () => {
    expect(validate({ payees: ["alice", "bob", "BAD"] })).toMatchObject({
      valid: false,
      path: "$.payees[]",
    })
  })
})
