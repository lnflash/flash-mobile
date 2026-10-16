import { checkLimit } from "@app/assistant/registry/actions/shared/limits"
import { PrepareRefusedError } from "@app/assistant/registry/refusals"
import { fakeActionCtx } from "../fakes"

const limit = (remainingLimit: number | null) => ({
  __typename: "OneDayAccountLimit",
  totalLimit: 100_000,
  remainingLimit,
  interval: 86_400,
})

const setup = (limits: Record<string, ReturnType<typeof limit>[]>) => {
  const { ctx, graphql } = fakeActionCtx()
  graphql.accountLimits.mockResolvedValue({
    withdrawal: [],
    internalSend: [],
    convert: [],
    ...limits,
  })
  return ctx
}

describe("checkLimit", () => {
  it("lets a payment within the remaining limit of its bucket through", async () => {
    const ctx = setup({ internalSend: [limit(5_000)] })

    await expect(checkLimit(ctx, "internalSend", 5_000)).resolves.toBeUndefined()
  })

  it("refuses one over its bucket's remaining limit with the limit card", async () => {
    const ctx = setup({ withdrawal: [limit(5_000)] })

    const refused = checkLimit(ctx, "withdrawal", 5_001)
    await expect(refused).rejects.toBeInstanceOf(PrepareRefusedError)
    await expect(refused).rejects.toMatchObject({ reason: "limitExceeded" })
  })

  it("counts only the payment's own bucket", async () => {
    const ctx = setup({ withdrawal: [limit(0)], convert: [limit(0)] })

    await expect(checkLimit(ctx, "internalSend", 1_000_000)).resolves.toBeUndefined()
  })

  it("reads a remaining limit of 0 as nothing left, where the screen reads it as no limit", async () => {
    const ctx = setup({ convert: [limit(0)] })

    await expect(checkLimit(ctx, "convert", 1)).rejects.toMatchObject({
      reason: "limitExceeded",
    })
  })

  it("leaves a limit the server does not report to the server", async () => {
    const ctx = setup({ withdrawal: [limit(null)] })

    await expect(checkLimit(ctx, "withdrawal", 10_000_000)).resolves.toBeUndefined()
  })

  it("checks every limit in the bucket", async () => {
    const ctx = setup({ withdrawal: [limit(9_000), limit(100)] })

    await expect(checkLimit(ctx, "withdrawal", 500)).rejects.toMatchObject({
      reason: "limitExceeded",
    })
  })
})
