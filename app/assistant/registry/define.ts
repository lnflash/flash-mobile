import { AMOUNT_CURRENCIES, AMOUNT_PATTERN } from "../engine/parse-amount"
import {
  compileSchema,
  JsonSchema,
  ObjectSchema,
  SchemaDefinitionError,
  Validator,
} from "../engine/schema-validator"
import type { Intent, ReadIntent, ReadToolCtx, Tier, ToolResult } from "./types"

// How a tool joins the registry. Adding an intent is a new file that calls
// defineRead (or, from ENG-688, defineAction) plus one entry in
// ./index.ts; the router, the executor and runTool are generic over the
// registry and are not edited (spec §7.2).

/**
 * The fields of a tool's input that hold model-emitted amounts, each mapped
 * to the field that holds its currency. The router parses them with
 * parseAmount, so a tool receives a MoneyAmount where the model sent a
 * string (spec §3, "Amounts").
 */
export type AmountFields = { readonly [amountField: string]: string }

export type ReadToolDefinition<Args, Payload, Projection> = {
  intent: ReadIntent
  /** What the tool does, for the model's tool list. */
  description: string
  input: ObjectSchema
  amounts?: AmountFields
  run: (args: Args, ctx: ReadToolCtx) => Promise<ToolResult<Payload>>
  /**
   * The compact form of an answer, the only form that leaves runTool (spec
   * §4): payment hashes, memos and counterparties are dropped unless the
   * query asked for them.
   */
  project: (payload: Payload, args: Args) => Projection
}

/** A tool as the router and runTool see it, its types erased. */
export type RegisteredTool = {
  intent: Intent
  tier: Tier
  description: string
  validate: Validator
  amounts: AmountFields
  run: (args: Record<string, unknown>, ctx: ReadToolCtx) => Promise<ToolResult<unknown>>
  project: (payload: unknown, args: Record<string, unknown>) => unknown
}

export type Registry = ReadonlyMap<Intent, RegisteredTool>

const checkAmountFields = (input: ObjectSchema, amounts: AmountFields): void => {
  Object.keys(amounts).forEach((field) => {
    const amount: JsonSchema | undefined = input.properties[field]
    if (amount?.type !== "string" || amount.pattern !== AMOUNT_PATTERN) {
      throw new SchemaDefinitionError(
        `$.${field}`,
        `an amount field must be a string with the amount pattern`,
      )
    }
    const currencyField = amounts[field]
    const currency: JsonSchema | undefined = input.properties[currencyField]
    const currencies: readonly unknown[] = AMOUNT_CURRENCIES
    if (!currency?.enum || !currency.enum.every((value) => currencies.includes(value))) {
      throw new SchemaDefinitionError(
        `$.${currencyField}`,
        `an amount's currency field must be an enum of ${AMOUNT_CURRENCIES.join(", ")}`,
      )
    }
  })
}

/**
 * Define a read-tier tool. The input schema and the amount fields are
 * checked here, when the tool is defined, so a tool the validator cannot
 * enforce never loads.
 */
export const defineRead = <Args, Payload, Projection>(
  definition: ReadToolDefinition<Args, Payload, Projection>,
): RegisteredTool => {
  const validate = compileSchema(definition.input)
  const amounts = definition.amounts ?? {}
  checkAmountFields(definition.input, amounts)
  return {
    intent: definition.intent,
    tier: "read",
    description: definition.description,
    validate,
    amounts,
    // The router hands run() only arguments its schema accepted, with the
    // amount fields parsed, which is what Args declares.
    run: (args, ctx) => definition.run(args as Args, ctx),
    project: (payload, args) => definition.project(payload as Payload, args as Args),
  }
}

export const createRegistry = (tools: readonly RegisteredTool[]): Registry => {
  const registry = new Map<Intent, RegisteredTool>()
  tools.forEach((tool) => {
    if (registry.has(tool.intent)) {
      throw new Error(`Two tools registered for ${tool.intent}`)
    }
    registry.set(tool.intent, tool)
  })
  return registry
}
