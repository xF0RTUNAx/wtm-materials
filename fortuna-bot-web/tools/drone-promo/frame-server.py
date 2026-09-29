# Приёмник кадров для записи промо-ролика (см. record.js): POST ?n=N с JPEG → frames/fNNNNN.jpg
#   python3 fortuna-bot-web/tools/drone-promo/frame-server.py   (порт 8936)
import http.server, os, urllib.parse
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'frames'); os.makedirs(D, exist_ok=True)
class H(http.server.BaseHTTPRequestHandler):
    def cors(self):
        self.send_header('Access-Control-Allow-Origin', '*'); self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS'); self.send_header('Access-Control-Allow-Headers', '*')
    def do_OPTIONS(self): self.send_response(204); self.cors(); self.end_headers()
    def do_POST(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query); n = q.get('n', ['0'])[0]
        data = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        with open(os.path.join(D, 'f%05d.jpg' % int(n)), 'wb') as f: f.write(data)
        self.send_response(200); self.cors(); self.end_headers(); self.wfile.write(b'ok')
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', 8936), H).serve_forever()
