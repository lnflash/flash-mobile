# Voice release readiness: 2026-10-20

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

At this measurement, `FLASH_VOICE_PACK_BASE_URL` was unset in release
configuration. The later production build configuration section documents the
subsequent workflow change. No store release was triggered here.

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
- Full-app older-iPhone and lower-memory Android measurements: cold/warm start,
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

## Follow-up: Android acceleration and Max: 2026-10-20

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
and long-answer continuity, lower-memory Android hardware, and sustained
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


## Simulator follow-up: 2026-10-21

Based on merged main `126c96f4c`. Apple M5 host, 24 GiB RAM; Android 15
ARM64 emulator with 2 virtual CPUs, repeated with 4. The emulator raised the
requested 1.5 GB RAM to 2.5 GB, so this is not a genuine 1.5 GB-device test.
Only generic fixtures were recorded. The user signed in directly; no credentials,
wallet details or conversation contents were collected. Physical phones and the
provisioner's Metro connections were preserved.

The standalone Release native probe completed 27 renders across three engine
lifetimes: first PCM 2.04–3.09 seconds, render/audio ratio 0.473–0.501, lifetime
peak RSS 336,672 KiB, final post-disposal RSS 111,304 KiB. Cancellation joined
within 5.4 ms. The native pronunciation/G2P/all-voices/cancellation check passed.
The actual Android downloader installed the public 102,466,705-byte pack in
16,685 ms including verification.

On the signed-in Debug Ask Flash screen, a generic suggested-topic question sent
through the actual input/send handlers produced an answer in 733 ms. Invoking its
Listen handler queued the first audio at 13,615 ms from Send (~12.9 seconds from
Listen). Separate three-voice playback runs took 10.5–13.1 seconds to start with
2 CPUs and 10.0–12.8 seconds with 4 CPUs; a subsequent warm 4-CPU run took 2.06
seconds. Increasing cores did not consistently resolve the variation. Matching
packaged ORT binaries and optimized native compilation were checked; the cause
is unresolved. These Debug timings are not Release or acoustic measurements.

During the 4-CPU three-voice run, JS frame-callback median was ~16.6 ms and P95
17.8–18.1 ms, with one 68 ms outlier. The 2-CPU run had one 411 ms outlier.
Frame callbacks are a responsiveness proxy, not a complete touch/render benchmark.
Full-app PSS rose from 636,743 to 786,571 KiB in the initial 2-CPU probe; simulated
RUNNING_LOW pressure canceled inference and reduced it to 677,427 KiB. Subsequent
playback recovered. This single pressure test does not establish leak freedom.

A real regression was found: replies shorter than the two-second AudioTrack
streaming threshold never began consuming frames and waited for the watchdog.
Android 12+ now requests a one-frame start threshold. Older versions receive
bounded silent padding to prime the stream, while completion counts only spoken
frames and discards the padding. Cancellation still guards each small write.
Six JVM regression cases cover short/long clips, partial writes, cancellation and
write failures. All 23 JVM tests pass; Debug ARM64/x86_64 builds and their packaged
16 KB ELF alignment checks pass.

The isolated `playback-check` APK uses the compiled production PCM writer and real,
muted AudioTrack without Flash data, network or a model. Android 10/API 29 and
Android 15/API 35 both completed 1-frame, 33,000-frame and 72,000-frame clips.
The 33,000-frame clip completed in 1,395/1,391 ms respectively. Legacy priming
queued 48,000 frames but stopped at the original audio end. This validates frame
consumption, not listening quality. The Android 10 AVD's stock 48 MB Java heap
failed full Flash Debug startup; no full-app performance claim is made for it.

Reproduce the isolated regression after `:app:compileDebugKotlin`:
`python3 scripts/voice-pack/playback-check/build.py --output /tmp/playback-check.apk`.
Install on an explicitly selected emulator and launch
`com.lnflash.voiceplayercheck/com.lnflash.assistant.PlaybackCheckActivity`;
read `files/playback-check.json` with `run-as com.lnflash.voiceplayercheck`.
The builder generates a separate public test key, never Flash's signing key.

Release gates remain open: consistent full-app Release audio onset, real
lower-memory Android hardware, actual listening/first-word/long-answer checks,
offline acceptance, sustained battery/thermal behavior and iOS public downloader.
Release voice-download configuration remains disabled.


### Full-app Release emulator follow-up

`emulator-release-measurements.json` records a non-debuggable Release ARM64 build
with bundled Hermes JS (no Metro or developer support). A separate local checkout
added fixed-fixture timing/file-output instrumentation, enabled only the local
assistant flags and navigated the existing signed-in account to Ask Flash. Store
signing and release feature configuration were not used or changed. The native
bridge played Heart, Michael and Emma twice; all six completed without errors.

Activity launch (`am start -W`) was 1,633 ms; this does not mean the entire screen
was ready. First queued audio ranged 7,417–13,824 ms. JS frame-callback medians
were ~16.6–16.7 ms, P95 17.7–17.9 ms; one 56 ms outlier. One during-playback
memory sample was 535,363 KiB PSS / 663,772 KiB RSS. The emulator had host audio
disabled, so this measures real AudioTrack frame consumption, not acoustic onset
or listening quality. These are instrumented Release measurements, not a signed
store artifact or a complete controller/microphone acceptance test.

Debug overhead therefore does not explain the delay. A separate 15-second,
99 Hz CPU-clock/frame-pointer profile collected 1,016 samples without loss;
91.93% were in the speech worker's ORT library. A separate ORT diagnostic trace
placed most kernel time in CPU-provider ConvInteger operations. Neither diagnostic
is used as the baseline latency measurement.

Crucially, a contemporaneous standalone welcome-phrase probe took 2.07–2.35 s,
while its freshly recompiled, SHA-256-identical executable later took 10.66–12.10 s
on the same emulator, with the same library and fixture. The variation therefore
also exists outside Flash and cannot be assigned solely to app overhead. No cause
or engine optimization is established by these runs. Do not treat the earlier
2–3 second emulator figures as a stable performance expectation.

The exact prior Debug APK was saved and restored without uninstalling or clearing
data. The local instrumented checkout is not a distribution build. All existing
physical-device/provisioner connections and Metro processes were preserved.
Consistent responsiveness is still an open release gate; next useful verification
is a borrowed or remote physical Android device, rather than buying a device or
changing the runtime based only on these variable emulator timings.


### Scheduling comparison and offline Release acceptance

The desktop emulator process was repeatedly observed at macOS scheduling priority
4. Android battery saver and device idle were off. Clearing Darwin background
policy with `taskpolicy -B` did not restore consistent timings. Restarting the
same AVD headlessly kept macOS priority at 31, with the same four virtual CPUs,
2.5 GB RAM, stored account and downloaded pack. The local Release build retained
bundled JS and developer support off, with the same fixture and production speech
engine; the temporary ORT profiling change was removed before measurement.

All six playbacks (three voices, twice) then started in 2,122–2,557 ms, with no
errors and no frame-callback intervals over 50 ms. A second cold app launch with
airplane mode on, Wi-Fi disabled and Android reporting **no active default
network** completed all six in 2,174–2,609 ms, with no errors and maximum frame
interval 28.1 ms. The verified pack was already installed; this does not claim
that downloading works offline. Cold activity launch was 523/724 ms online/offline,
respectively, distinct from full screen readiness. Detailed counters are appended
to `emulator-release-measurements.json`.

This materially narrows the earlier Release timing concern: the desktop emulator
scheduling/UI environment contributes to the multi-second variation. Headless mode
and a reboot changed together, so App Nap is a plausible explanation, not a
uniquely established cause. A similar priority-4/App Nap symptom is reported in
[Google's emulator tracker](https://issuetracker.google.com/issues/562546399),
for a different emulator version; the locally installed version is 37.1.11.
Do not extrapolate these Apple M5 emulator timings to an inexpensive Android phone.
No emulator CPU policy or model/runtime setting was added to Flash.

The original desktop AVD and Debug APK were restored, preserving the signed-in
account; airplane mode/Wi-Fi and the emulator's adb privilege level were restored.
No physical phone or provisioner connection was modified. The short-clip fix is
ready for review; remaining release gates concern listening quality, real-device
full-app behavior, sustained battery/thermal measurements and iOS public download
acceptance. A device purchase is not required to continue development.


After restoring the visible emulator, activating its window through
`NSRunningApplication` raised its observed macOS scheduling priority to 47.
The same standalone binary again generated the welcome fixture in 2.06–2.34 s
across three voices. The restored signed-in Debug Ask Flash screen queued Heart
at 2,582 ms and completed at 6,823 ms. This provides an additional foreground
confirmation without changing any persistent macOS preference. The documented
App Nap hypothesis remains narrower than claiming a confirmed emulator defect.
Android initially failed to scan the restored Debug APK on reboot; a full push
installation (`adb install --no-incremental --no-streaming -r`) restored it while
retaining the existing account and app data. No uninstall or data clear was used.


## iOS public delivery follow-up: 2026-10-21

PR #804 is merged as `2ef98e644`. The remaining native iOS public-host delivery
check now passes on iOS Simulator 18.6 and 26.5. The isolated Release app under
`delivery-check-ios` compiles unmodified production `SpeechPack.swift` and the
actual FlashSpeech/ORT 1.23.0 pod and compiled manifest. It has a separate bundle
ID/container, no bundled voice assets, no Flash account or microphone access,
no ATS/TLS exceptions, and no production signing/configuration changes.

| Simulator OS | Cancel after progress | Retry: full verified install | Delete + full redownload | Cold first PCM, three voices |
| --- | ---: | ---: | ---: | ---: |
| iOS 18.6 | 686 ms | 17,955 ms | 12,559 ms | 2.17–2.50 s |
| iOS 26.5 | 289 ms | 8,180 ms | 8,954 ms | 2.22–2.49 s |

Both complete installs on each OS validated all six assets (102,466,705 bytes)
against the compiled manifest and then independently rechecked installed sizes
and SHA-256 hashes. Backup exclusion was set. Cancel left the pack missing;
retry was immediate and succeeded. Explicit removal cleared readiness before
redownload. Results and source/manifest fingerprints are in
`ios-delivery-measurements.json`; reproduce using `delivery-check-ios/README.md`.
Installation timings include independent post-install verification and are not a
CDN throughput estimate.

After terminating each process, the installed-check mode creates a fresh downloader
object, verifies persisted readiness, and renders the generic welcome fixture in
all three voices from the saved pack. That path never calls download or creates a
URLSession. The simulator network remains available, so this is cold local-only
synthesis acceptance, not a network-blocked full-Flash or acoustic playback test.
Do not extrapolate these host timings to iPhone battery/thermal performance.

The native production-host transport/integrity gap is now covered on both Android
and iOS. At this checkpoint, production `FLASH_VOICE_PACK_BASE_URL` was still
unset. Full-app listening,
true disconnected iOS acceptance, sustained battery/thermal behavior and store
size/distribution measurements remain separate release work. Existing Android
emulator, physical devices, Flash account data and Metro/provisioner connections
were not modified by this follow-up.

## Production build configuration: 2026-10-21

The Android, iOS and iOS Alt deploy workflows now run
`scripts/ci/configure-voice-pack.py` after the `ASSISTANT_DEV_LINK` guard. It
sets the verified `https://voices.flashapp.me/kokoro-en-v1` source in the build
`.env`, replacing any older value without changing the shared `DOT_ENV` secret.
The script checks the compiled manifest version and fails the build if it no
longer matches. This wiring takes effect only in artifacts built after the
change is merged and deployed; existing store artifacts still need verification.

Firebase Remote Config remains a separate rollout gate. In project
`avid-ceiling-390418`, publish Boolean `true` for `assistantEnabled`,
`assistantVoice` and `assistantVoiceReplies` for the intended audience. The
current fetched values on the test emulator were false. This session has no
Firebase administrator credentials, so the console publication must be done
by an authorized project member. Experimental model and server flags stay as
they are. Store-mode full-app acceptance and hardware measurements listed above
remain before release tags.

## Physical tester builds from merged main: 2026-10-21

From `d80022b42` (#806), isolated local Release builds used a store-guarded
`.env` with the verified production voice URL and no `ASSISTANT_DEV_LINK`.
Neither build was a Play/TestFlight distribution artifact: Pixel's APK used
the local debug signing key to update its existing installation, and Max's iOS
app used an Apple Development profile for the existing team. Both installed
in place without clearing app data. The Android APK bundled JavaScript and
contained the URL; the signed iOS app also contained the URL and passed
`codesign --verify --deep --strict`. These checks confirm the build setting
reaches both binaries, not store signing or distribution.

The signed-in Android emulator fetched the three published Firebase flags as
`true` from Remote Config. On Pixel 8 Pro, the Release app launched and showed
Ask Flash and Hold to talk. The previously installed pack was removed in Flash
and redownloaded through the new Release app; it returned to the three-voice
offline-ready state with no error. With airplane mode on and Wi-Fi off, Flash
still showed the installed pack as ready after tapping Heart. The user heard
the Heart sample and a full spoken answer to a suggested question while
airplane mode was on, with the first word intact. Airplane mode was disabled
and Wi-Fi restored afterward. The arm64 APK was 102,041,642 bytes. A single
post-preview `dumpsys meminfo` snapshot showed 669,930 KiB PSS; it is not peak
memory or a sustained performance measurement.

On the older Max (iPhone 13 Pro Max), the Release app installed and launched
with build 57. The user confirmed that the first-time pack download completed,
the Heart sample played, and a suggested question showed an answer and spoke
it with airplane mode on. The expanded local `.app` was 131,726,858 bytes;
this is not an IPA or App Store download-size estimate.

Store-distributed artifacts, screen-reader behavior, and sustained unplugged
battery/thermal measurements remain open before production rollout. The
provisioner installation and existing Metro processes were preserved.
