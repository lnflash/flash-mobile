import {
  journaledBtcRail,
  journaledSendDeps,
  UNRECORDED_ONCHAIN_SEND,
} from "@app/assistant/registry/actions/shared/journal"
import type { BtcRail } from "@app/payments/btc-rail"
import { fakeBtcRail, fakeSendTriggers } from "../fakes"

describe("journaledBtcRail", () => {
  const sends: [keyof BtcRail, unknown[]][] = [
    ["payInvoice", ["lnbc1", 2100]],
    ["payLnurl", ["alice@flashapp.me", 2100, ""]],
    // The attempt's key (ENG-714) reaches the rail with the rest.
    ["payOnchain", ["bc1q", 6000, "fast", "attempt-key"]],
  ]

  sends.forEach(([method, args]) => {
    it(`writes a keyless dispatch down before ${method} sends`, async () => {
      const order: string[] = []
      const rail = fakeBtcRail()
      ;(rail[method] as jest.Mock).mockImplementation(async () => {
        order.push("send")
        return { sent: true }
      })
      const journalDispatch = jest.fn(async (key: string | null) => {
        order.push(`journal:${key}`)
      })

      const journaled = journaledBtcRail(rail as unknown as BtcRail, journalDispatch)
      const call = journaled[method] as (...a: unknown[]) => Promise<unknown>

      await expect(call(...args)).resolves.toEqual({ sent: true })
      expect(order).toEqual(["journal:null", "send"])
      expect((rail[method] as jest.Mock).mock.calls[0]).toEqual(args)
    })
  })

  // A write that fails sends nothing, and says so as the send's own wrapper
  // reports a refusal before its dispatch, so sendPayment reads it as one.
  sends
    .filter(([method]) => method !== "payOnchain")
    .forEach(([method, args]) =>
      it(`sends nothing through ${method} when the dispatch cannot be written down`, async () => {
        const rail = fakeBtcRail()
        const journal = jest.fn(async () => {
          throw new Error("disk full")
        })

        const call = journaledBtcRail(rail as unknown as BtcRail, journal)[method] as (
          ...a: unknown[]
        ) => Promise<unknown>

        await expect(call(...args)).rejects.toThrow("disk full")
        expect(rail[method]).not.toHaveBeenCalled()
      }),
    )

  it("sends nothing through payOnchain when the dispatch cannot be written down, and answers the refusal instead of rejecting", async () => {
    // Since ENG-714 sendPayment keeps Confirm disarmed on any rejection out of
    // payOnchain, as a withdrawal that may have left; payOnchainBreez answers
    // every refusal before its dispatch with success: false (spec v0.2.10 §5).
    const rail = fakeBtcRail()
    const journal = jest.fn(async () => {
      throw new Error("disk full")
    })

    await expect(
      journaledBtcRail(rail as unknown as BtcRail, journal).payOnchain(
        "bc1q",
        6000,
        "medium",
        "attempt-key",
      ),
    ).resolves.toEqual({ success: false, error: UNRECORDED_ONCHAIN_SEND })
    expect(rail.payOnchain).not.toHaveBeenCalled()
  })

  it("passes the reads and the prepare members through untouched", async () => {
    const rail = fakeBtcRail()
    const journal = jest.fn()
    const journaled = journaledBtcRail(rail as unknown as BtcRail, journal)

    expect(journaled.getBalanceSats).toBe(rail.getBalanceSats)
    expect(journaled.probeFee).toBe(rail.probeFee)
    expect(journaled.createInvoice).toBe(rail.createInvoice)
    await journaled.getBalanceSats()
    expect(journal).not.toHaveBeenCalled()
  })
})

describe("journaledSendDeps", () => {
  it("journals the GraphQL triggers and the rail's sends, and keeps the endpoint and host", async () => {
    const mutations = fakeSendTriggers()
    mutations.intraLedgerUsdPaymentSend.mockResolvedValue({ data: {} })
    const rail = fakeBtcRail()
    const journalDispatch = jest.fn(async () => undefined)

    const deps = journaledSendDeps(
      {
        send: {
          mutations: mutations as never,
          graphqlUri: "https://api.example/graphql",
          lnAddressHostname: "flashapp.me",
        },
        btcRail: rail as unknown as BtcRail,
      },
      journalDispatch,
    )
    await deps.mutations.intraLedgerUsdPaymentSend({
      variables: {
        input: { walletId: "w", recipientWalletId: "r", amount: 1, idempotencyKey: "k1" },
      },
    })
    await deps.btcRail.payLnurl("alice@flashapp.me", 1, "")

    expect(journalDispatch.mock.calls).toEqual([["k1"], [null]])
    expect(deps.graphqlUri).toBe("https://api.example/graphql")
    expect(deps.lnAddressHostname).toBe("flashapp.me")
  })
})
