# Storybook CI: Visual Testing with Detox

## Overview

Storybook visual regression tests run the app in Storybook mode on a real Android emulator
and take screenshots of representative stories on every PR that touches story files.

Screenshots are uploaded as GitHub Actions artifacts for review on each run.

## Architecture

```
PR opens
  └── .github/workflows/storybook-detox.yml triggers
        └── self-hosted runner: vandana-dev (Ubuntu 24.04, KVM)
              ├── sed patches index.js → SHOW_STORYBOOK = true
              ├── Gradle builds debug APK (x86_64, ~8 min)
              ├── Android emulator boots (Pixel 6 API 34, KVM)
              ├── Detox runs storybook.test.ts (18 stories, ~6 min)
              └── Screenshots uploaded as artifacts (30-day retention)
```

## Self-hosted Runner: vandana-dev

- **Host:** DigitalOcean droplet, Ubuntu 24.04 LTS
- **Specs:** 4 vCPU, 8GB RAM, 155GB SSD
- **KVM:** Available (nested virtualization enabled)
- **Android SDK:** /opt/android-sdk (API 34, x86_64)
- **AVD:** Pixel_API_34 (Pixel 6, Google APIs)
- **Labels:** `self-hosted`, `linux`, `android`
- **Runner service:** `actions.runner.lnflash-flash-mobile.vandana-dev`

## TODO: iOS Support

> **Blocked on:** Mac Mini CI node (to be provisioned)

When the Mac Mini is available:
1. Install GitHub Actions runner with labels `self-hosted`, `macos`, `ios`
2. Install Xcode + iOS Simulator (iPhone SE or iPhone 16)
3. Add `ios.sim.storybook` configuration to `.detoxrc.json`
4. Add `e2e-ios` job to `storybook-detox.yml` running in parallel

## Story Coverage

The CI run tests 18 representative stories (one per major area).
Full coverage (all 57 stories) can be triggered manually.

See `e2e/storybook/storybook.test.ts` for the full list.

## Adding Stories to CI Tests

When you add a new story, add it to the `STORIES_TO_TEST` array in
`e2e/storybook/storybook.test.ts`:

```ts
// [kind from Meta title, storyName from export name]
["My Screen/MyComponent", "DefaultVariant"],
```

## Local Storybook Mode

To run the app in Storybook mode locally:

```sh
# index.js: set SHOW_STORYBOOK = true, then:
yarn android
```

Or use the Storybook server for hot-reload:
```sh
yarn storybook        # starts web UI on :9001
yarn storybook-watcher  # watches for story file changes
```
