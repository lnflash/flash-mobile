import * as fs from "fs"
import * as path from "path"

// The manual mock at __mocks__/@breeztech/breez-sdk-spark-react-native.js
// claims its *_Tags objects mirror the SDK's generated enums verbatim. That
// claim has silently drifted before: a member missing from the mock reads as
// `undefined`, every tag comparison against it goes false, and a test passes
// green while asserting the wrong branch. This spec pins the claim to the
// installed package's generated d.ts so drift fails loudly on SDK bumps.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mock = require("../../__mocks__/@breeztech/breez-sdk-spark-react-native.js")

const generatedDts = fs.readFileSync(
  path.join(
    __dirname,
    "../../node_modules/@breeztech/breez-sdk-spark-react-native/lib/typescript/module/src/generated/breez_sdk_spark.d.ts",
  ),
  "utf8",
)

const realEnumMembers = (enumName: string): Record<string, string | number> => {
  const enumBlock = generatedDts.match(
    new RegExp(`export declare enum ${enumName} \\{([\\s\\S]*?)\\}`),
  )
  if (!enumBlock) {
    throw new Error(`enum ${enumName} not found in generated d.ts`)
  }
  const members: Record<string, string | number> = {}
  // Matches both string enums (`Synced = "Synced"`) and numeric enums
  // (`Completed = 0`) — the numeric ones (PaymentStatus, PaymentType) are the
  // ones that drifted destructively before (string values under a "Complete"
  // key), so both shapes must be pinned.
  for (const member of enumBlock[1].matchAll(/(\w+) = ("[^"]+"|\d+)/g)) {
    const rawValue = member[2]
    members[member[1]] = rawValue.startsWith('"')
      ? rawValue.slice(1, -1)
      : Number(rawValue)
  }
  if (Object.keys(members).length === 0) {
    throw new Error(`enum ${enumName} matched no members in generated d.ts`)
  }
  return members
}

describe("breez-sdk-spark manual mock parity with the generated SDK enums", () => {
  it("SdkEvent_Tags mirrors the generated enum exactly — members and values", () => {
    expect(mock.SdkEvent_Tags).toEqual(realEnumMembers("SdkEvent_Tags"))
  })

  it("PaymentRequest_Tags mirrors the generated enum exactly — members and values", () => {
    expect(mock.PaymentRequest_Tags).toEqual(realEnumMembers("PaymentRequest_Tags"))
  })

  it("PaymentStatus mirrors the generated numeric enum exactly — members and values", () => {
    expect(mock.PaymentStatus).toEqual(realEnumMembers("PaymentStatus"))
  })

  it("PaymentType mirrors the generated numeric enum exactly — members and values", () => {
    expect(mock.PaymentType).toEqual(realEnumMembers("PaymentType"))
  })
})
