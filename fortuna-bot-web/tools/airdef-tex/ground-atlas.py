# Свои текстуры земли и дорог (Свои/Текстуры земли и дорог, сборщик hawk21, 2026-11-16) → атласы для шейдера земли города (city-render.js groundMaterial):
#   PY=/Applications/Blender.app/Contents/Resources/5.2/python/bin/python3.13; $PY tools/airdef-tex/ground-atlas.py   (numpy, ffmpeg, basisu, cwebp)
# У шейдера земли предел - 16 текстур, поэтому плитки - в атласах 4 × 4 (в каждой клетке плитка, уменьшенная до 7/8 клетки, и поля по 1/16
# клетки - продолжение плитки с другого края: мипмапы до 1/64 клетки не смешивают соседние плитки):
#   gt_c / pt_c - цвет земли / покрытий (sRGB, ×√AO), в альфе - высота плитки 0..1 (смешивание слоёв по высоте);
#   gt_n / pt_n - нормали (R, G - x, y; OpenGL), B - шероховатость;
#   dc / dn - атлас наклеек износа дорог 8 × 8 м (цвет с покрытием в альфе; нормали, шероховатость, высота в альфе);
#   mt - макро-пятна 256 м: тон (×128 = 1), в альфе - выгоревшая трава.
# Два размера: _hi (клетка 1024 - 256 пикс/м) и _lo (512); запасные webp (без KTX2) - только _lo. Средние цвета, плитки, наклейки - в ground-tiles.js.
import sys, os, json, subprocess, shutil, tempfile, numpy as np
HOME = os.environ['HOME']
SRC = f'{HOME}/Downloads/Воздушное превосходство/Модели/Свои/Текстуры земли и дорог/плитки'
WEB = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../..'))
OUT = f'{WEB}/games/airdef/tex'
ONLY = [a for a in sys.argv[1:] if not a.startswith('-')]
NOKTX = '--no-ktx' in sys.argv
# 16 плиток земли и 16 покрытий: номер в списке - клетка атласа (строка = номер // 4)
GT = ['газон_1', 'газон_2', 'газон_3', 'газон_вытоптанный_1', 'газон_вытоптанный_2', 'луг_1', 'луг_цветущий_1', 'сухая_трава_1',
      'сухая_трава_2', 'суглинок_1', 'пашня_1', 'пашня_2', 'подстилка_1', 'глина_1', 'песок_1', 'ил_1']
PT = ['асфальт_1', 'асфальт_2', 'асфальт_новый_2', 'асфальт_разбитый_1', 'асфальт_двор_1', 'асфальт_двор_2', 'плитка_тротуар_1', 'плитка_тротуар_2',
      'брусчатка_1', 'бетон_площадка_1', 'бетон_площадка_2', 'гравий_2', 'грунтовка_1', 'промзона_1', 'набережная_2', 'плиты_паг_1']

def probe(p):
    o = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', p], capture_output=True, text=True, check=True).stdout.strip().split(',')
    return int(o[0]), int(o[1])
def read(p, fmt='rgba'):  # fmt: rgba (8 бит) или gray16le
    W, H = probe(p); raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-f', 'rawvideo', '-pix_fmt', fmt, '-'], capture_output=True, check=True).stdout
    if fmt == 'gray16le': return np.frombuffer(raw, '<u2').reshape(H, W).astype(np.float32) / 65535.0
    return np.frombuffer(raw, np.uint8).reshape(H, W, 4).astype(np.float32) / 255.0
def scale(a, w, h):  # a: H×W×4 float 0..1 → w×h (lanczos, 16 бит на канал)
    H, W = a.shape[:2]; src = (np.clip(a, 0, 1) * 65535 + 0.5).astype('<u2').tobytes()
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba64le', '-s', f'{W}x{H}', '-i', '-', '-vf', f'scale={w}:{h}:flags=lanczos', '-f', 'rawvideo', '-pix_fmt', 'rgba64le', '-'], input=src, capture_output=True, check=True).stdout
    return np.frombuffer(raw, '<u2').reshape(h, w, 4).astype(np.float32) / 65535.0
def cell(a, C):  # плитка (бесшовная) → клетка C: уменьшить до 7/8 C без шва (края - с другой стороны), поля C/16 - продолжение плитки
    S = a.shape[0]; inner = C * 7 // 8; q = 8 * S // C   # q·inner/S = 7 - целое: краевые 7 пикселей отрезаются ровно
    big = scale(np.pad(a, ((q, q), (q, q), (0, 0)), mode='wrap'), inner + 14, inner + 14)[7:-7, 7:-7]
    return np.pad(big, ((C // 16, C // 16), (C // 16, C // 16), (0, 0)), mode='wrap')
def write(a, name):  # PNG 8 бит RGBA
    H, W = a.shape[:2]; p = f'{TMP}/{name}.png'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{W}x{H}', '-i', '-', p], input=(np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8).tobytes(), check=True)
    return p
def basis(png, name, data):
    if NOKTX: return
    args = ['-ktx2', '-uastc', '-uastc_level', '2', '-uastc_rdo_l', '1.5', '-ktx2_zstandard_level', '18', '-mipmap', '-linear'] if data else ['-ktx2', '-mipmap', '-q', '200', '-comp_level', '2']
    r = subprocess.run(['basisu', *args, png, '-output_file', f'{OUT}/{name}.ktx2'], capture_output=True, text=True)
    if r.returncode: raise SystemExit(f'basisu {name}: {r.stderr[-400:]}')
def webp(png, name):
    subprocess.run(['cwebp', '-quiet', '-q', '88', '-alpha_q', '100', '-exact', png, '-o', f'{OUT}/{name}.webp'], check=True)
lin = lambda c: c ** 2  # как srgb() в шейдере (квадрат)

TMP = tempfile.mkdtemp(prefix='gatlas'); info = {}
def atlas(key, names):
    tiles = []
    for n in names:
        d = f'{SRC}/{n}'; P = json.load(open(f'{d}/паспорт.json'))
        c = read(f'{d}/цвет.png'); ao = read(f'{d}/ao.png')[..., :1]; h = read(f'{d}/высота.png', 'gray16le')[..., None]
        nr = read(f'{d}/нормали.png'); r = read(f'{d}/шероховатость.png')[..., :1]
        col = np.concatenate([c[..., :3] * np.sqrt(ao), h], 2); nrm = np.concatenate([nr[..., :2], r, np.ones_like(r)], 2)
        m = lin(col[..., :3]).reshape(-1, 3).mean(0)
        tiles.append(dict(name=n, T=P['плитка_м'], mean=[round(float(v), 5) for v in m], rough=round(float(r.mean()), 3), col=col, nrm=nrm))
        print(f'  {key}: {n} {P["плитка_м"]} м, средний (линейный) {np.round(m, 3)}', flush=True)
    info[key] = [{k: t[k] for k in ('name', 'T', 'mean', 'rough')} for t in tiles]
    for sfx, Cc, Cn in (('hi', 1024, 512), ('lo', 512, 256)):
        A = np.zeros((4 * Cc, 4 * Cc, 4), np.float32); N = np.zeros((4 * Cn, 4 * Cn, 4), np.float32)
        for i, t in enumerate(tiles):
            y, x = divmod(i, 4)
            A[y * Cc:(y + 1) * Cc, x * Cc:(x + 1) * Cc] = cell(t['col'], Cc); N[y * Cn:(y + 1) * Cn, x * Cn:(x + 1) * Cn] = cell(t['nrm'], Cn)
        pc, pn = write(A, f'{key}_c_{sfx}'), write(N, f'{key}_n_{sfx}')
        basis(pc, f'{key}_c_{sfx}', False); basis(pn, f'{key}_n_{sfx}', True)
        if sfx == 'lo': webp(pc, f'{key}_c_lo'); webp(pn, f'{key}_n_lo')
        print(f'  {key}_{sfx}: атлас {4 * Cc} / нормали {4 * Cn}', flush=True)

def fill(c, a):  # цвет под прозрачным (push-pull, как alpha-fill.py): у кромки наклейки в мипмапах нет тёмной каймы
    w = (a > 0.02).astype(np.float32)[..., None]; lv = [(c * w, w)]
    while lv[-1][0].shape[0] > 1:
        cc, ww = lv[-1]; h2 = cc.shape[0] // 2; lv.append((cc.reshape(h2, 2, h2, 2, 3).sum((1, 3)), ww.reshape(h2, 2, h2, 2, 1).sum((1, 3))))
    f = lv[-1][0] / np.maximum(lv[-1][1], 1e-6)
    for cc, ww in reversed(lv[:-1]): up = np.repeat(np.repeat(f, 2, 0), 2, 1); f = np.where(ww > 0, cc / np.maximum(ww, 1e-6), up)
    return f
def decals():
    d = f'{SRC}/наклейки_2'; P = json.load(open(f'{d}/паспорт.json'))
    c = read(f'{d}/цвет.png'); ao = read(f'{d}/ao.png')[..., :1]; h = read(f'{d}/высота.png', 'gray16le')[..., None]; nr = read(f'{d}/нормали.png'); r = read(f'{d}/шероховатость.png')[..., :1]
    col = np.concatenate([fill(c[..., :3] * np.sqrt(ao), c[..., 3]), c[..., 3:4]], 2); nrm = np.concatenate([nr[..., :2], r, h], 2)
    info['dec'] = {'m': P['плитка_м'], 'h': P['высота_м'], 'list': [{'name': n['имя'], 'uv': n['uv'], 'm': n['м'][2:], 'where': n['где']} for n in P['наклейки']]}
    S = c.shape[0]
    for sfx, C in (('hi', 2048), ('lo', 1024)):
        a = scale(col, C, C) if C != S else col; n = scale(nrm, C, C) if C != S else nrm
        pc, pn = write(a, f'dc_{sfx}'), write(n, f'dn_{sfx}'); basis(pc, f'dc_{sfx}', False); basis(pn, f'dn_{sfx}', True)
        if sfx == 'lo': webp(pc, 'dc_lo'); webp(pn, 'dn_lo')
    print(f'  наклейки: {len(P["наклейки"])}', flush=True)
def macro():  # тон макро-пятен 1 и выгоревшее (R мозаики) в альфе; шейдер кладёт её дважды (256 и 173 м с поворотом 37°)
    m1 = f'{SRC}/макро_пятна_1'; t1, mo1 = read(f'{m1}/тон.png'), read(f'{m1}/мозаика.png')
    a = np.concatenate([t1[..., :3], mo1[..., 0:1]], 2)
    info['macro'] = {'m': json.load(open(f'{m1}/паспорт.json'))['размер_м']}
    for sfx, C in (('hi', 1024), ('lo', 512)):
        A = scale(a, C, C) if C != a.shape[0] else a
        pa = write(A, f'mt_{sfx}'); basis(pa, f'mt_{sfx}', True)
        if sfx == 'lo': webp(pa, 'mt_lo')
    print('  макро-пятна', flush=True)

want = lambda k: not ONLY or k in ONLY
if want('gt'): atlas('gt', GT)
if want('pt'): atlas('pt', PT)
if want('dec'): decals()
if want('macro'): macro()
J = f'{WEB}/games/airdef/ground-tiles.js'
old = {}
if os.path.exists(J):
    s = open(J).read(); old = json.loads(s[s.index('{'):s.rindex('}') + 1])
old.update(info)
open(J, 'w').write('// Свои текстуры земли и дорог: плитки атласов gt / pt (клетка = номер, 4 × 4), средний цвет (линейный, квадрат sRGB, ×√AO), шероховатость;\n'
                   '// наклейки износа дорог (uv в атласе dc / dn, размер, м); макро-пятна. Пишет tools/airdef-tex/ground-atlas.py - руками не править.\n'
                   'export const GTILES = ' + json.dumps(old, ensure_ascii=False) + ';\n')
shutil.rmtree(TMP); print('готово:', J)
