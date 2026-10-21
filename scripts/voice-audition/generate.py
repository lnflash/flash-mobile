#!/usr/bin/env python3
"""Generate generic, local audition clips. This is not the app's inference runtime."""
import argparse
import hashlib
import json
import pathlib
import resource
import sys
import time
import urllib.request

import numpy as np
import onnxruntime as ort
import soundfile as sf
from misaki import en
from misaki.espeak import EspeakFallback

MODEL_REPO = "onnx-community/Kokoro-82M-v1.0-ONNX"
MODEL_REVISION = "1939ad2a8e416c0acfeecc08a694d14ef25f2231"
MODEL_SHA = "fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478"
VOICES = [
    ("af_heart", "d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b"),
    ("am_michael", "1d1f21dd8da39c30705cd4c75d039d265e9bc4a2a93ed09bc9e1b1225eb95ba1"),
    ("bf_emma", "669fe0647f9dd04fcab92f1439a40eeb4c8b4ab1f82e4996fe3d918ce4a63b73"),
]
SCRIPTS = {
    "welcome": "Hello, I'm Flash. I can help you find your way around your wallet.",
    "guidance": "To receive money, open Receive and share your Flash address or a payment request.",
    "amounts": "Here is an example, not your wallet balance: twelve US dollars and fifty cents, and two thousand five hundred satoshis.",
}

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def fetch(root, name, digest):
    target = root / name.replace("/", "_")
    if not target.exists():
        urllib.request.urlretrieve(f"https://huggingface.co/{MODEL_REPO}/resolve/{MODEL_REVISION}/{name}", target)
    if sha(target) != digest:
        raise ValueError("Source hash mismatch: " + name)
    return target

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--assets", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--catalog", type=pathlib.Path, required=True)
    args = parser.parse_args()
    args.assets.mkdir(parents=True, exist_ok=True)
    args.output.mkdir(parents=True, exist_ok=True)
    model = fetch(args.assets, "onnx/model_quantized.onnx", MODEL_SHA)
    config_path = args.assets / "hexgrad_config.json"
    if not config_path.exists():
        urllib.request.urlretrieve("https://huggingface.co/hexgrad/Kokoro-82M/resolve/f3ff3571791e39611d31c381e3a41a3af07b4987/config.json", config_path)
    if sha(config_path) != "5abb01e2403b072bf03d04fde160443e209d7a0dad49a423be15196b9b43c17f":
        raise ValueError("Source config hash mismatch")
    config = json.loads(config_path.read_text())
    vocab = config["vocab"]
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    started = time.monotonic()
    session = ort.InferenceSession(str(model), sess_options=options, providers=["CPUExecutionProvider"])
    metrics = {"environment": "development laptop, CPU, two threads; NOT a phone benchmark", "python": sys.version, "onnxruntime": ort.__version__, "modelRevision": MODEL_REVISION,
               "modelBytes": model.stat().st_size, "modelLoadSeconds": time.monotonic() - started, "clips": []}
    records = []
    for voice_id, digest in VOICES:
        voice = np.fromfile(fetch(args.assets, f"voices/{voice_id}.bin", digest), dtype=np.float32).reshape(-1, 1, 256)
        british = voice_id.startswith("b")
        g2p = en.G2P(british=british, fallback=EspeakFallback(british=british))
        for name, text in SCRIPTS.items():
            phonemes, _ = g2p(text)
            unknown = sorted(set(char for char in phonemes if char not in vocab))
            if unknown:
                raise ValueError(f"Unknown phonemes for {voice_id}/{name}: {unknown}")
            tokens = [vocab[char] for char in phonemes]
            if not 1 <= len(tokens) <= 508:
                raise ValueError("Sample exceeds model context")
            inputs = {"input_ids": np.array([[0, *tokens, 0]], dtype=np.int64),
                      "style": voice[len(tokens)], "speed": np.array([1.0], dtype=np.float32)}
            start = time.monotonic()
            audio = session.run(["waveform"], inputs)[0].reshape(-1)
            seconds = time.monotonic() - start
            if not np.isfinite(audio).all() or not 1 <= len(audio) / 24000 <= 30:
                raise ValueError("Invalid generated audio")
            peak = float(np.max(np.abs(audio)))
            if peak > 1:
                audio = audio / peak * 0.98
            # Small silence protects the opening phoneme when a physical output route wakes up.
            audio = np.concatenate([np.zeros(6000, dtype=np.float32), audio, np.zeros(2400, dtype=np.float32)])
            path = args.output / f"{voice_id}-{name}.wav"
            sf.write(str(path), audio, 24000, subtype="PCM_16")
            record = {"name": path.name, "bytes": path.stat().st_size, "sha256": sha(path)}
            records.append(record)
            metric = {"voice": voice_id, "sample": name, "generationSeconds": round(seconds, 3), "audioSeconds": round(len(audio) / 24000, 3), "peak": round(peak, 3)}
            metrics["clips"].append(metric)
            print(json.dumps(metric), flush=True)
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    metrics["processPeakRSSMB"] = rss / (1_000_000 if sys.platform == "darwin" else 1000)
    metrics["samplePackBytes"] = sum(record["bytes"] for record in records)
    (args.output / "measurements.json").write_text(json.dumps(metrics, indent=2) + "\n")
    (args.output / "manifest.json").write_text(json.dumps(records, indent=2) + "\n")
    args.catalog.write_text("// Generated by scripts/voice-audition/generate.py. Generic samples, downloaded only on request.\nexport const AUDITION_FILES = " + json.dumps(records, indent=2) + " as const\n")
    print(json.dumps({"samplePackBytes": metrics["samplePackBytes"], "processPeakRSSMB": metrics["processPeakRSSMB"]}), flush=True)

if __name__ == "__main__":
    main()
