// Checks every unspent piece on the card kept the mint's DLEQ proof beside it
// (LOAD_PROOF P1 = 1): cardsim's GET /state lists it as `dleq` on the slot.
const response = http.get(BRIDGE_URL + "/state")
if (!response.ok) throw new Error("cardsim /state failed: " + response.status)
const card = json(response.body)
const missing = card.slots.filter((slot) => slot.status === "unspent" && !slot.dleq)
if (missing.length > 0) {
  throw new Error("slots without the mint's DLEQ: " + missing.map((s) => s.slot).join(", "))
}
