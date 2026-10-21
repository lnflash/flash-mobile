# Voice release readiness — 2026-10-20

Source: PR #802, `fcd2e15a52c286bbd01f90fbd9e512f0612206f3`.
These are release-preparation measurements, not approval to ship.

## Production delivery

Published to dedicated Cloudflare R2 bucket `flash-voices`:
`https://voices.flashapp.me/kokoro-en-v1`.
All six pinned assets (102,466,705 bytes) passed full HTTPS GET, exact length,
identity encoding, immutable/no-transform cache policy and SHA-256 verification.
No redirects or TLS bypass were used. Public manifest, delivery metadata and
third-party notices are under the same version. Never overwrite these objects;
use a new version and compiled manifest for any content change.

Authoritative DNS and Cloudflare DNS returned the new edge addresses. The laptop
resolver still cached the old wildcard destination during validation, so the
verifier used a process-local authoritative address override while preserving
hostname/SNI and certificate verification. Repeat the normal verifier after DNS
propagation. Generic Python urllib User-Agent receives HTTP 403; the named
`FlashVoicePackVerifier/1.0` agent and curl pass. Real URLSession/OkHttp production
endpoint checks remain required; do not weaken site-wide security rules.

`FLASH_VOICE_PACK_BASE_URL` remains unset in release configuration. When the gates
below pass, wire the exact verified URL into both platforms' store build settings.
Do not change the shared DOT_ENV secret blindly or trigger a store release.

## Android app size

Same local toolchain, unsigned Release ARM64 APKs, identical environment, isolated
worktrees with the same symlinked dependency tree. Baseline `f14969391`, feature
`fcd2e15a5`. No model files were bundled. Store signing was disabled only in these
isolated measurement worktrees; neither APK is a distribution artifact.

| Measurement | Baseline | Feature | Increase |
| --- | ---: | ---: | ---: |
| APK bytes | 81,382,393 | 102,006,262 | 20,623,869 |
| Expanded ZIP entry bytes | 131,199,937 | 151,945,178 | 20,745,241 |

Feature ARM64 native libraries: ONNX Runtime 19,242,472 bytes, JNI 75,752 bytes,
first-party speech 1,176,008 bytes. Expanded ZIP size is not measured installed
storage. Play AAB/device split download and iOS app size still need measurement.
The optional pack adds 102.5 MB of persistent data after explicit download.

## Pixel 8 Pro native Release CPU probe

Physical Android 17 device, approximately 12 GB RAM, fully charged and plugged in;
thermal status 0. This is not a lower-memory Android device or a battery test.
Standalone NDK `-O2 -DNDEBUG` probe using the exact production C++ engine and
packaged ARM64 ORT 1.23.0; generic fixed phrases only. No audio player, React
Native, wallet state, account access or microphone. First PCM is not audible
speaker latency. Model initialization is reported separately (~1.3 seconds).

| Engine configuration | Renders | First PCM | Render/audio duration ratio | Peak RSS | RSS after disposal |
| --- | ---: | ---: | ---: | ---: | ---: |
| Current two-thread CPU | 9 | 7.22–10.98 s | 1.72–1.78 | 293,440 KiB | 61,856 KiB |
| CPU one thread, no spinning (experiment) | 3 | 5.40–6.21 s | 1.28–1.30 | 265,096 KiB | 60,660 KiB |
| CPU two threads, no spinning (experiment) | 3 | 9.19–9.80 s | 2.04–2.19 | 265,496 KiB | 60,764 KiB |
| XNNPACK two threads (experiment) | 3 | 3.07–3.48 s | 0.72–0.73 | 290,944 KiB | 183,416 KiB |

Ratio below 1 means faster than real time. Current configuration fails the desired
responsive Android experience even on this high-memory device. Pinning current
CPU inference to big cores did not materially improve it. Cancellation joined in
about 3.5 ms in the baseline probe.

Experiments are scratch builds, not app changes. XNNPACK uses the existing runtime,
but its allocator retained substantially more memory after disposal. The shorter
experimental runs used only the welcome phrase across three voices; they are not
equivalent to the nine-render baseline corpus. Before choosing it, repeat the full
corpus, check pronunciation/audio parity, repeated load/disposal, memory pressure,
background/cancel behavior, sustained thermals and full-app audible latency.

## Remaining gates

- Keep Max available to the user's cashu-card-provisioner testing. A separate
  `com.lnflash.voicebench` Release test app is installed; do not operate Max until
  the user finishes. No completed Max benchmark result is claimed.
- Older iPhone and genuinely lower-memory Android measurements: cold/warm start,
  peak and post-disposal memory, memory-pressure recovery and long answers.
- Actual Android listening checks: all three previews, suggested/typed/voice
  answers, stop/hold arbitration, first-word preservation and backgrounding.
- Both native production downloaders against public HTTPS: integrity, cancel/retry,
  delete/redownload, cold offline launch and downloaded voice playback.
- Full-app Release timings (screen ready and audible onset), sustained unplugged
  battery/thermal measurements and platform store-size estimates.
- Resolve Android responsiveness and memory tradeoff before enabling release
  downloads; retain system speech fallback throughout.

## Reproducing probes

`benchmark-android.cpp` accepts a verified pack directory and rounds (1–10).
Cross-compile it with `native/flash-speech/shared/Engine.cpp`, NDK C++17 and
`-O2 -DNDEBUG -Wl,-z,max-page-size=16384 -ldl -llog`. Copy the executable, matching
`libonnxruntime.so`, `libc++_shared.so` and verified pack to a fresh directory under
`/data/local/tmp`, then run with that directory on `LD_LIBRARY_PATH`. It emits only
fixture IDs, voice IDs, timings and memory counters. Do not substitute user text.

`benchmark-ios/generate.rb OUTPUT VERIFIED_PACK_DIRECTORY` generates a separate
local Xcode project and Podfile; assets directory must be named `pack`. Run
`pod install`, build scheme `FlashVoiceBench` with Release configuration, and
install only its separate bundle ID. Launch while unlocked and foregrounded.
Copy `Documents/voice-benchmark.json` from that test app's data container after
completion. The test app bundles assets solely to isolate synthesis measurements;
its size is not Flash's app-size overhead. It renders silently and never accesses
Flash data. Preserve existing Metro processes and adb reverses during all checks.
