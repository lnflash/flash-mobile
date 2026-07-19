#!/usr/bin/env bash
set -euo pipefail

# Load environment variables from .env.fastlane
if [ -f .env.fastlane ]; then
  set -a
  . ./.env.fastlane
  set +a
else
  echo "Error: .env.fastlane not found. Copy .env.fastlane.example and fill in your credentials."
  exit 1
fi

LANE="${1:-beta}"

# release/release_alt ship straight to real users (App Store Connect
# upload_to_app_store) with none of the CI-side guardrails
# ios-deploy.yml/ios-alt-deploy.yml enforce (release-ref validation, pinned
# Xcode/toolchain, --frozen/--deployment lockfile checks). This script
# exists for local beta testing only.
case "$LANE" in
  release|release_alt)
    echo "Error: '$LANE' ships to real users and must run via GitHub Actions workflow_dispatch, not locally." >&2
    exit 1
    ;;
esac

echo "Running iOS $LANE deploy..."
bundle exec fastlane ios "$LANE"
