## 📦 Flash App Release Process

This document outlines the steps to release the Flash app to **Google Play Console** and **App Store Connect**.

---

### 🔧 Prerequisites

- ✅ Working React Native app (tested on physical devices and simulators)
- ✅ App Store & Google Play developer accounts
- ✅ Release keystore (Android) & distribution certificate/provisioning profile (iOS)
- ✅ Correct bundle identifiers and app names
- ✅ Firebase properly configured (if used)
- ✅ Required environment variables/secrets set (e.g., via `.env`, CI/CD, or Vault)

---

## 🚀 Release to Google Play Console (Android)

### 1. **Update Version Info**

In `android/app/build.gradle`:

```groovy
versionCode  <increment this>
versionName  "<update version name>"
```

### 2. **Build AAB**

Use the following command:

```bash
yarn aab-android
```

> Make sure `yarn aab-android` is defined in your `package.json` scripts. Example:

```json
"scripts": {
  "aab-android": "bash scripts/ci/check-store-env.sh .env && cd android && ./gradlew bundleRelease && cd .."
}
```

> It runs `scripts/ci/check-store-env.sh` first, which stops the build while `ASSISTANT_DEV_LINK` (local phone builds only, ENG-734) is in `.env`, the other env files the bundle reads, or the environment.

### 3. **Upload to Google Play Console**

- Go to [Google Play Console](https://play.google.com/console)
- Select your app → **Testing** → **Open Testing** → **Create New Release**
- Upload `app-release.aab` from `android/app/build/outputs/bundle/release/`
- Fill in changelog and version info
- Roll out to testers
- After testing, promote the release to **Production**

---

## 🍏 Release to App Store Connect (iOS)

### 1. **Update Version Info**

In Xcode:

- Open the `.xcworkspace` project
- Select your target > **Build Settings**
- Update:
  - `Version` (e.g., 1.0.1)
  - `Build` (increment this number)

### 2. **Archive the iOS App**

> **Before archiving:** run `bash scripts/ci/check-store-env.sh .env` and archive only if it passes. An Xcode archive runs no check, and a checkout whose `.env` carries `ASSISTANT_DEV_LINK` (local phone builds only, ENG-734) would ship the assistant's dev link to the App Store.

- Select a real device or `Any iOS Device (arm64)`
- Go to **Product** > **Archive**
- Wait for the build to complete and archive to appear in Organizer

### 3. **Upload via Xcode or Transporter**

- In Xcode Organizer, select the archive > **Distribute App**
- Choose **App Store Connect** → **Upload**
- Validate and upload
- Alternatively, export `.ipa` and upload via [Transporter](https://apps.apple.com/us/app/transporter/id1450874784)

### 4. **Submit for Review**

- Go to [App Store Connect](https://appstoreconnect.apple.com/)
- Select your app > **+ New Version**
- Enter version number and notes
- Assign the uploaded build
- Fill in required info and submit for review

---

## 📝 Post-Release

- ✅ Monitor logs, Crashlytics, or analytics
- ✅ Update release notes in GitHub
- ✅ Tag release in Git:

```bash
git tag v1.0.0
git push origin v1.0.0
```

---

## 📂 Folder/File Structure

- `android/app/build.gradle` – Android version config
- `ios/*/Info.plist` – iOS display version (optional, shown to users)
- Xcode Build Settings – iOS version/build config
- `release-keystore.jks` – Android keystore (not committed)
- `GoogleService-Info.plist` / `google-services.json` – Firebase config
- `.env.production` – Environment variables (if used)

---


## Ask Flash optional voice pack (ENG-754)

Voice input and spoken replies remain controlled by `assistantVoice` and
`assistantVoiceReplies`, with defaults off. Automatic replies additionally require
an account preference. Debug deep links are not a store rollout mechanism.

The Android, iOS and iOS Alt deploy workflows set
`FLASH_VOICE_PACK_BASE_URL=https://voices.flashapp.me/kokoro-en-v1` after checking
the store `.env` and before building. The script verifies that this URL matches
the compiled pack version. It overrides an older URL in the `DOT_ENV` secret,
so the shared secret needs no edit. For a manual store build, run
`bash scripts/ci/check-store-env.sh .env` and then
`python3 scripts/ci/configure-voice-pack.py .env` before bundling or archiving.
The script changes the local `.env`; keep local development settings separate.

To make Ask Flash available to production users, publish these **Boolean**
Firebase Remote Config parameters in the app's Firebase project:
`assistantEnabled=true`, `assistantVoice=true`, and
`assistantVoiceReplies=true`. In project `avid-ceiling-390418`, use the
[Remote Config console](https://console.firebase.google.com/project/avid-ceiling-390418/config)
and select **Publish changes**. Scope the values to the intended audience if
rolling out in stages. Keep the experimental server and on-device model flags
as they are. No new app build is needed to change these flags, but a build made
before this URL configuration will still lack the verified download source.

Before enabling the three downloaded English voices in a store release:

- Keep the six pinned files from `scripts/voice-pack/manifest.json` available at
  the immutable HTTPS source above. Verify the source from the final Android and
  iOS store artifacts. Without it, Release hides the download control; installed
  system speech remains the fallback.
- Follow `scripts/voice-pack/README.md` to reproduce and verify all hashes. Keep
  model/audio assets out of the app bundle and repository. All three voices share
  a 102,466,705-byte download. Include the bundled model/runtime/frontend notices.
- Test actual store-mode builds on Android and a lower-memory iPhone. Measure
  binary-size increase, cold/warm first audio, peak/retained RAM, battery/thermal
  behavior and cancellation into Hold to talk. SuperMax Debug measurements do not
  establish performance for those devices.
- Verify download/delete/cancel/retry, cold-launch airplane-mode speech, route
  loss, backgrounding and screen-reader behavior. The user has confirmed the
  download/delete/retry/preview and airplane-mode suggested-question checks on
  SuperMax; broader hardware and store-build acceptance remain pending.

The native downloader checks free space before installing. Its use is declared
under `NSPrivacyAccessedAPICategoryDiskSpace` reason `E174.1` in the app's active
`ios/PrivacyInfo.xcprivacy` manifest; no free-space counters leave the device.
