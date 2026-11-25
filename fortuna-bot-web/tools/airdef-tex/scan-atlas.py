# Проба «земля по сканам» (Mark 2026-11-25: сравнение Watch Dogs 2 и GTA 6): те же атласы 4 × 4, что у ground-atlas.py, но плитки - сканы настоящей земли
# (Poly Haven, ambientCG - CC0). Нет карты высот у скана - высота из яркости (полоса частот). Крупные пятна скана приглушены (иначе виден повтор).
#   PY=/Applications/Blender.app/Contents/Resources/5.2/python/bin/python3.13; $PY tools/airdef-tex/scan-atlas.py [--lo]
import sys, os, json, subprocess, shutil, tempfile, glob, numpy as np
HOME = os.environ['HOME']; BASE = f'{HOME}/Downloads/Воздушное превосходство'; R = f'{BASE}/Модели/Свои/Текстуры земли и дорог/референсы/cc0'; T2 = f'{BASE}/Текстуры'; OWN = f'{BASE}/Модели/Свои/Текстуры земли и дорог/плитки'
WEB = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../..')); OUT = f'{WEB}/games/airdef/tex'
# (папка, размер плитки скана, м - сколько раз укладывается в клетку 4 м; сила рельефа; насыщенность)
GT = [(f'{T2}/Grass004_1K-JPG', 2, .9, .8), (f'{R}/ph_leafy_grass', 2, .8, .8), (f'{R}/ph_sparse_grass', 2, .8, .85), (f'{R}/ph_grass_path_2', 2, .8, .85), (f'{R}/Ground037', 2, .8, .85),
      (f'{R}/ph_sparse_grass', 2, .8, .85), (f'{R}/ph_leafy_grass', 2, .8, .85), (f'{R}/ph_withered_grass', 2, .8, .85), (f'{R}/ph_grass_path_2', 2, .8, .85), (f'{R}/brown_mud_dry', 2, .8, .9),
      (f'{R}/farm_soil', 2, .9, .9), (f'{R}/raked_dirt', 2, .9, .9), (f'{R}/ph_forest_floor', 2, .9, .9), (f'{R}/excavated_soil_wall', 4, .8, .9), (f'{R}/coast_sand_01', 2, .7, .9), (f'{R}/damp_sand', 2, .6, .9)]
A2 = f'{T2}/asphalt_02_1k'
PT = [(A2, 2, 1, .9), (A2, 4, 1, .9), (A2, 2, .7, .7), (f'{R}/Road008B', 4, 1, .9), (A2, 2, 1, .9), (A2, 4, .8, .8),
      (f'{T2}/concrete_pavement_1k', 2, .8, .9), (f'{T2}/concrete_pavement_02_1k', 2, .8, .9), (f'{T2}/cobblestone_large_01_2k', 2, .9, .9), (f'{R}/concrete_floor_worn_001', 2, .7, .9), (f'{R}/concrete_floor_02', 2, .7, .9),
      (f'{R}/sandy_gravel', 2, 1, .9), (f'{R}/stony_dirt_path', 2, 1, .9), (f'{R}/concrete_moss', 2, .8, .9), (f'{T2}/concrete_pavement_02_1k', 2, .8, .9), 'плиты_паг_1']
def probe(p):
    o = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', p], capture_output=True, text=True, check=True).stdout.strip().split(','); return int(o[0]), int(o[1])
def read(p, S, gray=False):
    W, H = probe(p); n = 1 if gray else 3
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-vf', f'scale={S}:{S}:flags=lanczos', '-f', 'rawvideo', '-pix_fmt', 'gray16le' if gray else 'rgb48le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, '<u2').reshape(S, S, n).astype(np.float32) / 65535
def blur(a, s):  # гаусс по кругу (плитка)
    H, W = a.shape[:2]; fy = np.fft.fftfreq(H)[:, None]; fx = np.fft.fftfreq(W)[None, :]; k = np.exp(-2 * np.pi ** 2 * s * s * (fx * fx + fy * fy)); return np.real(np.fft.ifft2(np.fft.fft2(a, axes=(0, 1)) * (k[..., None] if a.ndim == 3 else k), axes=(0, 1))).astype(np.float32)
def find(d, pats):
    for pt in pats:
        f = sorted(q for q in glob.glob(glob.escape(d) + '/**/*', recursive=True) if pt.lower() in os.path.basename(q).lower() and q.lower().endswith(('.jpg', '.png')))
        if f: return f[0]
def tile(spec, S):  # → (цвет S×S×3 0..1 sRGB, высота, нормаль xy, шероховатость) на 4 м
    if isinstance(spec, str):
        d = f'{OWN}/{spec}'; c = read(f'{d}/цвет.png', S); h = read(f'{d}/высота.png', S, True)[..., 0]; hm = 1.; sat = 1.; n = 1; amp = 1.; r = read(f'{d}/шероховатость.png', S, True)[..., 0]
    else:
        d, M, amp, sat = spec; n = round(4 / M); s = S // n
        c = read(find(d, ['_diff', '_Color']), s); dp = find(d, ['_disp', 'Displacement']); rp = find(d, ['_rough', 'Roughness'])
        r = read(rp, s, True)[..., 0] if rp else np.full((s, s), .85, np.float32)
        L = c.mean(2)
        if dp: h = read(dp, s, True)[..., 0]
        else: h = blur(L, 1.2) - blur(L, s / 24) * 0.85
        big = blur(L, s / 10); c = np.clip(c * ((L.mean() / np.maximum(big, .02)) ** .75)[..., None], 0, 1)  # крупные пятна тише
    lo, hi = np.percentile(h, [1, 99]); h = np.clip((h - lo) / max(hi - lo, 1e-4), 0, 1)
    g = c.mean(2, keepdims=True); c = np.clip(g + (c - g) * sat, 0, 1)
    px = h.shape[0]; k = amp * px / 1024 * 9  # наклон: высота клетки ~ 3 см на 2 м
    hb = blur(h, .7); dx = (np.roll(hb, -1, 1) - np.roll(hb, 1, 1)) * k; dy = (np.roll(hb, -1, 0) - np.roll(hb, 1, 0)) * k
    cav = np.clip(1 + (h - blur(h, px / 60)) * 1.1, .55, 1.15); c = np.clip(c * cav[..., None], 0, 1)  # тень в ямках - в цвет
    ln = np.sqrt(1 + dx * dx + dy * dy); nx = -dx / ln; ny = dy / ln  # OpenGL (G - вверх по картинке)
    a = np.concatenate([c, h[..., None], np.stack([nx * .5 + .5, ny * .5 + .5, r], 2)], 2); return np.tile(a, (n, n, 1))
def scale(a, w):
    H, W, n = a.shape; src = (np.clip(a, 0, 1) * 65535 + .5).astype('<u2').tobytes(); raw = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba64le', '-s', f'{W}x{H}', '-i', '-', '-vf', f'scale={w}:{w}:flags=lanczos', '-f', 'rawvideo', '-pix_fmt', 'rgba64le', '-'], input=src, capture_output=True, check=True).stdout
    return np.frombuffer(raw, '<u2').reshape(w, w, 4).astype(np.float32) / 65535
def cell(a, C):
    S = a.shape[0]; inner = C * 7 // 8; q = 8 * S // C; big = scale(np.pad(a, ((q, q), (q, q), (0, 0)), mode='wrap'), inner + 14)[7:-7, 7:-7]; return np.pad(big, ((C // 16, C // 16), (C // 16, C // 16), (0, 0)), mode='wrap')
TMP = tempfile.mkdtemp(prefix='gscan')
def write(a, name):
    H, W = a.shape[:2]; p = f'{TMP}/{name}.png'; subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{W}x{H}', '-i', '-', p], input=(np.clip(a, 0, 1) * 255 + .5).astype(np.uint8).tobytes(), check=True); return p
def basis(png, name): # UASTC и для цвета: у ETC1S на мелкой фактуре мыло и блоки
    r = subprocess.run(['basisu', '-ktx2', '-uastc', '-uastc_level', '2', '-uastc_rdo_l', '2.0', '-ktx2_zstandard_level', '18', '-mipmap', '-linear', png, '-output_file', f'{OUT}/{name}.ktx2'], capture_output=True, text=True)
    if r.returncode: raise SystemExit(r.stderr[-400:])
ONLY = [q for q in sys.argv[1:] if q in ('gt', 'pt')]
info = {}
_f = f'{WEB}/games/airdef/ground-tiles-scan.js'
if ONLY and os.path.exists(_f): _q = open(_f).read(); info = json.loads(_q[_q.index('{'):_q.rindex('}') + 1])
_j = open(f'{WEB}/games/airdef/ground-tiles.js').read(); OWNM = json.loads(_j[_j.index('{'):_j.rindex('}') + 1])
for key, L in (('gt', GT), ('pt', PT)):
    if ONLY and key not in ONLY: continue
    S = 2048; T = []; info[key] = []
    for s, o in zip(L, OWNM[key]):
        a = tile(s, S); m0 = (a[..., :3] ** 2).reshape(-1, 3).mean(0); mo = np.array(o['mean'], np.float32); g = mo.mean(); mo = g + (mo - g) * (.72 if key == 'gt' else .6)
        mo = mo * .75 + m0 * (mo.mean() / m0.mean()) * .25 # средний тон - от прежней плитки (на него настроены свет и смешивание), оттенок немного от скана
        a[..., :3] = np.clip(a[..., :3] * np.sqrt(mo / m0), 0, 1); m = (a[..., :3] ** 2).reshape(-1, 3).mean(0); T.append(a); info.setdefault(key, []).append({'name': os.path.basename(s if isinstance(s, str) else s[0]), 'T': 4, 'mean': [round(float(v), 5) for v in m], 'rough': round(float(a[..., 6].mean()), 3)}); print(key, info[key][-1], flush=True)
    for sfx, Cc, Cn in (('hi', 1024, 1024), ('lo', 512, 256)):
        A = np.zeros((4 * Cc, 4 * Cc, 4), np.float32); N = np.ones((4 * Cn, 4 * Cn, 4), np.float32)
        for i, a in enumerate(T):
            y, x = divmod(i, 4); A[y * Cc:(y + 1) * Cc, x * Cc:(x + 1) * Cc] = cell(a[..., :4], Cc); N[y * Cn:(y + 1) * Cn, x * Cn:(x + 1) * Cn] = cell(np.concatenate([a[..., 4:7], np.ones_like(a[..., :1])], 2), Cn)
        basis(write(A, f's{key}c{sfx}'), f's{key}_c_{sfx}'); basis(write(N, f's{key}n{sfx}'), f's{key}_n_{sfx}'); print(key, sfx, flush=True)
open(f'{WEB}/games/airdef/ground-tiles-scan.js', 'w').write('// Плитки «по сканам» (CC0), проба: пишет tools/airdef-tex/scan-atlas.py\nexport const GTILES_S = ' + json.dumps(info, ensure_ascii=False) + ';\n'); shutil.rmtree(TMP)
