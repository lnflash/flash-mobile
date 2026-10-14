# Flash AI Assistant — Tool Registry & Action-Card Spec

Status: design v0.2.1 · Companion to the architecture discussion (on-device-first intent parsing with server fallback). This document specifies the layer that makes the assistant safe to build: the **tool registry** that wraps Flash's existing payment rails, and the **action cards** that render money movement for human confirmation.

Every operation name below is real. GraphQL operations are taken from `app/graphql/public-schema.graphql` (mobile copy regenerated 2026-09-25, commit `ce85783bd`); Breez SDK wrappers from `app/utils/breez-sdk/`. Citations use `path:line`. See §11 for what changed from v0.1 and in v0.2.1.

---

## 1. Design principles (non-negotiable)

1. **Parser, not personality.** The LLM (on-device small model or server fallback) only emits a structured `ToolCall` from a closed intent set. It never composes free-form numeric claims.
2. **Numbers never come from the model.** Balances, fees, amounts, and rates are rendered exclusively from tool payload fields by native components. Model text is decorative and templated.
3. **Propose / dispose.** Action-tier tools **prepare** an operation and return a card; execution requires explicit tap + biometric/passcode on that card. The model can never fire a mutation.
4. **No new powers.** Tools call only what the UI already calls, with the session's own auth. Executor code paths are shared with the screens (`useSendPayment` family, `useSwap`, the receive-screen request builders), not re-implemented.
5. **Two rails, one registry.** Flash has a custodial rail (USD/USDT wallets, GraphQL) and a self-custodial rail (the BTC wallet, Breez Spark SDK running on the device). Every tool that touches BTC goes through a `BtcRail` interface; nothing in the registry imports the SDK directly.
6. **Prepared actions expire.** Every prepared action carries `expiresAt`. Fee probes, exchange rates, and USD invoices all go stale while a card sits in a thread; the executor refuses anything past its expiry and asks the user to re-prepare.
7. **Everything flagged.** `assistantEnabled`, `assistantVoice`, `assistantVoiceReplies`, `assistantServerFallback` remote-config flags, following the existing `FeatureFlags` + `getRemoteConfig().getValue(key)` pattern in `app/config/feature-flags-context.tsx:13,62`. No `Local`-instance override for these four (the existing flags are forced on for `galoyInstance.id === "Local"`, `feature-flags-context.tsx:123-128`); dogfooding flips the remote flag.

## 2. Placement

New module `app/assistant/`:

```
app/assistant/
  registry/            # tool definitions + executors
    read/              # read-tier tools
    actions/           # action-tier tools
    cards/             # typed action-card payloads → RN components
  rails/
    graphql-rail.ts    # thin wrapper over the Apollo client (client.query / client.mutate)
  engine/
    intent-router.ts   # on-device parse → validate → dispatch
    executor.ts        # single runTool()/executeAction() pipeline, expiry + auth gate
  ui/                  # chat thread, push-to-talk
```

The two shared pieces live **outside** the assistant, in `app/payments/`: `send-payment.ts` (the headless `sendPayment()` the confirmation screen also uses) and `btc-rail.ts` (`BtcRail` + `breezBtcRail`). The assistant imports them; nothing under `app/screens/` imports from `app/assistant/`. Decision 4 on ENG-684; plan in `sandbox/plans/ENG-686.md`.

The registry is pure TypeScript: no LLM dependency. It is fully unit-testable before any model is wired in (both rails are mocked), and the offline grammar tier + on-device models both dispatch through the identical `runTool()` entry.

### 2.1 The two rails

| Rail | Wallets | Balance source | Send | Receive |
| --- | --- | --- | --- | --- |
| GraphQL (custodial) | USD, USDT | `Wallet.balance: FractionalCentAmount` — US cents as a float, up to 8 decimals (`schema:977`, interface at `schema:2828-2836`, `UsdWallet` `schema:2515-2523`, `UsdtWallet` `schema:2563-2571`) | `intraLedger*PaymentSend`, `ln*PaymentSend` | `lnUsdInvoiceCreate` (`payment-request.ts:132,150`), `onChainAddressCurrent` (`payment-request.ts:167`) |
| Breez Spark (self-custodial) | BTC | `BreezContext` calls the SDK `getInfo()` and exposes `balanceSats` (`app/contexts/BreezContext.tsx:86,129,132`; wrapper `app/utils/breez-sdk/spark.ts:197`, `ensureSynced: true`). The server-side `BTCWallet.balance` is **null for external BTC wallets** (`schema:374-382`) | `payLightningBreez`, `payLnurlBreez`, `payOnchainBreez` (`use-send-payment.ts:38,200,213`) | `receivePaymentBreez`, `receiveOnchainBreez` (`payment-request.ts:108-116`) |

`BtcRail` is the seam: `{ getBalanceSats, listPayments, payInvoice, payLnurl, payOnchain, probeFee, createInvoice, getOnchainAddress }`. `breezBtcRail` is one-line delegates into `app/utils/breez-sdk/spark.ts`, which stays the only **runtime** importer of `@breeztech/breez-sdk-spark-react-native` (the type-only importers move behind the rail in ENG-693). Breez initializes only when advance mode is on (`BreezContext.tsx:110`); before that `getSDKInstance()` throws (`spark.ts:60-63`). The rail reports that as a `disabled` state and read tools render it as such, never as a zero balance. The SDK has its own release cadence and the app has already changed BTC backends once; the registry must survive the next swap without touching tools or cards.

## 3. Core contracts

```ts
// An intent the engine is allowed to emit. Closed enum — anything else
// is rejected by the validator before it touches a tool.
type Intent =
  | "getBalances"
  | "getTransactions"
  | "getTransactionDetails"
  | "resolveContact"
  | "getPrice"
  | "searchMerchants"
  | "getAccountLimits"
  | "decodePaymentRequest"
  | "prepareSend"
  | "prepareReceive"
  | "prepareGroupSend" // one amount fanned out to several payees (was prepareSplitPayment)
  | "prepareConversion"
  | "prepareCashout"

type ToolResult<T> =
  | { kind: "answer"; payload: T; card?: ActionCard } // read tier
  | { kind: "prepared"; card: ActionCard; preparedAction: PreparedAction }
  | { kind: "clarification"; card: ClarificationCard } // ambiguous input
  | { kind: "error"; userMessage: TranslationKey } // templated, LL.t

type PreparedAction = {
  id: string // uuidv4, also the idempotency seed
  intent: Intent
  createdAt: number
  expiresAt: number // see §5 — derived from the shortest-lived input (invoice, probe, rate)
  summary: ActionSummary // what the card displays (amounts, payee, fees)
  execute: () => Promise<ExecutionOutcome> // only reachable via card + auth, only before expiresAt
}
```

**Amounts.** Model-emitted amounts are decimal **strings** in display units (`"5"`, `"12.50"`), never JSON numbers. The validator parses them once into the app's `MoneyAmount<T>` (`app/types/amounts.ts:27`), which is an integer in minor units (cents or sats), via `toUsdMoneyAmount` / `toBtcMoneyAmount` (`amounts.ts:65,50`). No tool, card, or executor ever handles a float amount. Server balances arrive as fractional cents and are converted the same way the swap flow already does it (`toUsdMoneyAmount(usdWallet?.balance ?? NaN)`, `app/hooks/useSwap.ts:59`); display rounding is `useDisplayCurrency` (`app/hooks/use-display-currency.ts:81`). Rounding has bitten this codebase before; the assistant adds no new rounding code.

**Pending actions.** The executor holds at most 3 prepared actions per thread. Preparing a 4th evicts the oldest; dismissing a card or leaving the thread drops its action. The closures are the only live reference to a `PaymentDetail`, so eviction is also the memory bound.

Validation: every tool input has a JSON Schema; the intent router validates before execution. The validator is hand-written for the subset the registry uses (`type`, `properties`, `required`, `additionalProperties: false`, `enum`, `pattern`, `maximum`) and throws at definition time on any other keyword, so an unsupported schema can never pass silently; no `ajv` or `zod` dependency. `clarification` is a first-class outcome — a fuzzy contact match with 2+ candidates returns a picker card, never a guess.

## 4. Read tier (auto-execute, return data + optional card)

| Tool | Backing operation(s) | Notes |
| --- | --- | --- |
| `getBalances()` | USD/USDT: `me { defaultAccount { wallets { id balance walletCurrency isExternal } } }`, `balance` is fractional US cents (`schema:2834`, `schema:977`). BTC: `BtcRail.getBalanceSats()` (Breez `getInfo`, `BreezContext.tsx:129-132`). The server `BTCWallet.balance` is null and must not be read (`schema:378-380`) | Sum/comparison math in code on `MoneyAmount`; render via `useDisplayCurrency`. The BTC row has three states, `ok`, `syncing` and `disabled` (advance mode off, §2.1); the last two never show a number |
| `getTransactions({first?, direction?, query?})` | `Account.transactions(after, before, first, last, walletIds)` (`schema:11-24`, anti-chronological) | `direction` and `query` (memo/counterparty) are client-side filters. The tool pages through up to 5 pages of 20 looking for a match; the reply always states the window searched ("in your last 100 payments") so a miss is never silent. BTC-rail history comes from `BtcRail.listPayments` and is merged by timestamp |
| `getTransactionDetails({transactionId})` | `transactionDetails(input: TransactionDetailsInput!)` (`schema:2179`, input at `schema:2424-2427`) | GraphQL rail only; Breez payment details come from the rail |
| `resolveContact({hint})` | fuzzy-match against `me { contacts }` (`User.contacts`, `schema:2622`, marked `@deprecated("will be moved to account")` — wrap the read in one place so the move is a one-line change; `UserContact` at `schema:2652-2678`), then `accountDefaultWallet(username, walletCurrency)` → `PublicWallet` (`schema:2135`) | 0 matches → `clarification`; 2+ → picker card; **exactly 1 match below the confidence threshold → picker card with that single option**, never straight to a confirm card. The score comes from `fuse.js`, already a dependency (`package.json:110`); the threshold is tuned on the test corpus (§9). Every card that names a payee shows the full `username`, not only the alias |
| `getPrice()` | `realtimePrice(currency)` (`schema:2177`, type at `schema:2206-2221`) | Never estimate from memory — always live call |
| `searchMerchants({query?})` | `businessMapMarkers` (`schema:2148`, `MapMarker` at `schema:1642-1645`) | name filter client-side; `businessMapMarkers` takes no location input and a distance filter would need the location permission, so none in v1 |
| `getAccountLimits()` | `me { defaultAccount { level limits { convert internalSend withdrawal } } }` (`AccountLimits`, `schema:114-125`) | Answers "why can't I send this much" |
| `decodePaymentRequest({raw})` | Reuses the existing destination parser: `app/screens/send-bitcoin-screen/validation.ts` + `payment-destination/`. Decode only; fee probes (`lnInvoiceFeeProbe` `schema:1436-1441`, `lnUsdInvoiceFeeProbe` `schema:1608-1611`, `BtcRail.probeFee`) belong to `prepareSend` | Returns destination card; does **not** probe or pay |

Read-tier results are shaped into compact projections before they can reach any server-side model on the fallback path (drop payment hashes, memos, counterparties unless the query demands them).

Example tool definition:

```ts
registry.defineRead({
  intent: "getTransactions",
  description: "List the user's recent payments, newest first.",
  input: {
    type: "object",
    properties: {
      first: { type: "integer", maximum: 20 },
      direction: { enum: ["SEND", "RECEIVE"] }, // TxDirection, schema:2443-2446
      query: { type: "string" }, // client-side memo/payee filter
    },
  },
  run: async (args, ctx) => {
    /* ctx.graphql.query(...) + ctx.btcRail.listPayments(...) → TxListCard payload */
  },
})
```

## 5. Action tier (prepare → card → auth → execute)

Every action tool shares one shape: `prepare` builds the exact same `PaymentDetail<WalletCurrency>` structure the send flow uses (`payment-details/index.types.ts:238`), returns a typed card; the card's Confirm button routes through `executePreparedAction()` (single choke point) which checks `expiresAt`, then calls `BiometricWrapper.authenticate(...)` (`app/utils/biometricAuthentication.ts:18`, the same gate used by `authentication-screen.tsx:52`), then executes:

```ts
registry.defineAction({
  intent: "prepareSend",
  input: {
    type: "object",
    required: ["payee", "amount", "currency"],
    properties: {
      payee: { oneOf: [contactHint, lnPaymentRequest, lnurl, onchainAddress] },
      amount: { type: "string", pattern: "^[0-9]+(\\.[0-9]{1,8})?$" }, // display units; parsed once into MoneyAmount
      currency: { enum: ["BTC", "USD", "USDT"] }, // WalletCurrency, schema:2881-2885
      memo: { type: "string", maxLength: 80 },
      sourceWallet: { enum: ["BTC", "USD", "USDT"] }, // defaults to USD
    },
  },
  // prepare: resolve payee → walletId → PaymentDetail → fee probe → ConfirmPaymentCard (expiresAt = probe TTL)
  // execute: sendPayment(paymentDetail) — see below
})
```

**The auth gate is new behavior.** Today's send flow has no per-send biometric; the gate exists only for app unlock. The assistant adds it because chat is a new way to move money. `BiometricWrapper.isSensorAvailable()` (`biometricAuthentication.ts:6`) decides between biometrics and the device passcode fallback (`fallbackEnabled: true`, `biometricAuthentication.ts:30`); the in-app PIN (`app/screens/authentication-screen/pin-screen.tsx`) is the last resort. If none of the three is available, action tools **fail closed**: `prepare` still returns the card for review, but Confirm is disabled with a templated explanation that points to enabling the PIN or biometrics in settings. A device with no enrolled biometric and no in-app PIN fails closed even when it has an OS passcode, because JavaScript cannot detect a passcode without showing a prompt. Read tools are unaffected.

**Expiry.** `expiresAt` is the minimum of the inputs that can go stale:

| Input | TTL |
| --- | --- |
| LN fee probe (either rail) | 60 s |
| Exchange-rate-dependent amount (a BTC send specified in USD, or vice versa) | 60 s from the `realtimePrice` read |
| `lnUsdInvoiceCreate` invoice | server expiry: `expiresIn` or 5 minutes (`schema:1826-1837`); card uses the invoice's own `expiresAt` |
| `CashoutOffer` | the offer's own expiry field |
| Intraledger USD → USD with a fixed cent amount | 10 minutes (nothing moves; the cap is for hygiene) |

Past `expiresAt`, Confirm becomes "Refresh": the executor re-runs `prepare` with the same inputs and shows a new card with the new numbers. It never executes against stale ones.

**Execution path.** `useSendPayment` (`app/screens/send-bitcoin-screen/use-send-payment.ts:69`) is the only correct executor today — it wraps every send mutation (`lnInvoicePaymentSend`, `lnNoAmountInvoicePaymentSend`, `lnNoAmountUsdInvoicePaymentSend`, `lnurlPaymentSend`, `intraLedgerPaymentSend`, `intraLedgerUsdPaymentSend`, `onChain*`) plus the Breez paths (`payLightningBreez`, `payOnchainBreez`, `payLnurlBreez`), with the in-flight double-tap guard (`isInFlight`, `hasAttemptedSend`, lines 42-51) and `HomeAuthedDocument` refetch. Step 1 of implementation: **extract its mutation dispatch into a headless `sendPayment()` util in `app/payments/`** so the confirmation screen and the assistant share one path. Do not fork payment logic.

Be honest about the size of that step: the hook is 376 lines built from nine `use*Mutation` hooks with `refetchQueries: [HomeAuthedDocument]` (lines 76-99). Mutation and variable selection already lives in the pure `PaymentDetail.sendPaymentMutation` closures (`payment-details/*.ts`), so the extraction swaps the nine hooks for `client.mutate` wrappers, re-attaches the refetch explicitly, and makes the hook a thin wrapper that keeps its refs and loading signal. The Breez branch (lines 195-254) moves behind `BtcRail` in the same change. Full plan: `sandbox/plans/ENG-686.md`. Land this as its own PR with the existing send-flow tests green before any assistant code exists.

**Idempotency.** Six send inputs accept `idempotencyKey`: `IntraLedgerPaymentSendInput` (`schema:1315`), `IntraLedgerUsdPaymentSendInput` (`schema:1340`), `LnInvoicePaymentInput` (`schema:1450`), `LnNoAmountInvoicePaymentInput` (`schema:1523`), `LnNoAmountUsdInvoicePaymentInput` (`schema:1550`), `LnurlPaymentSendInput` (`schema:1625`). Each `PreparedAction` gets a uuidv4 at prepare time; the key is reused if the same prepared action is retried, and reuse errors are handled via the existing `isIdempotencyKeyReuseError` (`payment-details/idempotency-support.ts`). A refreshed action (post-expiry re-prepare) is a **new** action with a new key, because its amounts may differ. **Keyless legs** are Breez (BTC-wallet) sends, on-chain sends, and both cashout mutations. A keyless leg is never retried automatically: on failure the card reports it and the user re-prepares, which creates a new action. This is the rule the send flow applies today (`use-send-payment.ts:277-282`).

**The other actions:**

| Action | Prepare → | Execute → |
| --- | --- | --- |
| `prepareReceive({amount?, currency, memo?})` | Mirrors `payment-request.ts`. BTC Lightning → `BtcRail.createInvoice` (`receivePaymentBreez`, `payment-request.ts:111`); BTC on-chain → `BtcRail.getOnchainAddress` (`receiveOnchainBreez`, line 114). USD/USDT Lightning → `lnUsdInvoiceCreate` (USD cents, `schema:1577`, lines 132/150); USD on-chain → `onChainAddressCurrent` (line 167). The server-side BTC invoice ops (`lnInvoiceCreate` `schema:1407`, `lnNoAmountInvoiceCreate` `schema:1479`) are **not** used for the BTC wallet, which is external | No mutation at execute time; the card is the result. `InvoiceCard` with QR + share sheet. USD invoices expire in 5 minutes (`schema:1826-1837`) — card shows the same countdown as the existing invoice-expiry UI |
| `prepareGroupSend({payees[], total, currency, memo?})` | resolves each payee (clarification card on ambiguity or low confidence), computes shares **in code** on `MoneyAmount` (remainder cents handed out in payee-list order from index 0), per-leg fee probe → `GroupSendCard` listing every leg. `expiresAt` = shortest leg probe | serial execution, stop on first failure; per-leg idempotency keys where the input has one; result report card shows succeeded/failed legs individually with a "Retry failed legs" button that reuses those keys and is not offered for keyless legs, which need a fresh prepare. Never silently skip a leg. Not to be confused with the API's inbound **wallet splits** (`walletSplitsSet` / `walletSplitDelete`, ENG-653), which route a merchant's incoming payments; see §11 |
| `prepareConversion({from, to, amount})` | There is **no conversion mutation**. The conversion screen uses `useSwap` (`app/hooks/useSwap.ts`), a self-pay swap across the two rails: BTC → USD creates a `lnUsdInvoiceCreate` invoice on the user's own USD wallet, probes the Breez fee with `fetchBreezFee` (`useSwap.ts:99`), and pays it with `payLightningBreez`; USD → BTC creates a Breez invoice (`receivePaymentBreez`), probes it with `lnUsdInvoiceFeeProbe` (`useSwap.ts:153`), and pays it with `lnInvoicePaymentSend` from the USD wallet. The probe always runs on the paying side; v0.2 had the two swapped. `prepare` runs the invoice + probe steps and returns a `ConfirmPaymentCard` whose `expiresAt` is the invoice expiry (5 min for USD) | the pay leg only, through the shared `sendPayment`. Execute must not create a second invoice; if the card expired, the user refreshes and a new invoice is created |
| `prepareCashout({amountUSD, bankAccountId?})` | `requestCashout({amount, bankAccountId, walletId})` (`schema:1861`) → `CashoutOffer` (`schema:786`); card shows the offer including the Flash fee fields (fee semantics documented at `schema:823`) | `initiateCashout({offerId, walletId})` (`schema:1755`, input at `schema:1282-1291`). Only if `AccountCapabilities.bankPayout` is true (`schema:28-30`). Neither cashout input carries an idempotency key, so the card treats an offer as single-use: Confirm disables on the first execute attempt whatever the outcome, and a failure means a fresh `requestCashout`. `bankLabel` is resolved at prepare time from the same bank-accounts query the cashout screen uses |

Declined-for-v1 (kept out of the registry on purpose): Fygaro card top-up (`fygaroCheckoutCreate`, `schema:1748`, opens a WebView checkout — poor fit for chat; assistant answers top-up _questions_ and deep-links into the flow instead), Flashcard/NFC operations (physical tap is the point), Nostr/social, referrals (`createInvite`, `schema:1745`, invites fire via share sheet — fine as a v2 read/deep-link, not an action), inbound wallet splits (`walletSplitsSet` / `walletSplitDelete`, a v2 read tool once the mobile schema is regenerated).

## 6. Cards: the anti-hallucination boundary

```ts
type ActionCard =
  | {
      type: "confirmPayment"
      payeeLabel // alias or display name
      payeeUsername // always shown in full when the payee is a Flash user
      amountText
      feeText
      totalText
      sourceWalletLabel
      memo?
      expiresAt
      preparedActionId
    }
  | { type: "invoice"; paymentRequest; amountText?; shareText; expiresAt? }
  | {
      type: "groupSendSummary"
      legs: { payeeLabel; payeeUsername; amountText }[]
      totalText
      expiresAt
      preparedActionId
    }
  | { type: "txList"; txIds: string[]; windowText } // renders existing tx rows; windowText = "last 100 payments"
  | { type: "clarification"; options: { id; label; sublabel? }[] } // sublabel carries the full username
  | {
      type: "cashoutOffer"
      amountText
      feeText
      receiveText
      bankLabel
      expiresAt
      preparedActionId
    }
  | { type: "expired"; preparedActionId } // Confirm became Refresh
```

Rules:

- `*Text` fields are pre-formatted by tool code via the app's display-currency utils — the renderer never formats, the model never strings. Components render from payloads; a card with a missing/mismatched payload refuses to render.
- Confirm buttons exist only on concrete cards and always call `executePreparedAction(preparedActionId)` — the registry looks the action up; model text cannot synthesize one. Confirm is disabled when `expiresAt` has passed (card swaps to `expired`) or when no auth method is available (§5).
- Cards get Storybook stories (`*.stories.tsx` under `app/assistant/`) per the repo's on-device Storybook setup (`.storybook/`, 65 stories today).

## 7. Conversation surface & voice

- New tab-level thread "Ask Flash" (distinct from the Nostr/Chatwoot support chat per `docs/chatwoot-nip29-bridge.md`): user bubble, assistant text bubble (templated replies only, all strings through `useI18nContext().LL` per `app/i18n/i18n-react` — see the `LL.SendBitcoin...()` pattern at `send-bitcoin-confirmation-screen.tsx:81`), action cards, typing indicator.
- Voice input: push-to-talk button → platform on-device STT (iOS `SFSpeechRecognizer` with `requiresOnDeviceRecognition`, Android `SpeechRecognizer` on-device) → same text pipeline. Voice-initiated actions still require tap-confirm + biometric.
- Voice output is **opt-in** (`assistantVoiceReplies`, default off, plus a per-user toggle). Reading a balance aloud in a shop is a privacy leak, not a feature. When on, native TTS speaks non-card turns only; cards are never read aloud.
- Engine dispatch order: offline grammar tier (top intents, all devices) → on-device model where the hardware allows → server fallback with minimized context, error toasts via the existing `toastShow` pattern (`app/contexts/Flashcard.tsx:415` etc.).

### 7.1 On-device model coverage, honestly

The app targets iOS 15.1 (`ios/*.xcodeproj/project.pbxproj`, `IPHONEOS_DEPLOYMENT_TARGET`) and Android `minSdkVersion 26` (`android/build.gradle`), on React Native 0.77.1. Apple's Foundation Models framework needs iOS 26 on Apple Intelligence-capable iPhones; Gemini Nano needs an AICore-eligible Android device. On Flash's installed base that is a small minority. The grammar tier is therefore the product for most users, not a fallback, and it must be good enough to ship alone. Before Phase 3 is funded, add a one-time analytics event reporting `onDeviceModelAvailable: boolean` so the investment is sized on real numbers.

## 8. Safety rails (encoded, not hoped for)

- Closed `Intent` enum + JSON-Schema validation at the router; anything else returns the templated "I can't do that yet" reply.
- Tool results are data: memos/contact names reach the model (on-device) quoted and untrusted; they can never cross into `execute` — executors only rebuild from `PaymentDetail` reconstructed at prepare time.
- Payee resolution never auto-selects a low-confidence match (§4); every payee-bearing card shows the full username.
- Prepared actions expire (§5) and are capped at 3 per thread (§3). Nothing executes against numbers older than its inputs allow.
- The auth gate fails closed when no biometric, passcode, or PIN is available (§5).
- Rate limits: existing account `limits` and backend caps apply unchanged since tools call the same ops. `prepare` on action tools is additionally debounced client-side (one in-flight prepare per intent) so a chatty session cannot hammer fee probes.
- Telemetry: intent name, tier (read/action), outcome (prepared/confirmed/denied/expired/failed), latency, `onDeviceModelAvailable` — to Firebase Analytics; **never** memo/payee/amount payload text.

## 9. Testing

- Registry: pure functions → Jest unit tests with both rails mocked (`graphql-rail`, `btc-rail`), including per-leg group-send failures, idempotency-reuse retries, expiry refusal + refresh, the fail-closed auth path, and fractional-cent balance conversion against known rounding cases.
- Cards: Storybook stories + Maestro e2e in `.maestro/` (the live harness: 16 flows today under `.maestro/flashcard/`, CI in `.github/workflows/ios-e2e-card.yml`; the `e2e/` directory is the retired Detox tree, last touched 2026-07-02, do not add to it) for the two golden paths: "check balance" and "send $5 to a contact → confirm card → biometric mock".
- Grammar tier: snapshot tests on phrasing corpora (English + Jamaican patois variants) to keep accuracy honest over time. The same corpus tunes the contact-confidence threshold.

## 10. Phasing

0. **Regenerate the schema.** The mobile copy of `public-schema.graphql` (2026-09-25) is behind the API's `main` (ENG-653 `walletSplitsSet` / `walletSplitDelete`, ENG-660). Regenerate before Phase 1 so citations and generated hooks match.
1. **Executor extraction + rails + registry + cards** (no AI): `sendPayment()` lands first as its own PR; then `runTool()` works from a test harness and confirmation cards render.
2. **Offline grammar tier** for top intents → assistant ships flag-off, dogfoodable. This tier must stand alone (§7.1).
3. **On-device models** per platform behind `assistantEnabled`, sized by the coverage event.
4. **Voice** (native STT, opt-in TTS) behind `assistantVoice` / `assistantVoiceReplies`.
5. **Server fallback** behind `assistantServerFallback`, gated on privacy review.

## 11. Changes from v0.1 (2026-10-13)

Corrections after checking every citation against the checkout:

- **BTC is a separate rail.** v0.1 read all balances from GraphQL and claimed `Wallet.balance` was "sats for BTC". It is `FractionalCentAmount` (fractional US cents) and null for the external BTC wallet. BTC balance, receive, and send all go through the Breez Spark SDK on the device. Added §2.1 and the `BtcRail` interface.
- **Conversion is a swap, not a mutation.** v0.1 cited "conversion mutation per conversion-flow screens"; none exists. Documented the real `useSwap` sequence and its 5-minute invoice.
- **Prepared actions expire.** Added `expiresAt`, the TTL table, refresh semantics, and the per-thread cap.
- **Amounts are strings in, integers inside.** Replaced `amount: number` with a decimal string parsed once into `MoneyAmount`.
- **Contact resolution** no longer auto-selects a single low-confidence fuzzy match; cards show the full username.
- **Auth gate** is documented as new behavior with a fail-closed rule.
- **Executor extraction** is described as the rewrite it is (nine mutation hooks → `client.mutate`).
- **`prepareSplitPayment` → `prepareGroupSend`** to avoid colliding with the API's inbound wallet splits (ENG-653).
- **Transaction search** states its window instead of failing silently.
- **TTS is opt-in.**
- **On-device model coverage** is sized against the real deployment targets (§7.1).
- **Testing** points at `.maestro/`, not the retired `e2e/` Detox tree.
- **Citation fixes:** `CashoutOffer` is `schema:786` (v0.1 pointed at the SafeInt scalar), `initiateCashout` `schema:1755`, `realtimePrice` query `schema:2177`, `transactionDetails` query `schema:2179`, `Account.transactions` real argument list, `User.contacts` deprecation noted.

### v0.2.1 (2026-10-13, after the Phase 1 plans)

Corrections the ENG-686/687/688 planners found against the code:

- **Conversion fee probes were swapped.** BTC → USD probes with `fetchBreezFee`; USD → BTC with `lnUsdInvoiceFeeProbe` (`useSwap.ts:99,153`).
- **Six idempotency inputs, not five**, including `IntraLedgerUsdPaymentSendInput` (`schema:1340`); `lnurlPaymentSend` added to the executor's mutation list. Keyless legs (Breez, on-chain, cashout) are never auto-retried.
- **Shared code moved out of `app/assistant/`:** `sendPayment()` and `BtcRail` live in `app/payments/` (ENG-684 decision 4). `BtcRail` gains `listPayments`.
- **BTC rail `disabled` state:** Breez initializes only in advance mode (`BreezContext.tsx:110`).
- **Auth gate:** passcode-only devices fail closed; the message points to PIN/biometric settings.
- **Validator:** hand-written subset, throws on unknown keywords, no new dependency. Contact scoring uses the existing `fuse.js`.
- **`decodePaymentRequest` decodes only;** probes belong to `prepareSend`. **`searchMerchants` has no distance filter** (no location input).
- **Cashout offers are single-use** on the client; `bankLabel` comes from the cashout screen's bank-accounts query.
- **Line fixes:** mutation hooks `use-send-payment.ts:76-99`, Breez branch `195-254`.
- Pre-existing bug found and filed separately: the Breez LNURL/intraledger branch reports Success unconditionally (ENG-694).
