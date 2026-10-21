"""Картинки, присланные Mark в чат, → файлы (чтобы мерить чертежи и накладывать силуэт: инструментам нужны файлы на диске).

Вложения из чата сохраняются в журнале этого чата: ~/.claude/projects/<папка проекта>/<id чата>.jsonl (картинки — base64 в сообщениях пользователя).
Скрипт берёт журнал самого свежего чата в проекте, где он запущен (папка проекта выводится из текущей папки), и пишет картинки файлами.

  /usr/bin/python3 -I chat_images.py <папка_вывода> [--last-message | --all] [--start N] [--session <id или путь .jsonl>] [--project <имя папки>]
  /usr/bin/python3 -I chat_images.py --list [--all] [--session …]        (только перечислить, папка не нужна)

--last-message (по умолчанию) — картинки из последнего сообщения Mark, в котором они есть; --all — все картинки пользователя в чате; --start N — с какого номера
называть файлы (1.png, 2.jpg … без перезаписи существующих). Порядок файлов = порядок вложений в чате (№ в перечне). Какой вид на какой картинке — определи по содержимому
(открой файл) и при необходимости переименуй. Читает только блоки-картинки из сообщений пользователя, остальное в журнале не трогает.
Если Mark уже скачал файлы в ~/Downloads — проще взять их оттуда.
"""
import sys, os, json, base64, hashlib, glob, re, time

EXT = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif'}


def enc(p):
    return re.sub(r'[^A-Za-z0-9]', '-', p)          # так Claude Code называет папку проекта: каждый небуквенно-цифровой символ — «-»


def find_transcript(session=None, project=None):
    root = os.path.expanduser('~/.claude/projects')
    if session and os.path.isfile(session): return session
    pdir = os.path.join(root, project) if project else os.path.join(root, enc(os.getcwd()))
    if not os.path.isdir(pdir) and not project:   # не нашлась — берём свежайшую рядом, в Downloads
        near = [d for d in glob.glob(os.path.join(root, enc(os.path.expanduser('~/Downloads')) + '*')) if glob.glob(d + '/*.jsonl')]
        if near:
            pdir = max(near, key=lambda d: max(os.path.getmtime(f) for f in glob.glob(d + '/*.jsonl')))
            print('папка проекта по правилу не найдена, взята свежайшая в Downloads:', os.path.basename(pdir))
    if not os.path.isdir(pdir):
        recent = sorted(glob.glob(root + '/*/'), key=os.path.getmtime, reverse=True)[:5]
        raise SystemExit(f'нет папки проекта {pdir}: запусти скрипт из папки чата или укажи --project <имя из ~/.claude/projects>; свежие: ' + ', '.join(os.path.basename(d.rstrip('/')) for d in recent))
    files = [f for f in glob.glob(pdir + '/*.jsonl') if not session or os.path.basename(f).startswith(session)]
    if not files: raise SystemExit('нет журналов чата в ' + pdir)
    return max(files, key=os.path.getmtime)


def user_images(path):
    """[(номер сообщения с картинками, media_type, байты)] по порядку; только вложения самого пользователя, без повторов."""
    out, seen, idx = [], set(), 0
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        for line in f:
            if '"image"' not in line: continue
            try: o = json.loads(line)
            except Exception: continue
            msg = o.get('message') or {}
            if o.get('type') != 'user' or msg.get('role') != 'user': continue
            c = msg.get('content')
            if not isinstance(c, list) or any(isinstance(b, dict) and b.get('type') == 'tool_result' for b in c): continue   # картинки из результатов инструментов — не вложения
            imgs = [b for b in c if isinstance(b, dict) and b.get('type') == 'image' and (b.get('source') or {}).get('type') == 'base64']
            if not imgs: continue
            idx += 1
            for b in imgs:
                data = base64.b64decode(b['source']['data']); h = hashlib.sha1(data).hexdigest()
                if h in seen: continue
                seen.add(h); out.append((idx, b['source'].get('media_type', 'image/png'), data))
    return out


def size_of(data):
    try:
        import site; sys.path.append(site.getusersitepackages())
        from PIL import Image; import io
        return '×'.join(str(v) for v in Image.open(io.BytesIO(data)).size)
    except Exception:
        return '?'


if __name__ == '__main__':
    a = sys.argv[1:]; listing = '--list' in a
    if not a or (a[0].startswith('--') and not listing): print(__doc__); sys.exit(1)
    out = None if a[0].startswith('--') else a[0]
    opt = lambda n, d=None: a[a.index('--' + n) + 1] if '--' + n in a and a.index('--' + n) + 1 < len(a) else d
    tr = find_transcript(opt('session'), opt('project'))
    imgs = user_images(tr)
    if not imgs and time.time() - os.path.getmtime(tr) < 30:       # журнал пишется с небольшой задержкой — одна повторная попытка
        time.sleep(3); imgs = user_images(tr)
    if not imgs: raise SystemExit(f'в журнале {os.path.basename(tr)} нет картинок от пользователя')
    if '--all' not in a:
        last = max(i for i, _, _ in imgs); imgs = [x for x in imgs if x[0] == last]
    print(f'журнал {os.path.basename(tr)}: картинок {len(imgs)}')
    if listing:
        for n, (i, mt, d) in enumerate(imgs, 1): print(f'  №{n} (сообщение {i}): {mt}, {len(d) // 1024} КБ, {size_of(d)}')
        sys.exit(0)
    if out is None: raise SystemExit('нужна папка вывода (или --list)')
    os.makedirs(out, exist_ok=True)
    k = int(opt('start', 1))
    for n, (i, mt, d) in enumerate(imgs, 1):
        ext = EXT.get(mt, 'png')
        while os.path.exists(os.path.join(out, f'{k}.{ext}')): k += 1
        p = os.path.join(out, f'{k}.{ext}'); open(p, 'wb').write(d); print(f'  №{n} → {p}  ({len(d) // 1024} КБ, {size_of(d)})'); k += 1
