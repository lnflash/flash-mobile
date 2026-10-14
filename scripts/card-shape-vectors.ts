/**
 * The card-shape vectors (ENG-700): `targetPieces` for a set of balances, and
 * for a few short of slots, written to `__tests__/fixtures/card-shape-vectors.json`.
 *
 *   node_modules/.bin/tsx scripts/card-shape-vectors.ts
 *
 * That file is the canonical one. flash-pos (ENG-701) copies it verbatim, with
 * a `source` field naming the flash-mobile commit it came from, and both repos
 * assert every vector, so a till and a wallet cannot drift apart on the shape
 * without a test failing. `__tests__/utils/cashu-card-shape.spec.ts` checks
 * the file is exactly what this script writes.
 */
import { writeFileSync } from "fs"
import { join } from "path"
import { format, resolveConfig } from "prettier"

import { SPARE_PIECES, targetPieces } from "../app/utils/cashu-card-shape"

export type CardShapeVector = { balance: number; slotsFree?: number; pieces: number[] }

const BALANCES = [
  ...Array.from({ length: 64 }, (_, i) => i + 1),
  100,
  127,
  128,
  255,
  500,
  1000,
  1023,
  1024,
  4095,
  10_000,
  65_535,
  100_000,
  524_287,
  999_999,
  1_000_000,
]

/** Short of slots: the order the shape degrades in. */
const DEGRADED: [number, number][] = [
  [60, 11],
  [60, 9],
  [60, 8],
  [60, 4],
  [1000, 12],
  [1000, 10],
  [1000, 6],
]

export const cardShapeVectors = () => ({
  description:
    "ENG-700 canonical Cashu card shape: targetPieces(balance, slotsFree = 128), sorted ascending. Sorted, every piece is at most 1 + the sum of the smaller ones.",
  generator: "flash-mobile scripts/card-shape-vectors.ts",
  sparePieces: [...SPARE_PIECES],
  vectors: [
    ...BALANCES.map(
      (balance): CardShapeVector => ({
        balance,
        pieces: targetPieces(balance),
      }),
    ),
    ...DEGRADED.map(
      ([balance, slotsFree]): CardShapeVector => ({
        balance,
        slotsFree,
        pieces: targetPieces(balance, slotsFree),
      }),
    ),
  ],
})

export const CARD_SHAPE_VECTORS_PATH = join(
  __dirname,
  "..",
  "__tests__",
  "fixtures",
  "card-shape-vectors.json",
)

/** The file's text: the vectors as JSON, formatted by the repo's Prettier. */
export const cardShapeVectorsText = (): string =>
  format(JSON.stringify(cardShapeVectors()), {
    ...resolveConfig.sync(CARD_SHAPE_VECTORS_PATH),
    parser: "json",
  })

if (require.main === module) {
  writeFileSync(CARD_SHAPE_VECTORS_PATH, cardShapeVectorsText())
  console.log(`wrote ${CARD_SHAPE_VECTORS_PATH}`)
}
