import { OperationDefinitionNode } from "graphql"

import { noRetryOperations } from "@app/graphql/no-retry-operations"
import {
  FygaroCheckoutCreateDocument,
  IntraLedgerPaymentSendDocument,
  LnInvoicePaymentSendDocument,
  OnChainPaymentSendDocument,
} from "@app/graphql/generated"
import type { DocumentNode } from "@apollo/client"

// The name the RetryLink actually compares against is the one baked into the
// operation definition, not a string typed into a list by hand. Reading it
// from the generated document is what makes a rename fail here instead of
// silently re-enabling retries on a mutation that moves money.
const operationName = (doc: DocumentNode): string => {
  const definition = doc.definitions.find(
    (d): d is OperationDefinitionNode => d.kind === "OperationDefinition",
  )
  if (!definition?.name?.value) throw new Error("document has no named operation")
  return definition.name.value
}

describe("noRetryOperations", () => {
  it("never replays a checkout request, which MINTS an allowance reservation", () => {
    // `fygaroCheckoutCreate` is not a read. Each call reserves the amount
    // against the customer's own daily allowance, and the backend subtracts
    // holds from `remaining` the moment they exist — so a replay costs the
    // customer their limit even though nothing was charged.
    //
    // The retry link fires on ANY link error that is not a 401, including the
    // ones where the resolver committed and only the RESPONSE was lost (a
    // gateway 502, a dropped socket). Five attempts at ~300ms exponential
    // backoff all land inside CardPayment's 10s deadline, so one Continue tap
    // for $60 against a $125 allowance can end up holding $180: the customer
    // pays nothing, is told "Nothing has been charged — try again", and is
    // then locked out of card top-ups until the duplicate holds lapse.
    expect(noRetryOperations).toContain(operationName(FygaroCheckoutCreateDocument))
  })

  it("still covers every payment-send mutation it was written for", () => {
    // The list is only as good as the names in it; a rename upstream would
    // quietly re-arm the retry for these too.
    ;[
      IntraLedgerPaymentSendDocument,
      LnInvoicePaymentSendDocument,
      OnChainPaymentSendDocument,
    ].forEach((doc) => expect(noRetryOperations).toContain(operationName(doc)))
  })

  it("has no duplicate entries", () => {
    expect(new Set(noRetryOperations).size).toBe(noRetryOperations.length)
  })
})
