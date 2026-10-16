// The JSON Schema validator for tool inputs (docs/ai-assistant-tool-registry.md
// §3). Hand-written for the subset the registry uses, with no ajv or zod
// dependency. A schema is checked when a tool is defined, so a tool with a
// keyword this file does not implement fails at load instead of accepting
// input its author meant to refuse.
//
// ENG-688 grew the subset by arrays (`items`, `minItems`, `maxItems`): a
// group send takes a list of payees, and the action cards, whose payloads
// are validated at render time by this same validator (spec §6), carry lists
// of legs, options and transaction ids.

/** The keywords this validator implements. Any other keyword is refused. */
export const SUPPORTED_KEYWORDS = [
  "type",
  "properties",
  "required",
  "additionalProperties",
  "enum",
  "pattern",
  "maximum",
  "items",
  "minItems",
  "maxItems",
] as const

export type SchemaType = "object" | "array" | "string" | "integer" | "number" | "boolean"

export type EnumValue = string | number | boolean

export type JsonSchema = {
  type?: SchemaType
  properties?: { readonly [name: string]: JsonSchema }
  required?: readonly string[]
  /** Must be `false` wherever `type` is "object": objects are always closed. */
  additionalProperties?: false
  enum?: readonly EnumValue[]
  pattern?: string
  maximum?: number
  /** Must be set wherever `type` is "array": every item is checked against it. */
  items?: JsonSchema
  minItems?: number
  maxItems?: number
}

/** The schema every tool input has: a closed object. */
export type ObjectSchema = JsonSchema & {
  type: "object"
  properties: { readonly [name: string]: JsonSchema }
  additionalProperties: false
}

/** A schema the validator does not implement, found when a tool is defined. */
export class SchemaDefinitionError extends Error {
  constructor(path: string, problem: string) {
    super(`Invalid tool schema at ${path}: ${problem}`)
    this.name = "SchemaDefinitionError"
  }
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; path: string; problem: string }

export type Validator = (value: unknown) => ValidationResult

const TYPES: readonly SchemaType[] = [
  "object",
  "array",
  "string",
  "integer",
  "number",
  "boolean",
]

const OBJECT_ONLY = ["properties", "required", "additionalProperties"] as const

const ARRAY_ONLY = ["items", "minItems", "maxItems"] as const

const hasOwn = (target: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(target, key)

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const VALID: ValidationResult = { valid: true }

const invalid = (path: string, problem: string): ValidationResult => ({
  valid: false,
  path,
  problem,
})

const matchesType = (value: unknown, type: SchemaType): boolean => {
  switch (type) {
    case "object":
      return isPlainObject(value)
    case "array":
      return Array.isArray(value)
    case "string":
      return typeof value === "string"
    case "integer":
      return typeof value === "number" && Number.isInteger(value)
    case "number":
      return typeof value === "number" && Number.isFinite(value)
    case "boolean":
      return typeof value === "boolean"
  }
}

const checkKeywords = (schema: Record<string, unknown>, path: string): void => {
  const supported: readonly string[] = SUPPORTED_KEYWORDS
  Object.keys(schema).forEach((keyword) => {
    if (!supported.includes(keyword)) {
      throw new SchemaDefinitionError(path, `unsupported keyword "${keyword}"`)
    }
  })
  if (schema.type === undefined && schema.enum === undefined) {
    // An empty schema accepts anything, which no tool input should.
    throw new SchemaDefinitionError(path, `needs "type" or "enum"`)
  }
  if (schema.type !== undefined && !TYPES.includes(schema.type as SchemaType)) {
    throw new SchemaDefinitionError(
      path,
      `unsupported type ${JSON.stringify(schema.type)}`,
    )
  }
}

const compileEnum = (
  schema: JsonSchema,
  path: string,
): ((value: unknown) => boolean) | undefined => {
  if (schema.enum === undefined) return undefined
  const values = schema.enum as unknown
  if (!Array.isArray(values) || values.length === 0) {
    throw new SchemaDefinitionError(path, `"enum" must be a non-empty array`)
  }
  values.forEach((value) => {
    const literal = ["string", "number", "boolean"].includes(typeof value)
    if (!literal || (schema.type !== undefined && !matchesType(value, schema.type))) {
      throw new SchemaDefinitionError(path, `"enum" holds ${JSON.stringify(value)}`)
    }
  })
  return (value) => values.includes(value)
}

const compilePattern = (
  schema: JsonSchema,
  path: string,
): ((value: string) => boolean) | undefined => {
  if (schema.pattern === undefined) return undefined
  if (schema.type !== "string" || typeof schema.pattern !== "string") {
    throw new SchemaDefinitionError(path, `"pattern" needs type "string"`)
  }
  let regex: RegExp
  try {
    regex = new RegExp(schema.pattern, "u")
  } catch {
    throw new SchemaDefinitionError(path, `"pattern" is not a regular expression`)
  }
  // JSON Schema patterns are unanchored: a match anywhere passes. A schema
  // that means the whole string anchors it, as the amount pattern does.
  return (value) => regex.test(value)
}

const compileMaximum = (
  schema: JsonSchema,
  path: string,
): ((value: number) => boolean) | undefined => {
  if (schema.maximum === undefined) return undefined
  const numeric = schema.type === "integer" || schema.type === "number"
  if (!numeric || !Number.isFinite(schema.maximum)) {
    throw new SchemaDefinitionError(path, `"maximum" needs a numeric type and a number`)
  }
  const maximum = schema.maximum
  return (value) => value <= maximum
}

const compileObject = (schema: JsonSchema, path: string): Validator | undefined => {
  if (schema.type !== "object") {
    OBJECT_ONLY.forEach((keyword) => {
      if (schema[keyword] !== undefined) {
        throw new SchemaDefinitionError(path, `"${keyword}" needs type "object"`)
      }
    })
    return undefined
  }
  if (schema.additionalProperties !== false) {
    throw new SchemaDefinitionError(
      path,
      `objects must set "additionalProperties": false`,
    )
  }
  if (!isPlainObject(schema.properties)) {
    throw new SchemaDefinitionError(path, `objects must declare "properties"`)
  }
  const properties = schema.properties
  const fields = new Map<string, Validator>()
  Object.keys(properties).forEach((name) => {
    // compileNode and compileObject recurse into each other.
    fields.set(name, compileNode(properties[name], `${path}.${name}`))
  })
  const required = schema.required ?? []
  if (!Array.isArray(required)) {
    throw new SchemaDefinitionError(path, `"required" must be an array`)
  }
  required.forEach((name) => {
    if (typeof name !== "string" || !fields.has(name)) {
      throw new SchemaDefinitionError(path, `"required" names ${JSON.stringify(name)}`)
    }
  })

  return (value) => {
    const object = value as Record<string, unknown>
    const extra = Object.keys(object).find((key) => !fields.has(key))
    if (extra !== undefined) return invalid(`${path}.${extra}`, "is not allowed")
    const missing = required.find(
      (name) => !hasOwn(object, name) || object[name] === undefined,
    )
    if (missing !== undefined) return invalid(`${path}.${missing}`, "is required")
    for (const [name, validate] of fields) {
      if (hasOwn(object, name) && object[name] !== undefined) {
        const result = validate(object[name])
        if (!result.valid) return result
      }
    }
    return VALID
  }
}

/** A count keyword (`minItems`, `maxItems`): a whole number of items, or absent. */
const compileCount = (
  schema: JsonSchema,
  keyword: "minItems" | "maxItems",
  path: string,
): number | undefined => {
  const count: unknown = schema[keyword]
  if (count === undefined) return undefined
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
    throw new SchemaDefinitionError(path, `"${keyword}" must be a whole number`)
  }
  return count
}

const compileArray = (schema: JsonSchema, path: string): Validator | undefined => {
  if (schema.type !== "array") {
    ARRAY_ONLY.forEach((keyword) => {
      if (schema[keyword] !== undefined) {
        throw new SchemaDefinitionError(path, `"${keyword}" needs type "array"`)
      }
    })
    return undefined
  }
  // An array of anything would be an open door, as an open object would be.
  if (schema.items === undefined) {
    throw new SchemaDefinitionError(path, `arrays must declare "items"`)
  }
  // compileNode and compileArray recurse into each other.
  const validateItem = compileNode(schema.items, `${path}[]`)
  const minItems = compileCount(schema, "minItems", path)
  const maxItems = compileCount(schema, "maxItems", path)
  if (minItems !== undefined && maxItems !== undefined && minItems > maxItems) {
    throw new SchemaDefinitionError(path, `"minItems" is above "maxItems"`)
  }

  return (value) => {
    const items = value as readonly unknown[]
    if (minItems !== undefined && items.length < minItems) {
      return invalid(path, "has too few items")
    }
    if (maxItems !== undefined && items.length > maxItems) {
      return invalid(path, "has too many items")
    }
    for (const item of items) {
      const result = validateItem(item)
      if (!result.valid) return result
    }
    return VALID
  }
}

const compileNode = (schema: JsonSchema, path: string): Validator => {
  if (!isPlainObject(schema)) {
    throw new SchemaDefinitionError(path, "is not a schema object")
  }
  checkKeywords(schema, path)
  const inEnum = compileEnum(schema, path)
  const matchesPattern = compilePattern(schema, path)
  const underMaximum = compileMaximum(schema, path)
  const validateObject = compileObject(schema, path)
  const validateArray = compileArray(schema, path)
  const { type } = schema

  return (value) => {
    if (type !== undefined && !matchesType(value, type)) {
      return invalid(path, `is not of type ${type}`)
    }
    if (inEnum && !inEnum(value)) return invalid(path, "is not one of the allowed values")
    if (matchesPattern && !matchesPattern(value as string)) {
      return invalid(path, "does not match the pattern")
    }
    if (underMaximum && !underMaximum(value as number)) {
      return invalid(path, "is above the maximum")
    }
    if (validateObject) return validateObject(value)
    if (validateArray) return validateArray(value)
    return VALID
  }
}

/**
 * Check a tool's input schema once, at definition time, and return its
 * validator. Throws SchemaDefinitionError for anything outside the subset:
 * an unknown keyword, an empty schema, an object that is not closed, an
 * array with no `items`, a keyword on a type it does not apply to, or a
 * pattern that does not compile.
 */
export const compileSchema = (schema: ObjectSchema): Validator => {
  if (!isPlainObject(schema) || schema.type !== "object") {
    throw new SchemaDefinitionError("$", `a tool input must be of type "object"`)
  }
  return compileNode(schema, "$")
}
