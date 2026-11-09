/**
 * ENG-826, decision 5: the app keeps its own GET_CARD / SET_CARD codec
 * (`parseCardRecord`, `cardRecordValue`) and holds it to cardkit's. The
 * vectors below were produced by cashucard `tools/cardkit/gp/configuration.ts`
 * (`encodeCardRecord`, `decodeCardRecord`) at df3f0bf06338a38ba5d422aae37651bef6ce009f,
 * the applet ref ios-e2e-card.yml pins (CASHU_JAVACARD_REF). Re-generate them
 * from that file when the pin moves.
 *
 * Known difference, kept: cardkit always appends the design (3 bytes) to
 * SET_CARD's value; the app sends none, which spec/APDU.md (SET_CARD) allows
 * ("[design (3)]") and the card stores as zeros. cardkit's decoder is also
 * stricter about framing (reserved bytes, exact length); the app's is not
 * tightened here.
 */
import { cardRecordValue, parseCardRecord } from "../../app/utils/cashu-card"
import { limitValue } from "../../app/utils/cashu-card-owner"

const fromHex = (h: string) => (h.match(/../g) ?? []).map((x) => parseInt(x, 16))
const hex = (b: number[]) => b.map((x) => x.toString(16).padStart(2, "0")).join("")

/** encodeCardRecord({ unit: 0, mint, refundKey: 33 zeros, design: null }) at df3f0bf. */
const ENCODED: [string, string][] = [
  [
    "https://mint.test",
    "00" +
      "00".repeat(33) +
      "00".repeat(65) +
      "11" +
      "68747470733a2f2f6d696e742e74657374" +
      "000000",
  ],
  [
    "https://forge.flashapp.me",
    "00" +
      "00".repeat(33) +
      "00".repeat(65) +
      "19" +
      "68747470733a2f2f666f7267652e666c6173686170702e6d65" +
      "000000",
  ],
]

/** GET_CARD bodies and what decodeCardRecord made of them at df3f0bf. */
const DECODED = [
  {
    body:
      "04010000001388000000000000000000000000000000000000000000000000000000000000000000" +
      "00000000111111111111111111111111111111111111111111111111111111111111111102000100" +
      "000000000000000000000000000000000000000000000000001168747470733a2f2f6d696e742e74" +
      "657374000000",
    cardkit: {
      recordSet: true,
      unit: 0,
      mint: "https://mint.test",
      refundKey: "00".repeat(33),
      design: null,
      dailySats: 5000,
      lastHeader: "11".repeat(32),
      rolls: 2,
      rolloverBudget: 7,
      allowanceArmed: true,
    },
  },
  {
    body:
      "0401000000000002abababababababababababababababababababababababababababababababab" +
      "17021ec52222222222222222222222222222222222222222222222222222222222222222000c0000" +
      "00000000000000000000000000000000000000000000000000016d464c31",
    cardkit: {
      recordSet: true,
      unit: 0,
      mint: "m",
      refundKey: "02" + "ab".repeat(32),
      design: "FL1",
      dailySats: 0,
      lastHeader: "22".repeat(32),
      rolls: 0,
      rolloverBudget: 12,
      allowanceArmed: false,
    },
  },
]

describe("the app's card record codec matches cardkit's (df3f0bf)", () => {
  for (const [mint, encoded] of ENCODED) {
    it(`SET_CARD's value for ${mint} is cardkit's, without the optional design`, () => {
      const value = cardRecordValue({ mint })
      expect(hex(value)).toBe(encoded.slice(0, -6))
      // cardkit's own design for none is three zeros: what the card then holds.
      expect(encoded.slice(-6)).toBe("000000")
    })
  }

  for (const { body, cardkit } of DECODED) {
    it(`GET_CARD for ${cardkit.mint} decodes as cardkit decodes it`, () => {
      const record = parseCardRecord(fromHex(body))
      expect({
        recordSet: record.recordSet,
        unit: record.unit,
        mint: record.mint,
        refundKey: record.refundKey ?? "00".repeat(33),
        design: record.design,
        dailySats: record.dailyLimit,
        lastHeader: record.lastHeader,
        rolls: record.rolls,
        rolloverBudget: record.rollBudget,
        allowanceArmed: record.allowanceArmed,
      }).toEqual(cardkit)
    })
  }
})

/**
 * ENG-827: SET_LIMIT's thirteen-byte value (`limitValue`) held to cardkit's
 * `encodeOwnerLimits` (tools/cardkit/gp/configuration.ts at df3f0bf, the same
 * pin as above; identical at 09e16b0). Re-generate from that file when the
 * pin moves.
 */
const LIMIT_VECTORS: [
  { dailySats: number; paymentSats: number; noPinSats: number; rolloverBudget: number },
  string,
][] = [
  [
    { dailySats: 0, paymentSats: 0, noPinSats: 0, rolloverBudget: 7 },
    "00000000000000000000000007",
  ],
  [
    { dailySats: 50000, paymentSats: 21000, noPinSats: 2500, rolloverBudget: 12 },
    "0000c35000005208000009c40c",
  ],
  [
    { dailySats: 4294967295, paymentSats: 1, noPinSats: 0, rolloverBudget: 30 },
    "ffffffff00000001000000001e",
  ],
]

describe("the app's SET_LIMIT value matches cardkit's (df3f0bf)", () => {
  for (const [limits, encoded] of LIMIT_VECTORS) {
    it(`limitValue(${JSON.stringify(limits)}) is cardkit's encodeOwnerLimits`, () => {
      expect(
        hex(
          limitValue({
            day: limits.dailySats,
            payment: limits.paymentSats,
            allowance: limits.noPinSats,
            rollBudget: limits.rolloverBudget,
          }),
        ),
      ).toBe(encoded)
    })
  }
})
