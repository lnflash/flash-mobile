// Reads cardsim's GET /state into output.card: counts, PIN state, balance.
const response = http.get(BRIDGE_URL + "/state")
if (!response.ok) throw new Error("cardsim /state failed: " + response.status)
output.card = json(response.body)
