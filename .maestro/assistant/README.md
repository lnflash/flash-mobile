# Ask Flash e2e flows (ENG-689)

Maestro flows for the assistant's two golden paths (docs/ai-assistant-tool-
registry.md §9), on the iOS simulator the Flashcard job already builds and
signs in on the Test instance (`.github/workflows/ios-e2e-card.yml`). They
reuse the card suite's sign-in (`../flashcard/subflows/login.yaml`), so they
take the same env: `E2E_TOKEN`, `BRIDGE_URL`, `MINT_URL`.

## Turning the assistant on

`assistantEnabled` follows Remote Config and is off. A development build
(`__DEV__`, which the e2e job's Debug build is) honours
`flash://dev/assistant?on=1`, which turns the assistant on for that run of the
app (`app/config/assistant-dev-override.ts`); a store build ignores it. A
local phone build can opt in with `ASSISTANT_DEV_LINK=true` in `.env`
(ENG-734).
`subflows/open-ask-flash.yaml` opens it after signing in, then taps the home
screen's Ask Flash button (`home-ask-flash`). Like the card bridge's link, it
also hides LogBox: the sign-in subflow relaunches the app, which brings LogBox
back, and its toasts sit over the thread's input and Ask button.

## Flows

| Flow                               | Tags                | What it proves                                                                 |
| ---------------------------------- | ------------------- | ------------------------------------------------------------------------------ |
| `check-balance.yaml`               | `assistant`         | "what's my balance" is read by the grammar and answered live, not from cache   |
| `send-contact-confirm-result.yaml` | `assistant, funded` | "send 0.02 usd to <contact>" gives a confirm card, and Confirm sends it        |

## The funded tag

The send golden path moves real money on the Test instance, which settles on
mainnet. It needs a dedicated funded Test sender with CI credentials and a
dedicated payee in its contacts (ENG-710's blocker record lists what else). Until
those exist, CI runs `maestro test .maestro/assistant/ --exclude-tags funded`.
Run it locally against a funded account:

```
maestro test --env E2E_TOKEN=... --env BRIDGE_URL=... --env MINT_URL=... \
  --env CONTACT=<payee> --env AMOUNT=0.02 .maestro/assistant/send-contact-confirm-result.yaml
```
