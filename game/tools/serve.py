#!/usr/bin/env python3
"""Static server for the activity, plus a save endpoint for the render bench.

Two reasons this exists instead of `python -m http.server`:

  1. The render bench (tools/render-cues.js) renders each cue in the browser
     and has to get the bytes onto disk. A page cannot write files, so it
     POSTs them here and this writes them into assets/sfx/.
  2. VS Code Live Server reloads the page on every file save, which yanks the
     page out from under a multi-step render or a QA playthrough. This does
     not reload anything.

    python tools/serve.py            # serves the repo root on 127.0.0.1:8000

POST /__save?path=assets/sfx/pop.wav   body = raw bytes
    Writes the body to that path. The only thing the bench ever needs to
    write is a .wav into assets/sfx, so that is the only thing
    this allows - a stray fetch cannot reach app.js or drop a report
    anywhere.
"""

import os
import posixpath
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SAVE_OK_EXT = {'.wav'}
SAVE_OK_DIRS = ('assets/sfx',)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):          # one line per request, no noise
        sys.stderr.write('%s %s\n' % (self.command, self.path.split('?')[0]))

    def end_headers(self):
        # The bench may be opened from a different origin while iterating.
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if not self.path.startswith('/__save'):
            self.send_error(404)
            return
        query = self.path.split('?', 1)[1] if '?' in self.path else ''
        rel = ''
        for part in query.split('&'):
            if part.startswith('path='):
                from urllib.parse import unquote
                rel = unquote(part[5:])
        ok, why = self._allowed(rel)
        if not ok:
            self.send_error(403, why)
            return

        n = int(self.headers.get('Content-Length') or 0)
        body = self.rfile.read(n)
        dest = os.path.join(ROOT, *rel.split('/'))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, 'wb') as fh:
            fh.write(body)
        sys.stderr.write('  -> wrote %s (%d bytes)\n' % (rel, len(body)))
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(b'ok ' + str(len(body)).encode())

    def _allowed(self, rel):
        if not rel:
            return False, 'no path'
        rel = posixpath.normpath(rel.replace(chr(92), '/'))
        if rel.startswith('..') or rel.startswith('/') or ':' in rel:
            return False, 'path escapes the repo'
        if os.path.splitext(rel)[1].lower() not in SAVE_OK_EXT:
            return False, 'extension not saveable'
        if not any(rel.startswith(d + '/') for d in SAVE_OK_DIRS):
            return False, 'directory not saveable'
        return True, ''


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print('serving %s on http://127.0.0.1:%d/' % (ROOT, port))
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
