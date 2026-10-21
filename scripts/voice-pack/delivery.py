#!/usr/bin/env python3
"""Stage pinned voice assets or verify a public, direct HTTPS download endpoint."""
import argparse
import hashlib
import json
import pathlib
import shutil
import tempfile
import urllib.error
import urllib.parse
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
CACHE_CONTROL = "public, max-age=31536000, immutable, no-transform"


def manifest():
    return json.loads((HERE / "manifest.json").read_text())


def digest(stream):
    sha = hashlib.sha256()
    size = 0
    while True:
        chunk = stream.read(1024 * 1024)
        if not chunk:
            return size, sha.hexdigest()
        size += len(chunk)
        sha.update(chunk)


def verify_assets(directory, spec=None):
    spec = spec or manifest()
    for entry in spec["files"]:
        if pathlib.Path(entry["name"]).name != entry["name"]:
            raise ValueError("Asset must have a fixed filename")
        with (pathlib.Path(directory) / entry["name"]).open("rb") as stream:
            size, sha = digest(stream)
        if (size, sha) != (entry["bytes"], entry["sha256"]):
            raise ValueError("Asset verification failed: " + entry["name"])
    return spec


def stage(directory, output):
    spec = verify_assets(directory)
    output = pathlib.Path(output).resolve()
    if output.exists():
        raise ValueError("Refusing to replace an existing delivery bundle")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = pathlib.Path(tempfile.mkdtemp(prefix=".voice-delivery-", dir=output.parent))
    try:
        assets = temporary / spec["version"]
        assets.mkdir()
        for entry in spec["files"]:
            shutil.copyfile(pathlib.Path(directory) / entry["name"], assets / entry["name"])
        verify_assets(assets, spec)
        shutil.copytree(HERE.parents[1] / "native/flash-speech/notices", temporary / "notices")
        (temporary / "manifest.json").write_text(json.dumps(spec, indent=2) + "\n")
        (temporary / "delivery.json").write_text(json.dumps({
            "version": spec["version"], "totalBytes": sum(e["bytes"] for e in spec["files"]),
            "contentType": "application/octet-stream", "cacheControl": CACHE_CONTROL,
            "redirects": False, "contentEncoding": "identity",
            "overwritePublishedVersion": False,
        }, indent=2) + "\n")
        temporary.rename(output)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)
    print(f"Verified delivery bundle: {output} ({sum(e['bytes'] for e in spec['files'])} bytes)")


class NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def verify_host(base, spec=None, allow_http=False):
    spec = spec or manifest()
    parsed = urllib.parse.urlsplit(base)
    if parsed.scheme not in (("https", "http") if allow_http else ("https",)) or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("Expected a public HTTPS asset directory without credentials/query/fragment")
    opener = urllib.request.build_opener(NoRedirects())
    for entry in spec["files"]:
        url = base.rstrip("/") + "/" + entry["name"]
        request = urllib.request.Request(url, headers={"Accept-Encoding": "identity", "User-Agent": "FlashVoicePackVerifier/1.0"})
        with opener.open(request, timeout=30) as response:
            if response.status != 200:
                raise ValueError("Expected direct HTTP 200: " + entry["name"])
            if response.headers.get("Content-Encoding", "identity").lower() != "identity":
                raise ValueError("Disable content transformations: " + entry["name"])
            if response.headers.get("Content-Length") != str(entry["bytes"]):
                raise ValueError("Incorrect Content-Length: " + entry["name"])
            cache = {value.strip().lower() for value in response.headers.get("Cache-Control", "").split(",")}
            if not {"public", "max-age=31536000", "immutable", "no-transform"}.issubset(cache):
                raise ValueError("Missing immutable download cache policy: " + entry["name"])
            size, sha = digest(response)
            if (size, sha) != (entry["bytes"], entry["sha256"]):
                raise ValueError("Remote asset hash/size mismatch: " + entry["name"])
        print("PASS direct, immutable, SHA-256 verified:", entry["name"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    staging = commands.add_parser("stage")
    staging.add_argument("--assets", type=pathlib.Path, required=True)
    staging.add_argument("--output", type=pathlib.Path, required=True)
    remote = commands.add_parser("verify-host")
    remote.add_argument("--base-url", required=True)
    args = parser.parse_args()
    if args.command == "stage":
        stage(args.assets, args.output)
    else:
        verify_host(args.base_url)
