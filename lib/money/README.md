# `lib/money` — shared money primitives

This directory holds the shared money utilities that are **byte-identical**
between the [`flash`](https://github.com/lnflash/flash) backend (also used
by `price-server`) and the [`flash-mobile`](https://github.com/lnflash/flash-mobile)
React Native app.

> If you change a file in this directory, you must change the same file in the
> other repo, with the same bytes, in the same PR (or the next one).

| File | Purpose |
| ---- | ------- |
| `rounding.ts` | The single rounding policy. Every money rounding in Flash goes through this. |
| `rounding.test.ts` | Unit tests covering every mode and the policy table. |

---

## TL;DR — which function do I call?

| You are doing… | Call |
| -- | -- |
| Computing a ledger balance, reconciling, or anything that ends up in a financial report | `roundForContext(x, "accounting")` |
| Showing a number to the user | `roundForContext(x, "display")` |
| Charging the user a fee | `roundForContext(x, "fee")` |
| Paying the user out (sats, fiat, anything we owe them) | `roundForContext(x, "payout")` |
| You have a *very* good reason to pick a specific mode | `roundMinor(x, "half-to-even")` (etc.) — explain in PR |
| You wrote `Math.round(...)` on a money value | **Stop.** Pick a context. |

---

## The policy table

This is the entire policy. Four lines.

| Context | Mode | Why |
| -- | -- | -- |
| `accounting` | `half-to-even` | Banker's rounding. Removes the small positive bias of half-up over large samples. IFRS / GAAP friendly. |
| `display` | `half-up` | Matches what the user expects when they look at the screen — `0.5` rounds to `1`. |
| `fee` | `ceiling` | The house never under-charges itself. Matches Strike / CashApp behaviour. |
| `payout` | `floor` | The house never over-pays. Sub-minor-unit dust stays in treasury. |

Changing any of these four lines is a money-policy change. It should be:

1. its own PR,
2. with a rationale in the commit message,
3. reviewed by at least one engineer **and** one ops person,
4. accompanied by an updated changelog entry.

---

## How to choose a context (worked examples)

**You're computing a transaction fee.**
The fee is what the customer pays *us*. Use `"fee"`. The mode is `ceiling`,
which rounds in our favour by at most one minor unit. Documented, intentional,
visible in the codebase.

**You're showing the customer their wallet balance in their display currency.**
This is `"display"`. The number on screen rounds the way humans expect
(`half-up`). The actual value stored in the wallet is unchanged — only the UI
representation is rounded.

**You're crediting a payout to a customer.**
Use `"payout"`. The mode is `floor`, which means we pay out the largest whole
minor unit that is ≤ the true amount. The fractional remainder stays in
treasury until reconciliation sweeps it.

**You're posting a journal entry to the ledger.**
Use `"accounting"`. The mode is `half-to-even`, which over many entries does
not bias the books in either direction.

---

## Rounding mode reference

| Mode | Behaviour | Example |
| -- | -- | -- |
| `half-to-even` | Round to nearest; ties go to the nearest **even** integer. | `2.5 → 2`, `3.5 → 4` |
| `half-up` | Round to nearest; ties go **away from zero**. | `2.5 → 3`, `-2.5 → -3` |
| `half-down` | Round to nearest; ties go **toward zero**. | `2.5 → 2`, `-2.5 → -2` |
| `ceiling` | Always toward `+∞`. | `1.01 → 2`, `-1.99 → -1` |
| `floor` | Always toward `-∞`. | `1.99 → 1`, `-1.01 → -2` |

---

## Idempotence

`roundMinor(roundMinor(x, mode), mode) === roundMinor(x, mode)` for every
mode and every input. This is locked in by tests today; it will be locked in
by property tests once ENG-320 lands.

---

## Why `bigint`?

Currency amounts in Flash can exceed `Number.MAX_SAFE_INTEGER` when expressed
in the smallest minor unit (sats × scale, msats, etc.). The output is always
`bigint` so callers cannot silently re-introduce float drift after the round.

If you need a `number` at a call site (UI, JSON, GraphQL), convert explicitly
with `Number(x)` and document that you accept the precision loss.

---

## Sync between repos

Both `flash` and `flash-mobile` ship the same source for these files. The two
copies must be byte-for-byte identical. We rely on either:

- a CI check that diffs the two paths (`scripts/sync-money.sh`), or
- a published `@lnflash/money` package consumed from npm.

Pick whichever is in place when you read this. If you are adding a file to
this directory, add it to **both** repos in coordinated PRs.

---

## See also

- ENG-318 (this module) · `https://linear.app/island-bitcoin/issue/ENG-318`
- ENG-320 (property-test infrastructure)
- ENG-321 (money-boundary audit — replaces all bare `Math.round`/`floor`/`ceil` on money)
- ENG-316 (Phase 0 hotfix that motivated this work) · [PR #617](https://github.com/lnflash/flash-mobile/pull/617)
- Roadmap §2 and §4.1 in `groups/main/flash-currency-precision/roadmap.md`
