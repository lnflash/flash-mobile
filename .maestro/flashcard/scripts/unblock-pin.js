// The holder's way out of a blocked PIN is not in the app yet (out of scope
// for ENG-634): UNBLOCK_PIN with the fixture PUK 12345678 and new PIN 1234,
// straight to cardsim. SELECT first, as a new tap does.
// UNBLOCK_PIN = B0 45 00 00 0E | 08 "12345678" | 04 "1234"
// (unblockPinApdu in scripts/e2e/card-fixtures-lib.ts; its spec pins these bytes).
const send = (hex) => {
  const response = http.post(BRIDGE_URL + "/apdu", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hex: hex }),
  })
  if (!response.ok) throw new Error("cardsim /apdu failed: " + response.status)
  return json(response.body).sw
}
const select = send("00A4040007D276000085010200")
if (select !== "9000") throw new Error("SELECT answered " + select)
const unblock = send("B04500000E0831323334353637380431323334")
if (unblock !== "9000") throw new Error("UNBLOCK_PIN answered " + unblock)
