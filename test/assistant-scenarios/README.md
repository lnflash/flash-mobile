# Ask Flash scenario library

Run the complete suite without a phone, account, backend, model download, or human confirmation:

```sh
yarn test:assistant-scenarios
```

The initial corpus has **1,328 scenarios**: 28 regression conversations (14 through the rendered screen), eight separately authored acceptance examples, and 1,292 generated permutations. The runner has a four-minute timeout and returns a nonzero exit code for any mismatch, unexpected support handoff, financial dispatch, incomplete report, invalid corpus, or empty selection. It never sends a payment or connects to a live service.

```sh
# Quick regression conversations
yarn test:assistant-scenarios --profile smoke

# Reproduce a report's case and execution order
yarn test:assistant-scenarios --scenario max-legacy-lookup --seed 754

# Rendered-screen flows only, or a different deterministic execution order
yarn test:assistant-scenarios --layer screen
yarn test:assistant-scenarios --seed 271828

# List stable ids without running tests
yarn test:assistant-scenarios --list

# Test the framework's failure gates
node --test scripts/assistant-scenarios/library.test.cjs
```

Reports go to `reports/assistant-scenarios/report.json` and `report.md`. Use `--report-dir PATH` to keep a separate run. Reports include the corpus version/digest, seed, suite selection, category/layer/split totals, expected and actual outcomes, failing inputs, and an exact replay command. A filtered replay is explicitly identified; it does not claim complete coverage. Full CI runs require every expected outcome to pass, zero unexpected support handoffs, and zero financial dispatches. Rates describe this authored corpus, not population-wide recognition accuracy.

## What runs

The integration layer uses the production turn router, conversation context, registry, action preparers, executor, shared username lookup, recent-name migration, and `useKnownFlashUsers`. Apollo queries and normalized cache are real. External rails are scripted, while an unscripted Apollo request fails. Cached lookup migration uses the same `accountDefaultWallet` cache entries as the app. Restart serializes/restores the cache and constructs a new runtime; account switching must not import the previous session's names.

Screen scenarios render the actual `AskFlashScreen`. They type or replay native voice events, choose a displayed username suggestion, press add/remove actions, accept the removal dialog, toggle the wallet button, and press support. Navigation, wallet mode, OS audio/permissions, signing/relay publishing, and external services are fixture boundaries. Support navigation is checked at its callback; the destination screen and native device rendering are not mounted by this suite.

Voice scenarios replay **transcripts and native start/final/end events** through the hold/release logic. `intended` records the intended words when the observed transcript differs. This is recovery testing, **not an audio transcription accuracy measurement**. No user audio is collected. Native recognizer quality and real-device performance remain separate checks; the JSON report marks native speech recognition as untested.

The generated matrix covers named screens, polite/trailing wording, help, typed/voice origins, online/offline behavior, exact/spaced/misheard usernames, five candidate sources, payment amounts/recipients, unsupported requests, and unsafe compound/negative commands. The reviewed examples and expectations live in data, independently of the router's alias tables. There is no network-dependent paraphrase generator or runtime judge.

## Data and versions

`v1/manifest.json` declares schema version 1, the corpus semver, file SHA-256 digests, and minimum coverage counts. It points to:

- `fixtures.json`: synthetic verified identities. `dreadmax` is retained as the public username from the reported regressions.
- `regressions.json`: stable ids and multi-step reproductions, with initial state and explicit outcomes.
- `holdout.json`: separately authored acceptance examples excluded from generated matrices.
- `matrices.json`: authored phrases, entities, and state sources expanded deterministically.

Keep schema version and corpus version separate: incompatible step/expectation formats require a new schema implementation; adding examples or changing generated coverage bumps the corpus version. A fixed seed changes execution order only, preserving every scenario and expected result. The digest includes the generator/validator source as well as the manifest.

To add a regression:

1. Reproduce the intended request and observed transcript with the smallest relevant state. Include prior successful lookups, deleted contacts, connectivity, account scope, and earlier conversation turns where relevant.
2. Add a stable id and explicit expectation to `regressions.json`. A request Flash supports cannot expect `unknownIntent`/`notYetAvailable`. Financial expectations must name the card type, recipient, intent, and amount; a refusal card cannot masquerade as a successful review.
3. Bump the corpus version and refresh the data digests:

   ```sh
   node scripts/assistant-scenarios/version.cjs --set 1.0.1
   ```

4. Run the failing id, fix the shared production cause, then run the full suite. Preserve the original failure. A discovered failure in `holdout.json` is promoted to a regression and replaced with a separately authored acceptance example; do not tune on it and keep calling it held out.
5. Review any newly generated expectations once when adding the family. Thereafter, replay, comparison, reporting, and CI need no human interaction. Failure reports never rewrite expectations or weaken gates automatically.

An `ask` step supports `origin: "text" | "voice"`, optional `intended`, and an `expect` object. State fields are `contacts`, `chatContacts`, `history`, `legacyLookups`, `legacyIndex`, `recent`, `offline`, `scope`, `displayCurrency`, `lookupFails`, and `voiceAvailable`. Additional steps are `select`, `contactAction`, `restart`, `switchAccount`, `offline`, `openSupport`, `toggleWallet`, and `voiceUnavailable`; examples in `regressions.json` show each format. Unknown fields and unsupported schema versions fail validation.

## Continuous runs

`.github/workflows/assistant-scenarios.yml` runs the complete corpus for relevant pull requests, main pushes, manual dispatch, and nightly. PRs use seed 754; nightly runs rotate execution order using the workflow run number. JSON/Markdown reports are uploaded even after failure, and Markdown is added to the GitHub run summary. PR checks reject changed corpus data/generation without a version bump. The normal Jest suite also runs the quick regression profile.

This tooling is outside the app bundle and introduces no app dependencies or runtime cost.
