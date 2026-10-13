// Proves the card holds PIN: SELECT (the full 2.0 applet AID, the one the app
// sends first: ENG-681), then VERIFY_PIN in the clear (P1 = 0, which a sealed
// card takes too) straight to cardsim. A right PIN costs nothing; the SELECT
// ends the session it opened.
const send = (hex) => {
  const response = http.post(BRIDGE_URL + "/apdu", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hex: hex }),
  })
  if (!response.ok) throw new Error("cardsim /apdu failed: " + response.status)
  return json(response.body).sw
}
const select = send("00A404000BF04341534855434152440100")
if (select !== "9000") throw new Error("SELECT answered " + select)
let pinHex = ""
for (let i = 0; i < PIN.length; i += 1) pinHex += PIN.charCodeAt(i).toString(16)
const verify = send("B0400000" + ("0" + PIN.length.toString(16)).slice(-2) + pinHex)
if (verify !== "9000") throw new Error("VERIFY_PIN " + PIN + " answered " + verify)
send("00A404000BF04341534855434152440100")
