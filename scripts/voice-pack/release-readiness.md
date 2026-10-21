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

## Baseline Pixel 8 Pro native Release CPU probe

Physical Android 17 device, approximately 12 GB RAM, fully charged and plugged in;
thermal status 0. This is not a lower-memory Android device or a battery test.
Standalone NDK `-O2 -DNDEBUG` probe using the exact production C++ engine and
packaged ARM64 ORT 1.23.0; generic fixed phrases only. No audio player, React
Native, wallet state, account access or microphone. First PCM is not audible
speaker latency. Model initialization is reported separately (~1.3 seconds).

| Engine configuration | Renders | First PCM | Render/audio duration ratio | Peak RSS | RSS after disposal |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline two-thread CPU | 9 | 7.22–10.98 s | 1.72–1.78 | 293,440 KiB | 61,856 KiB |
| CPU one thread, no spinning (experiment) | 3 | 5.40–6.21 s | 1.28–1.30 | 265,096 KiB | 60,660 KiB |
| CPU two threads, no spinning (experiment) | 3 | 9.19–9.80 s | 2.04–2.19 | 265,496 KiB | 60,764 KiB |
| XNNPACK two threads (experiment) | 3 | 3.07–3.48 s | 0.72–0.73 | 290,944 KiB | 183,416 KiB |

Ratio below 1 means faster than real time. The baseline configuration failed the
desired responsive Android experience even on this high-memory device. Pinning current
CPU inference to big cores did not materially improve it. Cancellation joined in
about 3.5 ms in the baseline probe.

The experiments in this initial table were scratch builds, not app changes. XNNPACK uses the existing runtime,
but its allocator retained substantially more memory after disposal. The shorter
experimental runs used only the welcome phrase across three voices; they are not
equivalent to the nine-render baseline corpus. Before choosing it, repeat the full
corpus, check pronunciation/audio parity, repeated load/disposal, memory pressure,
background/cancel behavior, sustained thermals and full-app audible latency.

## Remaining gates

- The user subsequently made Max available; its separate native Release engine
  probe is complete (see follow-up below). Full-app listening/offline acceptance
  remains. Keep the provisioner installation/data and connections intact.
- Full-app older-iPhone and genuinely lower-memory Android measurements: cold/warm start,
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

`benchmark-android.cpp` accepts a verified pack directory, rounds (1–10), and an
optional cycle count (1–5, default 1). Each cycle constructs/disposes an engine;
RSS is also sampled after a two-second settle.
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

## Follow-up: Android acceleration and Max — 2026-10-20

Follow-up branch `eng-754-android-speech-performance` is based on merged main
`c0b4ddc45`. Detailed generic-only results are in `performance-follow-up.json`.

The Android engine now registers the XNNPACK provider already present in the
pinned ORT 1.23.0 AAR: two XNNPACK threads, one CPU fallback thread and disabled
CPU thread-pool spinning. iOS retains its existing configuration. No new library,
model, voice or download is added. Model construction is serialized because the
pinned XNNPACK implementation initializes a process-wide allocator lazily.

The first XNNPACK full-corpus probe retained 278,764 KiB after disposal and peaked
at 386,968 KiB. Its process-wide arena retains unused regions independently of
`DisableCpuMemArena()`. Enabling `memory.enable_memory_arena_shrinkage=cpu:0` per
run returns unused regions without globally changing Android's allocator policy.

Same generic corpus, three voices, three complete engine-load/render/cancel/dispose
cycles (27 renders) on the physical Pixel:

| Cycle | First PCM | Render/audio ratio | Lifetime peak RSS | RSS after disposal |
| --- | ---: | ---: | ---: | ---: |
| 1 | 3.10–4.90 s | 0.734–0.778 | 337,720 KiB | 89,244 KiB |
| 2 | 3.24–6.06 s | 0.772–1.124 | 345,564 KiB | 97,076 KiB |
| 3 | 3.56–5.82 s | 0.845–0.921 | 346,200 KiB | 98,920 KiB |

Model initialization is additional (~1.4 s on the first cycle). After a two-second
settle, the final RSS was 98,912 KiB. Cancellation joins were 8–12 ms. This is
an improvement over the original ratio 1.72–1.78, but increased transient memory
and sustained slowdown remain concerns. These results do not establish a leak-free
lifetime or battery impact; the device was AC powered. Thermal status remained 0;
battery temperature rose from 30.3 C before to 33.2 C during this test. Do not infer
thermal throttling solely from that temperature or the timing variation.

After the user made Max available, its separate signed Release benchmark completed
nine renders on iPhone 13 Pro Max (reported physical RAM 5,915,164,672 bytes).
First PCM was 2.43–3.85 s (first render 2.81 s includes lazy model load), ratios
0.554–0.670, sampled peak footprint 375,669,848 bytes, and post-disposal footprint
133,153,640 bytes from a 9,208,536-byte baseline. Thermal state was nominal and
low-power mode off. This completes an older-iPhone native speed/memory probe,
not full Flash listening, offline or battery acceptance.

Normal-resolver public verification now passes all six pinned HTTPS assets. The
actual Android `SpeechPackStore` also installed all 102,466,705 bytes from the public
HTTPS source in 24,113 ms on the Pixel, including compiled integrity verification.
The developer runtime invoked the actual native module without changing the release
source setting. iOS native public download acceptance remains a separate gate.

Validation for the configuration change: physical Android shared-engine integration
check (pronunciation, negative amounts, unknown-word G2P, all voices, cancellation
and recovery), Android Debug build and JVM installer checks, packaged arm64/x86_64
16 KB ELF alignment, and signed iOS native Release benchmark build. The native
integration check also exercises overlapping model constructors before initial
provider allocation. No store release, default-flag change or Max/provisioner data
removal is part of this follow-up.

Next gates are actual Android playback, listening quality, full-app audible onset
and long-answer continuity, genuinely lower-memory Android hardware, and sustained
unplugged measurements. In particular, engine throughput does not prove that the
AudioTrack write/backpressure path keeps playback continuously supplied. Release
download configuration remains off.

Configuration references: [XNNPACK threading guidance](https://onnxruntime.ai/docs/execution-providers/Xnnpack-ExecutionProvider.html),
[arena shrinkage](https://onnxruntime.ai/docs/get-started/with-c.html#features), and
the pinned [XNNPACK allocator implementation](https://github.com/microsoft/onnxruntime/blob/v1.23.0/onnxruntime/core/providers/xnnpack/xnnpack_init.cc).

The first actual native playback probe exposed a status timing issue: the old
blocking whole-chunk AudioTrack write emitted `started` at 7,765 ms and `end` at
9,003 ms for a 4.2-second fixture. These events cannot measure audible onset. The
follow-up caps individual writes at 1,024 frames, so `started` reports the first
small queued block instead of waiting for the entire chunk to drain. Actual
hardware acoustic latency is still not claimed.

After the small-write fix, the cold Debug playback probe reported `started` at
7,461 ms and `end` at 11,730 ms, a 4,269 ms interval for the same 4.2-second
Heart fixture. It completed without native error. This validates the status
interval correction, not an improvement in acoustic onset: the full Debug app
was starting up, so do not compare its cold timings to isolated Release engine
measurements. Manual listening and full-app Release measurements remain open.
