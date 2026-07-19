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
# rollout); promote_to_beta pushes the internal build to Play's beta
# (open/closed testing) track, a materially different and possibly much
# larger audience than internal testing — neither gets android-deploy.yml's
# guardrails (release-ref validation, pinned toolchain, --frozen/--deployment
# lockfile checks) when run this way. This script exists for local beta
# (internal-track) testing only.
case "$LANE" in
  release|promote_to_beta)
    echo "Error: '$LANE' ships to real users and must run via GitHub Actions workflow_dispatch on android-deploy.yml, not locally." >&2
    exit 1
    ;;
esac

echo "Running Android $LANE deploy..."
bundle exec fastlane android "$LANE"
