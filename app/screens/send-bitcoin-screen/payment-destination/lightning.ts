import { WalletCurrency } from "@app/graphql/generated"
import {
  InvalidLightningDestinationReason,
  LightningPaymentDestination,
} from "@galoymoney/client"
import { noteInvoiceFirstSight } from "../invoice-expiry"
import {
  createAmountLightningPaymentDetails,
  createNoAmountLightningPaymentDetails,
} from "../payment-details"
import {
  CreatePaymentDetailParams,
  DestinationDirection,
  InvalidDestinationReason,
  ParseDestinationResult,
  PaymentDestination,
} from "./index.types"
import { ZeroBtcMoneyAmount, toBtcMoneyAmount } from "@app/types/amounts"

export const resolveLightningDestination = (
  parsedLightningDestination: LightningPaymentDestination,
): ParseDestinationResult => {
  if (parsedLightningDestination.valid === true) {
    return createLightningDestination(parsedLightningDestination)
  }

  return {
    valid: false,
    invalidPaymentDestination: parsedLightningDestination,
    invalidReason: mapInvalidReason(parsedLightningDestination.invalidReason),
  }
}

export const createLightningDestination = (
  parsedLightningDestination: LightningPaymentDestination & { valid: true },
): PaymentDestination => {
  const { paymentRequest, amount, memo } = parsedLightningDestination

  // Start the expiry clock HERE — the first and only moment this device's own
  // clock has certified the invoice alive. `parsePaymentDestination` rejects an
  // already-expired bolt11, so reaching `valid === true` is proof the invoice
  // was live one instant ago, by the same clock the guard later reads. That is
  // exactly the property the elapsed-since-first-sight signal needs (see
  // ../invoice-expiry.ts): from a reading taken at a certified-alive moment,
  // "a whole lifetime has passed under this user" really does mean dead.
  //
  // The amount screen is one screen too late. Between here and there the user
  // has to tap Next, and on the paste/blur path the destination screen has
  // already flipped to Valid and may be holding them in ConfirmDestinationModal
  // — an unbounded pause on a 60-second invoice that no later reading can see
  // (ENG-555). A `lightning:` deep link pre-fills the field the same way.
  //
  // Registration is idempotent and keyed by the bolt11 itself, so the amount
  // and confirm screens' identical calls collapse into no-ops and the reading
  // they use is this one. Only `valid === true` destinations reach this
  // function, so a half-typed invoice never registers.
  noteInvoiceFirstSight(paymentRequest, Math.floor(Date.now() / 1000))

  let createPaymentDetail

  if (amount) {
    createPaymentDetail = <T extends WalletCurrency>({
      convertMoneyAmount,
      sendingWalletDescriptor,
    }: CreatePaymentDetailParams<T>) => {
      return createAmountLightningPaymentDetails({
        paymentRequest,
        sendingWalletDescriptor,
        paymentRequestAmount: toBtcMoneyAmount(amount),
        convertMoneyAmount,
        destinationSpecifiedMemo: memo,
      })
    }
  } else {
    createPaymentDetail = <T extends WalletCurrency>({
      convertMoneyAmount,
      sendingWalletDescriptor,
    }: CreatePaymentDetailParams<T>) => {
      return createNoAmountLightningPaymentDetails({
        paymentRequest,
        sendingWalletDescriptor,
        convertMoneyAmount,
        destinationSpecifiedMemo: memo,
        unitOfAccountAmount: ZeroBtcMoneyAmount,
      })
    }
  }

  return {
    valid: true,
    destinationDirection: DestinationDirection.Send,
    validDestination: parsedLightningDestination,
    createPaymentDetail,
  }
}

const mapInvalidReason = (
  invalidLightningReason: InvalidLightningDestinationReason,
): InvalidDestinationReason => {
  switch (invalidLightningReason) {
    case InvalidLightningDestinationReason.InvoiceExpired:
      return InvalidDestinationReason.InvoiceExpired
    case InvalidLightningDestinationReason.WrongNetwork:
      return InvalidDestinationReason.WrongNetwork
    case InvalidLightningDestinationReason.Unknown:
      return InvalidDestinationReason.UnknownLightning
  }
}
