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
  "aab-android": "cd android && ./gradlew bundleRelease"
}
```

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
