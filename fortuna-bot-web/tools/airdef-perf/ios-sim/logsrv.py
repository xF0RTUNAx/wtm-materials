# приёмник отладочных строк из симулятора: GET /l?<текст> → строка в gl.log (с временем)
import http.server, time, urllib.parse, sys
OUT = sys.argv[1]
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        q = urllib.parse.unquote(self.path.split('?', 1)[1]) if '?' in self.path else ''
        with open(OUT, 'a') as f: f.write(f'{time.strftime("%H:%M:%S")} {q}\n')
        self.send_response(204); self.send_header('Access-Control-Allow-Origin', '*'); self.end_headers()
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('', 8939), H).serve_forever()
