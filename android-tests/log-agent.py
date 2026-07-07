#!/usr/bin/env python3
"""Host-side agent for the Android e2e tests.

The instrumentation test runs on the emulator, which cannot read the host
filesystem or open a gRPC channel to the reader as conveniently as the host can.
This agent bridges both over the emulator host-loopback address (10.0.2.2):

    GET  /log/<name>          -> contents of <name>.log        (name: writer|reader|config)
    POST /clear/<name>        -> truncate <name>.log to empty
    GET  /read?type=&ad=&platform=  -> invoke the reader gRPC, return {"value": ...}

Back-compat aliases:  GET /writer.log , POST /clear  (== writer).

Usage:  ./log-agent.py [backend/logs dir] [port]
Defaults: ../backend/logs , port 8090
"""
import json
import os
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

HERE = os.path.dirname(os.path.abspath(__file__))
LOG_DIR = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(HERE, "..", "backend", "logs")
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8090
READ_RATIO_JS = os.path.join(HERE, "..", "e2e", "read-ratio.js")
NODE = os.environ.get("NODE_BIN", "node")

VALID = {"writer", "reader", "config"}


def log_path(name):
    return os.path.join(LOG_DIR, f"{name}.log")


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body=b"", ctype="text/plain"):
        if isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def do_GET(self):
        try:
            self._get(urlparse(self.path))
        except Exception as e:  # never let one bad request crash the server
            self._send(500, json.dumps({"error": str(e)}), "application/json")

    def _get(self, u):
        # /log/<name>  (and back-compat /writer.log)
        name = None
        if u.path.startswith("/log/"):
            name = u.path[len("/log/"):]
        elif u.path == "/writer.log":
            name = "writer"
        if name is not None:
            if name not in VALID:
                return self._send(404, b"unknown log")
            try:
                with open(log_path(name), "rb") as f:
                    return self._send(200, f.read())
            except FileNotFoundError:
                return self._send(200, b"")
        # /read?type=&ad=&platform=
        if u.path == "/read":
            q = parse_qs(u.query)
            rtype = q.get("type", ["vtc"])[0]
            ad = q.get("ad", ["ad-001"])[0]
            platform = q.get("platform", ["android"])[0]
            try:
                out = subprocess.check_output(
                    [NODE, READ_RATIO_JS, rtype, ad, platform],
                    stderr=subprocess.STDOUT, timeout=15,
                ).decode().strip()
                # read-ratio.js prints a JSON object on its last line
                last = out.splitlines()[-1]
                return self._send(200, last, "application/json")
            except subprocess.CalledProcessError as e:
                return self._send(502, json.dumps({"error": e.output.decode()}), "application/json")
        return self._send(404, b"not found")

    def do_POST(self):
        try:
            self._post(urlparse(self.path))
        except Exception as e:
            self._send(500, json.dumps({"error": str(e)}), "application/json")

    def _post(self, u):
        name = None
        if u.path.startswith("/clear/"):
            name = u.path[len("/clear/"):]
        elif u.path == "/clear":
            name = "writer"
        if name is not None:
            if name not in VALID:
                return self._send(404, b"unknown log")
            open(log_path(name), "w").close()  # writer opens append-mode, keeps writing after
            return self._send(200, b"cleared")
        return self._send(404, b"not found")

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"log-agent serving {LOG_DIR} on 0.0.0.0:{PORT} (reader via {NODE})", flush=True)
    HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
