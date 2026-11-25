# Проба «земля по сканам» (Mark 2026-11-25: сравнение Watch Dogs 2 и GTA 6): те же атласы 4 × 4, что у ground-atlas.py, но плитки - сканы настоящей земли
# (Poly Haven, ambientCG - CC0). Плитка - из случайно сдвинутых кусков скана (synth). Крупные пятна скана приглушены (иначе виден повтор).
#   PY=/Applications/Blender.app/Contents/Resources/5.2/python/bin/python3.13; $PY tools/airdef-tex/scan-atlas.py [--lo]
import sys, os, json, subprocess, shutil, tempfile, glob, numpy as np
HOME = os.environ['HOME']; BASE = f'{HOME}/Downloads/Воздушное превосходство'; R = f'{BASE}/Модели/Свои/Текстуры земли и дорог/референсы/cc0'; T2 = f'{BASE}/Текстуры'; OWN = f'{BASE}/Модели/Свои/Текстуры земли и дорог/плитки'
WEB = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../..')); OUT = f'{WEB}/games/airdef/tex'
Z = f'{BASE}/Модели/Свои/_текстуры_CC0/земля'
TM = 3  # м на клетку атласа
# (папка, размер скана в жизни, м; сила рельефа; насыщенность; как складывать: 'mix' - из случайно сдвинутых кусков, 'rep' - ровным повтором (плитка, кладка))
z = lambda n, M, amp=1., sat=.95, how='mix': (f'{Z}/{n}', M, amp, sat, how)
GT = [z('Grass004', 1.4, 1, .85), z('Grass003', 1.4, 1, .85), z('grass_ground', 2.5), z('grass_path_2', 1.4), z('grass_path_3', 1.4), z('forrest_ground_01', 2, 1, .85), z('leafy_grass', 2), z('withered_grass', 2),
      z('Ground072', 2), z('Ground106', 2), z('farm_soil', 2), z('raked_dirt', 2, 1, .95, 'rep'), (f'{T2}/Ground078_2K-JPG', 2, 1, .95, 'mix'), (f'{R}/excavated_soil_wall', 3, 1, .95, 'rep'), z('coast_sand_03', 3), z('damp_sand', 2)]
PT = [z('Asphalt025A', 2), z('Asphalt028A', 2), z('Asphalt028A', 1.6), z('Asphalt026A', 3, 1, .95, 'rep'), z('worn_asphalt', 2), z('asphalt_04', 3, 1, .95, 'rep'), z('concrete_pavement_03', 2, 1, .95, 'rep'), z('pavement_04', 3, 1, .95, 'rep'),
      z('cobblestone_05', 2.4, 1, .95, 'rep'), z('concrete_floor_damaged_01', 3, 1, .95, 'rep'), z('cracked_concrete', 2, 1, .95, 'rep'), z('gravel_floor_03', 2.5), z('stony_dirt_path', 2.2), z('dirty_concrete', 3, 1, .95, 'rep'), z('overgrown_concrete_pavers', 2, 1, .95, 'rep'), 'плиты_паг_1']
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
def synth(A, S, seed):  # плитка S×S (по кругу) из кусков скана A (s×s, по кругу): сетка 5 × 5 кусков со случайным сдвигом; шов - по высоте (камешек целиком из одного куска)
    s = A.shape[0]; N = 5; rng = np.random.default_rng(seed); out = np.zeros((S, S, A.shape[2]), np.float32); W = np.zeros((S, S, 1), np.float64)
    out = out.astype(np.float64); g = (np.arange(S) + .5) / S * N; nz = blur(rng.standard_normal((S, S)).astype(np.float32), S / 40); nz = np.clip(nz / nz.std() * .16, -.4, .4); h = A[..., 3]
    for j in range(N):
        for i in range(N):
            dx = np.abs((g - i - .5 + N / 2) % N - N / 2); dy = np.abs((g - j - .5 + N / 2) % N - N / 2); wx = np.clip(1.0 - dx, 0, 1); wy = np.clip(1.0 - dy, 0, 1)
            ix = np.where(wx > 0)[0]; iy = np.where(wy > 0)[0]; ox, oy = rng.integers(0, s, 2); sx = (ix + ox) % s; sy = (iy + oy) % s
            w = np.clip(wy[iy][:, None] * wx[ix][None, :] + nz[np.ix_(iy, ix)] * np.minimum(1, wy[iy][:, None] * wx[ix][None, :] * 6), 1e-3, None) ** 14 * np.exp(1.5 * h[np.ix_(sy, sx)]) + 1e-60; w = w[..., None]
            out[np.ix_(iy, ix)] += A[np.ix_(sy, sx)] * w; W[np.ix_(iy, ix)] += w
    o = (out / np.maximum(W, 1e-300)).astype(np.float32); L = o[..., :3].mean(2); o[..., :3] = np.clip(o[..., :3] * ((L.mean() / np.maximum(blur(L, S / 22), .02)) ** .85)[..., None], 0, 1); return o  # без клетки от швов: ровная яркость крупнее ~14 см
def tile(spec, S, seed=1):  # → (цвет S×S×3 0..1 sRGB, высота, нормаль xy, шероховатость) на TM метров
    if isinstance(spec, str):
        d = f'{OWN}/{spec}'; c = read(f'{d}/цвет.png', S); h = read(f'{d}/высота.png', S, True)[..., 0]; amp = 1.; r = read(f'{d}/шероховатость.png', S, True)[..., 0]; nm = read(f'{d}/нормали.png', S)[..., :2]; how = 'one'; sat = 1.; s = S
    else:
        d, M, amp, sat, how = spec; s = S // max(1, round(TM / M)) if how == 'rep' else round(S * M / TM / 2) * 2
        s = min(s, 2048)
        c = read(find(d, ['_diff', '_Color']), s); h = read(find(d, ['_disp', 'Displacement']), s, True)[..., 0]; rp = find(d, ['_rough', 'Roughness']); r = read(rp, s, True)[..., 0] if rp else np.full((s, s), .85, np.float32)
        nm = read(find(d, ['nor_gl', 'NormalGL']), s)[..., :2]; ap = find(d, ['_ao_', 'AmbientOcclusion']); ao = read(ap, s, True)[..., 0] if ap else np.ones((s, s), np.float32)
        L = c.mean(2); big = blur(L, s / 9); c = np.clip(c * ((L.mean() / np.maximum(big, .02)) ** .7)[..., None], 0, 1) * (ao ** .7)[..., None]
    h = h - blur(h, h.shape[0] / 7) * .8; lo, hi = np.percentile(h, [1, 99]); h = np.clip((h - lo) / max(hi - lo, 1e-4), 0, 1)
    cav = np.clip(1 + (h - blur(h, h.shape[0] / 60)) * .6, .6, 1.12); c = np.clip(c * cav[..., None], 0, 1)
    g = c.mean(2, keepdims=True); c = np.clip(g + (c - g) * sat, 0, 1); nm = np.clip((nm - .5) * amp + .5, 0, 1)
    a = np.concatenate([c, h[..., None], nm, r[..., None]], 2)
    if how == 'mix': return synth(a, S, seed)
    n = S // a.shape[0]; return np.tile(a, (n, n, 1))[:S, :S] if n > 1 else a
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
        a = tile(s, S, len(T) + 11); m0 = (a[..., :3] ** 2).reshape(-1, 3).mean(0); mo = np.array(o['mean'], np.float32); g = mo.mean(); mo = g + (mo - g) * (.8 if key == 'gt' else .6)
        mo = mo * .5 + m0 * (mo.mean() / m0.mean()) * .5 # средний тон - от прежней плитки (на него настроены свет и смешивание), оттенок немного от скана
        a[..., :3] = np.clip(a[..., :3] * np.sqrt(mo / m0), 0, 1); m = (a[..., :3] ** 2).reshape(-1, 3).mean(0); T.append(a); info.setdefault(key, []).append({'name': os.path.basename(s if isinstance(s, str) else s[0]), 'T': TM, 'mean': [round(float(v), 5) for v in m], 'rough': round(float(a[..., 6].mean()), 3)}); print(key, info[key][-1], flush=True)
    for sfx, Cc, Cn in (('hi', 1024, 1024), ('lo', 512, 256)):
        A = np.zeros((4 * Cc, 4 * Cc, 4), np.float32); N = np.ones((4 * Cn, 4 * Cn, 4), np.float32)
        for i, a in enumerate(T):
            y, x = divmod(i, 4); A[y * Cc:(y + 1) * Cc, x * Cc:(x + 1) * Cc] = cell(a[..., :4], Cc); N[y * Cn:(y + 1) * Cn, x * Cn:(x + 1) * Cn] = cell(np.concatenate([a[..., 4:7], np.ones_like(a[..., :1])], 2), Cn)
        basis(write(A, f's{key}c{sfx}'), f's{key}_c_{sfx}'); basis(write(N, f's{key}n{sfx}'), f's{key}_n_{sfx}'); print(key, sfx, flush=True)
open(f'{WEB}/games/airdef/ground-tiles-scan.js', 'w').write('// Плитки «по сканам» (CC0), проба: пишет tools/airdef-tex/scan-atlas.py\nexport const GTILES_S = ' + json.dumps(info, ensure_ascii=False) + ';\n'); shutil.rmtree(TMP)
