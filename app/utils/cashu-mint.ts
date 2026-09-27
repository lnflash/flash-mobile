/**
 * What the mint says about a Cashu card's contents (ENG-616).
 *
 * A card stores, per proof, a keyset id and an amount, and nothing else that
 * names a unit; GET_BALANCE adds every keyset together (spec/APDU.md:95 assumes
 * one unit per card and says nothing about mixed ones). The unit is a property
 * of the keyset, published by the mint that issued it (NUT-02 `GET /v1/keysets`:
 * `{ keysets: [{ id, unit, active, ... }] }`). So the only honest way to put a
 * unit next to a card's number is to ask the mint, and a keyset the mint does
 * not list stays "unit unknown". No unit is assumed here: which unit Flash mints
 * cards in is an open product decision, and this code must not pre-empt it.
 */
import axios from "axios"

import { CASHU_MINT_URL } from "@app/config/appinfo"

import type { CardKeysetTotal } from "./cashu-card"

/** Keyset id (lowercase hex) → the unit the mint gives for it, e.g. "sat". */
export type KeysetUnits = Record<string, string>

/** A card's unspent value per unit, and what no listed keyset accounts for. */
export type CardUnitTotals = {
  /** One entry per unit, sorted by unit, each the sum over that unit's keysets. */
  byUnit: { unit: string; amount: number }[]
  /** Unspent value in keysets the mint did not list: it has no unit we can name. */
  unknown: number
}

const KEYSETS_TIMEOUT_MS = 10_000

/**
 * Reads a NUT-02 `/v1/keysets` body. Entries without a string id and unit are
 * skipped rather than trusted; a body with no keyset list at all is an error,
 * so a proxy's HTML page cannot pass for "the mint has no keysets".
 */
export const parseKeysetUnits = (body: unknown): KeysetUnits => {
  const keysets = (body as { keysets?: unknown } | null | undefined)?.keysets
  if (!Array.isArray(keysets)) {
    throw new Error("mint keysets: response has no keysets list")
  }
  const units: KeysetUnits = {}
  keysets.forEach((keyset) => {
    const { id, unit } = (keyset ?? {}) as { id?: unknown; unit?: unknown }
    if (typeof id === "string" && id && typeof unit === "string" && unit) {
      units[id.toLowerCase()] = unit.toLowerCase()
    }
  })
  return units
}

/** One `GET <mint>/v1/keysets`, bounded by a timeout. */
export const fetchKeysetUnits = async (mintUrl: string): Promise<KeysetUnits> => {
  const { data } = await axios.get(`${mintUrl.replace(/\/+$/, "")}/v1/keysets`, {
    timeout: KEYSETS_TIMEOUT_MS,
    headers: { Accept: "application/json" },
  })
  return parseKeysetUnits(data)
}

const cache = new Map<string, Promise<KeysetUnits>>()

const keysetUnits = (mintUrl: string, refresh: boolean): Promise<KeysetUnits> => {
  const cached = cache.get(mintUrl)
  if (cached && !refresh) return cached
  const pending = fetchKeysetUnits(mintUrl)
  cache.set(mintUrl, pending)
  // A failed lookup is not remembered: the next read asks again.
  pending.catch(() => {
    if (cache.get(mintUrl) === pending) cache.delete(mintUrl)
  })
  return pending
}

/**
 * The unit of each of `keysetIds`, as `mintUrl` lists them. The list is cached
 * for the app session and fetched again once when it lacks one of the ids, so
 * a keyset the mint added since the last fetch is picked up. Ids the mint still
 * does not list are simply absent from the result. Rejects when the mint cannot
 * be reached or answers with something that is not a keyset list.
 */
export const unitsForKeysets = async (
  keysetIds: string[],
  mintUrl: string = CASHU_MINT_URL,
): Promise<KeysetUnits> => {
  const listsAll = (units: KeysetUnits) =>
    keysetIds.every((id) => units[id.toLowerCase()] !== undefined)
  const units = await keysetUnits(mintUrl, false)
  return listsAll(units) ? units : keysetUnits(mintUrl, true)
}

/** Groups a card's per-keyset totals by the unit the mint names for each keyset. */
export const totalsByUnit = (
  keysets: CardKeysetTotal[],
  units: KeysetUnits,
): CardUnitTotals => {
  const byUnit = new Map<string, number>()
  let unknown = 0
  keysets.forEach(({ keysetId, amount }) => {
    const unit = units[keysetId.toLowerCase()]
    if (unit === undefined) unknown += amount
    else byUnit.set(unit, (byUnit.get(unit) ?? 0) + amount)
  })
  return {
    byUnit: [...byUnit]
      .map(([unit, amount]) => ({ unit, amount }))
      .sort((a, b) => a.unit.localeCompare(b.unit)),
    unknown,
  }
}

/** The one unit every unspent proof on the card is in, if there is exactly one. */
export const soleUnit = ({ byUnit, unknown }: CardUnitTotals): string | undefined =>
  byUnit.length === 1 && unknown === 0 ? byUnit[0].unit : undefined
