#!/usr/bin/env bash
# Refuses a store build that would carry ASSISTANT_DEV_LINK (ENG-734).
#
# ASSISTANT_DEV_LINK=true makes a production-mode bundle honour the
# assistant's dev link, flash://dev/assistant?on=1
# (app/config/assistant-dev-override.ts). It is for local phone builds only.
#
# react-native-dotenv (babel.config.js) inlines it when the bundle is made. It
# reads the env file, then <file>.local, <file>.<mode> and <file>.<mode>.local
# over it, and puts the process environment over them all. A release bundle's
# mode is production unless APP_ENV, BABEL_ENV or NODE_ENV names another, so
# this checks production and every mode those three name. It fails when any of
# those files mentions the key, whatever its value and even on a commented-out
# line, and when the key is set in its own environment. Templates such as
# .env.example are not read by the bundle and are not checked.
#
# Who runs it, before anything is built: the deploy workflows, right after
# they write .env from the DOT_ENV secret; the Fastfile's store lanes; and
# `yarn aab-android` / `yarn apk-android`. An archive made by hand in Xcode
# runs no check, so docs/release.md says to run this first.
#
# It prints nothing from the files: they hold the store build's secrets.
#
# Usage: bash scripts/ci/check-store-env.sh [env-file]   (default: .env)
set -euo pipefail

env_file="${1:-.env}"

if [ ! -f "$env_file" ] || [ ! -r "$env_file" ]; then
  echo "::error::check-store-env: cannot read ${env_file}"
  exit 1
fi

files=("$env_file")
add_file() {
  local known
  for known in "${files[@]}"; do
    if [ "$known" = "$1" ]; then return 0; fi
  done
  files+=("$1")
}
add_file "${env_file}.local"
for mode in production "${APP_ENV:-}" "${BABEL_ENV:-}" "${NODE_ENV:-}"; do
  if [ -n "$mode" ]; then
    add_file "${env_file}.${mode}"
    add_file "${env_file}.${mode}.local"
  fi
done

status=0

if [ -n "${ASSISTANT_DEV_LINK+set}" ]; then
  echo "::error::ASSISTANT_DEV_LINK is set in the environment, which react-native-dotenv puts over every env file. It is for local phone builds only and must never reach a store build. Unset it."
  status=1
fi

for file in "${files[@]}"; do
  # Only the env file itself must exist; the bundle reads the others if they do.
  [ -e "$file" ] || continue
  if [ ! -f "$file" ] || [ ! -r "$file" ]; then
    echo "::error::check-store-env: cannot read ${file}"
    status=1
  elif grep -q ASSISTANT_DEV_LINK "$file"; then
    echo "::error file=${file}::ASSISTANT_DEV_LINK is for local phone builds only and must never reach a store build. Remove it from ${file} (a deploy workflow writes .env from the DOT_ENV secret)."
    status=1
  fi
done

if [ "$status" -ne 0 ]; then
  exit 1
fi

echo "check-store-env: no ASSISTANT_DEV_LINK in ${env_file}, the env files the bundle reads beside it, or the environment"
