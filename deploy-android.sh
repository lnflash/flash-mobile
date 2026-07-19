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

# release ships straight to real users (Play production track, 10% staged
# rollout) with none of the CI-side guardrails android-deploy.yml enforces
# (release-ref validation, pinned toolchain, --frozen/--deployment lockfile
# checks). This script exists for local beta testing only.
case "$LANE" in
  release)
    echo "Error: '$LANE' ships to real users and must run via GitHub Actions workflow_dispatch on android-deploy.yml, not locally." >&2
    exit 1
    ;;
esac

echo "Running Android $LANE deploy..."
bundle exec fastlane android "$LANE"
