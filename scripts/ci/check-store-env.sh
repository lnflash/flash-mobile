#!/usr/bin/env bash
# Refuses a store build's .env that carries ASSISTANT_DEV_LINK (ENG-734).
#
# ASSISTANT_DEV_LINK=true makes a production-mode bundle honour the
# assistant's dev link, flash://dev/assistant?on=1
# (app/config/assistant-dev-override.ts). It is for local phone builds only.
# The deploy workflows write .env from the DOT_ENV secret and run this right
# after, before anything is built, so a .env pasted from a developer's
# machine fails the deploy instead of reaching the stores. Any mention fails,
# whatever its value, even a commented-out line.
#
# It prints nothing from the file: that holds the store build's secrets.
#
# Usage: bash scripts/ci/check-store-env.sh [env-file]   (default: .env)
set -euo pipefail

env_file="${1:-.env}"

if [ ! -f "$env_file" ] || [ ! -r "$env_file" ]; then
  echo "::error::check-store-env: cannot read ${env_file}"
  exit 1
fi

if grep -q ASSISTANT_DEV_LINK "$env_file"; then
  echo "::error file=${env_file}::ASSISTANT_DEV_LINK is for local phone builds only and must never reach a store build. Remove it from the DOT_ENV secret."
  exit 1
fi

echo "check-store-env: ${env_file} carries no ASSISTANT_DEV_LINK"
