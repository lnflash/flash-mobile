// A till's offline payment of exactly AMOUNT from the card, no change
// (scripts/e2e/card-fixtures.ts serve, POST /spend/<amount>): pieces that add
// up to it, spent in one payment and redeemed at the mint. Fails when no
// pieces on the card add up to AMOUNT, as a till offline would refuse it.
const response = http.post(FIXTURES_URL + "/spend/" + AMOUNT, { body: "" })
if (!response.ok) {
  throw new Error("spend " + AMOUNT + " failed: " + response.status + " " + response.body)
}
output.spent = json(response.body)
