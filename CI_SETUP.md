# Flash E2E — CI Setup

## Strategy

| Platform | Where | Why |
|----------|-------|-----|
| **iOS E2E** | Self-hosted ForgeMini (M4 Mac Mini) | GitHub-hosted macOS runners don't have iPhone simulators; M4 runs at full speed |
| **Android E2E** | Self-hosted ForgeMini (M4 Mac Mini) | ARM64 emulator runs natively on M4; free vs GitHub-hosted $0.16/min |
| **Unit/integration** | GitHub-hosted ubuntu-latest | Fast, cheap, parallelizable |

ForgeMini is registered as a self-hosted GitHub Actions runner with labels `[self-hosted, macOS, apple-silicon, forgemini]`.

---

## Registering ForgeMini as a GitHub Actions runner

On ForgeMini:
```bash
# Download and configure
mkdir ~/actions-runner && cd ~/actions-runner
curl -o actions-runner-osx-arm64.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.322.0/actions-runner-osx-arm64-2.322.0.tar.gz
tar xzf ./actions-runner-osx-arm64.tar.gz

# Register (get token from: GitHub repo → Settings → Actions → Runners → New runner)
./config.sh --url https://github.com/lnflash/flash-mobile \
  --token YOUR_RUNNER_TOKEN \
  --name ForgeMini \
  --labels self-hosted,macOS,apple-silicon,forgemini \
  --work _work

# Install as launchd service (survives reboots)
./svc.sh install
./svc.sh start
```

---

## Workflow: E2E on ForgeMini (iOS + Android)

File: `.github/workflows/e2e.yml`

```yaml
name: E2E Tests

on:
  pull_request:
    paths:
      - 'app/**'
      - 'e2e/**'
      - 'index.js'
      - 'package.json'
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      suite:
        description: 'Test suite (critical|storybook|all)'
        default: 'critical'

concurrency:
  group: e2e-${{ github.ref }}
  cancel-in-progress: true

jobs:
  e2e-ios:
    name: E2E — iOS Simulator
    runs-on: [self-hosted, macOS, apple-silicon, forgemini]
    timeout-minutes: 45

    steps:
      - uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'yarn'

      - name: Install dependencies
        run: yarn install --frozen-lockfile

      - name: Install CocoaPods
        run: cd ios && pod install --repo-update && cd ..

      - name: Run iOS E2E
        run: ./scripts/e2e-ios --suite ${{ github.event.inputs.suite || 'critical' }}
        env:
          MAESTRO_CLI_NO_ANALYTICS: "true"

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: e2e-ios-${{ github.run_number }}
          path: e2e-artifacts/
          retention-days: 30

  e2e-android:
    name: E2E — Android Emulator
    runs-on: [self-hosted, macOS, apple-silicon, forgemini]
    timeout-minutes: 60

    steps:
      - uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'yarn'

      - name: Set up Java 17
        run: |
          export JAVA_HOME=/opt/homebrew/opt/openjdk@17
          echo "JAVA_HOME=$JAVA_HOME" >> $GITHUB_ENV
          echo "$JAVA_HOME/bin" >> $GITHUB_PATH

      - name: Install dependencies
        run: yarn install --frozen-lockfile

      - name: Run Android E2E
        run: ./scripts/e2e-android --suite ${{ github.event.inputs.suite || 'critical' }} --no-snapshot-save
        env:
          MAESTRO_CLI_NO_ANALYTICS: "true"
          ANDROID_HOME: ${{ env.HOME }}/Library/Android/sdk

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: e2e-android-${{ github.run_number }}
          path: e2e-artifacts/
          retention-days: 30

      - name: Publish test results
        uses: mikepenz/action-junit-report@v4
        if: always()
        with:
          report_paths: 'e2e-artifacts/**/results.xml'
```

---

## Workflow: Storybook visual regression (nightly)

File: `.github/workflows/storybook-maestro.yml`

```yaml
name: Storybook Visual Tests

on:
  schedule:
    - cron: '0 6 * * *'   # 2AM EST nightly
  workflow_dispatch:

jobs:
  storybook-ios:
    runs-on: [self-hosted, macOS, apple-silicon, forgemini]
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
      - run: yarn install --frozen-lockfile
      - run: cd ios && pod install && cd ..
      - run: ./scripts/e2e-ios --suite storybook
        env:
          MAESTRO_CLI_NO_ANALYTICS: "true"
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: storybook-ios-${{ github.run_number }}
          path: e2e-artifacts/
          retention-days: 90
```

---

## Required GitHub secrets

| Secret | Description |
|--------|-------------|
| (none currently) | Scripts read from local env on ForgeMini |

For future backend E2E with live test env, add:
- `TEST_PHONE_NUMBER` — test account phone
- `TEST_ENV_API_URL` — test API endpoint

---

## Known limitations

1. **Single runner** — iOS and Android jobs run sequentially on ForgeMini (one machine). Add a second runner for parallelism.
2. **No baseline diffing** — screenshots are uploaded as artifacts but not compared automatically. Add Applitools Eyes or Percy for visual regression.
3. **Backend not started in CI** — current flows run against `api.test.flashapp.me`. Add `dev-up --backend-only` step for full local stack testing.
4. **Snapshot caching** — Android emulator cold-boots in CI (`--no-snapshot-save`). ~3 min overhead. Accept it.
