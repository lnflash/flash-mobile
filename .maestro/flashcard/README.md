# Flashcard e2e flows (ENG-634, card protocol 2.0: ENG-675)

Maestro flows that drive the Flashcard v2 screens on an iOS simulator against
a simulated card. The card is the real cashu-javacard applet, protocol 2.0,
running in jCardSim behind a loopback HTTP bridge (`tools/cardsim` in
[lnflash/cashu-javacard](https://github.com/lnflash/cashu-javacard), at the
ref the workflow pins in `CASHU_JAVACARD_REF`; its `tools/cardsim/README.md`
is the bridge's contract); the mint is a local Nutshell 0.20.3 on FakeWallet.
No NFC hardware, no phone and no production system is involved.

## How the app reaches the card

Development builds only (`__DEV__`); a release build contains none of it.

- `flash://dev/card-bridge?url=<bridge>&mint=<mint>&stubPay=1` points the card
  flows at the bridge and the top-up at the dev mint, and turns on the pay
  stub: the Cash wallet's payment of the mint's invoice is skipped and reads
  as paid. The production mint is refused as a dev mint, and the stub needs a
  dev mint. `flash://dev/card-bridge?off=1` goes back to NFC.
- `&ownerKey=<64 hex>` makes the app prove ownership with that P-256 key: the
  public TEST owner key every fixture but `fresh` is owned by
  (`subflows/owner-card.yaml`). Without it the app is a phone that is not the
  card's owner. `&headers=<url>` points the card's clock at the fixture
  server's header stub instead of mempool.space and blockstream.info.
- `flash://dev/card-tap` taps the card, as the card controls do.
- The developer screen has the same controls (Card bridge section).
- Nothing is persisted: every flow sets the bridge again after its launch.

## Fixtures

`node_modules/.bin/tsx scripts/e2e/card-fixtures.ts serve` answers
`POST /load/<name>` and provisions a brand-new card through the applet's own
commands (owner last: the PIN, the record, SET_OWNER with the TEST owner key;
then the owner's ALLOW_LOAD and one LOAD_PROOF per piece, with the mint's
DLEQ), with format-4 SIG_ALL pieces minted at the dev mint. It also serves the
tip header stub at `/headers` (a real mainnet header, `FIXTURE_TIP_HEADER`),
and `POST /spend/<amount>`: a till's offline payment of exactly that much
from the card, no change, redeemed at the mint (500 when no pieces add up to
it).

| Fixture         | Card                                                                                    |
| --------------- | --------------------------------------------------------------------------------------- |
| `fresh`         | empty, no owner, no record, no PIN                                                      |
| `owned`         | set up, owned by the TEST key, no PIN, empty                                            |
| `loaded`        | `owned` with PIN `1234` and 21 sat in 3 slots (16, 4, 1)                                |
| `spent`         | `loaded`, with slots 1 and 2 spent on the card by one payment and SPENT at the mint     |
| `full`          | `owned`, all 128 slots of 1 sat                                                         |
| `blocked`       | `loaded`, PIN blocked by three wrong tries                                              |
| `limited`       | `loaded`, with the owner's limits (5,000 a day, 1,000 a payment, 250 without the PIN)   |
| `missing-small` | `owned`, no PIN, 12 sat as 8 + 4: no 1 or 2, so a till offline can take only 4, 8 or 12 |

There is no `legacy` fixture: cardsim serves only the 2.0 applet, so "This
card needs an update" (a 0.x or Foxy 1.x card) is pinned by the unit specs
(`__tests__/utils/cashu-card.spec.ts`, `__tests__/contexts/flashcard-cashu-card.spec.tsx`).

## Flows

`balance-read`, `setup-owner` (a fresh card set up in one tap, owner last),
`set-pin` (the owner adds a PIN under its grant), `change-pin` (the owner's
CHANGE_PIN, no old PIN), `pin-wrong-then-right` (a phone that is not the
owner checks the PIN before a top-up), `pin-blocked` (the owner's CHANGE_PIN
unblocks a blocked PIN), `limits` (the owner's SET_LIMIT, rollover budget
included), `topup` (the owner's grant, no PIN; reclaims the two spent slots
and loads pieces with their DLEQ), `topup-full` (no room), `tidy` (ENG-702:
the owner tidies `missing-small` to the ladder in one tap, then a till takes
exactly 3). Every flow signs
in from a clean install (`subflows/login.yaml`), with the Keychain cleared:
top-up records and owner keys live there.

Assertions use testIDs, not text, so the device locale does not matter. Taps
use testIDs too; no flow taps a screen coordinate.

## Running locally

```sh
# cashu-javacard at the ref the workflow pins
mvn -B -f tools/cardsim/pom.xml package -DskipTests
java -jar tools/cardsim/target/cardsim.jar --port 9876

# Nutshell 0.20.3 on FakeWallet, v1 keyset ids (a card slot holds an 8-byte
# id): forge's shape. 0.20.3 pins a breez-sdk-spark range PyPI no longer has,
# and FakeWallet never uses it, so it is installed without its dependencies
# and they are installed beside it with breez-sdk-spark 0.17.0 (python 3.10+).
python -m venv .nutshell && . .nutshell/bin/activate
pip install --no-deps "cashu==0.20.3"
python -c 'import importlib.metadata as m, re; print("\n".join(re.sub(r" \((.*)\)", r"\1", r) for r in m.requires("cashu") if not r.startswith("breez")))' > nutshell-deps.txt
pip install -r nutshell-deps.txt "breez-sdk-spark==0.17.0" "marshmallow<4" "limits<4"
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
Sign it ad hoc, as the workflow does; do not build it unsigned
(`CODE_SIGNING_ALLOWED=NO`). An unsigned app has no Keychain on the simulator,
and the top-up store lives there, so `topup` stops at "Couldn't set up the
top-up with the mint" while every other flow passes:

```sh
FORCE_BUNDLING=1 xcodebuild -workspace ios/LNFlash.xcworkspace -scheme LNFlash \
  -configuration Debug -sdk iphonesimulator -derivedDataPath build \
  -destination 'platform=iOS Simulator,name=<booted simulator>' \
  CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER= \
  build
xcrun simctl install booted build/Build/Products/Debug-iphonesimulator/Flash.app
```

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
