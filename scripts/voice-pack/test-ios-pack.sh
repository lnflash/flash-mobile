#!/bin/sh
# macOS Foundation/CryptoKit integration test of the actual iOS downloader source.
set -eu
cd "$(dirname "$0")/../.."
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/flash-ios-pack-check.XXXXXX")
fixture_pid=
cleanup() {
  if [ -n "$fixture_pid" ]; then kill "$fixture_pid" 2>/dev/null || true; wait "$fixture_pid" 2>/dev/null || true; fi
  rm -rf "$test_dir"
}
trap cleanup EXIT HUP INT TERM
# Only the model manifest dependency is replaced. Explicit tiny immutable assets
# are injected by the harness; all downloader/verification/lifecycle code is real.
cat > "$test_dir/FlashSpeech.swift" <<'SWIFT'
public final class FlashSpeech {
  public static func packManifest() -> String { "{\"files\":[]}" }
}
SWIFT
xcrun swiftc -swift-version 5 -emit-module -emit-library -module-name FlashSpeech "$test_dir/FlashSpeech.swift" -o "$test_dir/libFlashSpeech.dylib"
xcrun swiftc -swift-version 5 -D DEBUG -I "$test_dir" -L "$test_dir" -lFlashSpeech -Xlinker -rpath -Xlinker "$test_dir" ios/LNFlash/SpeechPack.swift scripts/voice-pack/tests/main.swift -o "$test_dir/check"
python3 scripts/voice-pack/tests/http-fixture.py "$test_dir/port" &
fixture_pid=$!
while [ ! -s "$test_dir/port" ]; do
  if ! kill -0 "$fixture_pid" 2>/dev/null; then exit 1; fi
  sleep 0.1
done
"$test_dir/check" "$(cat "$test_dir/port")"
