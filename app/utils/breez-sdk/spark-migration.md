# Spark Migration: Liquid to Spark Wallet

## Overview

This migration transfers user funds from the legacy Breez Liquid SDK wallet to the new Breez Spark SDK wallet. The swap fee is covered by Flash via an LNURL-withdraw link.

## How It Works

```
Liquid Wallet ──(Lightning submarine swap)──> Spark Wallet
                                                  │
                              LNURL-w fee ────────┘
                              reimbursement
```

### Flow

1. **Init Liquid SDK** — Connect to the Liquid SDK using the shared mnemonic from Keychain (`mnemonic_key`)
2. **Sync** — Call `sync()` to ensure the Liquid wallet has up-to-date balance
3. **Check balance** — If `balanceSat > max(limits.send.minSat, 100)`, proceed
4. **Fee discovery** — Generate a Spark bolt11 invoice for `balance / 2`, call `prepareSendPayment` on the Liquid side to discover the fee
5. **Drain** — Generate a new Spark invoice for `balance - fee * 1.5` (with safety margin), prepare and send from Liquid
6. **Fee reimbursement** — Withdraw `fee * 1.5` sats from the LNURL-w link (`MIGRATION_FEE_LNURL_W` in `.env`) into the user's Spark wallet
7. **Disconnect Liquid** — Disconnect Liquid SDK and delete its working directory

### Trigger Points

- **App startup** — `BreezContext.getBreezInfo()` checks `persistentState.sparkMigrationCompleted`. If not completed, calls `onMigrate()` after Spark SDK initializes.
- **Wallet import** — `ImportWallet.onComplete()` resets `sparkMigrationCompleted: false`, navigates to Primary screen, which remounts BreezProvider and triggers migration.

### State Flag

`sparkMigrationCompleted` (optional boolean) on `PersistentState_7` in `state-migrations.ts`:
- `undefined` or `false` — migration not yet completed, will attempt on next app launch
- `true` — migration completed successfully (or no funds to migrate)

### Retry Behavior

- On **success** or **no funds**: `sparkMigrationCompleted` is set to `true`
- On **failure**: `sparkMigrationCompleted` stays `false`, migration retries on next app launch
- Fee reimbursement failure does NOT block migration success — funds are already transferred

### UI

`SparkMigrationModal` shows during migration:
- Loading spinner while in progress
- Error message if migration fails
- "Export Liquid Transactions" button (CSV via share sheet)
- "Complete" button to dismiss
- `onModalHide` calls `disconnectLiquidSdk` to clean up

## Files Involved

| File | What it does |
|---|---|
| `app/utils/breez-sdk/migration.ts` | Core migration logic: `handleSparkMigration`, `drainLiquidWallet`, `feeReimbursement`, `exportLiquidTxs`, `disconnectLiquidSdk` |
| `app/utils/breez-sdk/index.ts` | Barrel export — re-exports `migration.ts` |
| `app/utils/breez-sdk/spark.ts` | Spark SDK wrapper — `receivePaymentBreez` (generates bolt11), `lnurlWithdraw` (fee reimbursement) |
| `app/contexts/BreezContext.tsx` | Triggers migration after Spark SDK init, renders `SparkMigrationModal`, manages migration state |
| `app/components/spark-migration-modal/index.tsx` | Migration modal UI |
| `app/screens/import-wallet-screen/ImportWallet.tsx` | Resets `sparkMigrationCompleted: false` on wallet import |
| `app/store/persistent-state/state-migrations.ts` | `sparkMigrationCompleted` field on `PersistentState_7` |
| `app/types/declaration.d.ts` | `MIGRATION_FEE_LNURL_W` env var declaration |
| `.env` | `MIGRATION_FEE_LNURL_W` — static LNURL-withdraw link for fee reimbursement |

## Cleanup: Removing Migration After All Users Migrate

Once all users have migrated (future release), remove all migration-related code:

| File | Action |
|---|---|
| `app/utils/breez-sdk/migration.ts` | **Delete entire file** |
| `app/utils/breez-sdk/index.ts` | Remove `export * from "./migration"` |
| `app/contexts/BreezContext.tsx` | Remove: `onMigrate`, `migrating`/`migrationModal`/`migrationErr` state, `initializingRef`, migration trigger in `getBreezInfo`, `SparkMigrationModal` import and render |
| `app/components/spark-migration-modal/` | **Delete entire directory** |
| `app/screens/import-wallet-screen/ImportWallet.tsx` | Remove `sparkMigrationCompleted: false` from `updateStateHandler` |
| `app/store/persistent-state/state-migrations.ts` | Remove `sparkMigrationCompleted` from `PersistentState_7` |
| `app/types/declaration.d.ts` | Remove `MIGRATION_FEE_LNURL_W` |
| `.env` | Remove `MIGRATION_FEE_LNURL_W` |
| `package.json` | Remove `@breeztech/react-native-breez-sdk-liquid` dependency |
| `app/utils/breez-sdk-liquid/` | **Delete entire directory** (if still present) |

### Cleanup checklist

- [ ] Delete migration files listed above
- [ ] Remove `@breeztech/react-native-breez-sdk-liquid` from `package.json`
- [ ] Run `yarn install` to update lockfile
- [ ] Search codebase for `sparkMigration`, `liquidWallet`, `disconnectLiquidSdk`, `exportLiquidTxs` — remove any remaining references
- [ ] Test that app starts without errors after removal
