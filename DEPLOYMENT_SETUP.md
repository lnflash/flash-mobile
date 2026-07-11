# Deployment Setup (GitHub Actions)

One-time setup for the store-deploy pipelines in `.github/workflows/android-deploy.yml` and `.github/workflows/ios-deploy.yml`. For day-to-day usage see [DEPLOYMENT_QUICK_START.md](DEPLOYMENT_QUICK_START.md).

## GitHub secrets (Settings → Secrets and variables → Actions → Secrets)

### Shared

| Secret | What it is | How to obtain |
|---|---|---|
| `DOT_ENV` | Full contents of the app `.env` file (react-native-config). | Copy your working local `.env`. It is written verbatim to the repo root before the build. |

### Android

| Secret | What it is | How to obtain |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | Base64 of the release keystore. | `base64 -i release.keystore \| pbcopy` from the keystore currently used by the CircleCI pipeline (env var `RELEASE_KEYSTORE` there). |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore store password. | From whoever generated the keystore / your secrets vault. Wired into `MYAPP_UPLOAD_STORE_PASSWORD`. |
| `ANDROID_KEY_ALIAS` | Key alias inside the keystore (`flash-release` today). | `keytool -list -keystore release.keystore`. Wired into `MYAPP_UPLOAD_KEY_ALIAS`. |
| `ANDROID_KEY_PASSWORD` | Key password. | Same source as the store password. Wired into `MYAPP_UPLOAD_KEY_PASSWORD`. |
| `GOOGLE_PLAY_JSON_KEY` | Google Play service-account JSON (raw JSON, not base64). | Play Console → Setup → API access → create/choose a service account in Google Cloud → create a JSON key → grant the account release permissions for `com.lnflash`. Written at run time to `android/fastlane/lnflash-2e25e160d4ba.json` (the path the Appfile expects). |

Note: `android/gradle.properties` in the repo contains placeholder `MYAPP_UPLOAD_*` values. CI overrides them via `~/.gradle/gradle.properties`, which takes precedence; the tracked file is not modified.

### iOS

| Secret | What it is | How to obtain |
|---|---|---|
| `MATCH_PASSWORD` | Passphrase encrypting the match signing repo. | Must be the passphrase that encrypted the certs in `lnflash/flash-mobile-certificates`. Also used as the CI keychain password. |
| `MATCH_GIT_BASIC_AUTHORIZATION` | `base64("<github-username>:<personal-access-token>")` for a user/machine account with **read access to the match repo**. | `echo -n 'user:ghp_xxx' \| base64`. The PAT needs `repo` read on the signing repo. |
| `APP_STORE_CONNECT_API_KEY_ID` | App Store Connect API key ID. | App Store Connect → Users and Access → Integrations → App Store Connect API → generate a key with App Manager role. |
| `APP_STORE_CONNECT_API_ISSUER_ID` | ASC API issuer ID. | Same page as above. |
| `APP_STORE_CONNECT_API_KEY_CONTENT` | Base64 of the `.p8` private key. | `base64 -i AuthKey_XXXX.p8`. (The workflow maps these to the env names the existing `ios/fastlane/Fastfile`.) |
| `APP_STORE_CONNECT_REVIEW_EMAIL` / `_FIRST_NAME` / `_LAST_NAME` / `_PHONE` | Review contact info (only used by promote lanes). | Optional; team contact details. |
| `DEMO_ACCOUNT_NAME` / `DEMO_ACCOUNT_PASSWORD` | Demo account for App Review (promote lanes). | Optional. |

### Variables (Settings → Secrets and variables → Actions → Variables)

| Variable | Default | Purpose |
|---|---|---|
| `MATCH_GIT_URL` | `https://github.com/lnflash/flash-mobile-certificates` | Match repo URL. Must be the **https** form so `MATCH_GIT_BASIC_AUTHORIZATION` works. Only set the variable to point somewhere else. |
| `EXTERNAL_TESTING_GROUPS` | (unset) | TestFlight external tester groups for `promote_to_beta`. |

## Match repo access

The Matchfile reads `MATCH_GIT_URL` from the environment and defaults to the lnflash-owned `https://github.com/lnflash/flash-mobile-certificates` (contains `certs/`, `profiles/`, `match_version.txt`). CI uses basic auth over https — no deploy SSH key needed. The account behind the PAT must have read access to that repo (or to whatever repo `MATCH_GIT_URL` points at).

Note: `MATCH_PASSWORD` must be the passphrase that encrypted the certs already in that repo. If those certs were not created by your match setup (or the passphrase is unknown), run `fastlane match appstore` once locally in read-write mode to regenerate certs/profiles into the repo with a passphrase you control.

## Branch permissions

Both workflows commit a version bump back to `main` with `[skip ci]` and `git push origin main --follow-tags` using the default `GITHUB_TOKEN`. Ensure:

- Workflow permissions: Settings → Actions → General → Workflow permissions → "Read and write permissions".
- If `main` is branch-protected, allow the `github-actions[bot]` pushes (or swap `GITHUB_TOKEN` for a PAT/app token with bypass rights).

## Differences from the CircleCI pipeline

The `.circleci/config.yml` pipeline is **left untouched** and can be retired once this pipeline is proven. Differences:

- CircleCI builds are API-triggered with `version`/`build_number` parameters and upload artifacts to GCS; store uploads are a separate API-triggered job. The GHA pipeline is tag/dispatch-triggered, computes versions itself, and uploads straight to the stores — no GCS intermediary.
- Version bumps are committed back to `main` by CI (CircleCI never committed).
- The Huawei AppGallery lane (`huawei_store_upload`) is **not wired** into GHA (needs `HUAWEI_CLIENT_ID`/`HUAWEI_CLIENT_SECRET`/`HUAWEI_APP_ID` and a universal APK artifact path).
- Browserstack e2e lanes remain CircleCI-only.

## Open items to verify before first real release

1. **Xcode version** — CircleCI pinned Xcode 14.2, which is unavailable on GitHub's macos-15 runners; the workflow uses `latest-stable`. The iOS Ruby toolchain has been modernized (ruby 3.2.2, fastlane 2.237.0, cocoapods 1.15.2 in `ios/Gemfile`), but `pod install` under the new CocoaPods and the project building on latest-stable Xcode are **unverified** — a dispatch `beta` dry run is the first-run verify item.
2. **Match certs validity** — `MATCH_PASSWORD` must match the passphrase used to encrypt `lnflash/flash-mobile-certificates`; if the certs there weren't produced by this team's match setup, run `fastlane match appstore` once in read-write mode to regenerate.
3. **Play promotion version codes** — Android builds use ABI-split `versionCodeOverride` (e.g. `3xxxxxxxx` for arm64). The promote lanes pass the base `versionCode` from `build.gradle`; if Play rejects the promotion, pass the actual uploaded code via the `version_code` dispatch input.
4. **`GOOGLE_PLAY_JSON_KEY` path resolution** — the key is written to both `android/fastlane/` and `android/` to cover fastlane's relative-path resolution; once confirmed, one can be dropped.
