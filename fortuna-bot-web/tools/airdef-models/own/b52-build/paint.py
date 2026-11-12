# paint.py - краска Boeing B-52H из данных gbuf.py: цвет (только краска и грязь, без света), нормали, карта блеска glTF (R затенение, G шероховатость, B металл). Без Blender: /usr/bin/python3 -I paint.py
# B52_TEX=2048|4096, B52_OUT=<папка>, B52_C = r,g,b (sRGB 0…1) основной серый. B52_PREV=1 - ещё планы сверху/снизу/сбоку прямо из данных.
# Схема: однотонный тёмно-серый ВВС США (b52_02, 04, 07, 10), листы и латки разного тона, перекрашенные пятна (b52_07, 10), матовая краска, затёртая до блеска у люков и по верху,
# потёки по потоку от люков и дренажей, масло под гондолами и пилонами, копоть за двигателями и на нижней стороне крыла (b52_11), грязь от колёс на створках,
# эрозия передних кромок, голый металл на губах воздухозаборников. Износ - фотомаски CC0 ambientCG (Свои/_текстуры_CC0, README) трёхплоскостной проекцией по координатам самолёта.
# Знаки: малозаметная звезда с полосами, на киле вымышленные буквы KM и номер AF 64 052 (B-52H в 1964 г. не строили), полоса на верхушке киля - своя. Реальные коды частей и номера с фото не берутся.
import json, math, os, site, sys, time
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image, ImageDraw, ImageFont
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__)); DAT = os.path.join(HERE, '_проба'); CC0D = os.path.join(HERE, '..', '_текстуры_CC0')
S = int(os.environ.get('B52_TEX', '2048')); OUT = os.environ.get('B52_OUT', DAT); os.makedirs(OUT, exist_ok=True)
env3 = lambda k, d: np.array([float(v) for v in os.environ.get(k, d).split(',')], np.float32)
C0 = env3('B52_C', '0.353,0.380,0.401')                              # +2 % после пыли, следов и заклёпок (средний цвет как на пробе 2)
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f} с]', *a, flush=True)
L_ = 48.78; ZA = 4.0
pos = np.load(f'{DAT}/gb_pos_{S}.npy'); nor = np.load(f'{DAT}/gb_nor_{S}.npy'); idd = np.load(f'{DAT}/gb_id_{S}.npy'); aob = np.load(f'{DAT}/gb_ao_{S}.npy')
ATLAS = json.load(open(f'{DAT}/uv.json', encoding='utf-8'))['atlas_m']; PXM = 0.985 * S / ATLAS; DS = 1.0 / PXM
mat = np.round(idd[..., 0] * 16).astype(np.int8); cls = np.round(idd[..., 1] * 32).astype(np.int8); cov = idd[..., 2] > 0.5
a = (L_ / 2 - pos[..., 1]).astype(np.float32); x = pos[..., 0].astype(np.float32); z = pos[..., 2].astype(np.float32); ax = np.abs(x); zg = z + ZA
nx, ny, nz = nor[..., 0], nor[..., 1], nor[..., 2]
ao1, ao2, bev = aob[..., 0].copy(), aob[..., 1].copy(), aob[..., 2]
doors = np.isin(cls, (3, 7, 10)); ao1[doors] = 1.0; ao2[doors] = 1.0
log('данные загружены', S, 'плотность', round(PXM), 'пикс/м')
# ── таблицы формы из b52_geo.py ──
src = open(os.path.join(HERE, 'b52_geo.py'), encoding='utf-8').read(); ns = {'Z': lambda q: q - ZA, 'math': math}
def ex(a0, a1): exec(src[src.index(a0):src.index(a1)], ns)
ex('class Track:', 'def tracks(')
ex('def tracks(', 'def sup(')
ex('FUS = [', 'def fus_top(')
ex('XTIP = ', 'def wing_up(')
ex('FLAPS = [', 'def _wsec(')
ex('PODS = (', 'def nacelle(')
ex('TANK_X, TANK_LEN', 'def tank(')
ex('SZ = ', 'ELEV_X = ')
ex('FZ0, FZ1 = ', 'def fin(')
ex('SPOIL = [', 'def spoilers(')
ex('BAY = dict(', 'BOMB_X = ')
ex('WPY_X = ', 'def weapon_pylons(')
LEf = lambda q: (11.50 + 0.780 * (q - 1.45)).astype(np.float32); TEf = lambda q: (20.95 + 0.529 * q).astype(np.float32)
FA = np.array([r[0] for r in ns['FUS']]); F_TOP = np.array([r[1] for r in ns['FUS']]); F_BOT = np.array([r[2] for r in ns['FUS']]); F_HW = np.array([r[3] for r in ns['FUS']])
hw = np.interp(a, FA, F_HW).astype(np.float32); ftop = np.interp(a, FA, F_TOP).astype(np.float32); fbot = np.interp(a, FA, F_BOT).astype(np.float32)
PODS = ns['PODS']; POD_DX = ns['POD_DX']; POD_LEN = ns['POD_LEN']; pod_front = ns['pod_front']; pod_z = ns['pod_z']; TANK_X = ns['TANK_X']
FLE = ns['FLE']; FTE = ns['FTE']; SLE = ns['SLE']; STE = ns['STE']


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


# ── фотомаски CC0 трёхплоскостной проекцией (м -> плитка), 0…1 ──
_IM = {}
def cc0(name, f):
    k = (name, f)
    if k not in _IM: _IM[k] = np.asarray(Image.open(os.path.join(CC0D, name, f)).convert('L'), np.float32) / 255.0
    return _IM[k]
def tri(name, f, tile, flow=False):
    M = cc0(name, f); H_, W_ = M.shape
    w = np.stack([np.abs(nx) ** 4, np.abs(ny) ** 4, np.abs(nz) ** 4], -1); w /= np.maximum(w.sum(-1, keepdims=True), 1e-6)
    def smp(u, v): return M[((v / tile) % 1.0 * (H_ - 1)).astype(np.int32), ((u / tile) % 1.0 * (W_ - 1)).astype(np.int32)]
    if flow:                                                                     # потёки: «вниз» картинки - по потоку назад на верхе/низе, вниз по высоте на бортах
        return smp(x, a) * w[..., 2] + smp(a, -z) * w[..., 0] + smp(x, -z) * w[..., 1]
    return smp(a, x) * w[..., 2] + smp(a, z) * w[..., 0] + smp(x, z) * w[..., 1]


skin_m = (mat == 0)
paint_m = skin_m & np.isin(cls, (0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 14, 15))
wing = (cls == 0) & (ax > hw + 0.15)
fus = (cls == 0) & ~wing
top_ = nz > 0.30; bot_ = nz < -0.30; side_ = ~top_ & ~bot_
col = np.broadcast_to(C0, (S, S, 3)).astype(np.float32).copy(); BASE = col.copy()
rough = np.full((S, S), 0.64, np.float32); metal = np.full((S, S), 0.04, np.float32); height = np.zeros((S, S), np.float32)
# ── листы: тон по раскрою (кольца фюзеляжа через 1,25 м, лонжероны и нервюры крыла), границы - по швам ──
RING = np.arange(6.3, 46.0, 1.25).astype(np.float32)
RIB = np.arange(3.5, 27.5, 1.50).astype(np.float32)
LEw = LEf(ax); CHw = TEf(ax) - LEw; uch = (a - LEw) / np.maximum(CHw, 0.1)
SPAR = (0.06, 0.35, 0.68)
tt = np.random.RandomState(7).uniform(0.925, 1.075, 512).astype(np.float32); hh = np.random.RandomState(9).uniform(-0.020, 0.020, 512).astype(np.float32)
zb = np.digitize(zg - fbot, [0.55, 1.6, 2.6, 3.4]); fi = (np.searchsorted(RING, a) * 7 + zb * 2 + (x > 0)) % 512
wi = ((np.searchsorted(RIB, ax) * 5 + np.digitize(uch, SPAR)) * 4 + (x > 0) * 2 + (nz > 0) + 101) % 512
pi_ = np.where(wing, wi, fi)
for c_, sd in ((1, 21), (2, 23), (3, 31), (4, 27), (5, 29), (6, 41), (7, 35), (8, 39), (10, 43), (14, 47), (15, 49)):
    k_ = (sd * 13 + (x > 0).astype(np.int32) * 3 + np.floor(a / 1.6).astype(np.int32) * 5 + np.floor(ax / 1.8).astype(np.int32) * 7) % 512
    pi_ = np.where(cls == c_, k_, pi_)
col *= tt[pi_][..., None]; col[..., 0] *= 1 + hh[pi_]; col[..., 2] *= 1 - hh[pi_]
rough += (tt[(pi_ * 3) % 512] - 1.0) * 1.2
log('листы')
# ── перекрашенные пятна и латки: свежая краска синее и чуть темнее, старая - светлее и теплее (b52_07, 10) ──
RS = np.random.RandomState(31)
def patches(n, mask, A, Q, arng, qrng, wr, hr, kind):
    ids = np.nonzero((mask & paint_m).ravel())[0]; AA, QQ = A.ravel()[ids], Q.ravel()[ids]
    for k in range(n):
        a0 = RS.uniform(*arng); q0 = RS.uniform(*qrng); w = RS.uniform(*wr); h = RS.uniform(*hr); e_ = RS.uniform(0.02, 0.10)
        d = np.minimum.reduce([AA - a0, a0 + w - AA, QQ - q0, q0 + h - QQ]); sel = d > -e_
        if not sel.any(): continue
        t_ = np.clip((d[sel] + e_) / (2 * e_), 0, 1); cc = ids[sel]
        if kind == 0: c3 = np.array([0.88, 0.92, 1.00]) * RS.uniform(0.90, 1.0); dr = -0.09          # свежая: синее, ровнее, глаже
        else: c3 = np.array([1.12, 1.09, 1.02]) * RS.uniform(1.0, 1.08); dr = 0.07                 # старая выгоревшая
        for ch_ in range(3): col[..., ch_].ravel()[cc] *= 1 + (c3[ch_] - 1) * t_
        rough.ravel()[cc] += dr * t_
patches(55, fus & side_, a, zg, (6, 46), (1.8, 5.2), (0.4, 2.4), (0.3, 1.4), 0); patches(26, fus & side_, a, zg, (6, 46), (1.8, 5.2), (0.3, 1.6), (0.3, 1.0), 1)
patches(22, fus & top_, a, x, (5, 46), (-1.4, 1.4), (0.5, 2.6), (0.4, 1.6), 0); patches(14, fus & bot_, a, x, (5, 46), (-1.4, 1.4), (0.5, 2.0), (0.4, 1.2), 1)
patches(70, wing & top_, a, ax, (12, 36), (2.5, 27), (0.5, 2.2), (0.6, 2.4), 0); patches(26, wing & top_, a, ax, (12, 36), (2.5, 27), (0.4, 1.6), (0.4, 1.6), 1)
patches(50, wing & bot_, a, ax, (12, 36), (2.5, 27), (0.5, 2.0), (0.5, 2.0), 0); patches(12, np.isin(cls, (1, 5)), a, np.where(cls == 1, zg, ax), (36, 47), (0.5, 12), (0.5, 1.8), (0.4, 1.4), 0)
log('пятна')
# ── швы, лючки, заклёпки ──
seamd = np.full((S, S), 9.0, np.float32); hedge = np.full((S, S), 9.0, np.float32); riv = np.zeros((S, S), np.float32)
def seam(m, d):
    seamd[m] = np.minimum(seamd[m], d[m])
fs = fus & skin_m
for r_ in RING: seam(fs, np.abs(a - r_))
for zz in (0.62, 1.55, 2.65): seam(fs & side_ & (a > 5.0) & (a < 46.5), np.abs(zg - fbot - zz))   # продольные швы по борту
seam(fs & top_ & (a > 5.0) & (a < 46.0), np.abs(ax - 0.95 * hw))                                  # плечи
seam(fs & bot_ & (a > 5.0) & (a < 45.0), np.abs(ax - 0.70))
ws = wing & skin_m & (uch > 0.01) & (uch < 0.98)
for sp in SPAR: seam(ws, np.abs(uch - sp) * CHw)
for r_ in RIB: seam(ws & (uch > SPAR[0]), np.abs(ax - r_))
seam(np.isin(cls, (1,)) & skin_m, np.abs(a - (FLE(zg) + 0.55)) * 0.8)
seam(np.isin(cls, (5,)) & skin_m, np.abs(a - (SLE(ax) + 0.45)) * 0.8)
for xc in PODS:                                                                                       # гондолы: кольца кожуха и откидные створки
    for k in (-1, 1):
        cx_ = xc + POD_DX * k; m_ = (cls == 6) & skin_m & (np.abs(ax - cx_) < 0.9)
        s_ = a - pod_front(xc)
        for ss in (0.55, 1.45, 3.10, 4.30): seam(m_, np.abs(s_ - ss))
pos_r = np.random.RandomState(53)
def hatch(A, Q, a0, a1, q0, q1, vm, tone=1.0):
    ins = vm & (A > a0) & (A < a1) & (Q > q0) & (Q < q1) & skin_m
    d = np.minimum.reduce([A - a0, a1 - A, Q - q0, q1 - Q]); hedge[ins] = np.minimum(hedge[ins], d[ins]); col[ins] *= tone; rough[ins] -= 0.05
HS = []
for k in range(70):                                                                                   # лючки на бортах и снизу фюзеляжа
    sg = 1 if k % 2 else -1; a0 = pos_r.uniform(5.5, 45.0); w_ = pos_r.uniform(0.25, 0.9); zz = pos_r.uniform(1.95, 4.9); h_ = pos_r.uniform(0.2, 0.6)
    hatch(a, zg, a0, a0 + w_, zz, zz + h_, fus & side_ & (sg * x > 0), pos_r.uniform(0.985, 1.02)); HS.append((a0, w_, zz, h_, sg))
for k in range(30):
    a0 = pos_r.uniform(6, 44); w_ = pos_r.uniform(0.3, 1.0); q0 = pos_r.uniform(-1.3, 1.0); h_ = pos_r.uniform(0.25, 0.6)
    hatch(a, x, a0, a0 + w_, q0, q0 + h_, fus & bot_ & ((a < ns['BAY']['a0'] - 0.3) | (a > ns['BAY']['a1'] + 0.3)), pos_r.uniform(0.985, 1.02))
for k in range(90):                                                                                   # лючки крыла, больше снизу
    sg = 1 if k % 2 else -1; xr = pos_r.uniform(3.0, 26.0); le = float(11.5 + 0.78 * (xr - 1.45)); te = float(20.95 + 0.529 * xr); ch = te - le
    a0 = pos_r.uniform(le + 0.12 * ch, le + 0.62 * ch); w_ = pos_r.uniform(0.25, 0.7); h_ = pos_r.uniform(0.3, 0.9)
    hatch(a, sg * x, a0, a0 + w_, xr, xr + h_, wing & (bot_ if k % 3 else top_), pos_r.uniform(0.985, 1.02))
hatch(a, x, 2.4, 4.6, -0.45, 0.45, fus & bot_, 1.0)                                                  # люк экипажа под носом
bump = np.zeros((S, S), np.float32)
for xc in PODS:                                                                                       # замки капотов: короткие планки за кольцевыми швами гондол
    pf = pod_front(xc); pz_ = pod_z(xc)
    for k in (-1, 1):
        cx_ = xc + POD_DX * k; rr = np.hypot(ax - cx_, z - pz_); th = np.arctan2(ax - cx_, -(z - pz_)); s_ = a - pf
        m_ = (cls == 6) & skin_m & (rr > 0.55) & (rr < 0.80) & (np.abs(ax - cx_) < 0.85)
        for ss in (1.45, 3.10):
            for t0 in (-2.2, -1.5, -0.8, 0.0, 0.8, 1.5, 2.2):
                d = np.minimum(0.075 - np.abs(s_ - ss - 0.11), 0.032 - np.abs(th - t0) * rr); ins = m_ & (d > 0)
                hedge[ins] = np.minimum(hedge[ins], d[ins]); col[ins] *= 0.90; bump[ins] = np.maximum(bump[ins], smooth(0.0, 0.012, d[ins])); rough[ins] -= 0.06
# заклёпки вдоль швов: двойной ряд, шаг 9 см
PITCH = 0.09; RV = max(0.008, 0.9 * DS)
near = (seamd < 0.06) & skin_m
along = np.where(wing & (np.abs(seamd - np.abs(ax - np.round(ax / 1.5) * 1.5)) < 1e-3), a, np.where(fus & side_, a + 0.0 * zg, a + ax))
ph = (along / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH
dr = np.hypot(dph, np.abs(seamd - 0.028)); riv = np.where(near, np.clip(1 - dr / RV, 0, 1), 0.0).astype(np.float32)
# заклёпки по стрингерам по всей обшивке: одиночный ряд, шаг 11 см; при 2048 слабее (точки мельче пикселя, иначе сливаются в полосы)
STR, P2 = 0.21, 0.11; RV2 = max(0.006, 0.7 * DS)
qf = np.where(fus & side_, zg - fbot, ax); qw = uch * CHw
d2 = np.where(wing, np.abs(qw / 0.20 - np.round(qw / 0.20)) * 0.20, np.abs(qf / STR - np.round(qf / STR)) * STR)
al2 = np.where(wing, ax, a); ph2 = (al2 / P2) % 1.0; dph2 = np.minimum(ph2, 1 - ph2) * P2
riv2 = np.where(skin_m & (fus | wing) & (seamd > 0.05) & (hedge > 0.03), np.clip(1 - np.hypot(dph2, d2) / RV2, 0, 1), 0.0).astype(np.float32)
riv = np.maximum(riv, riv2 * (1.0 if S >= 4096 else 0.45))
log('швы, лючки, заклёпки', round(float((riv > 0).mean()), 4))
# ── износ по фотомаскам CC0 ──
si3 = tri('SurfaceImperfections003', 'SurfaceImperfections003_2K-JPG_Opacity.jpg', 2.4); si13 = tri('SurfaceImperfections013', 'SurfaceImperfections013_2K-JPG_Opacity.jpg', 3.1)
sc3 = tri('Scratches003', 'Scratches003_2K-JPG_Opacity.jpg', 1.7); sc5 = tri('Scratches005', 'Scratches005_2K-JPG_Opacity.jpg', 2.2)
lk12 = tri('Leaking012A', 'Leaking012A_2K-JPG_Displacement.jpg', 3.5, flow=True); lk17 = 1.0 - tri('Leaking017B', 'Leaking017B_2K-JPG_Color.jpg', 2.8, flow=True)
mott = fbm(0.22, 0.22, 0.22, 4, 1.0); fine = fbm(8.0, 8.0, 8.0, 2, 5.0); patch = fbm(0.6, 0.6, 0.6, 4, 9.0)
col *= (1 + (mott - 0.5) * 0.10 + (fine - 0.5) * 0.02)[..., None]
col = mix(col, (0.44, 0.45, 0.44), smooth(0.30, 0.85, si3) * 0.32 * paint_m)                       # светлый налёт пятнами
col = mix(col, (0.17, 0.17, 0.17), smooth(0.35, 0.90, si13) * 0.34 * paint_m)                      # тёмные засохшие разводы
rough += smooth(0.35, 0.85, si3) * 0.08 * paint_m - smooth(0.4, 0.9, si13) * 0.05
# блеск: затёрто по верху фюзеляжа и крыла у корня (ходят техники), у люков; выгорание сверху
sun = smooth(0.25, 0.9, nz)
walk = (fus & top_) * 1.0 + (wing & top_) * smooth(9.0, 4.0, ax)
polish = walk * smooth(0.45, 0.70, fbm(0.6, 0.6, 0.6, 3, 13.0)) + smooth(0.06, 0.0, hedge) * 0.6
rough -= polish * 0.18; col = mix(col, BASE * 1.06, sun * smooth(0.45, 0.75, patch) * 0.18)
scuff = walk * smooth(0.55, 0.85, sc5) * 0.55 + smooth(0.05, 0.0, hedge) * smooth(0.5, 0.8, sc3) * 0.6
col = mix(col, (0.47, 0.48, 0.48), scuff * 0.45 * paint_m); rough -= scuff * 0.10
# передние кромки: эрозия светлее, сколы до грунта
dle = a - LEw
LEm = (smooth(0.20, 0.02, dle) * smooth(-0.03, 0.02, dle) * wing) + ((cls == 5) * smooth(0.18, 0.02, a - SLE(ax)) * smooth(-0.03, 0.02, a - SLE(ax))) + ((cls == 1) * smooth(0.18, 0.02, a - FLE(zg)) * smooth(-0.03, 0.02, a - FLE(zg)))
col = mix(col, BASE * 1.22, LEm * 0.55); rough -= LEm * 0.12
edge = smooth(0.985, 0.90, bev) * paint_m
chip = np.clip(edge * smooth(0.60, 0.80, sc3) + LEm * smooth(0.55, 0.75, sc5) * 0.7 + smooth(0.03, 0.0, hedge) * smooth(0.65, 0.85, sc3) * 0.6, 0, 1)
chip *= np.where(np.isin(cls, (2, 3, 4, 7, 10)), 0.25, 1.0)
PRIMER = np.array((0.56, 0.57, 0.50), np.float32); BARE = np.array((0.62, 0.63, 0.64), np.float32)
deep = chip * smooth(0.55, 0.85, fine)
col = mix(col, PRIMER, chip * 0.75); col = mix(col, BARE, deep * 0.8); metal = np.maximum(metal, deep * 0.85); rough = rough * (1 - deep) + 0.38 * deep
log('износ')
# ── потёки и грязь по потоку ──
# от люков и дренажей - короткие тёмные потёки назад (на верхе/низе) и вниз (на бортах)
aft = np.zeros((S, S), np.float32)
for k in range(140):
    sg = 1 if k % 2 else -1; on_w = k % 3 == 0
    if on_w: xr = pos_r.uniform(3.0, 24.0); a0 = float(11.5 + 0.78 * (xr - 1.45)) + pos_r.uniform(1.0, 6.0); q0 = xr; Q = ax; mm = wing & bot_ & (sg * x > 0)
    else: a0 = pos_r.uniform(6, 44); q0 = pos_r.uniform(1.9, 4.6); Q = zg; mm = fus & side_ & (sg * x > 0)
    ln = pos_r.uniform(0.6, 3.5); wd = pos_r.uniform(0.04, 0.22)
    if on_w: d_ = (a - a0) / ln; lat = np.abs(Q - q0) / wd
    else: d_ = (q0 - zg) / (ln * 0.5) * 0.6 + (a - a0) / ln * 0.4; lat = np.abs(a - a0 - (q0 - zg) * 0.5) / wd
    t_ = mm & (d_ > 0) & (d_ < 1) & (lat < 1)
    aft[t_] = np.maximum(aft[t_], ((1 - d_[t_]) ** 1.5) * (1 - lat[t_] ** 2))
flow = aft * (0.55 + 0.45 * smooth(0.3, 0.8, lk12))
col = mix(col, (0.13, 0.12, 0.10), flow * 0.75 * paint_m); rough += flow * 0.10
col = mix(col, (0.17, 0.17, 0.17), smooth(0.40, 0.85, lk17) * 0.30 * paint_m * (fus | wing) * smooth(0.6, -0.8, nz))      # разводы снизу по потоку
# масло под гондолами и пилонами, глянцевое
oil = np.zeros((S, S), np.float32)
for xc in PODS:
    pf = pod_front(xc)
    m_ = (cls == 6) & (nz < 0.0) & (np.abs(ax - xc) < 1.6); oil = np.maximum(oil, m_ * smooth(pf + 1.5, pf + POD_LEN, a) * smooth(0.40, 0.75, lk12))
    m2 = wing & bot_ & (np.abs(ax - xc) < 1.8); oil = np.maximum(oil, m2 * smooth(pf + 3.0, pf + POD_LEN + 2.0, a) * smooth(pf + POD_LEN + 9.0, pf + POD_LEN + 2.0, a) * smooth(0.45, 0.8, lk17) * 0.7)
oil = np.maximum(oil, (cls == 8) * (nz < 0.1) * smooth(0.40, 0.75, lk12) * 0.8)
col = mix(col, (0.10, 0.095, 0.085), oil * 0.55); rough -= oil * 0.22
# копоть за двигателями: нижняя сторона крыла и закрылки за соплами, верх закрылков, задняя часть гондол (b52_11 - сильно коптит)
soot = np.zeros((S, S), np.float32)
for xc in PODS:
    pe = pod_front(xc) + POD_LEN
    for k in (-1, 1):
        cx_ = xc + POD_DX * k
        lat = np.abs(ax - cx_) / (0.55 + 0.10 * np.maximum(a - pe, 0)); ln = smooth(pe - 0.6, pe + 0.2, a) * smooth(pe + 14.0, pe + 1.0, a)
        soot = np.maximum(soot, np.isin(cls, (0, 4)) * ln * np.clip(1 - lat ** 2, 0, 1) * (0.30 + 0.70 * smooth(-0.1, -0.6, nz)))       # сверху слабее (b52_02), снизу и на закрылках сильнее
    soot = np.maximum(soot, (cls == 6) * (np.abs(ax - xc) < 1.6) * smooth(pe - 2.2, pe, a) * (0.85 + 0.15 * smooth(-0.2, -0.7, nz)))
soot *= 0.55 + 0.45 * smooth(0.25, 0.75, fbm(0.4, 2.5, 2.5, 4, 31.0))
col = mix(col, (0.06, 0.058, 0.056), soot * 0.88); rough += soot * 0.20
# грязь от колёс: створки ниш, низ фюзеляжа за тележками, внутренности стоек
dirt = np.zeros((S, S), np.float32)
for ac in (13.6, 29.0):
    dirt = np.maximum(dirt, (fus & bot_) * smooth(ac - 1.0, ac + 0.4, a) * smooth(ac + 6.0, ac + 1.0, a) * smooth(0.35, 0.8, si13))
dirt = np.maximum(dirt, (cls == 7) * smooth(0.30, 0.75, si3))
col = mix(col, (0.24, 0.215, 0.18), dirt * 0.50); rough += dirt * 0.15
# затенение в стыках и общее
crev = smooth(0.75, 0.30, ao1) * skin_m; col = mix(col, (0.10, 0.10, 0.10), crev * 0.50); rough += crev * 0.12
col *= (0.90 + 0.10 * smooth(0.15, 0.95, ao2))[..., None]
hair = smooth(max(0.010, 1.0 * DS), 0.002, seamd) * skin_m; col *= (1 - 0.20 * hair)[..., None]
halo = smooth(0.12, 0.0, seamd) * smooth(0.35, 0.75, lk12) * skin_m; col *= (1 - 0.10 * halo)[..., None]
col *= (1 - smooth(0.0, 0.5, riv) * 0.13 * skin_m)[..., None]
grime = smooth(0.15, 0.0, np.minimum(seamd, hedge)) * smooth(0.35, 0.8, si13) * paint_m
col = mix(col, (0.14, 0.135, 0.125), grime * 0.35); rough += grime * 0.06                            # грязь, набившаяся у швов и люков
# пыль снизу гуще, к носу (брызги от колёс) сильнее
dust = smooth(-0.2, -0.8, nz) * paint_m * smooth(0.35, 0.80, si3) * (0.55 + 0.45 * smooth(32.0, 10.0, a))
col = mix(col, (0.37, 0.36, 0.33), dust * 0.20); rough += dust * 0.06
# следы ботинок: по верху фюзеляжа и у корня крыла, где ходят техники
wids = np.nonzero((((fus & top_ & (a > 7.0) & (a < 34.0) & (ax < 1.0)) | (wing & top_ & (ax < 9.0) & (uch > 0.08) & (uch < 0.85))) & paint_m).ravel())[0]
boot = np.zeros(S * S, np.float32)
if len(wids):
    AA, XX = a.ravel()[wids], x.ravel()[wids]; RB = np.random.RandomState(77)
    for k in range(320):
        j = RB.randint(len(wids)); a0, x0 = AA[j], XX[j]; ang = RB.uniform(0, math.pi); st = RB.uniform(0.25, 1.0)
        sel = np.nonzero((np.abs(AA - a0) < 0.17) & (np.abs(XX - x0) < 0.17))[0]
        if not len(sel): continue
        du, dv = AA[sel] - a0, XX[sel] - x0; u_ = du * math.cos(ang) + dv * math.sin(ang); v_ = -du * math.sin(ang) + dv * math.cos(ang)
        sole = ((u_ / 0.135) ** 2 + (v_ / (0.048 - 0.012 * (u_ < 0))) ** 2 < 1) & ~((u_ > -0.045) & (u_ < -0.015))
        ids_ = wids[sel][sole]; boot[ids_] = np.maximum(boot[ids_], st)
boot = boot.reshape(S, S) * smooth(0.25, 0.70, sc3 * 0.5 + fine * 0.5)
col = mix(col, (0.19, 0.18, 0.16), boot * 0.28); rough -= boot * 0.04
log('потёки, масло, копоть, грязь')
# ── особые места ──
tn = fbm(1.2, 4.0, 4.0, 4, 59.0); ts = fbm(0.8, 14.0, 14.0, 3, 61.0)
# губы воздухозаборников - голый металл, коки - металл, вентилятор тёмный, сопла - горелый металл
for xc in PODS:
    pf = pod_front(xc); pz_ = pod_z(xc) + 0.0
    for k in (-1, 1):
        cx_ = xc + POD_DX * k; rr = np.hypot(ax - cx_, z - pz_)
        lip = (cls == 6) & (mat == 0) & (a > pf - 0.10) & (a < pf + 0.22) & (rr > 0.50) & (rr < 0.85); col[lip] = (BARE * (0.86 + 0.20 * ts[lip, None])); metal[lip] = 0.9; rough[lip] = 0.32
noz = (cls == 6) & (mat == 1); col[noz] = (np.array((0.30, 0.28, 0.26), np.float32) * (0.75 + 0.4 * tn[noz, None])); metal[noz] = 0.9; rough[noz] = 0.55
spin = (cls == 6) & (mat == 1) & False
duct = mat == 11; col[duct] = np.array((0.30, 0.31, 0.32), np.float32) * (0.85 + 0.2 * ts[duct, None]); rough[duct] = 0.55; metal[duct] = 0.3
dark = mat == 2; col[dark] = np.array((0.035, 0.035, 0.038), np.float32); rough[dark] = 0.85; metal[dark] = 0.1
# окна хвостовой кабины заделаны листами (b52_09: тёмные прямоугольники по борту за килем)
for a0, a1 in ((45.45, 45.85), (46.15, 46.55), (46.85, 47.45)):
    m_ = fus & side_ & (a > a0) & (a < a1) & (zg > 4.35) & (zg < 4.95); col[m_] = np.array((0.20, 0.18, 0.17), np.float32) * (0.9 + 0.2 * fine[m_, None]); rough[m_] = 0.7
    hedge[m_] = np.minimum(hedge[m_], np.minimum.reduce([a - a0, a1 - a, zg - 4.35, 4.95 - zg])[m_])
# обтекатели хвоста и блистеры под носом - диэлектрик чуть другого тона, глаже
diel = (fus & (a > 47.75)) | (fus & (a > 2.8) & (a < 5.1) & (zg < 2.45) & (ax > 0.35))
col[diel] *= np.array((0.94, 0.96, 0.99), np.float32); rough[diel] = 0.42
# полоса на верхушке киля - своя (тёмно-синяя с жёлтой каймой), без надписей частей
fz = (cls == 1) & (zg > 11.45); col[fz] = np.array((0.10, 0.16, 0.32), np.float32) * (0.92 + 0.12 * fine[fz, None]); rough[fz] = 0.45
fz2 = (cls == 1) & (zg > 11.36) & (zg <= 11.45); col[fz2] = np.array((0.80, 0.66, 0.16), np.float32); rough[fz2] = 0.45
# белые направляющие дозаправки и дорожки по крылу убраны (Mark 2026-11-11: на фото их нет)
log('особые места')
# ── знаки и трафареты: только вымышленные ──
FNB = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'; FNN = '/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf'
INK = (22, 24, 27, 255); WHITE = (226, 228, 226, 255); RED = (160, 34, 30, 255); YEL = (200, 168, 40, 255)
def stamp(im_, ac, qc, W_, H_, side, along=True, alpha=0.92, cl=(0,), rough_to=None):
    A0 = np.asarray(im_, np.float32) / 255.0; hp, wp = A0.shape[:2]
    vm, Q_ = ((nz > 0.35, x) if side == 'top' else (nz < -0.35, x) if side == 'bot' else (nx > 0.35, zg) if side == 'r' else (nx < -0.35, zg))
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
    S_ = S_ / 5.0; al = S_[:, 3] * alpha * (0.88 + 0.12 * smooth(0.3, 0.7, si3[ins])) * (1 - 0.6 * chip[ins])
    S_[:, :3] = np.where(S_[:, 3:4] > 1e-3, S_[:, :3] / np.maximum(S_[:, 3:4], 1e-3), 0.0)
    col[ins] = col[ins] * (1 - al[..., None]) + S_[:, :3] * al[..., None]; rough[ins] = rough[ins] * (1 - al) + (0.50 if rough_to is None else rough_to) * al
def text_img(t, H=240, ink=INK, font=FNB, pad=20):
    f_ = ImageFont.truetype(font, int(H * 0.86)); tmp = ImageDraw.Draw(Image.new('L', (8, 8))); bb = tmp.textbbox((0, 0), t, font=f_); W = bb[2] - bb[0] + pad * 2
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(im_).text((W / 2, H / 2), t, font=f_, fill=ink, anchor='mm'); return im_
def star_bar(W=1600, H=640, ink=INK):
    """Малозаметная звезда с полосами: только контур тёмной краской (обычный знак ВВС, нарисован здесь)."""
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); c = (W / 2, H / 2); R = H * 0.48; t = int(H * 0.045)
    pts = [(c[0] + (R if i % 2 == 0 else R * 0.382) * math.cos(-math.pi / 2 + i * math.pi / 5), c[1] + (R if i % 2 == 0 else R * 0.382) * math.sin(-math.pi / 2 + i * math.pi / 5)) for i in range(10)]
    d_.ellipse((c[0] - R, c[1] - R, c[0] + R, c[1] + R), outline=ink, width=t); d_.line(pts + [pts[0]], fill=ink, width=t, joint='curve')
    bh = H * 0.24; d_.rectangle((W * 0.03, c[1] - bh / 2, c[0] - R * 0.92, c[1] + bh / 2), outline=ink, width=t); d_.rectangle((c[0] + R * 0.92, c[1] - bh / 2, W * 0.97, c[1] + bh / 2), outline=ink, width=t)
    return im_
def arrow_img(W=640, H=170, ink=YEL):
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dr = ImageDraw.Draw(im_); dr.polygon([(10, H * 0.32), (W - 170, H * 0.32), (W - 170, 8), (W - 10, H / 2), (W - 170, H - 8), (W - 170, H * 0.68), (10, H * 0.68)], fill=ink); return im_
def frame_img(W=600, H=400, ink=YEL, t=18):
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_)
    for i in range(0, W, 60): d_.line([(i, 0), (i + 30, 0)], fill=ink, width=t); d_.line([(i, H - 1), (i + 30, H - 1)], fill=ink, width=t)
    for j in range(0, H, 60): d_.line([(0, j), (0, j + 30)], fill=ink, width=t); d_.line([(W - 1, j), (W - 1, j + 30)], fill=ink, width=t)
    return im_
def chevron_img(W=400, H=400):
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); d_.polygon([(W / 2, H * 0.05), (W * 0.95, H * 0.92), (W * 0.05, H * 0.92)], fill=RED); d_.polygon([(W / 2, H * 0.33), (W * 0.76, H * 0.80), (W * 0.24, H * 0.80)], fill=WHITE); return im_
def walk_line(W=2000, H=60, ink=(200, 202, 200, 255)):
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(im_).rectangle((0, H * 0.25, W, H * 0.75), fill=ink); return im_
SB = star_bar()
for sd in ('r', 'l'):
    stamp(SB, 37.6, 3.55, 2.60, 1.04, sd, alpha=0.85)                                              # звезда на борту за крылом
    stamp(text_img('KM', 300, ink=(18, 20, 24, 255)), 42.6, 8.15, 1.55, 1.05, sd, cl=(1,), alpha=0.90)     # буквы на киле (вымышленные)
    ka, kn = (43.55, 42.85) if sd == 'r' else (42.30, 43.00)                                          # AF 64 слева от номера с обеих сторон
    stamp(text_img('AF 64', 160, ink=(18, 20, 24, 255), font=FNN), ka, 7.40, 0.60, 0.22, sd, cl=(1,), alpha=0.88)
    stamp(text_img('052', 300, ink=(18, 20, 24, 255), font=FNN), kn, 7.30, 0.75, 0.36, sd, cl=(1,), alpha=0.88)
    stamp(text_img('RESCUE', 120, ink=YEL), 4.70, 4.05, 0.62, 0.11, sd, alpha=0.85)                 # спасательные надписи у кабины
    stamp(arrow_img(), 4.70, 3.90, 0.70, 0.17, sd, alpha=0.85)
    stamp(frame_img(), 5.90, 4.25, 0.90, 0.55, sd, alpha=0.75)                                     # рамка аварийного люка
    stamp(text_img('CUT HERE FOR EMERGENCY RESCUE', 90, ink=YEL, font=FNN), 5.90, 3.92, 1.05, 0.07, sd, alpha=0.80)
    stamp(chevron_img(), 7.30, 4.45, 0.20, 0.20, sd, alpha=0.95)
    stamp(text_img('NO STEP', 110, ink=INK, font=FNN), 44.8, 3.85, 0.42, 0.08, sd, alpha=0.7)
    stamp(text_img('GROUND', 110, ink=INK, font=FNN), 13.1, 2.25, 0.36, 0.07, sd, alpha=0.7)
    stamp(text_img('GROUND', 110, ink=INK, font=FNN), 28.5, 2.25, 0.36, 0.07, sd, alpha=0.7)
for sg in (1, -1):
    stamp(SB, 25.5, sg * 19.5, 2.6, 1.04, 'top' if sg < 0 else 'bot', along=False, alpha=0.85) if False else None
stamp(SB, 25.0, -19.5, 2.60, 1.04, 'top', along=False, alpha=0.85, cl=(0,))                         # звезда на левом крыле сверху и на правом снизу
stamp(SB, 25.0, 19.5, 2.60, 1.04, 'bot', along=False, alpha=0.85, cl=(0,))
for sg in (1, -1):                                                                                   # дорожки и NO STEP на крыле
    for xr in (6.0, 11.0, 16.0, 21.0):
        stamp(text_img('NO STEP', 110, ink=INK, font=FNN), float(20.95 + 0.529 * xr) - 1.6, sg * xr, 0.55, 0.11, 'top', along=False, alpha=0.65, cl=(0, 4))
    for xc in PODS:                                                                                  # предупреждения у воздухозаборников
        pf = float(pod_front(xc))
        stamp(chevron_img(), pf + 0.75, 3.0, 0.22, 0.22, 'r' if sg > 0 else 'l', alpha=0.95, cl=(6,)) if False else None
        stamp(text_img('DANGER', 110, ink=RED, font=FNN), pf + 0.85, sg * (xc + 0.0), 0.50, 0.10, 'top', along=False, alpha=0.85, cl=(6,))
def jack_img(W=420, H=360, ink=INK):
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); d_.polygon([(W / 2, 10), (W * 0.80, H * 0.55), (W * 0.20, H * 0.55)], outline=ink, width=14)
    f_ = ImageFont.truetype(FNN, 80); d_.text((W / 2, H * 0.80), 'JACK PAD', font=f_, fill=ink, anchor='mm'); return im_
def port_img(W=200, H=200):
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); d_.ellipse((10, 10, W - 10, H - 10), outline=RED, width=16); d_.ellipse((60, 60, W - 60, H - 60), fill=(40, 42, 44, 255)); return im_
def grille_img(W=300, H=500, n=9):
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); d_.rectangle((0, 0, W - 1, H - 1), outline=(30, 32, 34, 255), width=10)
    for i in range(n): x0 = 24 + i * (W - 48) / n; d_.rectangle((x0, 24, x0 + (W - 48) / n * 0.45, H - 24), fill=(24, 26, 28, 255))
    return im_
def strip_img(W=700, H=70, ink=(165, 182, 128, 255)):
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(im_).rectangle((0, 0, W - 1, H - 1), fill=ink); return im_
RN = np.random.RandomState(83)
for sd in ('r', 'l'):
    for ac in (10.5, 33.5): stamp(jack_img(), ac, 1.95, 0.24, 0.21, sd, alpha=0.75)                   # точки домкратов
    stamp(text_img('TIRE PRESS 260 PSI', 90, ink=INK, font=FNN), 12.0, 2.05, 0.62, 0.06, sd, alpha=0.7)  # давление шин у ниш
    stamp(text_img('TIRE PRESS 260 PSI', 90, ink=INK, font=FNN), 27.4, 2.05, 0.62, 0.06, sd, alpha=0.7)
    stamp(port_img(), 5.60, 3.05, 0.10, 0.10, sd, alpha=0.9); stamp(port_img(), 5.85, 3.05, 0.10, 0.10, sd, alpha=0.9)   # приёмники статического давления
    stamp(grille_img(), 7.35, 3.25, 0.30, 0.50, sd, alpha=0.9, rough_to=0.7)                      # решётка на борту носа (b52_06)
    for ac, zc_, cl_ in ((6.9, 3.92, (0,)), (38.5, 4.70, (0,)), (41.6, 9.50, (1,))):                # полосы строевых огней
        stamp(strip_img(), ac, zc_, 0.70, 0.07, sd, alpha=0.95, cl=cl_, rough_to=0.22)
for ac, zc_, sd, t in ((8.6, 2.60, 'r', 'HYD SERVICE'), (5.4, 2.20, 'l', 'OXYGEN'), (9.8, 1.95, 'l', 'EXT POWER'), (31.6, 2.05, 'r', 'SINGLE POINT REFUEL'),
                      (35.2, 2.30, 'l', 'LOX'), (14.6, 2.35, 'r', 'WATER'), (40.2, 3.10, 'r', 'ACCESS 41R')):
    stamp(text_img(t, 90, ink=INK, font=FNN), ac, zc_, 0.075 * len(t) * 0.55 + 0.06, 0.07, sd, alpha=0.72)
for sg in (1, -1):
    xr = 9.5; stamp(jack_img(), float(20.95 + 0.529 * xr) - 2.4, sg * xr, 0.24, 0.21, 'bot', along=False, alpha=0.75, cl=(0,))
for (a0, w_, zz, h_, sg) in HS[:34]:                                                                 # номера лючков (вымышленные)
    t = f'{RN.randint(11, 99)}{RN.randint(1, 9)}{"R" if sg > 0 else "L"}'
    stamp(text_img(t, 90, ink=INK, font=FNN), a0 + min(0.14, w_ * 0.3), zz + h_ - 0.06, 0.16, 0.05, 'r' if sg > 0 else 'l', alpha=0.55)
log('знаки')
# ── материалы ──
def solid(m, c, r, me=0.0, nz_=0.08):
    col[m] = np.array(c, np.float32) * (1 - nz_ / 2 + nz_ * fine[m])[..., None]; rough[m] = r; metal[m] = me
solid(mat == 4, (0.055, 0.055, 0.058), 0.88)
solid(mat == 12, (0.52, 0.05, 0.04), 0.10, 0, 0.04); solid(mat == 13, (0.05, 0.40, 0.15), 0.10, 0, 0.04); solid(mat == 14, (0.80, 0.80, 0.76), 0.10, 0, 0.04)
solid((mat == 5) & (cls == 11), (0.10, 0.105, 0.11), 0.7, 0, 0.16)
solid(mat == 6, (0.30, 0.31, 0.27), 0.9); solid(mat == 8, (0.18, 0.18, 0.19), 0.7, 0.4); solid(mat == 7, (0.02, 0.04, 0.035), 0.12); solid(mat == 9, (0.70, 0.56, 0.08), 0.42)
baym = (cls == 13) | ((cls == 0) & (mat == 5)) | (np.isin(cls, (3, 7)) & (nz > 0.25))
solid(baym & (mat != 1), (0.40, 0.42, 0.40), 0.66, 0, 0.12); col[baym] *= (0.55 + 0.45 * smooth(0.25, 0.95, ao1[baym]))[..., None]
solid(baym & (mat == 1), (0.42, 0.43, 0.44), 0.42, 0.8)
solid(np.isin(cls, (8,)) & (mat == 1), (0.30, 0.31, 0.32), 0.5, 0.6)
tag = (cls == 13) & (mat == 1) & (np.abs(((a - 17.4) % 1.55) - 0.6) < 0.06) & (nz < -0.3); col[tag] = np.array((0.72, 0.60, 0.12), np.float32); rough[tag] = 0.5; metal[tag] = 0.0   # жёлтые таблички на балках отсека
gr_ = cls == 12; g_p = gr_ & (mat == 0); g_c = gr_ & (mat == 1); g_s = gr_ & (mat == 8)
gm1 = fbm(2.4, 2.4, 2.4, 4, 91.0); gm2 = fbm(18.0, 18.0, 18.0, 3, 93.0)
solid(g_p, (0.52, 0.53, 0.53), 0.50, 0.2, 0.10); solid(g_c, (0.55, 0.55, 0.54), 0.25, 0.95, 0.06); solid(g_s, (0.16, 0.155, 0.15), 0.56, 0.75, 0.14)
col[g_p] *= (0.84 + 0.30 * gm1[g_p])[..., None]
gd = smooth(1.3, 0.2, zg) * gr_; col = mix(col, (0.25, 0.22, 0.18), gd * 0.55 * (g_p | g_s)); rough += gd * 0.15 * g_p
goil = gr_ * smooth(0.5, 0.8, lk12); col = mix(col, (0.13, 0.11, 0.08), goil * 0.45 * (g_p | g_c))
col[gr_] *= (0.55 + 0.45 * smooth(0.15, 0.95, ao2[gr_]))[..., None]
rough = np.clip(rough, 0.08, 0.97); metal = np.clip(metal, 0, 1); col = np.clip(col, 0, 1)
for c_ in range(16):
    m_ = (cls == c_) & cov
    if m_.sum() > 300: print('деталь', c_, 'цвет', (col[m_].mean(0) * 255).round(0), 'G', round(float(rough[m_].mean()), 2), 'B', round(float(metal[m_].mean()), 2))
log('материалы')
# ── высота и нормали: канавки швов, крышки люков, заклёпки, волна листов, царапины ──
gw = max(0.006, 0.9 * DS)
height -= smooth(gw, 0.0, seamd) * 0.0011 * skin_m
height += smooth(0.0, 2.5 * gw, hedge) * 0.0005 * (hedge < 8); height -= smooth(gw, 0.0, hedge) * 0.0010 * (hedge < 8)
height += smooth(0.1, 0.8, riv) * 0.0006 * skin_m + bump * 0.0012
pill = smooth(0.0, 0.25, np.minimum(seamd, 0.25)) * (seamd < 8)
height += pill * 0.0012 * skin_m                                                                     # лист выпуклый подушкой между швами
height += (fbm(0.7, 0.7, 0.7, 2, 79.0) - 0.5) * 0.004 * skin_m
height -= smooth(0.6, 0.9, sc5) * 0.00012 * paint_m + chip * 0.00025
height += (fbm(55.0, 55.0, 55.0, 2, 73.0) - 0.5) * 0.00010 * paint_m
gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * DS); gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / (2 * DS)
flat = np.isin(mat, (2, 7, 9, 11)) | np.isin(cls, (11, 12, 13)); gx[flat] = 0; gy[flat] = 0
BVP = f'{DAT}/gb_bev_{S}.npy'
if os.path.exists(BVP):                                                                              # фаски: нормаль с шейдера Bevel, только у кромок (на ровном - чистая нормаль)
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
Image.fromarray(lift(col)[::-1]).save(f'{OUT}/b52_color.png', compress_level=1)
Image.fromarray(lift(nn * 0.5 + 0.5)[::-1]).save(f'{OUT}/b52_normal.png', compress_level=1)
Image.fromarray(lift(np.stack([occ, rough, metal], -1))[::-1]).save(f'{OUT}/b52_orm.png', compress_level=1)
for nm_, pm in (('верх', skin_m & cov & (cls == 0) & (nz > 0.3)), ('низ', skin_m & cov & (cls == 0) & (nz < -0.3)), ('борт', skin_m & cov & fus & side_)):
    print('средний цвет обшивки,', nm_, 'sRGB', (col[pm].mean(0) * 255).round(1), 'шероховатость', round(float(rough[pm].mean()), 3))
log('сохранено', OUT)
if os.environ.get('B52_PREV'):
    K = 20.0
    def plan(name, keep, U, V, D, w, h, lv):
        ii = np.nonzero(keep & cov); u_ = ((U[ii] + w / 2) * K).astype(int); v_ = ((V[ii]) * K).astype(int); d_ = D[ii]
        W_, H_ = int(w * K) + 2, int(h * K) + 2; ok = (u_ >= 0) & (u_ < W_) & (v_ >= 0) & (v_ < H_); u_, v_, d_ = u_[ok], v_[ok], d_[ok]
        c_ = col[ii][ok] * (0.55 + 0.45 * np.clip(nor[ii][ok] @ np.array(lv), 0, 1))[:, None]
        o_ = np.argsort(d_); im = np.full((H_, W_, 3), 0.8, np.float32); im[v_[o_], u_[o_]] = c_[o_]
        Image.fromarray(lift(im)).save(os.path.join(OUT, name))
    plan('план_сверху.png', nz > -0.05, x, a, zg, 57.0, 50.0, [0.3, 0.2, 0.93])
    plan('план_снизу.png', nz < 0.05, -x, a, -zg, 57.0, 50.0, [0.3, 0.2, -0.93])
    plan('план_справа.png', nx > -0.05, -a + 25.0, 12.5 - zg, x, 50.0, 13.0, [0.93, 0.2, 0.3])
    log('планы')
