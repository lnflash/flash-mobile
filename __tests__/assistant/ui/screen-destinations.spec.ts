import { readScreenDestination } from "@app/assistant/ui/screen-destinations"

describe("named Ask Flash destinations", () => {
  const destinations = [
    ["Where is the map?", "map"],
    ["Can you open the map, please?", "map"],
    ["Open my contacts", "contacts"],
    ["Take me to in-app support", "support"],
    ["Where is my chat profile?", "chatProfile"],
    ["How do I get to bank accounts?", "bankAccounts"],
    ["Show me notification settings", "notifications"],
    ["Open wallet backup", "backup"],
    ["Go to payment history", "history"],
    ["Turn on my Bitcoin wallet", "bitcoinWalletOn"],
    ["Enable BTC wallet", "bitcoinWalletOn"],
    ["Turn off the Bitcoin wallet", "bitcoinWalletOff"],
    ["Turn off advance mode", "bitcoinWalletOff"],
  ] as const
  destinations.forEach(([question, expected]) =>
    it(`resolves ${question} locally`, () => {
      expect(readScreenDestination(question)).toBe(expected)
    }),
  )
  const unmatched = [
    "Send 500 to Map",
    "Show me the payment to Bob",
    "Open Bob's chat profile",
    "Open a bank account for Alice",
    "What's my Flash address?",
    "How do I cash out to my account?",
    "Open https://example.com/map",
  ]
  unmatched.forEach((question) =>
    it(`does not route a financial or parameterized request: ${question}`, () => {
      expect(readScreenDestination(question)).toBeUndefined()
    }),
  )
})
