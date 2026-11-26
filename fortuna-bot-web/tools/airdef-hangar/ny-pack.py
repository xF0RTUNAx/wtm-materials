# Новогодний ангар (fuel-builder 2026-11-26, «Новый год/ангар»): слои сборщика → файлы игры games/airdef/ui/hangar/ny/.
#   blender -b --factory-startup -P ny-pack.py -- "<папка Новый год/ангар>" [доля размера слоёв света = 1]
# На кадр (fighter, heavy):
#   <к>.jpg, <к>_s.jpg - база (лампы в слабом накале), как прежние кадры ангара;
#   <к>_w.jpg - тёплые нитки g1..g4 сеткой 2 × 2, серый: яркость группы (корень - точнее тёмные места);
#   <к>_c.jpg - RGB-нитки c1..c4 сеткой 2 × 2, серый: белый свет группы (цвет даёт игра);
#   <к>_t.jpg - цвет отсвета: слева тёплых (Σ свет / наибольший канал), справа RGB-ниток (отсвет белого света на предметах);
#   <к>_m.jpg - сетка 2 × 2: маска улицы, маска фонарей крыши, глубина улицы (корень от доли 600 м), пусто.
# Слои по группам - одной яркостью: у одной группы цвет света везде один (тёплые лампы), отличие - только цвет поверхностей (в _t).
import OpenImageIO as oiio, numpy as np, sys, os, subprocess, tempfile
a = sys.argv[sys.argv.index('--') + 1:]
SRC = a[0]; K = float(a[1]) if len(a) > 1 else 1.0
OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../games/airdef/ui/hangar/ny'))
os.makedirs(OUT, exist_ok=True); tmp = tempfile.mkdtemp()
def rd(f):
    i = oiio.ImageInput.open(f); x = i.read_image(oiio.FLOAT); i.close(); return x if x.ndim == 3 else x[..., None]
def rs(x, w, h):
    b = oiio.ImageBuf(np.ascontiguousarray(x.astype(np.float32))); return oiio.ImageBufAlgo.resize(b, roi=oiio.ROI(0, w, 0, h, 0, 1, 0, x.shape[2])).get_pixels(oiio.FLOAT)
def jpg(x, fn, q):
    x = np.clip(x, 0, 1); png = os.path.join(tmp, 'x.png'); o = oiio.ImageOutput.create(png)
    o.open(png, oiio.ImageSpec(x.shape[1], x.shape[0], x.shape[2], 'uint8')); o.write_image(np.ascontiguousarray((x * 255 + 0.5).astype(np.uint8))); o.close()
    gray = ['-pix_fmt', 'gray'] if x.shape[2] == 1 else ['-pix_fmt', 'yuvj444p']
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', png, *gray, '-q:v', str(q), fn], check=True)
def grid(L):
    return np.concatenate([np.concatenate(L[0:2], 1), np.concatenate(L[2:4], 1)], 0)
for key in ('fighter', 'heavy'):
    d, ds = os.path.join(SRC, key), os.path.join(SRC, key + '_s')
    jpg(rd(os.path.join(d, f'{key}_база.png'))[..., :3], os.path.join(OUT, f'{key}.jpg'), 3)
    jpg(rd(os.path.join(ds, f'{key}_s_база.png'))[..., :3], os.path.join(OUT, f'{key}_s.jpg'), 3)
    W = [rd(os.path.join(ds, f'{key}_s_свет_{i}.png'))[..., :3] for i in range(1, 5)]
    Cc = [rd(os.path.join(ds, f'{key}_s_цвет_{i}.png'))[..., :3] for i in range(1, 5)]
    H, Wd = W[0].shape[:2]; w, h = int(Wd * K) // 4 * 4, int(H * K) // 4 * 4
    lum = lambda x: np.sqrt(np.clip(x.max(-1, keepdims=True), 0, 1))
    tint = lambda L: (lambda s: s / np.maximum(s.max(-1, keepdims=True), 1e-4))(sum(L))
    for sfx, kk in (('', 1), ('_s', 0.5)):  # _s - телефон и малые экраны: сетка 1600 × 900 (полная 3200 × 1800 - около 23 МБ видеопамяти на слой)
        jpg(rs(grid([lum(x) for x in W]), int(2 * w * kk), int(2 * h * kk)), os.path.join(OUT, f'{key}_w{sfx}.jpg'), 3)
        jpg(rs(grid([lum(x) for x in Cc]), int(2 * w * kk), int(2 * h * kk)), os.path.join(OUT, f'{key}_c{sfx}.jpg'), 3)
    jpg(rs(np.concatenate([tint(W), tint(Cc)], 1), Wd, H // 2), os.path.join(OUT, f'{key}_t.jpg'), 4)
    M = rd(os.path.join(ds, f'{key}_s_маска_улицы.png'))[..., :1]
    try: Ml = rd(os.path.join(ds, f'{key}_s_маска_фонари.png'))[..., :1]
    except Exception: Ml = np.zeros_like(M)
    D = np.sqrt(np.clip(rd(os.path.join(ds, f'{key}_s_глубина_улицы.png'))[..., :1], 0, 1))
    jpg(rs(grid([M, Ml, D, np.zeros_like(M)]), Wd, H), os.path.join(OUT, f'{key}_m.jpg'), 3)
    print(key, {f: round(os.path.getsize(os.path.join(OUT, f)) / 1024) for f in sorted(os.listdir(OUT)) if f.startswith(key)}, flush=True)
