"""Delivery contract checks using tiny fixtures; no model downloads."""
import hashlib
import http.server
import pathlib
import tempfile
import threading
import unittest
from unittest.mock import patch
import urllib.error

import delivery


class DeliveryTests(unittest.TestCase):
    def setUp(self):
        self.body = b'approved fixture'
        self.spec = {'version': 'fixture-v1', 'files': [{
            'name': 'model.bin', 'bytes': len(self.body),
            'sha256': hashlib.sha256(self.body).hexdigest()}]}

    def test_staging_checks_integrity_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            (root / 'model.bin').write_bytes(self.body)
            with patch.object(delivery, 'manifest', return_value=self.spec):
                delivery.stage(root, root / 'bundle')
                self.assertEqual((root / 'bundle/fixture-v1/model.bin').read_bytes(), self.body)
                self.assertTrue((root / 'bundle/notices').is_dir())
                with self.assertRaises(ValueError):
                    delivery.stage(root, root / 'bundle')
                (root / 'model.bin').write_bytes(b'corrupt')
                with self.assertRaises(ValueError):
                    delivery.stage(root, root / 'another')
                self.assertFalse((root / 'another').exists())

    def serve(self, status=200, body=None, headers=None):
        content = self.body if body is None else body
        response_headers = {'Content-Length': str(len(content)),
                            'Cache-Control': delivery.CACHE_CONTROL}
        response_headers.update(headers or {})

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(inner):
                inner.send_response(status)
                for key, value in response_headers.items():
                    inner.send_header(key, value)
                inner.end_headers()
                inner.wfile.write(content)

            def log_message(self, *_):
                pass

        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        self.addCleanup(server.server_close)
        self.addCleanup(worker.join)
        self.addCleanup(server.shutdown)
        return 'http://127.0.0.1:' + str(server.server_port)

    def test_valid_download(self):
        delivery.verify_host(self.serve(), self.spec, allow_http=True)

    def test_rejects_redirect_corruption_transform_and_bad_headers(self):
        cases = [dict(status=302, headers={'Location': '/other'}),
                 dict(body=b'changed fixture!'),
                 dict(headers={'Content-Length': '1'}),
                 dict(headers={'Cache-Control': 'public, max-age=60'}),
                 dict(headers={'Content-Encoding': 'gzip'})]
        for case in cases:
            with self.subTest(case=case):
                with self.assertRaises((ValueError, urllib.error.HTTPError)):
                    delivery.verify_host(self.serve(**case), self.spec, allow_http=True)

    def test_rejects_unsafe_source_before_request(self):
        for url in ['http://example.org', 'https://user:pass@example.org',
                    'https://example.org/?token=value', 'https://example.org/#fragment']:
            with self.subTest(url=url), self.assertRaises(ValueError):
                delivery.verify_host(url, self.spec)


if __name__ == '__main__':
    unittest.main()
