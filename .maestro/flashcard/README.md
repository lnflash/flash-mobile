# Flashcard e2e flows (ENG-634)

Maestro flows that drive the Flashcard v2 screens on an iOS simulator against
a simulated card. The card is the real cashu-javacard applet running in
jCardSim behind a loopback HTTP bridge (`tools/cardsim` in
[lnflash/cashu-javacard](https://github.com/lnflash/cashu-javacard)); the mint
is a local Nutshell on FakeWallet. No NFC hardware, no phone and no production
system is involved.

## How the app reaches the card

Development builds only (`__DEV__`); a release build contains none of it.

- `flash://dev/card-bridge?url=<bridge>&mint=<mint>&stubPay=1` points the card
  flows at the bridge and the top-up at the dev mint, and turns on the pay
  stub: the Cash wallet's payment of the mint's invoice is skipped and reads
  as paid. The production mint is refused as a dev mint, and the stub needs a
  dev mint. `flash://dev/card-bridge?off=1` goes back to NFC.
- `flash://dev/card-tap` taps the card, as the card controls do.
- The developer screen has the same controls (Card bridge section).
- Nothing is persisted: every flow sets the bridge again after its launch.

## Fixtures

`node_modules/.bin/tsx scripts/e2e/card-fixtures.ts serve` answers
`POST /load/<name>` and provisions a brand-new card through the applet's own
commands, with proofs minted at the dev mint:

| Fixture      | Card                                                                          |
| ------------ | ----------------------------------------------------------------------------- |
| `fresh`      | empty, no PIN                                                                 |
| `loaded`     | 21 sat in 3 slots (16, 4, 1), PUK `12345678`, PIN `1234`                      |
| `spent`      | `loaded`, with slots 1 and 2 spent on the card and SPENT at the mint          |
| `full`       | 32 slots of 1 sat, no PIN                                                     |
| `blocked`    | `loaded`, PIN blocked by three wrong tries                                    |
| `loaded-0.4` | `loaded` on an applet 0.4 card (cardsim's version mask): no PUK, no CLEAR_PIN |

## Flows

`balance-read`, `set-pin`, `change-pin`, `remove-pin`, `pin-wrong-then-right`,
`pin-blocked` (three wrong PINs, then `UNBLOCK_PIN` straight to the bridge:
there is no in-app unblock yet), `topup` (reclaims the two spent slots and
loads), `topup-full` (no room), `remove-pin-absent-0.4` (a 0.4 card offers
no Remove PIN). Every flow signs in from a clean install
(`subflows/login.yaml`), with the Keychain cleared: top-up records live there.

Assertions use testIDs, not text, so the device locale does not matter. Taps
use testIDs too; no flow taps a screen coordinate.

## Running locally

```sh
# cashu-javacard at the ref the workflow pins
mvn -B -f tools/cardsim/pom.xml package -DskipTests
java -jar tools/cardsim/target/cardsim.jar --port 9876

# Nutshell on FakeWallet, v1 keyset ids (a card slot holds an 8-byte id)
pip install cashu==0.21.0 "marshmallow<4" "limits<4"
VERSION=0.19.2 MINT_PRIVATE_KEY=e2e-local-only \
  MINT_BACKEND_BOLT11_SAT=FakeWallet MINT_LISTEN_PORT=3338 \
  MINT_INPUT_FEE_PPK=0 MINT_RATE_LIMIT=FALSE FAKEWALLET_DELAY_INCOMING_PAYMENT=0 mint

# this repo
node_modules/.bin/tsx scripts/e2e/card-fixtures.ts serve
maestro test \
  --env BRIDGE_URL=http://localhost:9876 \
  --env MINT_URL=http://localhost:3338 \
  --env FIXTURES_URL=http://localhost:9877 \
  --env E2E_TOKEN=<a Test-instance session token> \
  .maestro/flashcard/
```

The app must be a Debug build (so `__DEV__` holds) installed on a booted
simulator. `FORCE_BUNDLING=1` embeds the JS bundle so it runs without Metro.

## Prerequisites for CI (operator actions)

The workflow (`.github/workflows/ios-e2e-card.yml`) signs in on the **Test**
instance (`api.test.flashapp.me`), never production, with the review account.
It needs, as repository secrets, either:

- `E2E_TEST_PHONE` and `E2E_TEST_CODE`: the review account's phone number and
  its fixed login code, or
- `E2E_TOKEN`: a Test-instance session token for that account.

Prefer the phone and code: each run then signs in for a session of its own
and revokes it when the job ends. An `E2E_TOKEN` secret is never revoked by
the workflow (that would break the next run), so rotate it by hand. Either
way the token stays out of the uploaded results: only Maestro's screenshots
go up from `~/.maestro/tests` (its `maestro.log` records typed text), and the
logs and JUnit report are scrubbed of the token first. Artifacts are kept for
seven days.

The account's Cash balance does not matter: with the dev pay stub on, the
payment is skipped and the amount check against the Cash balance is lifted
with it (`topUpAmountProblem`). A release build has no stub and always checks
the balance; `__tests__/utils/cashu-card-topup-amount-problem.spec.ts` pins
that.
