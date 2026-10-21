export const AUDITION_VOICES = [
  { id: "af_heart", name: "Heart", language: "en-US" },
  { id: "am_michael", name: "Michael", language: "en-US" },
  { id: "bf_emma", name: "Emma", language: "en-GB" },
] as const
export const AUDITION_SCRIPTS = [
  {
    id: "welcome",
    text: "Hello, I'm Flash. I can help you find your way around your wallet.",
  },
  {
    id: "guidance",
    text: "To receive money, open Receive and share your Flash address or a payment request.",
  },
  {
    id: "amounts",
    text: "Here is an example, not your wallet balance: twelve US dollars and fifty cents, and two thousand five hundred satoshis.",
  },
] as const
