// Checks the card's unspent pieces form a covering ladder (ENG-700): sorted
// ascending, every piece is at most 1 + the sum of the smaller ones, so every
// amount from 1 to the balance pays exactly offline. Reads cardsim's GET /state.
const response = http.get(BRIDGE_URL + "/state")
if (!response.ok) throw new Error("cardsim /state failed: " + response.status)
const card = json(response.body)
const pieces = card.slots
  .filter((slot) => slot.status === "unspent")
  .map((slot) => slot.amount)
  .sort((a, b) => a - b)
let below = 0
pieces.forEach((piece) => {
  if (piece > below + 1) {
    throw new Error(
      "the card's pieces leave a gap at " + (below + 1) + ": " + pieces.join(","),
    )
  }
  below += piece
})
output.shape = { pieces: pieces, total: below }
