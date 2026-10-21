#!/usr/bin/env python3
"""Loopback-only corrupt/slow asset fixture; never reads production model assets."""
import http.server
import pathlib
import sys
import time

ASSETS = {"one.bin": b"a" * 131072, "two.bin": b"second verified asset"}

class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_):
        pass

    def do_GET(self):
        mode, name = self.path.strip("/").split("/", 1)
        data = ASSETS.get(name)
        if data is None:
            self.send_error(404)
            return
        if mode == "redirect":
            self.send_response(302)
            self.send_header("Location", "/good/" + name)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        self.send_response(503 if mode == "status" else 200)
        if mode == "hash" or (mode == "secondhash" and name == "two.bin"):
            data = b"z" * len(data)
        if mode != "oversize":
            self.send_header("Content-Length", str(len(data) + (1 if mode == "size" else 0)))
        else:
            # Unknown length exercises the streamed byte bound independently of headers.
            self.send_header("Connection", "close")
            self.close_connection = True
            data += b"x" * 131072
        self.end_headers()
        try:
            if mode == "slow":
                self.wfile.write(data[:4096])
                self.wfile.flush()
                time.sleep(1)
                self.wfile.write(data[4096:])
            elif mode == "truncated":
                self.wfile.write(data[:1024])
                self.close_connection = True
            else:
                self.wfile.write(data)
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass

server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
pathlib.Path(sys.argv[1]).write_text(str(server.server_port))
server.serve_forever()
