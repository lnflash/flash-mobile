## 📦 Flash App Release Process

This document outlines the steps to release the Flash app to **Google Play Console** and **App Store Connect**.

---

### 🔧 Prerequisites

- ✅ Working React Native app (tested on physical devices and simulators)
- ✅ App Store & Google Play developer accounts
- ✅ Release keystore (Android) & distribution certificate/provisioning profile (iOS)
- ✅ Correct bundle identifiers and app names
- ✅ Firebase properly configured (if used)
- ✅ Required secrets configured in GitHub Actions (match/App Store Connect API key, Android keystore, Google Play service account JSON, etc. — see `.env.fastlane.example` for the equivalent local-testing variables)

---

## 🚀 Releasing (GitHub Actions, all platforms)

The manual Xcode/Transporter/Play-Console-upload process this doc used to
describe has been replaced by three GitHub Actions workflows —
`ios-deploy.yml`, `ios-alt-deploy.yml`, `android-deploy.yml` — that build,
sign, and upload directly from CI. Version/build numbers are computed
automatically (from git tags, and cross-checked against what's already live
on TestFlight/Play); do not hand-edit `versionCode`/`versionName` in
`android/app/build.gradle` or `Version`/`Build` in Xcode as a release step —
the pipeline owns those fields and will commit its own bumps back to `main`.

### Beta (TestFlight / Play internal track — no user exposure)

Either:
- **Tag push**: `git tag ios/vX.Y.Z && git push origin ios/vX.Y.Z` (or
  `android/vX.Y.Z`, `ios-alt/vX.Y.Z`) — triggers the matching workflow's
  `beta`/`beta_alt` lane automatically.
- **workflow_dispatch**: run the workflow from the Actions tab with
  `lane: beta`, `ref` left blank (defaults to the current branch tip).

### Release (App Store / Play production — reaches real users)

`workflow_dispatch` only, `lane: release` (or `release_alt`), with `ref` set
to the **exact tag produced by a successful beta run** (e.g. `ios/v0.6.2-46`
— the platform prefix, version, and build number are all required; the
workflow rejects a blank ref or one that doesn't resolve to a real beta tag).
iOS/iOS-Alt still require a manual "Submit for Review" click in App Store
Connect afterward; Android release lane on Google Play starts landing at a
10% staged rollout automatically.

**Never** push a bare `vX.Y.Z` tag (no platform prefix) expecting it to
trigger anything — that convention is gone, and the pipeline's own version
resolution deliberately does not recognize it.

---

## 📝 Post-Release

- ✅ Monitor logs, Crashlytics, or analytics
- The pipeline tags and commits the version bump back to `main`
  automatically — no manual git tagging step is needed.

---

## 📂 Folder/File Structure

- `android/app/build.gradle` – Android version config
- `ios/*/Info.plist` – iOS display version (optional, shown to users)
- Xcode Build Settings – iOS version/build config
- `release-keystore.jks` – Android keystore (not committed)
- `GoogleService-Info.plist` / `google-services.json` – Firebase config
- `.env.production` – Environment variables (if used)

---
