#!/usr/bin/env bash

set -Eeuo pipefail

on_error() {
  local exit_code=$?
  echo "Error: command '${BASH_COMMAND}' failed with exit code ${exit_code} at line ${BASH_LINENO[0]}." >&2
  exit "${exit_code}"
}

trap on_error ERR

require_command() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: required command '$cmd' is not installed or not in PATH." >&2
    exit 1
  fi
}

ensure_node_24() {
  local current_major=""

  if command -v node >/dev/null 2>&1; then
    current_major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || true)"
  fi

  if [[ "$current_major" == "24" ]]; then
    echo "Node.js v24 is already active."
    return
  fi

  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck source=/dev/null
    . "$NVM_DIR/nvm.sh"
  fi

  if ! command -v nvm >/dev/null 2>&1; then
    echo "Error: Node.js v24 is required, and nvm was not found. Install nvm first." >&2
    exit 1
  fi

  echo "Switching to Node.js v24 using nvm..."
  if ! nvm use 24 >/dev/null 2>&1; then
    echo "Node.js v24 not found locally. Installing with nvm..."
    nvm install 24 >/dev/null
    nvm use 24 >/dev/null
  fi

  current_major="$(node -p "process.versions.node.split('.')[0]")"
  if [[ "$current_major" != "24" ]]; then
    echo "Error: failed to activate Node.js v24 (current: v$(node -v))." >&2
    exit 1
  fi

  echo "Using Node.js $(node -v)."
}

with_pod_shim() {
  local shim_dir
  local status

  shim_dir="$(mktemp -d "${TMPDIR:-/tmp}/reset-dev-pod-shim.XXXXXX")"
  cat > "${shim_dir}/pod" <<'SH'
#!/usr/bin/env bash
echo "Skipping CocoaPods during yarn install; reset-dev.sh runs pod install later."
exit 0
SH
  chmod +x "${shim_dir}/pod"

  set +e
  PATH="${shim_dir}:${PATH}" "$@"
  status=$?
  set -e

  rm -rf "${shim_dir}"
  return "${status}"
}

main() {
  require_command rm
  require_command yarn

  ensure_node_24

  echo "Deleting installed libraries and caches..."
  rm -rf node_modules
  rm -rf .cache

  echo "Cleaning Android and iOS build artifacts..."
  rm -rf android/app/build
  rm -rf ios/build
  rm -rf ios/Pods
  rm -rf ios/DerivedData
  rm -rf ios/xcuserdata

  echo "Installing JavaScript dependencies from yarn.lock..."
  with_pod_shim yarn install --frozen-lockfile

  if [[ -d ios ]]; then
    require_command pod
    pushd ios >/dev/null
    if [[ "${UPDATE_PODS:-0}" == "1" ]]; then
      pod install --repo-update
    else
      pod install
    fi
    popd >/dev/null
  else
    echo "Warning: ios directory not found. Skipping CocoaPods install."
  fi

  if [[ -d android ]]; then
    if [[ -x android/gradlew ]]; then
      pushd android >/dev/null
      ./gradlew clean
      popd >/dev/null
    else
      echo "Warning: android/gradlew not executable or not found. Skipping Android clean."
    fi
  else
    echo "Warning: android directory not found. Skipping Android clean."
  fi

  echo "Clean and rebuild completed successfully!"

  make codegen
  if [[ "${START_METRO:-1}" == "1" ]]; then
    yarn start --reset-cache
  else
    echo "Skipping Metro start because START_METRO=${START_METRO}."
  fi
  echo "All done! You can now run your app with 'yarn android' or 'yarn ios'."
}

main "$@"
