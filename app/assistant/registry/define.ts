import { AMOUNT_CURRENCIES, AMOUNT_PATTERN } from "../engine/parse-amount"
import {
  compileSchema,
  JsonSchema,
  ObjectSchema,
  SchemaDefinitionError,
  Validator,
} from "../engine/schema-validator"
import {
  ActionIntent,
  ActionToolCtx,
  Intent,
  ReadIntent,
  ReadToolCtx,
  tierOf,
  ToolResult,
} from "./types"

// How a tool joins the registry. Adding an intent is a new file that calls
// defineRead or defineAction plus one entry in ./index.ts; the router, the
// executor and runTool are generic over the registry and are not edited
// (spec §7.2).

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

/**
 * An action-tier tool (ENG-688). Its run() prepares: it returns a prepared
 * action whose card the user confirms, a clarification, an error, or (for
 * prepareReceive, which has nothing to confirm) an answer. Nothing it does
 * before the executor runs the prepared action's execute() moves money.
 */
export type ActionToolDefinition<Args, Payload> = {
  intent: ActionIntent
  /** What the tool does, for the model's tool list. */
  description: string
  input: ObjectSchema
  amounts?: AmountFields
  run: (args: Args, ctx: ActionToolCtx) => Promise<ToolResult<Payload>>
  /** The compact form of an answer. Without one, the answer leaves as it is. */
  project?: (payload: Payload, args: Args) => unknown
}

type RegisteredToolBase = {
  intent: Intent
  description: string
  validate: Validator
  amounts: AmountFields
  project: (payload: unknown, args: Record<string, unknown>) => unknown
}

/** A read tool as the router and runTool see it, its types erased. */
export type RegisteredReadTool = RegisteredToolBase & {
  tier: "read"
  run: (args: Record<string, unknown>, ctx: ReadToolCtx) => Promise<ToolResult<unknown>>
}

/** An action tool as the router and runTool see it, its types erased. */
export type RegisteredActionTool = RegisteredToolBase & {
  tier: "action"
  run: (args: Record<string, unknown>, ctx: ActionToolCtx) => Promise<ToolResult<unknown>>
}

/**
 * A tool as the router and runTool see it. The tier says which context it
 * gets: a read tool never sees the action context, so it cannot reach a
 * send by construction.
 */
export type RegisteredTool = RegisteredReadTool | RegisteredActionTool

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
): RegisteredReadTool => {
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

/**
 * Define an action-tier tool, checked as defineRead checks a read tool. An
 * answer without a projection leaves runTool as it is: prepareReceive's
 * invoice card is already the compact form.
 */
export const defineAction = <Args, Payload>(
  definition: ActionToolDefinition<Args, Payload>,
): RegisteredActionTool => {
  const validate = compileSchema(definition.input)
  const amounts = definition.amounts ?? {}
  checkAmountFields(definition.input, amounts)
  const project = definition.project
  return {
    intent: definition.intent,
    tier: "action",
    description: definition.description,
    validate,
    amounts,
    // As for a read tool: the router hands run() only accepted arguments.
    run: (args, ctx) => definition.run(args as Args, ctx),
    project: (payload, args) =>
      project ? project(payload as Payload, args as Args) : payload,
  }
}

export const createRegistry = (tools: readonly RegisteredTool[]): Registry => {
  const registry = new Map<Intent, RegisteredTool>()
  tools.forEach((tool) => {
    if (registry.has(tool.intent)) {
      throw new Error(`Two tools registered for ${tool.intent}`)
    }
    // A read intent defined as an action (or the reverse) would get the
    // other tier's context.
    if (tool.tier !== tierOf(tool.intent)) {
      throw new Error(`${tool.intent} belongs to the ${tierOf(tool.intent)} tier`)
    }
    registry.set(tool.intent, tool)
  })
  return registry
}
