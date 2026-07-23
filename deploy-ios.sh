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
echo "Running iOS $LANE deploy..."
bundle exec fastlane ios "$LANE"
