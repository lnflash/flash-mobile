import { ToolReplyError } from "@app/assistant/registry/actions/shared/errors"
import { probeSendFee } from "@app/assistant/registry/actions/shared/fee"
import { PrepareRefusedError } from "@app/assistant/registry/refusals"
import { WalletCurrency } from "@app/graphql/generated"
import type { PaymentDetail } from "@app/screens/send-bitcoin-screen/payment-details/index.types"
import { toBtcMoneyAmount, toUsdMoneyAmount } from "@app/types/amounts"
import { fakeActionCtx } from "../fakes"

const btcDetail = (paymentType: string, destination: string) =>
  ({
    paymentType,
    destination,
    sendingWalletDescriptor: { id: "btc-1", currency: WalletCurrency.Btc },
    settlementAmount: toBtcMoneyAmount(2_100),
  } as unknown as PaymentDetail<WalletCurrency>)

const cashDetail = (getFee: jest.Mock | undefined) =>
  ({
    paymentType: "lightning",
    destination: "lnbc1",
    sendingWalletDescriptor: { id: "usd-1", currency: WalletCurrency.Usd },
    settlementAmount: toUsdMoneyAmount(500),
    canGetFee: getFee !== undefined,
    getFee,
  } as unknown as PaymentDetail<WalletCurrency>)

const failure = async (probe: Promise<unknown>) => {
  try {
    await probe
  } catch (err) {
    if (err instanceof ToolReplyError) return err.replyKey
    if (err instanceof PrepareRefusedError) return err.reason
    throw err
  }
  return undefined
}

describe("probeSendFee", () => {
  it("probes a BTC-wallet send through the rail, paying a Flash user at their Lightning address", async () => {
    const { ctx, btcRail } = fakeActionCtx()
    btcRail.probeFee.mockResolvedValue({ fee: 3, err: null })

    await expect(probeSendFee(btcDetail("intraledger", "alice"), ctx)).resolves.toEqual(
      toBtcMoneyAmount(3),
    )
    expect(btcRail.probeFee).toHaveBeenCalledWith({
      paymentType: "intraledger",
      paymentRequest: "alice@flashapp.me",
      amountSats: 2_100,
    })
  })

  it("probes a BTC-wallet LNURL send at its own address", async () => {
    const { ctx, btcRail } = fakeActionCtx()
    btcRail.probeFee.mockResolvedValue({ fee: 0, err: null })

    await probeSendFee(btcDetail("lnurl", "carol@blink.sv"), ctx)

    expect(btcRail.probeFee.mock.calls[0][0].paymentRequest).toBe("carol@blink.sv")
  })

  it("maps the rail's fee errors to replies, never to a fee of 0", async () => {
    const cases: [unknown, string][] = [
      [
        { kind: "amount-below-min", minSats: 1000 },
        "Assistant.amountOutsideRecipientLimits",
      ],
      [
        { kind: "amount-above-max", maxSats: 10 },
        "Assistant.amountOutsideRecipientLimits",
      ],
      [{ kind: "insufficient-funds", message: "short" }, "insufficientBalance"],
      [{ kind: "network", message: "offline" }, "Assistant.feeUnavailable"],
      [{ kind: "sdk", message: "boom" }, "Assistant.feeUnavailable"],
    ]
    for (const [err, expected] of cases) {
      const { ctx, btcRail } = fakeActionCtx()
      btcRail.probeFee.mockResolvedValue({ fee: null, err })

      await expect(
        failure(probeSendFee(btcDetail("lnurl", "carol@blink.sv"), ctx)),
      ).resolves.toBe(expected)
    }
    const { ctx, btcRail } = fakeActionCtx()
    btcRail.probeFee.mockResolvedValue({ fee: null, err: null })
    await expect(failure(probeSendFee(btcDetail("lnurl", "x@y.z"), ctx))).resolves.toBe(
      "Assistant.feeUnavailable",
    )
  })

  it("probes a cash-wallet send with the detail's own getFee and the fee triggers", async () => {
    const { ctx, actions } = fakeActionCtx()
    const getFee = jest.fn(async () => ({ amount: toUsdMoneyAmount(7) }))

    await expect(probeSendFee(cashDetail(getFee), ctx)).resolves.toEqual(
      toUsdMoneyAmount(7),
    )
    expect(getFee).toHaveBeenCalledWith(actions.feeProbes)
  })

  it("answers a cash-wallet probe that errs, has no amount, throws or cannot run as no fee", async () => {
    const getFees = [
      jest.fn(async () => ({
        amount: toUsdMoneyAmount(7),
        errors: [{ message: "no route" }],
      })),
      jest.fn(async () => ({ amount: null })),
      jest.fn(async () => {
        throw new Error("Network request failed")
      }),
    ]
    for (const getFee of getFees) {
      const { ctx } = fakeActionCtx()
      await expect(failure(probeSendFee(cashDetail(getFee), ctx))).resolves.toBe(
        "Assistant.feeUnavailable",
      )
    }
    const { ctx } = fakeActionCtx()
    await expect(failure(probeSendFee(cashDetail(undefined), ctx))).resolves.toBe(
      "Assistant.feeUnavailable",
    )
  })
})
