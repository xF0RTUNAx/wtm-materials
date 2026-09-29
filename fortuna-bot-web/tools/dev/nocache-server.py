# Локальный сервер статики БЕЗ кэша (python -m http.server кэширует модули, и правки «не видны»).
#   python3 fortuna-bot-web/tools/dev/nocache-server.py [порт=8935]
# Отдаёт корень монорепо (wtm-materials): http://localhost:8935/fortuna-bot-web/app.html,
# игра — http://localhost:8935/fortuna-bot-web/games/drone.html?mode=training&test=1
import http.server, functools, os, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8935
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, *a): pass
print(f'без кэша: http://localhost:{PORT}/fortuna-bot-web/  (корень {ROOT})')
http.server.ThreadingHTTPServer(('', PORT), functools.partial(H, directory=ROOT)).serve_forever()
