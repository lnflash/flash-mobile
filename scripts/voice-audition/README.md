# Flash voice audition

This Debug-only prototype compares three Kokoro voices before selecting an offline synthesis engine for Flash. It downloads nine generic sample recordings inside Ask Flash. It does not install a model, change the account's system voice, synthesize wallet answers, or send wallet data to a service.

Heart and Michael use US English; Emma uses British English. Each has identical welcome, receive-money guidance, and clearly fictional balance examples. Sample selection uses the same native audio owner as Hold to talk and system speech, with stop/background/route-loss cancellation. No speech dependencies or voice assets were added to the shipping app.

## Generate and serve

Use an isolated development environment; these Python dependencies are generation tools only. They are not app dependencies.

```sh
uv venv --python 3.11 /tmp/flash-voice-prototype/venv
uv pip install --python /tmp/flash-voice-prototype/venv/bin/python -r scripts/voice-audition/requirements.lock
/tmp/flash-voice-prototype/venv/bin/python scripts/voice-audition/generate.py --assets /tmp/flash-voice-prototype/assets --output /tmp/flash-voice-prototype/serve --catalog app/assistant/ui/voice-audition-files.ts
./node_modules/.bin/eslint --fix app/assistant/ui/voice-audition-files.ts
python3 -m http.server 18083 --bind 0.0.0.0 --directory /tmp/flash-voice-prototype/serve
```

Use an available dedicated port 18083; leave Flash Metro 8081, provisioner Metro 8082, and the existing service on 8083 untouched. The Debug audition derives the laptop hostname from Metro's bundle URL and downloads only the named samples on port 18083. The source model, three voice files, and config have pinned revisions and SHA-256 checks in `generate.py`. Generated audio is outside the repository and is not a Metro/bundled asset.

Open Ask Flash → Voice → Compare new voices → Download samples. The 2,747,196-byte sample pack is checked against the compiled size/hash manifest before an atomic install in the audition cache. Downloads are explicit, cancelable, retryable and deletable; returning to the screen verifies the cache without fetching anything. Voice taps preview downloaded files; the three tabs compare welcome, guidance and amount pronunciation. Deleting the samples does not affect wallet data or the selected system voice.

The audition uses bounded fetch transfers for small WAVs and the existing filesystem module for storage. It does not use the existing file module's iOS download cancellation path, which can produce resume data without settling its Promise. Each install has a unique staging directory, and cancellation rejects the audition transfer even if an underlying request acknowledges late. The full model needs a native streaming downloader rather than buffering a large model through JavaScript.

## Measurements and decision

`results/laptop-cpu.json` records local CPU generation using ONNX Runtime 1.23.2, two inference threads, and Misaki's language frontend. The shared quantized model is 92,361,116 bytes; three voice files are 1,566,720 bytes total. Model initialization was approximately 0.20 seconds, and complete sample generation ranged from 1.745 to 3.616 seconds for 4.55–9.4 seconds of padded audio. The developer Python process peaked around 1,001 MB RSS, including PyTorch, spaCy and language processing. These are laptop figures, not estimates of Flash's mobile RAM, battery use or first-audio latency.

Listening to this prototype can approve or reject the voice candidates, accents and pronunciation. Playing downloaded recordings cannot establish the latency, memory, power use or quality of a future mobile synthesis implementation. Before production integration, benchmark an engine with the exact quantized model and frontend on SuperMax and a supported Android device; verify incremental playback, prompt cancellation, release-binary overhead, offline cold launch and sustained/idle resource use.

## Sources and integration constraints

- [Kokoro model and voice assets](https://huggingface.co/hexgrad/Kokoro-82M) and [quantized export](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) declare Apache-2.0. The prototype pins export revision `1939ad2a8e416c0acfeecc08a694d14ef25f2231`.
- [Misaki](https://github.com/hexgrad/misaki) supplies US/British pronunciation in the development generator. Its eSpeak fallback is used on the laptop only; it has not been integrated or redistributed in Flash. Audit frontend code, dictionary/model notices and transitive licenses for the actual mobile engine before distribution. Do not assume the neural model's license covers every phonemizer/runtime dependency.
- [ONNX Runtime](https://onnxruntime.ai/docs/tutorials/mobile/) supports native mobile inference and custom runtime builds. Its runtime and a suitable native frontend still need implementation and device measurement.

The intended production experience is a separate optional, versioned model pack with three curated voices, user-visible size/progress/cancel/retry/delete controls, integrity-checked atomic installation, persistent storage excluded from backups, and system speech available before download. No automatic or background model download, cloud synthesis, or silent switch to another provider. The generic audition recordings are not that production model pack.
