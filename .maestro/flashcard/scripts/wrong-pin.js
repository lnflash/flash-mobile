// Reads the PIN try counter without the app: SELECT, then one VERIFY_PIN with
// 9999 (a PIN no fixture holds) straight to cardsim, and checks the card
// answers EXPECT_SW. 63CX names the tries left after this one (spec/APDU.md,
// VERIFY_PIN), so 63C2 means the counter stood at its limit of three. It
// costs a try; the SELECT after it ends the session.
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
// VERIFY_PIN = B0 40 00 00 04 | "9999"
const verify = send("B040000004" + "39393939")
if (verify !== EXPECT_SW) {
  throw new Error("VERIFY_PIN 9999 answered " + verify + ", expected " + EXPECT_SW)
}
send("00A4040007D276000085010200")
