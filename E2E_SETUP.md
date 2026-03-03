# Flash E2E Testing Setup

Optimized for **Apple Silicon (M4 Mac Mini)**. Uses Maestro for mobile E2E — black-box, no test APK needed, works on both iOS Simulator and Android emulator.

## Why Maestro (not Detox, not Appium)

| | Maestro | Detox | Appium |
|---|---|---|---|
| **Test APK required** | ❌ No | ✅ Yes | ✅ Yes |
| **Breez SDK conflict** | ❌ None | ⚠️ Breaks (libc++_shared.so) | ⚠️ Breaks |
| **Setup time** | ~30 min | ~3 hours | ~5 hours |
| **YAML flows** | ✅ | ❌ JS only | ❌ JS only |
| **iOS Simulator** | ✅ | ✅ | ✅ |
| **ARM Android** | ✅ | ✅ | ✅ |

**Detox is explicitly ruled out** for this repo: its `assembleAndroidTest` step hits a `libc++_shared.so` native lib conflict with the Breez Spark SDK. Maestro sidesteps this entirely.

---

## Prerequisites

```bash
./scripts/doctor   # checks everything below
```

| Tool | Version | Install |
|------|---------|---------|
| macOS | Apple Silicon | — |
| Xcode | 15+ | App Store |
| iOS Simulator | iPhone 17 Pro | Xcode → Simulators |
| Node | 22+ | `nvm install 22` |
| Yarn | 1.x | `npm i -g yarn` |
| Java | 17 | `brew install openjdk@17` |
| Android SDK | API 36 | Android Studio |
| ARM64 AVD | Medium_Phone_API_36.1 | Android Studio → AVD Manager |
| Maestro | latest | `curl -Ls 'https://get.maestro.mobile.dev' \| bash` |
| Docker Desktop | latest | docker.com |
| gh CLI | latest | `brew install gh` |

---

## First-time setup

```bash
# 1. Clone repos
mkdir ~/dev && cd ~/dev
gh repo clone lnflash/flash-mobile
gh repo clone lnflash/flash

# 2. Configure environment
cp ~/dev/flash/.env.ci ~/dev/flash/.env
# Edit .env — set TWILIO_VERIFY_SERVICE_SID, IBEX credentials etc for test mode

# 3. Install mobile deps
cd ~/dev/flash-mobile
yarn install
cd ios && pod install && cd ..

# 4. Install backend deps
cd ~/dev/flash
yarn install

# 5. Verify everything
cd ~/dev/flash-mobile
./scripts/doctor
```

---

## Running tests

### Start the full stack
```bash
cd ~/dev/flash-mobile
./scripts/dev-up
# Starts: MongoDB, Redis, Apollo Router, Oathkeeper, Kratos, Flash API, Metro
```

### iOS E2E (primary — fastest on M4)
```bash
# First time (builds app ~10 min):
./scripts/e2e-ios

# Subsequent runs (skip build):
./scripts/e2e-ios --skip-build

# Storybook visual tests:
./scripts/e2e-ios --suite storybook

# Specific device:
./scripts/e2e-ios --device "iPhone 17 Pro"
```

### Android E2E
```bash
# First time (builds APK ~9 min):
./scripts/e2e-android

# Subsequent runs:
./scripts/e2e-android --skip-build

# Storybook:
./scripts/e2e-android --suite storybook
```

### Reset test state between runs
```bash
./scripts/e2e-reset                 # soft reset (app data only)
./scripts/e2e-reset --hard          # full DB wipe + reseed
./scripts/e2e-reset --simulator-only
./scripts/e2e-reset --emulator-only
```

### Validate environment
```bash
./scripts/doctor
```

---

## Test artifacts

Each run saves artifacts to `e2e-artifacts/YYYYMMDD_HHMMSS-{ios|android}/`:

```
e2e-artifacts/
  20260303_142533-ios/
    e2e.log          ← full run log
    metro.log        ← Metro bundler output
    maestro.log      ← Maestro test output
    results.xml      ← JUnit XML (for CI)
    screenshots/     ← Maestro screenshots per flow
```

Artifacts older than 7 days are auto-cleaned by `e2e-reset`.

---

## Writing new flows

Maestro flows live in `e2e/flows/`. YAML syntax:

```yaml
appId: com.lnflash
---
- launchApp:
    clearState: false
- waitForAnimationToEnd        # singular — NOT waitForAnimationsToEnd
- tapOn:
    text: "Send"
- waitForAnimationToEnd
- takeScreenshot: "send-screen"
```

**Key gotchas:**
- Command is `waitForAnimationToEnd` (singular) — `waitForAnimationsToEnd` will silently fail all tests
- Use `optional: true` on taps that may not always appear
- Use `anyOf:` for text that varies by auth state

---

## Troubleshooting

### iOS build fails
```bash
cd ios && pod deintegrate && pod install && cd ..
# Then retry e2e-ios
```

### Android APK missing JS bundle
```bash
# Pre-bundle manually then rebuild:
mkdir -p android/app/src/main/assets
node node_modules/.bin/react-native bundle \
  --platform android --dev true \
  --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --reset-cache
rm -f android/app/build/outputs/apk/debug/*.apk
cd android && ./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a && cd ..
```
> **Why:** Gradle's incremental build skips JS recompilation if it thinks nothing changed. Always pre-bundle explicitly for E2E.

### Android emulator won't boot
```bash
# Check for stale lock files
rm -f ~/.android/avd/Medium_Phone_API_36.1.avd/*.lock
# Verify ARM64 AVD (not x86_64 — ARM runs natively on M4)
$ANDROID_HOME/emulator/emulator -list-avds
```

### Maestro can't find elements
```bash
# Dump the view hierarchy to see actual text labels
~/.maestro/bin/maestro hierarchy > /tmp/hierarchy.json
# Check text labels in flows match exactly what's rendered
```

### Metro fails to start
```bash
pkill -f 'react-native start' && yarn start --reset-cache
```

---

## Directory structure

```
flash-mobile/
  scripts/
    doctor           ← validate environment
    dev-up           ← start full stack
    e2e-ios          ← run iOS E2E
    e2e-android      ← run Android E2E
    e2e-reset        ← wipe + reseed test state
  e2e/
    flows/
      critical/      ← critical path flows (5 flows)
      storybook/     ← visual regression flows (18 flows)
    .maestro.yaml    ← workspace config
  e2e-artifacts/     ← test output (gitignored)
  E2E_SETUP.md       ← this file
  CI_SETUP.md        ← CI configuration guide
```
