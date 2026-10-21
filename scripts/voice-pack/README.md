# Optional offline Flash voices

Heart and Michael (US English) and Emma (British English) use the same Kokoro
weights/styles approved in the audition. This implementation synthesizes new
answers on the device; it does not play cached answers or call a speech service.
The optional pack is **102,466,705 bytes** (102.5 MB decimal), shared by all three
voices. No model or voice binary is included in Metro or the app bundle.

The app includes native ONNX Runtime **1.23.0** and API headers from that exact
version. Both platforms use the first-party C++17 engine in `native/flash-speech`.
It lazily loads two CPU sessions on a serial worker, uses two inference threads,
and streams 24 kHz mono audio chunks to the native player. Stop cancels active
ORT work, invalidates queued chunks, and releases the shared audio owner before
Hold to talk starts. System speech remains available before download and for
other languages. Blur/background disposes the engine cache; iOS also handles
memory warnings. RAM/battery and low-end Android benchmarks remain release gates.

The pronunciation frontend includes Misaki 0.9.4 US/GB gold lexicons, a small
ONNX G2P model for unknown words, and a frozen reference corpus of 184 generic
English help/preview strings. Cached entries contain pronunciation only, never
user or wallet data. Dynamic amounts retain fractional zeros and long numeric
identifiers are read digit-by-digit. The lightweight dynamic frontend does not
include spaCy POS tagging; arbitrary heteronyms and unsupported non-ASCII names
can differ from the development reference. Unsupported characters fail safely
with text still visible. Native integration checks cover amounts, accents,
reference phrases, all three voices, cancellation, and a subsequent fresh render.

## Reproduce and serve for development

Use the isolated environment and dependency lock in `scripts/voice-audition`.
Those Python/PyTorch/spaCy/eSpeak tools are laptop-only and are not shipped.

```sh
/tmp/flash-voice-prototype/venv/bin/python scripts/voice-pack/prepare.py \
  --assets /tmp/flash-neural-voice \
  --output /tmp/flash-neural-voice/pack
python3 -m http.server 18083 --bind 0.0.0.0 --directory /tmp/flash-voice-prototype/serve
```

Place a `neural-v1` symlink in the serve directory pointing to that pack. Debug
builds derive the laptop host from Metro, using port 18083. Do not stop or change
Flash Metro 8081, provisioner Metro 8082, or the other service on 8083.
Preparation checks source hashes and the final pinned manifest. English copy
changes do not implicitly change a published pack; update `sentences.json`, review
the generated manifest and create a new pack version deliberately.

`manifest.json` and the compiled `shared/Pack.hpp` agree exactly. Kokoro model
and styles are pinned to onnx-community/Kokoro-82M-v1.0-ONNX revision
`1939ad2a8e416c0acfeecc08a694d14ef25f2231`. The G2P export/config are pinned to
nekwo/misaki-en-us-g2p-onnx revision
`4b3a605d2f605318ab4f762ab9855c44106528b7` with SHA-256 checks.

## Installation and release hosting

Download is explicit. Native downloaders stream to a unique staging directory,
enforce compiled size/SHA-256 for all six fixed assets, then atomically install
into persistent backup-excluded application storage. Partial installs never
appear as usable voices. The UI supports progress/cancel/retry/delete and defaults
to Heart only after an explicit successful download. Backgrounding cancels a
transfer; a canceled transfer restarts rather than silently resuming later.

Release builds require **FLASH_VOICE_PACK_BASE_URL** pointing to an immutable
HTTPS directory containing exactly the manifest's six assets. It is intentionally
unset here: no production hosting was published. The download control stays
hidden in Release until that source is configured. Both native downloaders still
verify compiled hashes. Do not publish a different model under this version.
The pack needs about twice its final size free during installation. Downloading
assets is the only network operation in this feature; synthesis has no HTTP path.

Apache-2.0 model/Misaki/G2P and MIT runtime/JSON notices ship on both platforms in
`native/flash-speech/notices`. The downloaded assets are data, not executable
code. System engines, voice licenses, third-party runtime updates, device memory,
real Android playback and release size should be reviewed before wider rollout.

## Checks

Run Jest for `voice-pack`, `speech-settings`, `native-speech-output`,
`use-speech-output`, and `ask-flash-screen`. Build both iOS schemes and Android.
`engine-check.cpp` links the shared core against ONNX Runtime and runs with the
verified local pack path. It prints only pass/fail, never user data.

SuperMax measurements and the current test build are recorded in the local
Ask Flash voice handoff. No Android physical device was connected during this
implementation; Android compilation/unit checks do not establish listening quality
or performance on Android hardware.

## Three-voice picker follow-up

After installation the picker shows exactly Heart, Michael and Emma. System voice
enumeration remains internal for offline fallback before download; users no longer
browse OS voices or accent filters. A previously saved system choice becomes Heart
when the installed pack is opened, preserving speed and automatic-reply settings.
The Debug audition entry is removed now that live previews are available.
The user confirmed delete/fallback, cancel/retry, all three previews and airplane-mode
suggested-question speech all worked on SuperMax.
