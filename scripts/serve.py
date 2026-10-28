#!/usr/bin/env python3
"""Serve index.html, on this computer or with --lan to the local network.

Uses only the Python standard library. The application is a single page with no server side:
this only hands out the file. RCAs and DFMEAs stay in each visitor's own files and browser.
"""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import socket

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'index.html'


class Handler(BaseHTTPRequestHandler):
    server_version = 'Causeway'

    def respond(self, body_wanted):
        path = self.path.split('?', 1)[0]
        if path == '/favicon.ico':
            self.send_response(204)
            self.end_headers()
            return
        if path not in ('/', '/index.html'):
            self.send_error(404)
            return
        # Read on every request, so a rebuilt or replaced page is served without a restart.
        body = PAGE.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        # Browsers check for a newer page on each visit instead of keeping an old one.
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        if body_wanted:
            self.wfile.write(body)

    def do_GET(self):
        self.respond(True)

    def do_HEAD(self):
        self.respond(False)


def lan_address():
    """This computer's address on the network, found without sending anything."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
        try:
            probe.connect(('10.255.255.255', 1))
            return probe.getsockname()[0]
        except OSError:
            return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8080, help='Port to listen on (default 8080)')
    parser.add_argument('--lan', action='store_true', help='Also reachable from other computers on the network (default: this computer only)')
    args = parser.parse_args()
    host = '0.0.0.0' if args.lan else '127.0.0.1'
    if not PAGE.exists():
        raise SystemExit(f'{PAGE} is missing. Run scripts/build.py first.')
    server = ThreadingHTTPServer((host, args.port), Handler)
    print(f'Serving Causeway ({PAGE.name}). Press Ctrl+C to stop.', flush=True)
    print(f'  On this computer: http://localhost:{args.port}/', flush=True)
    if args.lan:
        for name in dict.fromkeys([socket.gethostname(), lan_address()]):
            if name:
                print(f'  On the network:   http://{name}:{args.port}/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')


if __name__ == '__main__':
    main()
