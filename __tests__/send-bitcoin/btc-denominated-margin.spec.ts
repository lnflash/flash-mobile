// Contract test for work order 06 (flash-onchain-send). Written by Claude; the
// worker makes it pass without changing it.
//
// A request that fixes its sats is paid from the Cash Account as sats: the
// server prices them at the mid rate, adds its margin and rounds UP to a whole
// cent (usd-cents-for-sats.ts on the server):
//
//   cents = Math.ceil(sats * centsPerSat * (1 + marginBps / 10_000)), marginBps 50
//
// The payment detail's settlement amount is that number, so every balance
// check sees what the server will debit. What is sent is still the request's
// sats. An amount in dollars, the Bitcoin Account and Lightning are untouched.
import { WalletCurrency } from "@app/graphql/generated"
import { checkAmountPlusFee } from "@app/screens/send-bitcoin-screen/amount-plus-fee"
import {
  AmountInvalidReason,
  BTC_DENOMINATED_SEND_MARGIN_BPS,
  ConvertMoneyAmount,
  cashCentsToDeliverSats,
  createAmountLightningPaymentDetails,
  createAmountOnchainPaymentDetails,
  createNoAmountOnchainPaymentDetails,
  isValidAmount,
} from "@app/screens/send-bitcoin-screen/payment-details"
import { toBtcMoneyAmount, toUsdMoneyAmount, toWalletAmount } from "@app/types/amounts"

/** The server's formula, written out as the server writes it. */
const serverCents = (sats: number, centsPerSat: number) =>
  Math.ceil(sats * centsPerSat * (1 + 50 / 10_000))

// A fixture price in cents per sat; sats round to whole sats, cents do not,
// as convertMoneyAmount does (app/utils/price-conversion.ts).
const at =
  (centsPerSat: number): ConvertMoneyAmount =>
  (money, currency) => ({
    amount:
      money.currency === currency
        ? money.amount
        : money.currency === "BTC"
        ? money.amount * centsPerSat
        : currency === "BTC"
        ? Math.round(money.amount / centsPerSat)
        : money.amount,
    currency,
    currencyCode: currency,
  })

const address = "bc1q-margin-recipient"

const fixedRequest = (currency: WalletCurrency, sats: number, centsPerSat = 0.1) =>
  createAmountOnchainPaymentDetails({
    address,
    destinationSpecifiedAmount: toBtcMoneyAmount(sats),
    convertMoneyAmount: at(centsPerSat),
    sendingWalletDescriptor: { id: `${currency}-wallet`, currency },
  })

describe("cashCentsToDeliverSats", () => {
  it("is the server's default margin, 50 basis points", () => {
    expect(BTC_DENOMINATED_SEND_MARGIN_BPS).toBe(50)
  })

  it("matches the server's formula at several rates", () => {
    const cases: [number, number, number][] = [
      // 50,000 sats at US$63,000 a bitcoin: 3,150 cents, 3,165.75 with the margin.
      [50_000, 0.063, 3_166],
      // 6,800 sats at ten sats a cent: 680 cents, 683.4 with the margin. Rounded
      // to the nearest cent this would be 683; the server rounds up.
      [6_800, 0.1, 684],
      // 0.0625 is exact in binary: 5,500 sats are 343.75 cents, 345.46875 with it.
      [5_500, 0.0625, 346],
      // A margin that lands on a whole cent adds no extra one.
      [20_000, 0.1, 2_010],
      [100_000, 0.1, 10_050],
      // One sat still costs a whole cent.
      [1, 0.1, 1],
    ]
    for (const [sats, centsPerSat, cents] of cases) {
      expect(cashCentsToDeliverSats(sats * centsPerSat)).toBe(cents)
      expect(cashCentsToDeliverSats(sats * centsPerSat)).toBe(
        serverCents(sats, centsPerSat),
      )
    }
  })

  it("leaves 0 at 0, and an amount that cannot be priced as NaN", () => {
    expect(cashCentsToDeliverSats(0)).toBe(0)
    expect(Number.isNaN(cashCentsToDeliverSats(NaN))).toBe(true)
  })
})

describe("a request that fixes its sats, paid from the Cash Account", () => {
  ;[WalletCurrency.Usd, WalletCurrency.Usdt].forEach((currency) => {
    it(`settles what the server debits from ${currency}: the margin, rounded up`, () => {
      const detail = fixedRequest(currency, 6_800)
      expect(detail.settlementAmount).toEqual({
        amount: 684,
        currency,
        currencyCode: currency,
      })
      expect(detail.settlementAmountIsEstimated).toBe(true)
      // The request itself is unchanged.
      expect(detail.destinationSpecifiedAmount).toEqual(toBtcMoneyAmount(6_800))
      expect(detail.unitOfAccountAmount).toEqual(toBtcMoneyAmount(6_800))
    })

    it(`still sends and probes the request's own sats from ${currency}`, async () => {
      const detail = fixedRequest(currency, 6_800)
      if (!detail.canSendPayment || !detail.canGetFee)
        throw new Error("the Cash Account cannot pay this request")

      const send = jest.fn().mockResolvedValue({
        data: {
          onChainUsdPaymentSendAsBtcDenominated: { status: "SUCCESS", errors: [] },
        },
      })
      await detail.sendPaymentMutation({
        onChainUsdPaymentSendAsBtcDenominated: send,
      } as never)
      expect(send).toHaveBeenCalledTimes(1)
      expect(send.mock.calls[0][0].variables.input).toMatchObject({
        walletId: `${currency}-wallet`,
        address,
        amount: 6_800,
      })

      const probe = jest.fn().mockResolvedValue({
        data: { onChainUsdTxFeeAsBtcDenominated: { amount: 37 } },
      })
      const fee = await detail.getFee({ onChainUsdTxFeeAsBtcDenominated: probe } as never)
      expect(probe.mock.calls[0][0].variables).toEqual({
        walletId: `${currency}-wallet`,
        address,
        amount: 6_800,
      })
      expect(fee.amount).toEqual(toWalletAmount({ amount: 37, currency }))
    })

    it(`refuses a ${currency} balance that covers the sats at the mid rate but not the margin`, () => {
      const balances = { btcWalletAmount: toBtcMoneyAmount(0) }
      const detail = fixedRequest(currency, 6_800)
      expect(
        isValidAmount({
          ...balances,
          usdWalletAmount: toUsdMoneyAmount(684),
          paymentDetail: detail,
        }),
      ).toEqual({ validAmount: true })
      expect(
        isValidAmount({
          ...balances,
          usdWalletAmount: toUsdMoneyAmount(683),
          paymentDetail: detail,
        }),
      ).toEqual({
        validAmount: false,
        invalidReason: AmountInvalidReason.InsufficientBalance,
        balance: toUsdMoneyAmount(683),
      })
    })

    it(`confirms from ${currency} a balance of exactly the margined amount plus fee, not a cent less`, () => {
      const detail = fixedRequest(currency, 6_800)
      const feeAmount = toWalletAmount({ amount: 37, currency })
      // 684 + 37 = 721 cents.
      expect(
        checkAmountPlusFee({
          settlementAmount: detail.settlementAmount,
          feeAmount,
          cashBalanceCents: 721,
        }),
      ).toBe("fits")
      expect(
        checkAmountPlusFee({
          settlementAmount: detail.settlementAmount,
          feeAmount,
          cashBalanceCents: 720,
        }),
      ).toBe("overCashBalance")
    })
  })

  it("keeps the 5,500-sat floor on the request's sats, not on its cents", () => {
    const balances = {
      usdWalletAmount: toUsdMoneyAmount(10_000),
      btcWalletAmount: toBtcMoneyAmount(0),
    }
    expect(
      isValidAmount({
        ...balances,
        paymentDetail: fixedRequest(WalletCurrency.Usd, 5_500),
      }),
    ).toEqual({ validAmount: true })
    expect(
      isValidAmount({
        ...balances,
        paymentDetail: fixedRequest(WalletCurrency.Usd, 5_499),
      }),
    ).toEqual({
      validAmount: false,
      invalidReason: AmountInvalidReason.MinOnChainSatLimit,
    })
  })
})

describe("what the margin does not touch", () => {
  it("leaves the Bitcoin Account paying the request's sats", () => {
    const detail = fixedRequest(WalletCurrency.Btc, 6_800)
    expect(detail.settlementAmount).toEqual(toBtcMoneyAmount(6_800))
    expect(detail.settlementAmountIsEstimated).toBe(false)
  })
  ;[WalletCurrency.Usd, WalletCurrency.Usdt].forEach((currency) => {
    it(`leaves an on-chain amount typed in dollars at its cents from ${currency}`, () => {
      const detail = createNoAmountOnchainPaymentDetails<WalletCurrency>({
        address,
        unitOfAccountAmount: { amount: 683, currency, currencyCode: currency },
        convertMoneyAmount: at(0.1),
        sendingWalletDescriptor: { id: "cash-wallet", currency },
      })
      expect(detail.settlementAmount.amount).toBe(683)
    })

    it(`leaves a Lightning invoice for a fixed number of sats at the mid rate from ${currency}`, () => {
      const detail = createAmountLightningPaymentDetails({
        paymentRequest: "lnbc68u1-margin-fixture",
        paymentRequestAmount: toBtcMoneyAmount(6_800),
        convertMoneyAmount: at(0.1),
        sendingWalletDescriptor: { id: "cash-wallet", currency },
      })
      expect(detail.settlementAmount.amount).toBe(680)
    })
  })
})
