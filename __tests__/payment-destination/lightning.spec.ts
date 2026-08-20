import { WalletCurrency } from "@app/graphql/generated"
import {
  PaymentDetail,
  CreateAmountLightningPaymentDetailsParams,
  CreateNoAmountLightningPaymentDetailsParams,
} from "@app/screens/send-bitcoin-screen/payment-details"

const mockCreateAmountLightningPaymentDetail = jest.fn<
  PaymentDetail<WalletCurrency>,
  [CreateAmountLightningPaymentDetailsParams<WalletCurrency>]
>()
const mockCreateNoAmountLightningPaymentDetail = jest.fn<
  PaymentDetail<WalletCurrency>,
  [CreateNoAmountLightningPaymentDetailsParams<WalletCurrency>]
>()

jest.mock("@app/screens/send-bitcoin-screen/payment-details", () => {
  return {
    createAmountLightningPaymentDetails: mockCreateAmountLightningPaymentDetail,
    createNoAmountLightningPaymentDetails: mockCreateNoAmountLightningPaymentDetail,
  }
})
import {
  createLightningDestination,
  resolveLightningDestination,
} from "@app/screens/send-bitcoin-screen/payment-destination"
import {
  noteInvoiceFirstSight,
  resetInvoiceFirstSight,
} from "@app/screens/send-bitcoin-screen/invoice-expiry"
import { InvalidLightningDestinationReason } from "@galoymoney/client"
import { defaultPaymentDetailParams } from "./helpers"
import { ZeroBtcMoneyAmount, toBtcMoneyAmount } from "@app/types/amounts"

describe("create lightning destination", () => {
  const baseParsedLightningDestination = {
    paymentType: "lightning",
    valid: true,
    paymentRequest: "testinvoice",
    memo: "testmemo",
  } as const

  // First sightings live in module state, and this file now writes to it.
  beforeEach(resetInvoiceFirstSight)
  afterEach(() => {
    resetInvoiceFirstSight()
    jest.restoreAllMocks()
  })

  describe("with amount", () => {
    const parsedLightningDestinationWithAmount = {
      ...baseParsedLightningDestination,
      amount: 1000,
    } as const
    it("correctly creates payment detail", () => {
      const amountLightningDestination = createLightningDestination(
        parsedLightningDestinationWithAmount,
      )

      amountLightningDestination.createPaymentDetail(defaultPaymentDetailParams)

      expect(mockCreateAmountLightningPaymentDetail).toBeCalledWith({
        paymentRequest: parsedLightningDestinationWithAmount.paymentRequest,
        paymentRequestAmount: toBtcMoneyAmount(
          parsedLightningDestinationWithAmount.amount,
        ),
        convertMoneyAmount: defaultPaymentDetailParams.convertMoneyAmount,
        destinationSpecifiedMemo: parsedLightningDestinationWithAmount.memo,
        sendingWalletDescriptor: defaultPaymentDetailParams.sendingWalletDescriptor,
      })
    })
  })

  describe("without amount", () => {
    const parsedLightningDestinationWithoutAmount = {
      ...baseParsedLightningDestination,
    } as const
    it("correctly creates payment detail", () => {
      const noAmountLightningDestination = createLightningDestination(
        parsedLightningDestinationWithoutAmount,
      )
      noAmountLightningDestination.createPaymentDetail(defaultPaymentDetailParams)
      expect(mockCreateNoAmountLightningPaymentDetail).toBeCalledWith({
        paymentRequest: parsedLightningDestinationWithoutAmount.paymentRequest,
        unitOfAccountAmount: ZeroBtcMoneyAmount,
        convertMoneyAmount: defaultPaymentDetailParams.convertMoneyAmount,
        destinationSpecifiedMemo: parsedLightningDestinationWithoutAmount.memo,
        sendingWalletDescriptor: defaultPaymentDetailParams.sendingWalletDescriptor,
      })
    })
  })

  // ENG-555. The expiry guard's primary signal is how long the invoice has
  // been in front of THIS user, and that reading is only worth anything if it
  // starts at a moment the invoice was provably alive. This is that moment:
  // `parsePaymentDestination` rejects an already-expired bolt11, so a
  // destination reaching `valid === true` was live one instant ago.
  //
  // Every later candidate is one screen too late. From here the user still has
  // to tap Next, and on the paste/blur path the destination screen has already
  // flipped to Valid and may be holding them in ConfirmDestinationModal — an
  // unbounded pause on a 60-second invoice that a reading taken on the amount
  // screen cannot see, which is how a corpse reaches the backend as "Something
  // went wrong".
  describe("first sight of the invoice", () => {
    // The real invoice from the incident: issued 1787243982, expires
    // 1787244042 — a 60-second window, per IBEX's cap.
    const INCIDENT_INVOICE =
      "lnbc1p4gwtwwpp5wwulk8jw0llvgjadwzuen6nxh7hgmddplj3evpgjc7n8l5kzqvmqdph2pshjgr5dusyvmrpwd5zq4mpd3kx2apq24ek2u36ypj8yetpv3kkz7qcqzzsxqzpusp5wane88x5twmdlpnu4cqrk4wd6g3tks7xgq798nt9zt68vmcnnp6q9qxpqysgqnszg0ycjk4255es2hdd3ajep3yquuvra6jn4k8shskhpzg80mrl9m9pgylahzq80aw9ekz6e47ycpcf558080xrxn6uljn54lc447rqpn9u06u"
    const ISSUED = 1787243982
    // The parse lands 4 seconds into the window, while the invoice is
    // unambiguously alive.
    const PARSED_SECONDS = ISSUED + 4

    it("registers the moment the destination is proved valid", () => {
      jest.spyOn(Date, "now").mockReturnValue(PARSED_SECONDS * 1000)

      createLightningDestination({
        ...baseParsedLightningDestination,
        paymentRequest: INCIDENT_INVOICE,
      })

      // Read back through the registrar itself: it returns the sighting on
      // record, so a later call reporting the parse instant proves this
      // function put it there and that every downstream call (amount screen,
      // confirm screen) is the no-op. If nothing had registered, this call
      // would install ISSUED + 200 and return it — and the elapsed duration
      // the guard measures would collapse to zero.
      expect(noteInvoiceFirstSight(INCIDENT_INVOICE, ISSUED + 200)).toBe(PARSED_SECONDS)
    })

    it("never registers a destination that failed to parse", () => {
      // Only `valid === true` destinations reach createLightningDestination,
      // so a half-typed invoice cannot pin a sighting to a string the user is
      // still editing — DestinationField re-parses on every keystroke. The
      // partial is carried on the invalid result here so that hoisting the
      // registration up into resolveLightningDestination, ahead of the
      // validity check, is caught rather than silently accepted.
      jest.spyOn(Date, "now").mockReturnValue(PARSED_SECONDS * 1000)

      const partial = INCIDENT_INVOICE.slice(0, 40)
      const result = resolveLightningDestination({
        paymentType: "lightning",
        valid: false,
        paymentRequest: partial,
        invalidReason: InvalidLightningDestinationReason.Unknown,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      expect(result.valid).toBe(false)
      // Nothing on record, so this call is what installs the reading.
      expect(noteInvoiceFirstSight(partial, ISSUED + 200)).toBe(ISSUED + 200)
    })
  })
})
