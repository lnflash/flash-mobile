#!/usr/bin/env bash
# Flash E2E Test Helpers
# Shared constants and utility functions for all test flows

set -uo pipefail
# NOTE: We intentionally do NOT use set -e. Individual Maestro steps can fail
# (e.g. element not found) without crashing the whole suite. Each test section
# handles its own error checking.

# ── Devices ──────────────────────────────────────────────────────────────────
IOS_UDID="3F94623D-0433-40D7-A968-2C49FF9E02DB"
ANDROID_SERIAL="emulator-5554"
MAESTRO="$HOME/.maestro/bin/maestro"
APP_ID="com.lnflash"

# ── Test Accounts ────────────────────────────────────────────────────────────
ACCOUNT_1="forgetest1"   # iOS, JMD, has Cash + BTC
ACCOUNT_2="forgetest2"   # Android, JMD, has Cash

# ── Output ───────────────────────────────────────────────────────────────────
RESULTS_DIR="${RESULTS_DIR:-$(dirname "$0")/../results/$(date +%Y-%m-%d_%H%M%S)}"
FLOW_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../flows" && pwd)"
PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

mkdir -p "$RESULTS_DIR"

# ── Logging ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_section() { echo -e "\n${BLUE}━━━ $1 ━━━${NC}"; }
log_pass()    { echo -e "  ${GREEN}✅ PASS${NC} — $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
log_fail()    { echo -e "  ${RED}❌ FAIL${NC} — $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
log_skip()    { echo -e "  ${YELLOW}⏭  SKIP${NC} — $1"; SKIP_COUNT=$((SKIP_COUNT + 1)); }
log_info()    { echo -e "  ${YELLOW}ℹ️ ${NC} $1"; }

# ── iOS Helpers ──────────────────────────────────────────────────────────────
ios_screenshot() {
  local name="${1:-screenshot}"
  local path="$RESULTS_DIR/${name}.png"
  xcrun simctl io "$IOS_UDID" screenshot "$path" 2>/dev/null
  echo "$path"
}

ios_record_start() {
  local name="${1:-recording}"
  local path="$RESULTS_DIR/${name}.mp4"
  xcrun simctl io "$IOS_UDID" recordVideo -f "$path" &
  echo $!
  sleep 2  # let recording init
}

ios_record_stop() {
  local pid="$1"
  kill -INT "$pid" 2>/dev/null || true
  sleep 2
}

# ── Maestro Helpers ──────────────────────────────────────────────────────────
# Run a named Maestro flow file
run_flow() {
  local flow="$1"
  local flow_path="$FLOW_DIR/$flow"
  if [[ ! -f "$flow_path" ]]; then
    echo "FLOW_NOT_FOUND: $flow_path"
    return 1
  fi
  "$MAESTRO" --device "$IOS_UDID" test "$flow_path" 2>&1 | tail -5
}

# Run an inline Maestro flow from a heredoc string
run_inline() {
  local tmp="/tmp/maestro-inline-$$.yaml"
  cat > "$tmp"
  "$MAESTRO" --device "$IOS_UDID" test "$tmp" 2>&1 | tail -5
  local rc=$?
  rm -f "$tmp"
  return $rc
}

# Tap a point (percentage coordinates)
tap() {
  local x="$1" y="$2"
  run_inline <<EOF
appId: $APP_ID
---
- tapOn:
    point: "${x}%,${y}%"
EOF
}

# Tap a field by its hintText/id, then type into it
type_into() {
  local field_id="$1"
  local text="$2"
  run_inline <<EOF
appId: $APP_ID
---
- tapOn:
    id: "$field_id"
- inputText: "$text"
- hideKeyboard
EOF
}

# Swipe back (iOS edge gesture)
swipe_back() {
  run_inline <<EOF
appId: $APP_ID
---
- swipe:
    start: "2%,50%"
    end: "80%,50%"
EOF
}

# Swipe direction
swipe() {
  local sx="$1" sy="$2" ex="$3" ey="$4"
  run_inline <<EOF
appId: $APP_ID
---
- swipe:
    start: "${sx}%,${sy}%"
    end: "${ex}%,${ey}%"
EOF
}

# Enter number pad amount (e.g., "1234.56")
numpad_enter() {
  local amount="$1"
  local flow="/tmp/maestro-numpad-$$.yaml"
  echo "appId: $APP_ID" > "$flow"
  echo "---" >> "$flow"
  for (( i=0; i<${#amount}; i++ )); do
    local ch="${amount:$i:1}"
    local px py
    case "$ch" in
      1) px=17; py=53 ;;
      2) px=50; py=53 ;;
      3) px=83; py=53 ;;
      4) px=17; py=62 ;;
      5) px=50; py=62 ;;
      6) px=83; py=62 ;;
      7) px=17; py=72 ;;
      8) px=50; py=72 ;;
      9) px=83; py=72 ;;
      0) px=50; py=82 ;;
      .) px=17; py=82 ;;
      *) continue ;;
    esac
    echo "- tapOn:" >> "$flow"
    echo "    point: \"${px}%,${py}%\"" >> "$flow"
  done
  "$MAESTRO" --device "$IOS_UDID" test "$flow" 2>&1 | tail -3
  rm -f "$flow"
}

# Navigate to home (triple swipe-back as fallback)
go_home() {
  run_inline <<EOF
appId: $APP_ID
---
- swipe:
    start: "2%,50%"
    end: "80%,50%"
- swipe:
    start: "2%,50%"
    end: "80%,50%"
- swipe:
    start: "2%,50%"
    end: "80%,50%"
EOF
  sleep 1
  # Tap Home tab if we're on Map
  tap 20 97
  sleep 1
}

# Dismiss modal if present (tap X in top-right corner)
dismiss_modal() {
  tap 90 15
  sleep 1
}

# Wait N seconds
wait_s() { sleep "${1:-2}"; }

# ── Summary ──────────────────────────────────────────────────────────────────
print_summary() {
  local total=$((PASS_COUNT + FAIL_COUNT + SKIP_COUNT))
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}  TEST SUMMARY${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "  Total:   $total"
  echo -e "  ${GREEN}Passed:  $PASS_COUNT${NC}"
  echo -e "  ${RED}Failed:  $FAIL_COUNT${NC}"
  echo -e "  ${YELLOW}Skipped: $SKIP_COUNT${NC}"
  echo -e "  Results: $RESULTS_DIR"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  
  # Write JSON summary
  cat > "$RESULTS_DIR/summary.json" <<ENDJSON
{
  "timestamp": "$(date -Iseconds)",
  "device": "$IOS_UDID",
  "total": $total,
  "passed": $PASS_COUNT,
  "failed": $FAIL_COUNT,
  "skipped": $SKIP_COUNT
}
ENDJSON
}
