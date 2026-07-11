# Deployment Quick Start

Prereqs: secrets configured per [DEPLOYMENT_SETUP.md](DEPLOYMENT_SETUP.md).

## Ship a new build (tag push)

Tags always run the **beta** path: build + upload to Play internal track (Android) or TestFlight (iOS), then commit the version bump back to `main` with `[skip ci]`.

```bash
# Android → Play internal track
git tag android/v0.6.1
git push origin android/v0.6.1

# iOS → TestFlight
git tag ios/v0.6.1
git push origin ios/v0.6.1
```

The marketing version comes from the tag (`android/vX.Y.Z[-beta.N]` / `ios/vX.Y.Z[-beta.N]` — only `X.Y.Z` is used). versionCode / build number auto-increment.

## Manual runs (workflow_dispatch)

Actions → "Android Deploy" / "iOS Deploy" → Run workflow → pick a lane.

### Android lane mapping

Play track flow is promotion-based (matching the existing fastlane lanes): `internal → alpha → beta → production`.

| Lane | What it does |
|---|---|
| `beta` (default) | Build APKs + upload to **internal** track (`build` + `play_store_upload`). |
| `promote_to_beta` | Promote internal → **alpha**. |
| `promote_to_public` | Promote alpha → **beta**. |
| `release` | Phased promotion beta → **production** (`public_phased_percent`), rollout from the `rollout` input (default `0.1` = 10%). Does **not** build — the build must already be on the beta track. |

Optional inputs: `version` / `version_code` override the values read from `build.gradle` for promote lanes; `rollout` sets the production fraction.

### iOS lane mapping

| Lane | What it does |
|---|---|
| `beta` (default) | Build IPA + upload to TestFlight (`build` + `app_store_upload`). |
| `promote_to_beta` | Distribute the TestFlight build to external tester groups. |
| `release` | Promote the current build to the App Store with phased release (`promote_to_public`). Does **not** build. |

Optional inputs: `version`, `build_number`, `changelog`.

## Typical promote flow

1. `git tag android/v0.6.1 && git push origin android/v0.6.1` → internal track.
2. Verify internally → dispatch `promote_to_beta` → alpha testers.
3. Dispatch `promote_to_public` → open beta.
4. Dispatch `release` with `rollout: 0.1` → 10% production; re-run with higher rollout to expand.

(iOS: tag → TestFlight → dispatch `promote_to_beta` for external testers → dispatch `release`.)

## Notes

- Workflows always check out and push to `main`; run releases from main.
- The old CircleCI pipeline (`.circleci/config.yml`) still exists unchanged (Browserstack tests + GCS artifact builds) and can be retired separately.
- Huawei AppGallery uploads are not wired into GitHub Actions.
- Failure runs upload build outputs / gym logs / fastlane `report.xml` as workflow artifacts.
