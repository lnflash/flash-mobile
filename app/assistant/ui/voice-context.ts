import { FLASH_USERNAME } from "../registry/read/lookup-flash-username"

const COMMANDS = [
  "What's my balance",
  "Show my balance",
  "Show my contacts",
  "Open support chat",
  "How do I receive money",
  "What's my Flash address",
  "Turn on my Bitcoin wallet",
  "Turn off my Bitcoin wallet",
  "Add as a contact",
  "Remove from my contacts",
  "Show me their profile",
  "Swap USD to Bitcoin",
  "Swap Bitcoin to USD",
]

/** Vocabulary hints only: the offline recognizer still returns what it hears. */
export const voiceContext = (usernames: readonly string[]): string[] => {
  const names = [...new Set(usernames)]
    .filter((name) => FLASH_USERNAME.test(name))
    .slice(-12)
  return [
    ...COMMANDS,
    ...names.flatMap((name) => [
      name,
      `Add ${name} as a contact`,
      `Add ${name} to my contacts`,
      `Remove ${name} from my contacts`,
      `Pay ${name}`,
      `Send to ${name}`,
      `Show me ${name}'s profile`,
    ]),
  ]
}
