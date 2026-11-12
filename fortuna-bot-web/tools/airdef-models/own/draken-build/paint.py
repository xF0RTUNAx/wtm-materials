# paint.py - краска Saab J 35F Draken из данных gbuf.py: цвет (только краска и грязь, без света), нормали, карта блеска glTF (R затенение, G шероховатость, B металл).
# Без Blender: /usr/bin/python3 -I paint.py. DR_TEX=2048|4096, DR_OUT=<папка>, DR_AL = r,g,b (sRGB 0…1): неокрашенный алюминий (как F-100D), DR_PREV=1 - планы сверху и снизу.
# Схема: натуральный металл (фото 03, 04, 05, 07, 08): листы разного тона и блеска - полированные, матовые, потемневшие (07); подтёки и ржавые потёки по потоку (07),
# копоть и цвета побежалости на хвостовом конусе (08), сколы и царапины по маскам CC0 (Свои/_текстуры_CC0), чёрный обтекатель РЛС, антибликовая полоса перед фонарём,
# губы заборников оливковые с жёлтой каймой (05, 07). Знаки - шведские круги с тремя коронами, нарисованы здесь; номер 42 придуман (реальные 16 и 79 не копируются).
import json, math, os, site, sys, time
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image, ImageDraw, ImageFont
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__)); DAT = os.path.join(HERE, '_проба'); CC0D = os.path.join(HERE, '..', '_текстуры_CC0')
S = int(os.environ.get('DR_TEX', '2048')); OUT = os.environ.get('DR_OUT', DAT); os.makedirs(OUT, exist_ok=True)
env3 = lambda k, d: np.array([float(v) for v in os.environ.get(k, d).split(',')], np.float32)
C_AL = env3('DR_AL', '0.645,0.640,0.618')                       # теплее F-100D: на фото 07 металл желтоватый (152, 148, 132)
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f} с]', *a, flush=True)
L_ = 15.35; AX = 1.57
pos = np.load(f'{DAT}/gb_pos_{S}.npy'); nor = np.load(f'{DAT}/gb_nor_{S}.npy'); idd = np.load(f'{DAT}/gb_id_{S}.npy'); aob = np.load(f'{DAT}/gb_ao_{S}.npy')
ATLAS = json.load(open(f'{DAT}/uv.json', encoding='utf-8'))['atlas_m']; PXM = 0.985 * S / ATLAS; DS = 1.0 / PXM
mat = np.round(idd[..., 0] * 16).astype(np.int8); cls = np.round(idd[..., 1] * 32).astype(np.int8); cov = idd[..., 2] > 0.5
a = (L_ / 2 - pos[..., 1]).astype(np.float32); x = pos[..., 0].astype(np.float32); z = pos[..., 2].astype(np.float32); ax = np.abs(x)
nx, ny, nz = nor[..., 0], nor[..., 1], nor[..., 2]
ao1, ao2, bev = aob[..., 0].copy(), aob[..., 1].copy(), aob[..., 2]
doors = np.isin(cls, (7,)); ao1[doors] = 1.0; ao2[doors] = 1.0
log('данные загружены', S, 'плотность', round(PXM), 'пикс/м')
# ── план крыла и фюзеляж (как в dr_geo.py) ──
def LEf(q):
    q = np.asarray(q, np.float32)
    return np.where(q <= 1.365, 4.42, np.where(q <= 2.23, 4.42 + (q - 1.365) * (9.36 - 4.42) / (2.23 - 1.365), 9.36 + (q - 2.23) * (13.78 - 9.36) / (4.71 - 2.23))).astype(np.float32)
def TEf(q):
    q = np.asarray(q, np.float32); return np.where(q >= 2.16, 13.94, 13.94 + (2.16 - q) / (2.16 - 0.60) * (14.62 - 13.94)).astype(np.float32)
FUS = [(2.26, 0.320, -0.300, 0.310), (3.00, 0.440, -0.400, 0.370), (4.00, 0.520, -0.520, 0.430), (5.00, 0.590, -0.620, 0.520), (6.00, 0.660, -0.665, 0.600), (7.50, 0.760, -0.680, 0.620),
       (9.00, 0.780, -0.680, 0.620), (10.50, 0.760, -0.640, 0.600), (12.00, 0.700, -0.580, 0.570), (13.50, 0.600, -0.520, 0.520), (14.60, 0.500, -0.470, 0.470), (15.35, 0.415, -0.415, 0.415)]
FA = np.array([r[0] for r in FUS]); hw = np.interp(a, FA, [r[3] for r in FUS]).astype(np.float32)
LEw = LEf(ax); TEw = TEf(ax); CHw = np.maximum(TEw - LEw, 0.1)
skin_m = mat == 0
wing = (cls == 0) & (ax > hw + 0.08) & (np.abs(z + 0.10) < 0.40)
fus = (cls == 0) & ~wing
top_ = nz > 0.30; bot_ = nz < -0.30; side_ = ~top_ & ~bot_


def smooth(e0, e1, v):
    t = np.clip((v - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)


def vnoise(px, py, pz):
    ix, iy, iz = np.floor(px).astype(np.int32), np.floor(py).astype(np.int32), np.floor(pz).astype(np.int32); fx, fy, fz = px - ix, py - iy, pz - iz
    def h(i, j, k):
        v = (i * 374761393 + j * 668265263 + k * 2147483647) & 0x7fffffff; v = (v ^ (v >> 13)) * 1274126177 & 0x7fffffff; return ((v ^ (v >> 16)) & 0xffff).astype(np.float32) / 65535.0
    ux, uy, uz = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy), fz * fz * (3 - 2 * fz)
    c00 = h(ix, iy, iz) * (1 - ux) + h(ix + 1, iy, iz) * ux; c10 = h(ix, iy + 1, iz) * (1 - ux) + h(ix + 1, iy + 1, iz) * ux
    c01 = h(ix, iy, iz + 1) * (1 - ux) + h(ix + 1, iy, iz + 1) * ux; c11 = h(ix, iy + 1, iz + 1) * (1 - ux) + h(ix + 1, iy + 1, iz + 1) * ux
    return (c00 * (1 - uy) + c10 * uy) * (1 - uz) + (c01 * (1 - uy) + c11 * uy) * uz


R3 = np.array([[0.80, 0.36, -0.48], [-0.60, 0.48, -0.64], [0.0, 0.80, 0.60]], np.float32)
def fbm(fa, fx_, fz_, octv=3, seed=0.0):
    r = 0.0; w = 0.5; tot = 0.0
    pa, px, pz = a * fa, x * fx_, z * fz_
    wa = vnoise(pa * 0.7 + seed + 11.3, px * 0.7 - seed, pz * 0.7 + 5.1) - 0.5; wb = vnoise(pa * 0.7 - 7.7, px * 0.7 + seed + 3.3, pz * 0.7 - seed) - 0.5
    pa, px, pz = pa + wa * 0.9, px + wb * 0.9, pz + (wa - wb) * 0.6
    for i in range(octv):
        qa = R3[0, 0] * pa + R3[0, 1] * px + R3[0, 2] * pz; qx = R3[1, 0] * pa + R3[1, 1] * px + R3[1, 2] * pz; qz = R3[2, 0] * pa + R3[2, 1] * px + R3[2, 2] * pz
        pa, px, pz = qa * 2.03, qx * 2.03, qz * 2.03
        r = r + w * vnoise(qa + seed + i * 3.1, qx - seed * 0.7, qz + seed * 1.3 + i); tot += w; w *= 0.5
    return r / tot


def mix(c, col_, t):
    t = np.clip(t, 0, 1)[..., None]; return c * (1 - t) + np.asarray(col_, np.float32) * t


_IM = {}
def cc0(name, f):
    k = (name, f)
    if k not in _IM: _IM[k] = np.asarray(Image.open(os.path.join(CC0D, name, f)).convert('L'), np.float32) / 255.0
    return _IM[k]
def tri(name, f, tile, flow=False):
    M = cc0(name, f); H_, W_ = M.shape
    w = np.stack([np.abs(nx) ** 4, np.abs(ny) ** 4, np.abs(nz) ** 4], -1); w /= np.maximum(w.sum(-1, keepdims=True), 1e-6)
    def smp(u, v): return M[((v / tile) % 1.0 * (H_ - 1)).astype(np.int32), ((u / tile) % 1.0 * (W_ - 1)).astype(np.int32)]
    if flow: return smp(x, a) * w[..., 2] + smp(a, -z) * w[..., 0] + smp(x, -z) * w[..., 1]
    return smp(a, x) * w[..., 2] + smp(a, z) * w[..., 0] + smp(x, z) * w[..., 1]


# ── основа: неокрашенный алюминий, листы разного тона и блеска по раскрою (07) ──
BASE = np.broadcast_to(C_AL, (S, S, 3)).astype(np.float32)
col = BASE.copy(); rough = np.full((S, S), 0.44, np.float32); metal = np.where(skin_m, 0.80, 0.0).astype(np.float32); height = np.zeros((S, S), np.float32)   # окисленный алюминий: матовее зеркала (07)
RING = np.array([2.26, 3.05, 4.10, 5.05, 6.05, 7.05, 8.15, 9.20, 10.30, 11.40, 12.50, 13.55, 14.60], np.float32)      # шпангоуты и поперечные швы крыла (07)
WX = np.array([0.95, 1.95, 3.05, 4.05], np.float32)                                                       # продольные швы крыла
FZ = np.array([-0.45, -0.18, 0.18, 0.45], np.float32)                                                                 # продольные швы фюзеляжа по высоте
ri = np.searchsorted(RING, a); wi_ = np.searchsorted(WX, ax); zi = np.searchsorted(FZ, z)
tt = np.random.RandomState(7).uniform(0.955, 1.045, 1024).astype(np.float32); rt = np.random.RandomState(8).uniform(-0.08, 0.08, 1024).astype(np.float32)
hh = np.random.RandomState(9).uniform(-0.014, 0.014, 1024).astype(np.float32)
pid = np.where(wing, (ri * 11 + wi_ * 3 + (x > 0) * 101 + (nz > 0) * 211 + 7), (ri * 13 + zi * 5 + (x > 0) * 307 + 3)) % 1024
for c_, sd in ((1, 21), (2, 23), (3, 25), (4, 27), (7, 31), (8, 33), (14, 37), (15, 41)):
    k_ = (sd * 17 + (x > 0).astype(np.int32) * 3 + np.floor(a / 1.1).astype(np.int32) * 5 + np.floor(ax / 1.2).astype(np.int32) * 7) % 1024
    pid = np.where(cls == c_, k_, pid)
col *= tt[pid][..., None]; col[..., 0] *= 1 + hh[pid]; col[..., 2] *= 1 - hh[pid]; rough += rt[pid]
dark_sheet = (np.random.RandomState(11).uniform(0, 1, 1024) < 0.10)[pid] & skin_m                                    # потемневшие листы (07: серо-тёмные панели)
col = mix(col, C_AL * np.array([0.86, 0.86, 0.86], np.float32), dark_sheet * 0.55); rough += dark_sheet * 0.08
pol_sheet = (np.random.RandomState(12).uniform(0, 1, 1024) < 0.12)[pid] & skin_m & ~dark_sheet                       # полированные
col = mix(col, C_AL * 1.05, pol_sheet * 0.5); rough -= pol_sheet * 0.12; metal += pol_sheet * 0.08
log('листы')
# ── швы, люки, заклёпки ──
seamd = np.full((S, S), 9.0, np.float32); hedge = np.full((S, S), 9.0, np.float32)
def seam(m, d): seamd[m] = np.minimum(seamd[m], d[m])
for r_ in RING: seam(skin_m & np.isin(cls, (0, 14)) & (a > 2.3), np.abs(a - r_))
for q_ in WX: seam(wing & skin_m, np.abs(ax - q_))
for q_ in FZ: seam(fus & skin_m & side_ & (a > 2.3), np.abs(z - q_))
seam(fus & skin_m & (top_ | bot_) & (a > 2.3), np.abs(ax - 0.30))
seam((cls == 1) & skin_m, np.abs(a - (9.98 + (13.70 - 9.98) * (z - 0.75) / (2.32 - 0.75) + 0.60)) * 0.8)
seam((cls == 1) & skin_m, np.abs(z - 1.50))
pr = np.random.RandomState(53)
def hatch(A, Q, a0, a1, q0, q1, vm, tone=1.0):
    ins = vm & (A > a0) & (A < a1) & (Q > q0) & (Q < q1) & skin_m
    d = np.minimum.reduce([A - a0, a1 - A, Q - q0, q1 - Q]); hedge[ins] = np.minimum(hedge[ins], d[ins]); col[ins] *= tone; rough[ins] -= 0.04
for k in range(38):                                                                                     # лючки по бортам
    sg = 1 if k % 2 else -1; a0 = pr.uniform(2.6, 14.4); w_ = pr.uniform(0.12, 0.42); z0 = pr.uniform(-0.45, 0.45); h_ = pr.uniform(0.08, 0.24)
    hatch(a, z, a0, a0 + w_, z0, z0 + h_, fus & side_ & (sg * x > 0), pr.uniform(0.98, 1.025))
for k in range(30):                                                                                     # снизу фюзеляжа (07: много мелких)
    a0 = pr.uniform(3.0, 14.4); w_ = pr.uniform(0.12, 0.45); q0 = pr.uniform(-0.40, 0.30); h_ = pr.uniform(0.10, 0.26)
    hatch(a, x, a0, a0 + w_, q0, q0 + h_, fus & bot_, pr.uniform(0.98, 1.025))
for k in range(56):                                                                                     # крыло, больше снизу
    sg = 1 if k % 2 else -1; xr = pr.uniform(1.0, 4.0); le = float(LEf(xr)); te = float(TEf(xr)); ch = te - le
    a0 = pr.uniform(le + 0.12 * ch, le + 0.70 * ch); w_ = pr.uniform(0.15, 0.55); h_ = pr.uniform(0.15, 0.50)
    hatch(a, sg * x, a0, a0 + w_, xr, xr + h_, wing & (bot_ if k % 3 else top_), pr.uniform(0.975, 1.03))
PITCH = 0.045; RV = max(0.006, 0.85 * DS)
near = (seamd < 0.05) & skin_m
along = np.where(wing & (np.abs(seamd - np.abs(ax - WX[np.clip(wi_ - 0, 0, len(WX) - 1)])) < 1e-3), a, np.where(fus & side_, a, a + ax))
ph = (along / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH
riv = np.where(near, np.clip(1 - np.hypot(dph, np.abs(seamd - 0.022)) / RV, 0, 1), 0.0).astype(np.float32)
log('швы, люки, заклёпки', round(float((riv > 0).mean()), 4))
# ── износ: пятна, блеск, царапины (CC0) ──
si3 = tri('SurfaceImperfections003', 'SurfaceImperfections003_2K-JPG_Opacity.jpg', 1.6); si13 = tri('SurfaceImperfections013', 'SurfaceImperfections013_2K-JPG_Opacity.jpg', 2.1)
sc3 = tri('Scratches003', 'Scratches003_2K-JPG_Opacity.jpg', 1.2); sc5 = tri('Scratches005', 'Scratches005_2K-JPG_Opacity.jpg', 1.5)
lk12 = tri('Leaking012A', 'Leaking012A_2K-JPG_Displacement.jpg', 2.4, flow=True); lk17 = 1.0 - tri('Leaking017B', 'Leaking017B_2K-JPG_Color.jpg', 2.0, flow=True)
mott = fbm(0.6, 0.6, 0.6, 4, 1.0); fine = fbm(11.0, 11.0, 11.0, 2, 5.0); patch = fbm(1.4, 1.4, 1.4, 4, 9.0)
col *= (1 + (mott - 0.5) * 0.14 + (fine - 0.5) * 0.02)[..., None]
col = mix(col, (0.46, 0.46, 0.44), smooth(0.35, 0.85, si3) * 0.22 * skin_m)                            # светлый налёт
col = mix(col, (0.30, 0.30, 0.29), smooth(0.40, 0.90, si13) * 0.20 * skin_m)                           # разводы
rough += smooth(0.35, 0.85, si3) * 0.10 * skin_m + smooth(0.4, 0.9, si13) * 0.06 * skin_m
polish = smooth(0.55, 0.72, fbm(0.9, 0.9, 0.9, 3, 13.0)); rough += (mott - 0.5) * 0.10 - polish * 0.08
sun = smooth(0.25, 0.9, nz); col = mix(col, BASE * 1.05, sun * smooth(0.45, 0.75, patch) * 0.16)
scr = smooth(0.62, 0.86, sc5) * skin_m; col = mix(col, C_AL * 1.10, scr * 0.20); rough -= scr * 0.08          # светлые царапины на металле
scuff = smooth(0.05, 0.0, hedge) * smooth(0.5, 0.8, sc3) * 0.5; col = mix(col, C_AL * 1.08, scuff * 0.35); rough -= scuff * 0.10
log('износ')
# ── потёки по потоку, ржавые потёки, масло снизу (07) ──
aft = np.zeros((S, S), np.float32)
for k in range(120):
    sg = 1 if k % 2 else -1; on_w = k % 3 != 0
    if on_w: xr = pr.uniform(1.0, 4.2); a0 = float(LEf(xr)) + pr.uniform(0.3, 3.0); q0 = xr; mm = wing & bot_ & (sg * x > 0)
    else: a0 = pr.uniform(3.5, 13.5); q0 = pr.uniform(-0.35, 0.35); mm = fus & bot_
    ln = pr.uniform(0.4, 2.2); wd = pr.uniform(0.02, 0.09); Q = ax if on_w else x
    d_ = (a - a0) / ln; lat = np.abs(Q - q0) / wd; t_ = mm & (d_ > 0) & (d_ < 1) & (lat < 1)
    aft[t_] = np.maximum(aft[t_], ((1 - d_[t_]) ** 1.4) * (1 - lat[t_] ** 2))
flow_ = aft * (0.5 + 0.5 * smooth(0.3, 0.8, lk12))
col = mix(col, (0.30, 0.295, 0.28), flow_ * 0.45 * skin_m); rough += flow_ * 0.10
rust = np.zeros((S, S), np.float32)                                                                       # ржавые потёки от дренажей и винтов (07: коричнево-рыжие полосы назад)
for a0, q0, ln, wd, sgn in ((10.35, 1.15, 1.9, 0.10, 1), (10.10, 1.20, 1.4, 0.07, -1), (12.60, 0.42, 1.2, 0.05, 1), (8.20, 1.75, 1.0, 0.05, -1), (11.80, 2.60, 1.1, 0.05, 1), (6.80, 0.20, 1.6, 0.06, 1)):
    d_ = (a - a0) / ln; lat = np.abs(ax - q0) / wd; t_ = bot_ & skin_m & (sgn * x > 0) & (d_ > 0) & (d_ < 1) & (lat < 1)
    rust[t_] = np.maximum(rust[t_], ((1 - d_[t_]) ** 1.2) * (1 - lat[t_] ** 2) * (0.55 + 0.45 * smooth(0.3, 0.8, lk17[t_])))
col = mix(col, (0.52, 0.34, 0.18), rust * 0.65); rough += rust * 0.18; metal -= rust * 0.5
yel = smooth(0.55, 0.85, lk17) * bot_ * skin_m * smooth(7.5, 10.5, a) * smooth(13.5, 11.5, a) * smooth(0.6, 0.9, patch)   # желтоватые пятна (07)
col = mix(col, (0.62, 0.58, 0.42), yel * 0.30)
oil = smooth(-0.2, -0.8, nz) * smooth(0.48, 0.72, fbm(1.0, 4.0, 4.0, 4, 23.0)) * skin_m
col = mix(col, (0.22, 0.215, 0.20), oil * 0.12); rough += oil * 0.12
# ── хвост: побежалость и копоть (08) ──
hot = (cls == 0) & (a > 13.9) & (ax < 0.65); hst = fbm(0.6, 9.0, 9.0, 4, 131.0)
gold = smooth(13.95, 14.4, a) * hot; blue = smooth(14.6, 15.1, a) * hot
col = mix(col, np.array((0.60, 0.52, 0.36), np.float32) * (0.85 + 0.30 * hst)[..., None], gold * 0.45)
col = mix(col, np.array((0.36, 0.36, 0.42), np.float32) * (0.85 + 0.30 * hst)[..., None], blue * 0.55)
soot = smooth(14.3, 15.3, a) * hot * (0.5 + 0.5 * smooth(0.25, 0.75, fbm(0.8, 3.0, 3.0, 4, 31.0)))
col = mix(col, (0.09, 0.085, 0.08), soot * 0.70); rough += soot * 0.25; metal -= soot * 0.4
# ── кромки и сколы ──
dle = a - LEw
LEm = smooth(0.14, 0.02, dle) * smooth(-0.03, 0.02, dle) * wing + (cls == 1) * smooth(0.14, 0.02, a - (9.98 + (13.70 - 9.98) * (z - 0.75) / 1.57)) * smooth(-0.03, 0.02, a - (9.98 + (13.70 - 9.98) * (z - 0.75) / 1.57))
col = mix(col, C_AL * 1.10, LEm * 0.40); rough -= LEm * 0.12
edge = smooth(0.985, 0.90, bev) * skin_m
chip = np.clip(edge * smooth(0.60, 0.80, sc3) + LEm * smooth(0.55, 0.75, sc5) * 0.6, 0, 1) * np.where(np.isin(cls, (2, 3, 4, 7)), 0.3, 1.0)
col = mix(col, C_AL * 1.14, chip * 0.6); rough = rough * (1 - chip * 0.5) + 0.22 * chip * 0.5
crev = smooth(0.75, 0.30, ao1) * skin_m; col = mix(col, (0.16, 0.16, 0.16), crev * 0.40); rough += crev * 0.14
col *= (0.88 + 0.12 * smooth(0.15, 0.95, ao2))[..., None]
hair = smooth(max(0.008, 1.0 * DS), 0.002, seamd) * skin_m; col *= (1 - 0.14 * hair)[..., None]
grime = smooth(0.08, 0.0, np.minimum(seamd, hedge)) * smooth(0.35, 0.8, si13) * skin_m; col = mix(col, (0.25, 0.25, 0.24), grime * 0.25)
col *= (1 - smooth(0.0, 0.5, riv) * 0.06 * skin_m)[..., None]
log('потёки, хвост, кромки')
# ── обтекатель, антибликовая полоса, губы заборников ──
rad = skin_m & (cls == 0) & (a < 2.27); col[rad] = np.array((0.035, 0.036, 0.040), np.float32) * (0.85 + 0.3 * fine[rad, None]); rough[rad] = 0.30 + 0.10 * fine[rad]; metal[rad] = 0.0
agl = skin_m & (cls == 0) & (a > 2.27) & (a < 3.12) & (nz > 0.35) & (ax < 0.10 + 0.12 * (a - 2.27) / 0.85)
col[agl] = np.array((0.07, 0.075, 0.07), np.float32) * (0.9 + 0.2 * fine[agl, None]); rough[agl] = 0.80; metal[agl] = 0.0
ia = a - 4.42; rr_ = np.hypot((ax - 1.010) / 0.42, (z - (-0.07)) / 0.26)
lip = skin_m & (cls == 0) & (ia > -0.07) & (ia < 0.28) & (rr_ < 1.25) & (rr_ > 0.70)
col[lip] = np.array((0.26, 0.28, 0.21), np.float32) * (0.85 + 0.3 * fine[lip, None]); rough[lip] = 0.55; metal[lip] = 0.1          # оливковая губа (07)
yring = skin_m & (cls == 0) & (ia > 0.20) & (ia < 0.27) & (rr_ < 1.35) & (rr_ > 0.85)
col[yring] = np.array((0.80, 0.64, 0.12), np.float32); rough[yring] = 0.5; metal[yring] = 0.0                                    # жёлтая кайма (05)
diel = skin_m & (cls == 1) & (z > 2.16); col[diel] = np.array((0.08, 0.085, 0.09), np.float32); rough[diel] = 0.5; metal[diel] = 0.0   # тёмная законцовка киля (антенна)
log('обтекатель, заборники')
# ── знаки и трафареты (свои) ──
FNB = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'; FNN = '/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf'
INK = (24, 26, 30, 255); YEL = (214, 172, 28, 255); RED = (170, 36, 30, 255); WHITE = (232, 234, 232, 255)
SBLUE = (40, 104, 170, 255); SYEL = (232, 196, 40, 255)
MARKS = []
def stamp(im_, ac, qc, W_, H_, side, along=True, alpha=0.95, cl=(0,), rough_to=0.45):
    A0 = np.asarray(im_, np.float32) / 255.0; hp, wp = A0.shape[:2]
    vm, Q_ = ((nz > 0.35, x) if side == 'top' else (nz < -0.35, x) if side == 'bot' else (nx > 0.35, z) if side == 'r' else (nx < -0.35, z))
    if along: ins = vm & (np.abs(a - ac) < W_ / 2) & (np.abs(Q_ - qc) < H_ / 2)
    else: ins = vm & (np.abs(Q_ - qc) < W_ / 2) & (np.abs(a - ac) < H_ / 2)
    ins &= (mat == 0) & np.isin(cls, cl) & cov
    if not ins.any(): log('знак не лёг', ac, qc, side); return
    if along:
        u_ = (a[ins] - ac) / W_ + 0.5; v_ = 0.5 - (Q_[ins] - qc) / H_
        if side == 'r': u_ = 1 - u_
    else:
        u_ = (Q_[ins] - qc) / W_ + 0.5; v_ = (a[ins] - ac) / H_ + 0.5
        if side == 'bot': u_ = 1 - u_
    du, dv = 0.25 * DS / W_, 0.25 * DS / H_; S_ = 0.0
    for su, sv in ((-1, -1), (1, -1), (-1, 1), (1, 1), (0, 0)):
        S_ = S_ + A0[np.clip(((v_ + sv * dv) * hp).astype(int), 0, hp - 1), np.clip(((u_ + su * du) * wp).astype(int), 0, wp - 1)]
    S_ = S_ / 5.0; al = S_[:, 3] * alpha * (0.90 + 0.10 * smooth(0.3, 0.7, si3[ins])) * (1 - 0.6 * chip[ins])
    S_[:, :3] = np.where(S_[:, 3:4] > 1e-3, S_[:, :3] / np.maximum(S_[:, 3:4], 1e-3), 0.0)
    col[ins] = col[ins] * (1 - al[..., None]) + S_[:, :3] * al[..., None]; rough[ins] = rough[ins] * (1 - al) + rough_to * al; metal[ins] = metal[ins] * (1 - al)
    MARKS.append((side, float(ac), float(qc)))
def text_img(t, H=240, ink=INK, font=FNB, pad=20):
    f_ = ImageFont.truetype(font, int(H * 0.86)); tmp = ImageDraw.Draw(Image.new('L', (8, 8))); bb = tmp.textbbox((0, 0), t, font=f_); W = bb[2] - bb[0] + pad * 2
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(im_).text((W / 2, H / 2), t, font=f_, fill=ink, anchor='mm'); return im_
def crown(d_, cx, cy, s, fill):
    P = [(cx - s, cy + s * 0.55), (cx - s, cy - s * 0.25), (cx - s * 0.55, cy + s * 0.05), (cx, cy - s * 0.60), (cx + s * 0.55, cy + s * 0.05), (cx + s, cy - s * 0.25), (cx + s, cy + s * 0.55)]
    d_.polygon(P, fill=fill); d_.rectangle((cx - s, cy + s * 0.62, cx + s, cy + s * 0.85), fill=fill)
def roundel(W=900):
    """Шведский знак: голубой круг, жёлтая кайма, три короны (нарисовано здесь)."""
    im_ = Image.new('RGBA', (W, W), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); c = W / 2; R = W / 2 - 4
    d_.ellipse((c - R, c - R, c + R, c + R), fill=SYEL); d_.ellipse((c - R * 0.86, c - R * 0.86, c + R * 0.86, c + R * 0.86), fill=SBLUE)
    for dx, dy in ((-0.28, -0.24), (0.28, -0.24), (0.0, 0.26)): crown(d_, c + dx * R, c + dy * R, R * 0.22, SYEL)
    return im_
def arrow_img(W=640, H=170, ink=YEL):
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dr = ImageDraw.Draw(im_); dr.polygon([(10, H * 0.32), (W - 170, H * 0.32), (W - 170, 8), (W - 10, H / 2), (W - 170, H - 8), (W - 170, H * 0.68), (10, H * 0.68)], fill=ink); return im_
def tri_warn(S_=400):
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); P_ = [(S_ / 2, S_ * 0.06), (S_ * 0.96, S_ * 0.92), (S_ * 0.04, S_ * 0.92)]; d_.polygon(P_, fill=RED)
    d_.polygon([(S_ / 2, S_ * 0.30), (S_ * 0.78, S_ * 0.80), (S_ * 0.22, S_ * 0.80)], fill=WHITE); return im_
def hatch_frame(W=600, H=300, t=40):
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_)
    for i in range(-H, W, 60):
        d_.polygon([(i, 0), (i + 30, 0), (i + 30 + H, H), (i + H, H)], fill=YEL); d_.polygon([(i + 30, 0), (i + 60, 0), (i + 60 + H, H), (i + 30 + H, H)], fill=INK)
    d_.rectangle((t, t, W - t, H - t), fill=(0, 0, 0, 0)); return im_
RD = roundel()
for sd in ('r', 'l'):
    stamp(RD, 3.05, 0.02, 0.50, 0.50, sd, alpha=0.97)                                                       # круг на носу (03, 07)
    stamp(text_img('42', 300, font=FNB), 3.80, -0.02, 0.48, 0.40, sd, alpha=0.95)                           # номер придуман
    stamp(text_img('42', 300, font=FNB), 13.20, 1.30, 0.80, 0.62, sd, cl=(1,), alpha=0.95)                  # номер на киле
    stamp(arrow_img(), 4.10, 0.47, 0.38, 0.10, sd, alpha=0.9, rough_to=0.5)                                   # спасательная стрелка у фонаря
    stamp(tri_warn(), 5.85, 0.46, 0.13, 0.13, sd, alpha=0.95)                                                  # катапульта
    stamp(text_img('RÄDDNING', 110, ink=YEL, font=FNN), 4.10, 0.36, 0.40, 0.07, sd, alpha=0.85)
    stamp(hatch_frame(), 12.68, 0.12, 0.78, 0.34, sd, alpha=0.9, rough_to=0.5)                                # жёлто-чёрная окантовка щитков (04, 07)
for sg in (1, -1):
    stamp(RD, 11.30, sg * 1.63, 1.00, 1.00, 'bot', along=False, alpha=0.97)                                  # круги снизу (07)
    stamp(RD, 12.20, sg * 3.00, 0.90, 0.90, 'top', along=False, alpha=0.97, cl=(0, 4))                       # круги сверху (02)
    for xr in (1.6, 2.5, 3.4):
        stamp(text_img('TRAMPA EJ', 110, font=FNN), float(TEf(xr)) - 1.1, sg * xr, 0.44, 0.09, 'top', along=False, alpha=0.70)   # «не наступать»
    stamp(text_img('42', 300, font=FNB), 12.4, sg * 2.3, 0.70, 0.55, 'bot', along=False, alpha=0.90)            # номер снизу крыла
log('знаки', len(MARKS))
# ── материалы без металла обшивки ──
def solid(m, c, r, me=0.0, nz_=0.08):
    col[m] = np.array(c, np.float32) * (1 - nz_ / 2 + nz_ * fine[m])[..., None]; rough[m] = r; metal[m] = me
solid(mat == 10, (0.20, 0.21, 0.22), 0.85); solid(mat == 2, (0.030, 0.030, 0.032), 0.9); solid(mat == 4, (0.050, 0.050, 0.053), 0.88)
solid(mat == 5, (0.20, 0.215, 0.22), 0.66, 0, 0.16); solid(mat == 6, (0.30, 0.31, 0.22), 0.92, 0, 0.2); solid(mat == 8, (0.30, 0.28, 0.21), 0.9, 0, 0.14)
solid(mat == 7, (0.018, 0.038, 0.032), 0.12); solid(mat == 9, (0.74, 0.60, 0.06), 0.42)
solid(mat == 12, (0.52, 0.05, 0.04), 0.10, 0, 0.04); solid(mat == 13, (0.05, 0.40, 0.15), 0.10, 0, 0.04); solid(mat == 14, (0.80, 0.80, 0.76), 0.10, 0, 0.04)
solid(mat == 1, (0.42, 0.42, 0.42), 0.40, 0.9, 0.10)
duct = mat == 11; ia_ = np.clip((a - 4.42) / 1.3, 0, 1); col[duct] = (np.array((0.42, 0.43, 0.44), np.float32)[None] * (0.25 + 0.75 * (1 - ia_[duct]))[:, None]); rough[duct] = 0.6; metal[duct] = 0.3
noz = (cls == 0) & (mat == 1) & (a > 14.0); tn = fbm(1.2, 4.0, 4.0, 4, 59.0)
col[noz] = np.array((0.30, 0.28, 0.25), np.float32) * (0.75 + 0.4 * tn[noz, None]); metal[noz] = 0.9; rough[noz] = 0.55
gr_ = cls == 12; g_p = gr_ & (mat == 0); g_c = gr_ & (mat == 1); g_s = gr_ & (mat == 8)
gm1 = fbm(2.4, 2.4, 2.4, 4, 91.0); gm2 = fbm(18.0, 18.0, 18.0, 3, 93.0)
solid(g_p, (0.58, 0.59, 0.59), 0.46, 0.4, 0.10); solid(g_c, (0.55, 0.55, 0.54), 0.25, 0.95, 0.06); solid(g_s, (0.16, 0.155, 0.15), 0.56, 0.75, 0.14)
col[g_p] *= (0.84 + 0.30 * gm1[g_p])[..., None]
gd = smooth(-0.9, -1.55, z) * gr_; col = mix(col, (0.25, 0.22, 0.18), gd * 0.50 * (g_p | g_s)); rough += gd * 0.15 * g_p
col[gr_] *= (0.55 + 0.45 * smooth(0.15, 0.95, ao2[gr_]))[..., None]
door_in = (cls == 7) & (nz > 0.2); solid(door_in, (0.62, 0.62, 0.60), 0.55, 0.3, 0.14)
rough = np.clip(rough, 0.08, 0.97); metal = np.clip(metal, 0, 1); col = np.clip(col, 0, 1)
for c_ in range(16):
    m_ = (cls == c_) & cov
    if m_.sum() > 300: print('деталь', c_, 'цвет', (col[m_].mean(0) * 255).round(0), 'G', round(float(rough[m_].mean()), 2), 'B', round(float(metal[m_].mean()), 2))
log('материалы')
# ── высота и нормали: канавки швов, крышки, заклёпки, подушки листов, вмятины; фаски с запекания Bevel ──
gw = max(0.004, 0.9 * DS)
height -= smooth(gw, 0.0, seamd) * 0.0008 * skin_m
height += smooth(0.0, 2.5 * gw, hedge) * 0.0004 * (hedge < 8); height -= smooth(gw, 0.0, hedge) * 0.0008 * (hedge < 8)
height += smooth(0.1, 0.8, riv) * 0.0006 * skin_m
height += smooth(0.0, 0.12, np.minimum(seamd, 0.12)) * (seamd < 8) * 0.0010 * skin_m
height += (fbm(1.6, 1.6, 1.6, 2, 79.0) - 0.5) * 0.005 * skin_m
height += (fbm(70.0, 70.0, 70.0, 2, 73.0) - 0.5) * 0.00012 * skin_m - smooth(0.6, 0.9, sc5) * 0.00010 * skin_m
gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * DS); gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / (2 * DS)
flat = np.isin(mat, (2, 7, 9, 11)) | np.isin(cls, (11, 12)); gx[flat] = 0; gy[flat] = 0
BVP = f'{DAT}/gb_bev_{S}.npy'
if os.path.exists(BVP):
    bv = np.load(BVP) * 2.0 - 1.0; bv /= np.maximum(np.linalg.norm(bv, axis=-1, keepdims=True), 1e-6)
    wb = smooth(0.9995, 0.975, bv[..., 2]) * cov * (mat != 3); log('фаски: доля кромок', round(float((wb > 0.05).mean()), 4))
    nn = np.stack([bv[..., 0] * wb - gx, bv[..., 1] * wb - gy, 1 - wb + bv[..., 2] * wb], -1)
else: nn = np.stack([-gx, -gy, np.ones_like(gx)], -1)
nn /= np.linalg.norm(nn, axis=-1, keepdims=True)
def bleed(arrs, mask, n=16):
    m = mask.copy()
    for _ in range(n):
        w_ = m.astype(np.float32); W_ = np.roll(w_, 1, 0) + np.roll(w_, -1, 0) + np.roll(w_, 1, 1) + np.roll(w_, -1, 1); new = (~m) & (W_ > 0)
        if not new.any(): break
        for A_ in arrs:
            ex_ = A_ if A_.ndim == 3 else A_[..., None]
            s_ = (np.roll(ex_ * w_[..., None], 1, 0) + np.roll(ex_ * w_[..., None], -1, 0) + np.roll(ex_ * w_[..., None], 1, 1) + np.roll(ex_ * w_[..., None], -1, 1)) / np.maximum(W_, 1)[..., None]
            ex_[new] = s_[new]
        m |= new
occ = np.clip(0.35 + 0.65 * smooth(0.10, 0.92, ao2) * smooth(0.25, 0.90, ao1), 0, 1)
bleed([col, rough, metal, occ, nn], cov)
def lift(arr): return (np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)
Image.fromarray(lift(col)[::-1]).save(f'{OUT}/dr_color.png', compress_level=1)
Image.fromarray(lift(nn * 0.5 + 0.5)[::-1]).save(f'{OUT}/dr_normal.png', compress_level=1)
Image.fromarray(lift(np.stack([occ, rough, metal], -1))[::-1]).save(f'{OUT}/dr_orm.png', compress_level=1)
for nm_, pm in (('верх', skin_m & cov & (cls == 0) & (nz > 0.3) & (a > 3.2)), ('низ', skin_m & cov & (cls == 0) & (nz < -0.3) & (a > 3.2))):
    print('средний цвет обшивки,', nm_, 'sRGB', (np.clip(col[pm], 0, 1) * 255).mean(0).round(1), 'шероховатость', round(float(rough[pm].mean()), 3), 'металл', round(float(metal[pm].mean()), 3))
log('сохранено', OUT)
if os.environ.get('DR_PREV'):
    K = 60.0
    def plan(name, keep, U, V, D, w, h, lv):
        ii = np.nonzero(keep & cov); u_ = ((U[ii] + w / 2) * K).astype(int); v_ = ((V[ii]) * K).astype(int); d_ = D[ii]
        W_, H_ = int(w * K) + 2, int(h * K) + 2; ok = (u_ >= 0) & (u_ < W_) & (v_ >= 0) & (v_ < H_); u_, v_, d_ = u_[ok], v_[ok], d_[ok]
        c_ = col[ii][ok] * (0.55 + 0.45 * np.clip(nor[ii][ok] @ np.array(lv), 0, 1))[:, None]
        o_ = np.argsort(d_); im = np.full((H_, W_, 3), 0.8, np.float32); im[v_[o_], u_[o_]] = c_[o_]
        Image.fromarray(lift(im)).save(os.path.join(OUT, name))
    plan('план_сверху.png', nz > -0.05, x, a, z, 10.0, 15.6, [0.3, 0.2, 0.93])
    plan('план_снизу.png', nz < 0.05, -x, a, -z, 10.0, 15.6, [0.3, 0.2, -0.93])
    log('планы')
