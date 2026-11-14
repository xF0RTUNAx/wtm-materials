# paint.py - краска Як-38М из данных gbuf.py (по paint.py Ту-22): цвет (только краска и грязь, без света), нормали, карта блеска glTF (R затенение, G шероховатость, B металл).
# Без Blender: /usr/bin/python3 -I paint.py.  YK_TEX=2048|4096, YK_OUT=<папка>, YK_SCHEME=grey|blue|dark, YK_PREV=1 - планы сверху и снизу.
#   grey - светло-серая морская (фото 02, 07): красные губы заборников, красный контур треугольника перед заборником, флаг ВМФ, номер красный.
#   blue - тёмно-синий верх и борта, зелёный низ (фото 04): номер жёлтый.
#   dark - тёмно-серая (фото 05): номер жёлтый.
# Звёзды, флаг, треугольник, номер 47 и трафареты нарисованы здесь (номер придуман); маски износа - ambientCG CC0 (Свои/_текстуры_CC0). Пиксели фото не используются.
# Знаки (правило 17): звезда на киле - в центре площади киля без руля, на крыле - в центре складной консоли без элерона, слева и справа одинаково.
import json, math, os, site, sys, time
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image, ImageDraw, ImageFont
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__)); DAT = os.path.join(HERE, '_проба'); CC0D = os.path.join(HERE, '..', '_текстуры_CC0')
S = int(os.environ.get('YK_TEX', '2048')); SCHEME = os.environ.get('YK_SCHEME', 'grey'); OUT = os.environ.get('YK_OUT', os.path.join(DAT, SCHEME)); os.makedirs(OUT, exist_ok=True)
# цвета краски (sRGB 0..1) сняты средним по освещённым бортам фото и не темнее их: 02/07 светло-серый 0,66-0,77; 04 синий 0,25/0,30/0,46; 05 тёмно-серый 0,45/0,52/0,58 сверху, 0,31/0,37/0,40 борт
PAL = {'grey': dict(top=(0.725, 0.745, 0.770), und=(0.735, 0.755, 0.775), num=(196, 36, 30, 255), nout=None),
       'blue': dict(top=(0.250, 0.300, 0.455), und=(0.215, 0.300, 0.225), num=(222, 176, 40, 255), nout=(40, 36, 30, 255)),
       'dark': dict(top=(0.440, 0.495, 0.540), und=(0.460, 0.510, 0.550), num=(226, 180, 42, 255), nout=None)}
P_ = PAL[SCHEME]
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f} с]', *a, flush=True)
L_ = 16.13
pos = np.load(f'{DAT}/gb_pos_{S}.npy'); nor = np.load(f'{DAT}/gb_nor_{S}.npy'); idd = np.load(f'{DAT}/gb_id_{S}.npy'); aob = np.load(f'{DAT}/gb_ao_{S}.npy')
ATLAS = json.load(open(f'{DAT}/uv.json', encoding='utf-8'))['atlas_m']; PXM = 0.985 * S / ATLAS; DS = 1.0 / PXM
mat = np.round(idd[..., 0] * 16).astype(np.int8); cls = np.round(idd[..., 1] * 32).astype(np.int8); cov = idd[..., 2] > 0.5
a = (L_ / 2 - pos[..., 1]).astype(np.float32); x = pos[..., 0].astype(np.float32); z = pos[..., 2].astype(np.float32); ax = np.abs(x)
nx, ny, nz = nor[..., 0], nor[..., 1], nor[..., 2]
ao1, ao2, bev = aob[..., 0].copy(), aob[..., 1].copy(), aob[..., 2]
doors = np.isin(cls, (7, 6, 4, 2)); ao1[doors] = np.maximum(ao1[doors], 0.85); ao2[doors] = np.maximum(ao2[doors], 0.85)        # створки и рули двигаются - тени соседей на них нет
log('данные загружены', S, SCHEME, 'плотность', round(PXM), 'пикс/м')

# ── геометрия (как в yak_geo.py) ──
FA = np.array([0.0, 0.10, 0.44, 1.10, 1.75, 2.41, 3.29, 4.17, 5.00, 6.20, 7.20, 9.80, 11.00, 12.00, 12.94, 14.25, 14.80, 15.40, 15.95, 16.13])
FTOP = np.array([1.27, 1.32, 1.45, 1.62, 1.80, 1.95, 2.10, 2.27, 2.38, 2.41, 2.42, 2.41, 2.41, 2.42, 2.44, 2.30, 2.24, 2.16, 2.04, 1.98])
FBOT = np.array([1.23, 1.17, 1.07, 0.99, 0.94, 0.92, 0.90, 0.85, 0.83, 0.83, 0.83, 0.81, 0.83, 0.90, 1.05, 1.40, 1.55, 1.70, 1.85, 1.92])
FHW = np.array([0.012, 0.05, 0.13, 0.27, 0.36, 0.44, 0.52, 0.54, 0.60, 0.78, 0.89, 0.90, 0.89, 0.85, 0.79, 0.74, 0.66, 0.48, 0.19, 0.04])
ftop = np.interp(a, FA, FTOP).astype(np.float32); fbot = np.interp(a, FA, FBOT).astype(np.float32); fhw = np.interp(a, FA, FHW).astype(np.float32)
WR, FOLD, XT = 0.91, 2.07, 3.29; ANH = math.tan(math.radians(12.0))
def LEf(q): return (7.69 + 1.0336 * (q - WR)).astype(np.float32)
def TEf(q): return (11.02 + 0.1218 * (q - WR)).astype(np.float32)
LEw = LEf(ax); TEw = TEf(ax); CHw = np.maximum(TEw - LEw, 0.3); wzf = 1.90 - ANH * np.maximum(ax - WR, 0)
INL_A0, INL_Z0, INL_Z1, INL_XO = 4.02, 0.94, 2.12, 1.10
def lip_a(q): zc = (INL_Z0 + INL_Z1) / 2; ht = (INL_Z1 - INL_Z0) / 2; return INL_A0 + 0.28 * np.minimum(1.0, np.abs(q - zc) / ht) ** 2.2
def FLE(q): return np.where(q >= 2.45, 12.94 + (14.80 - 12.94) * (q - 2.45) / (3.82 - 2.45), 12.94 - (2.45 - q) * 3.0).astype(np.float32)
def FTE(q): return (15.40 + (16.10 - 15.40) * (q - 2.30) / (3.82 - 2.30)).astype(np.float32)
def STLE(q): return (13.93 + (q - 0.50) * (15.09 - 13.93) / (1.55 - 0.50)).astype(np.float32)
skin_m = mat == 0
wing = ((cls == 0) & (ax > 0.93) & (np.abs(z - wzf) < 0.30) & (a > LEw - 0.10) & (a < TEw + 0.12)) | (cls == 1) | (cls == 4)
finm = ((cls == 0) & (ax < 0.26) & (z > ftop + 0.02) & (a > 12.0)) | (cls == 2)
stabm = cls == 6
intk = (cls == 0) & (a > 3.90) & (a < 7.9) & (ax > 0.415) & (ax < 1.16) & (z > INL_Z0 - 0.06) & (z < INL_Z1 + 0.06) & ~wing
icx = 0.76; icz = (INL_Z0 + INL_Z1) / 2
inner = intk & ((ax - icx) * np.sign(x) * nx + (z - icz) * nz < 0) & (a < 6.2)                                                        # внутренность канала: нормаль к оси заборника
planes = wing | stabm
fus = (cls == 0) & ~wing & ~finm
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
def fbm(fa, fx_, fz_, octv=3, seed=0.0, xs=None):
    r = 0.0; w = 0.5; tot = 0.0
    pa, px, pz = a * fa, (x if xs is None else xs) * fx_, z * fz_
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


mott = fbm(1.2, 1.2, 1.2, 4, 1.0); fine = fbm(22.0, 22.0, 22.0, 2, 5.0); patch = fbm(2.6, 2.6, 2.6, 4, 9.0)
sax = np.sqrt(x * x + 0.2)

# ── основа ──
F3 = lambda c: np.asarray(c, np.float32)[None, None, :]
cT, cU = F3(P_['top']), F3(P_['und'])
if SCHEME == 'blue':                                   # зелёный низ (04): на борту ниже линии z 1,45 с лёгкой волной, к носу уходит под брюхо; на плоскостях - нижняя сторона
    dl = 1.45 + 0.03 * (fbm(0.8, 0.8, 0.8, 2, 233.0) - 0.5) - 0.85 * smooth(5.8, 4.4, a)
    und_f = smooth(dl + 0.025, dl - 0.025, z)
    und_p = smooth(-0.05, -0.25, nz)
    undm = np.where(planes, und_p, und_f).astype(np.float32); undm = np.where(finm, 0.0, undm)
else:
    undm = (smooth(-0.2, -0.6, nz) * ((cls == 0) | planes)).astype(np.float32)          # низ на тон светлее (серые схемы)
BASE = (cT * (1 - undm[..., None]) + cU * undm[..., None]).astype(np.float32)
col = BASE.copy(); rough = np.full((S, S), 0.52, np.float32); metal = np.where(skin_m, 0.04, 0.0).astype(np.float32)
height = np.zeros((S, S), np.float32)

# ── листы: тон и блеск по раскрою ──
RING = np.array([0.95, 1.55, 2.30, 3.05, 3.80, 4.55, 5.30, 6.05, 6.80, 7.55, 8.30, 9.05, 9.80, 10.55, 11.30, 12.05, 12.80, 13.55, 14.30, 15.05, 15.70], np.float32)
FZ = np.array([1.05, 1.45, 1.90, 2.25], np.float32)
WX = np.array([1.40, FOLD, 2.70], np.float32)
ri = np.searchsorted(RING, a); wi_ = np.searchsorted(WX, ax); zi = np.searchsorted(FZ, z)
wch = np.clip(np.floor((a - LEw) / CHw * 3.0), 0, 3).astype(np.int32)
tt = np.random.RandomState(7).uniform(0.965, 1.035, 1024).astype(np.float32); rt = np.random.RandomState(8).uniform(-0.06, 0.06, 1024).astype(np.float32); hh = np.random.RandomState(9).uniform(-0.010, 0.010, 1024).astype(np.float32)
pid = np.where(wing, ri * 3 + wi_ * 11 + wch * 37 + (x > 0) * 101 + (nz > 0) * 211 + 7, ri * 13 + zi * 5 + (x > 0) * 307 + 3) % 1024
for c_, sd in ((1, 19), (2, 21), (4, 27), (6, 29), (7, 31), (3, 33), (15, 41)):
    k_ = (sd * 17 + (x > 0).astype(np.int32) * 3 + np.floor(a / 0.8).astype(np.int32) * 5 + np.floor(ax / 0.8).astype(np.int32) * 7) % 1024
    pid = np.where(cls == c_, k_, pid)
col *= (1 + (tt[pid] - 1) * 1.0)[..., None]; col[..., 0] *= 1 + hh[pid] * 1.0; col[..., 2] *= 1 - hh[pid] * 1.0; rough += rt[pid] * 0.8
batch = np.random.RandomState(10).randint(0, 4, 1024)[pid] * skin_m                                       # правило 12: листы из разных партий краски - чуть зеленее, синее, теплее
for b_, sh_ in ((1, (0.985, 1.012, 0.990)), (2, (0.985, 0.995, 1.025)), (3, (1.020, 1.005, 0.980))): col[batch == b_] *= np.array(sh_, np.float32)
log('листы')

# ── швы, лючки, заклёпки ──
seamd = np.full((S, S), 9.0, np.float32); hedge = np.full((S, S), 9.0, np.float32)
def seam(m, d): seamd[m] = np.minimum(seamd[m], d[m])
for r_ in RING: seam(skin_m & fus & (a > 0.9) & (a < 15.8), np.abs(a - r_))
for q_ in FZ: seam(fus & skin_m & side_ & (a > 1.0) & (a < 15.6), np.abs(z - q_))
seam(fus & skin_m & (top_ | bot_) & (a > 1.0) & (a < 15.6), np.abs(ax - 0.30))
for q_ in WX: seam(wing & skin_m, np.abs(ax - q_))
seam(wing & skin_m, np.abs(a - (LEw + 0.12 * CHw))); seam(wing & skin_m, np.abs(a - (LEw + 0.55 * CHw)))
seam(finm & skin_m & (z > 2.45), np.abs(a - (FLE(z) + 0.18)) * 0.8); seam(finm & skin_m, np.abs(z - 2.90)); seam(finm & skin_m, np.abs(z - 3.40))
seam(stabm & skin_m, np.abs(ax - 1.10)); seam(stabm & skin_m, np.abs(a - (STLE(ax) + 0.15)))
seam(intk & ~inner & skin_m, np.abs(a - 4.85)); seam(intk & ~inner & skin_m, np.abs(a - 5.70)); seam(intk & ~inner & skin_m, np.abs(a - 6.60))
pr = np.random.RandomState(53)
def hatch(A, Q, a0, a1, q0, q1, vm, tone=1.0):
    ins = vm & (A > a0) & (A < a1) & (Q > q0) & (Q < q1) & skin_m
    d = np.minimum.reduce([A - a0, a1 - A, Q - q0, q1 - Q]); hedge[ins] = np.minimum(hedge[ins], d[ins]); col[ins] *= tone; rough[ins] -= 0.03
for k in range(70):                                                                                     # лючки по бортам (02, 07, 08: много мелких)
    sg = 1 if k % 2 else -1; a0 = pr.uniform(1.4, 15.2); w_ = pr.uniform(0.10, 0.36); z0 = pr.uniform(0.95, 2.15); h_ = pr.uniform(0.08, 0.22)
    if 3.4 < a0 < 7.0 and z0 > 1.0: continue                                                            # на заборнике знаки, люки отдельно
    hatch(a, z, a0, a0 + w_, z0, z0 + h_, fus & side_ & (sg * x > 0), pr.uniform(0.985, 1.02))
for k in range(30):                                                                                     # снизу (кроме створок и ниш)
    a0 = pr.uniform(1.4, 14.5); w_ = pr.uniform(0.10, 0.34); q0 = pr.uniform(-0.40, 0.30); h_ = pr.uniform(0.08, 0.22)
    if 2.8 < a0 < 4.1 or 4.9 < a0 < 7.0 or 7.3 < a0 < 9.9: continue
    hatch(a, x, a0, a0 + w_, q0, q0 + h_, fus & bot_, pr.uniform(0.985, 1.02))
for k in range(16):                                                                                     # сверху за горбом
    a0 = pr.uniform(8.6, 12.6); w_ = pr.uniform(0.10, 0.34); q0 = pr.uniform(-0.40, 0.25); h_ = pr.uniform(0.08, 0.22)
    hatch(a, x, a0, a0 + w_, q0, q0 + h_, fus & top_, pr.uniform(0.985, 1.02))
for k in range(12):                                                                                     # на заборниках сзади знаков
    sg = 1 if k % 2 else -1; a0 = pr.uniform(6.6, 7.6); w_ = pr.uniform(0.10, 0.25); z0 = pr.uniform(1.0, 2.0); h_ = pr.uniform(0.08, 0.20)
    hatch(a, z, a0, a0 + w_, z0, z0 + h_, intk & ~inner & (sg * x > 0), pr.uniform(0.985, 1.02))
for k in range(36):                                                                                     # крыло, больше снизу
    sg = 1 if k % 2 else -1; xr = pr.uniform(1.0, 3.0); le = float(LEf(np.float32(xr))); ch = float(TEf(np.float32(xr))) - le
    a0 = pr.uniform(le + 0.15 * ch, le + 0.55 * ch); w_ = pr.uniform(0.12, 0.30); h_ = pr.uniform(0.10, 0.25)
    hatch(a, sg * x, a0, a0 + w_, xr, xr + h_, wing & (bot_ if k % 3 else top_), pr.uniform(0.985, 1.02))
PITCH = 0.035; RV = max(0.0045, 0.85 * DS)
near = (seamd < 0.05) & skin_m
along = np.where(wing, np.where(np.abs(seamd - np.min(np.abs(ax[..., None] - WX[None, None, :]), -1)) < 1e-3, a, ax), np.where(fus & side_, a + z, a + ax))
ph = (along / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH
riv = np.where(near, np.clip(1 - np.hypot(dph, np.abs(seamd - 0.018)) / RV, 0, 1), 0.0).astype(np.float32)
log('швы, люки, заклёпки', round(float((riv > 0).mean()), 4))

# ── износ: налёт, разводы, выгорание, соль (корабль), царапины (CC0) ──
si3 = tri('SurfaceImperfections003', 'SurfaceImperfections003_2K-JPG_Opacity.jpg', 1.2); si13 = tri('SurfaceImperfections013', 'SurfaceImperfections013_2K-JPG_Opacity.jpg', 1.6)
sc3 = tri('Scratches003', 'Scratches003_2K-JPG_Opacity.jpg', 0.9); sc5 = tri('Scratches005', 'Scratches005_2K-JPG_Opacity.jpg', 1.1)
lk12 = tri('Leaking012A', 'Leaking012A_2K-JPG_Displacement.jpg', 1.6, flow=True); lk17 = 1.0 - tri('Leaking017B', 'Leaking017B_2K-JPG_Color.jpg', 1.4, flow=True)
col *= (1 + (mott - 0.5) * 0.09 + (fine - 0.5) * 0.02)[..., None]
col = mix(col, BASE * 1.05, smooth(0.35, 0.85, si3) * 0.18 * skin_m)
col = mix(col, BASE * 0.80, smooth(0.40, 0.90, si13) * 0.12 * skin_m)
rough += smooth(0.35, 0.85, si3) * 0.08 * skin_m + smooth(0.4, 0.9, si13) * 0.05 * skin_m + (mott - 0.5) * 0.08
sun = smooth(0.25, 0.9, nz)
col = mix(col, BASE * np.array([1.10, 1.10, 1.08], np.float32) + 0.015, sun * smooth(0.36, 0.72, patch) * 0.30)                    # выгорание сверху пятнами
chalk = sun * smooth(0.40, 0.80, fbm(0.7, 0.7, 0.7, 4, 251.0)) * skin_m; col = mix(col, BASE * 1.08 + 0.035, chalk * 0.18); rough += chalk * 0.08
salt = smooth(0.50, 0.85, lk12) * smooth(0.45, 0.75, fbm(1.0, 1.0, 1.0, 3, 257.0)) * skin_m * (1 - 0.6 * sun)                      # соль: светлые потёки по потоку, на тёмных схемах заметнее
col = mix(col, (0.80, 0.81, 0.80), salt * (0.07 if SCHEME == 'grey' else 0.16)); rough += salt * 0.06
scr = smooth(0.62, 0.86, sc5) * skin_m; col = mix(col, BASE * 1.15 + 0.03, scr * 0.16); rough -= scr * 0.06
scuff = smooth(0.04, 0.0, hedge) * smooth(0.5, 0.8, sc3) * 0.5; col = mix(col, BASE * 1.10, scuff * 0.35); rough -= scuff * 0.08
touch = np.zeros((S, S), np.float32); tsh = np.ones((S, S), np.float32); pt_ = np.random.RandomState(61)       # подкраски после ремонта: свежая краска другого тона и с блеском, края прямые по раскрою
for k in range(46):
    sg = 1 if k % 2 else -1; kind = k % 3; a0 = pt_.uniform(1.2, 14.8); w_ = pt_.uniform(0.25, 0.9); h_ = pt_.uniform(0.18, 0.55); q0 = pt_.uniform(-0.6, 2.2); f_ = pt_.uniform(0.93, 1.06)
    if kind == 0: m_ = fus & side_ & (sg * x > 0); Q = z; q0 = pt_.uniform(0.95, 2.1)
    elif kind == 1: m_ = (fus & (top_ | bot_)) | wing; Q = x; q0 = pt_.uniform(-2.8, 2.6)
    else: m_ = wing & (sg * x > 0); Q = ax; q0 = pt_.uniform(1.0, 3.0); a0 = float(LEf(np.float32(q0))) + pt_.uniform(0.2, 1.6)
    d_ = np.minimum.reduce([a - a0, a0 + w_ - a, Q - q0, q0 + h_ - Q]); t_ = m_ & skin_m & (d_ > 0)
    touch[t_] = np.maximum(touch[t_], smooth(0.0, 0.012, d_[t_])); tsh[t_] = f_
col = mix(col, col * tsh[..., None] * np.array([1.0, 1.003, 1.006], np.float32), touch); rough -= touch * 0.10
vst = fbm(5.0, 5.0, 0.35, 4, 271.0)                                                                        # правило 10: дождевые потёки вниз по бортам, гуще под стыками и в нижней половине
rainv = side_ * skin_m * smooth(0.52, 0.80, vst) * smooth(0.35, 0.85, lk12) * (0.5 + 0.5 * smooth(2.2, 1.2, z))
col = mix(col, BASE * 0.70, rainv * 0.22); rough += rainv * 0.05
saltc = skin_m * smooth(0.012, 0.0, np.minimum(seamd, hedge)) * smooth(1.9, 1.2, z) * smooth(0.55, 0.80, fbm(9.0, 9.0, 9.0, 3, 277.0))   # морская соль и белая коррозия в стыках внизу
col = mix(col, (0.84, 0.85, 0.82), saltc * 0.55); rough += saltc * 0.15
log('износ')

# ── потёки, масло, гидравлика снизу ──
aft = np.zeros((S, S), np.float32)
for k in range(160):
    sg = 1 if k % 2 else -1; kind = k % 4
    if kind == 0: xr = pr.uniform(1.0, 3.1); a0 = float(LEf(np.float32(xr))) + pr.uniform(0.2, 1.4); q0 = xr; mm = wing & bot_ & (sg * x > 0); Q = ax
    elif kind == 1: a0 = pr.uniform(2.0, 14.0); q0 = pr.uniform(-0.40, 0.40); mm = fus & bot_; Q = x
    else: a0 = pr.uniform(1.5, 15.0); q0 = pr.uniform(0.95, 2.2); mm = fus & side_ & (sg * x > 0); Q = z
    ln = pr.uniform(0.3, 1.5); wd = pr.uniform(0.015, 0.05)
    d_ = (a - a0) / ln; lat = np.abs(Q - q0) / wd; t_ = mm & (d_ > 0) & (d_ < 1) & (lat < 1)
    aft[t_] = np.maximum(aft[t_], ((1 - d_[t_]) ** 1.4) * (1 - lat[t_] ** 2))
flow_ = aft * (0.5 + 0.5 * smooth(0.3, 0.8, lk12))
col = mix(col, BASE * 0.55, flow_ * 0.25 * skin_m); rough += flow_ * 0.08
rain = smooth(0.45, 0.85, lk12) * np.abs(nx) ** 2 * skin_m * smooth(0.40, 0.70, fbm(1.0, 1.0, 1.0, 3, 331.0)); col = mix(col, BASE * 0.62, rain * 0.16); rough += rain * 0.05
rust = np.zeros((S, S), np.float32)                                                                       # ржавые потёки от дренажей и винтов (корабельная сырость)
for a0, q0, ln, wd, onw in ((9.9, 0.25, 0.9, 0.035, 0), (12.5, -0.2, 0.8, 0.03, 0), (10.6, 1.6, 0.7, 0.03, 1), (10.2, 2.4, 0.6, 0.03, 1), (4.3, 0.1, 0.7, 0.03, 0), (13.4, 0.15, 0.9, 0.03, 0)):
    for sg in (1, -1):
        d_ = (a - a0) / ln; lat = np.abs((ax if onw else x * sg) - q0) / wd; t_ = bot_ & skin_m & (sg * x > 0 if onw else True) & (d_ > 0) & (d_ < 1) & (lat < 1)
        rust[t_] = np.maximum(rust[t_], ((1 - d_[t_]) ** 1.2) * (1 - lat[t_] ** 2) * (0.55 + 0.45 * smooth(0.3, 0.8, lk17[t_])))
col = mix(col, (0.50, 0.34, 0.20), rust * 0.40); rough += rust * 0.15
under = smooth(-0.15, -0.75, nz)
oil = under * smooth(0.48, 0.72, fbm(2.0, 7.0, 7.0, 4, 23.0)) * skin_m; col = mix(col, (0.20, 0.19, 0.17), oil * 0.12); rough += oil * 0.08
ost = fbm(0.7, 14.0, 14.0, 4, 341.0)                                                                     # масло и гидравлика назад от ниш и створок
om_ = under * (fus * smooth(3.85, 4.05, a) * smooth(5.4, 4.3, a) * np.exp(-(x / 0.18) ** 2) + fus * smooth(9.7, 9.9, a) * smooth(11.6, 10.2, a) * np.exp(-((ax - 0.65) / 0.16) ** 2)
              + fus * smooth(6.8, 7.0, a) * smooth(8.4, 7.2, a) * np.exp(-(x / 0.30) ** 2)) * smooth(0.40, 0.66, ost)
col = mix(col, (0.09, 0.08, 0.065), np.clip(om_, 0, 1) * 0.40 * skin_m); rough -= np.clip(om_, 0, 1) * 0.18 * skin_m
dust = smooth(0.55, 0.95, nz) * smooth(0.42, 0.70, fbm(1.6, 1.6, 1.6, 4, 351.0)) * skin_m; col = mix(col, (0.52, 0.50, 0.46), dust * 0.08); rough += dust * 0.06
log('потёки, масло')

# ── копоть: за поворотными соплами, у нижних створок подъёмных двигателей, на хвосте ──
est = fbm(0.9, 9.0, 9.0, 4, 311.0)
noz_s = fus * smooth(11.45, 11.9, a) * smooth(15.2, 12.6, a) * smooth(1.55, 1.05, z) * smooth(0.45, 0.70, ax) * (0.45 + 0.55 * smooth(0.30, 0.70, est))
lift_s = fus * under * smooth(4.7, 5.05, a) * smooth(7.6, 6.85, a) * (0.4 + 0.6 * smooth(0.30, 0.70, est)) * 0.65
wing_s = wing * bot_ * smooth(0.8, 1.25, ax) * smooth(10.6, 11.0, a) * smooth(11.6, 11.1, a) * 0.0
soot = np.clip(noz_s * 0.75 + lift_s, 0, 1) * skin_m
heat = fus * skin_m * smooth(10.30, 10.45, a) * smooth(12.75, 12.60, a) * smooth(1.62, 1.50, z) * smooth(0.50, 0.62, ax)        # разные материалы: неокрашенные жаростойкие листы в нише сопел (08)
HT = np.array((0.47, 0.46, 0.44), np.float32) * (0.92 + 0.16 * vnoise(a * 3.0, x * 3.0, z * 3.0))[..., None]
col = mix(col, HT, heat); rough = rough * (1 - heat) + 0.42 * heat; metal = np.maximum(metal, heat * 0.85)
tint = heat * smooth(0.35, 0.75, est); col = mix(col, (0.55, 0.45, 0.30), tint * 0.35); col = mix(col, (0.30, 0.30, 0.42), heat * smooth(0.65, 0.85, est) * 0.30)     # побежалость
col = mix(col, (0.10, 0.095, 0.09), soot * 0.75); rough += soot * 0.18; metal -= soot * 0.02
spray = np.zeros((S, S), np.float32)                                                                       # правило 10: брызги веером назад от колёс по брюху и створкам
for ac_, xc_ in ((3.32, 0.0), (9.60, 1.25), (9.60, -1.25)):
    d_ = a - ac_ - 0.3; lat = np.abs(x - xc_) - 0.10 - d_ * 0.35; spray += under * smooth(-0.1, 0.4, d_) * smooth(2.6, 0.6, d_) * smooth(0.35, 0.0, lat)
spray = np.clip(spray, 0, 1) * skin_m * smooth(0.62, 0.78, fbm(30.0, 30.0, 30.0, 3, 283.0)); col = mix(col, (0.34, 0.31, 0.26), spray * 0.55); rough += spray * 0.12
log('копоть')

# ── кромки, сколы, тропы ──
dle = a - LEw
LEm = smooth(0.12, 0.015, dle) * smooth(-0.03, 0.015, dle) * wing
LEm = LEm + stabm * smooth(0.10, 0.015, a - STLE(ax)) + finm * (z > 2.45) * smooth(0.10, 0.015, a - FLE(z))
LEm = np.clip(LEm, 0, 1)
edge = smooth(0.985, 0.90, bev) * skin_m
movm = np.isin(cls, (2, 4, 6, 7))
C_AL = np.array((0.64, 0.64, 0.63), np.float32)
eros = smooth(0.46, 0.60, fbm(14.0, 14.0, 14.0, 3, 37.0))
walk = (fus * top_ * np.exp(-(x / 0.22) ** 2) * smooth(8.6, 9.0, a) * smooth(12.4, 11.8, a) + wing * top_ * smooth(1.0, 1.15, ax) * smooth(1.9, 1.75, ax) * smooth(8.3, 8.6, a) * smooth(10.6, 10.3, a)) * smooth(0.40, 0.66, fbm(4.0, 4.0, 4.0, 3, 53.0))
WEAR_SPOTS = [(3.45, -0.62, 1.35, 0.16, 'l'), (3.45, -0.62, 1.80, 0.16, 'l'), (3.20, 0.0, 2.15, 0.55, 'sill'), (5.0, 0.0, 2.40, 0.35, 'door'), (6.62, 0.0, 2.40, 0.35, 'door'),
              (9.4, 1.30, 0.0, 0.40, 'wtop'), (9.4, -1.30, 0.0, 0.40, 'wtop'), (3.30, 0.0, 0.95, 0.30, 'bot'), (9.6, 0.65, 0.95, 0.35, 'bot'), (9.6, -0.65, 0.95, 0.35, 'bot')]
spots = np.zeros((S, S), np.float32)                                                                     # правило 9: где руки и ноги - подножки у кабины слева, борт кабины, кромки створок, крыло у корня, ниши стоек
for ac_, xc_, zc_, r_, kind in WEAR_SPOTS:
    if kind == 'l': d_ = np.hypot(a - ac_, z - zc_); m_ = side_ & (x < 0)
    elif kind == 'sill': d_ = np.hypot((a - ac_) / 3.0, (z - zc_) * 2.5); m_ = side_ | top_
    elif kind == 'door': d_ = np.hypot((a - ac_) / 1.5, (z - zc_)); m_ = top_ | (cls == 7)
    elif kind == 'wtop': d_ = np.hypot((a - ac_) / 2.0, (x - xc_)); m_ = wing & top_
    else: d_ = np.hypot((a - ac_) / 2.0, x - xc_); m_ = bot_
    spots = np.maximum(spots, m_ * smooth(r_, r_ * 0.3, d_))
spots *= skin_m * smooth(0.40, 0.70, fbm(12.0, 12.0, 12.0, 3, 47.0))
convex = smooth(0.70, 0.92, ao1)                                                                         # сколы только на выпуклых кромках: во внутренних углах затенение отсекает
dmg = np.clip(edge * convex * smooth(0.50, 0.66, fbm(24.0, 24.0, 24.0, 3, 41.0)) + spots * smooth(0.35, 0.75, sc3) * 1.1 + LEm * smooth(0.62, 0.76, eros) * 0.9 + smooth(0.014, 0.003, hedge) * smooth(0.60, 0.72, fbm(36.0, 36.0, 36.0, 3, 43.0)) * 0.7
              + walk * smooth(0.45, 0.75, sc3) * 0.9, 0, 1) * np.where(movm, 0.35, 1.0) * skin_m
prim = smooth(0.18, 0.40, dmg) * 0.75; bare = smooth(0.55, 0.90, dmg)
col = mix(col, (0.60, 0.60, 0.42), prim); rough += prim * 0.10                                         # слои: жёлто-зелёный грунт, глубже - алюминий
col = mix(col, BASE * 1.12 + 0.02, spots * 0.25); rough -= spots * 0.10                                      # затёрто до блеска там, где ходят и берутся руками
col = mix(col, C_AL, bare); rough = rough * (1 - bare) + 0.30 * bare; metal = np.maximum(metal, bare * 0.85)
col = mix(col, BASE * 0.92, walk * 0.25); rough += walk * 0.06
crev = smooth(0.75, 0.30, ao1) * skin_m; col = mix(col, BASE * 0.35, crev * 0.40); rough += crev * 0.12
col *= (0.90 + 0.10 * smooth(0.15, 0.95, ao2))[..., None]
hair = smooth(max(0.006, 1.0 * DS), 0.0015, seamd) * skin_m; col *= (1 - 0.13 * hair)[..., None]
grime = smooth(0.06, 0.0, np.minimum(seamd, hedge)) * smooth(0.35, 0.8, si13) * skin_m; col = mix(col, BASE * 0.55, grime * 0.20)
col *= (1 - smooth(0.0, 0.5, riv) * 0.06 * skin_m)[..., None]
log('кромки')

# ── зоны другого цвета: белый носок, законцовка киля, губы и каналы заборников ──
WHT = np.array((0.86, 0.87, 0.85), np.float32); RED_ = np.array((0.70, 0.13, 0.11), np.float32)
nose_t = (cls == 0) & skin_m & (a < 0.34); col = mix(col, WHT * (0.97 + 0.03 * fine[..., None]), nose_t * smooth(0.36, 0.30, a)); rough = np.where(nose_t, 0.40, rough)       # радиопрозрачный носок (02, 04, 05)
ftip = finm & (z > 3.70)
if SCHEME != 'dark': col = mix(col, WHT * 0.95, ftip * 0.92); rough = np.where(ftip, 0.45, rough)                               # законцовка киля (02)
lipw = np.where(intk & skin_m, np.maximum(smooth(lip_a(z) + 0.115, lip_a(z) + 0.095, a), inner * smooth(4.95, 4.70, a)), 0.0)          # губа: кольцо 10 см снаружи и начало канала красные (02, 04, 07); на 05 губа серая
if SCHEME == 'dark': lipw = lipw * 0.0
col = mix(col, RED_ * (0.95 + 0.08 * fine[..., None]), lipw); rough = np.where(lipw > 0.5, 0.40, rough)
lipm = np.where(intk & skin_m, smooth(lip_a(z) + 0.045 if SCHEME == 'dark' else lip_a(z) + 0.018, lip_a(z) + 0.004, a), 0.0) * smooth(4.75, 4.55, a)   # кромка губы стёрта потоком до металла (05: светлое кольцо)
col = mix(col, np.array((0.70, 0.70, 0.68), np.float32) * (0.9 + 0.2 * fine[..., None]), lipm); rough = rough * (1 - lipm) + 0.26 * lipm; metal = np.maximum(metal, lipm * 0.9)
ftipd = finm & (z > 3.70)
if SCHEME == 'dark': col = mix(col, (0.30, 0.32, 0.31), ftipd * 0.9); rough = np.where(ftipd, 0.70, rough)                    # диэлектрическая законцовка киля - матовая тёмная
log('зоны')

# ── знаки и трафареты (свои) ──
FNB = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'; FNN = '/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf'
INK = (32, 34, 36, 255) if SCHEME == 'grey' else (214, 216, 212, 255); RED = (178, 30, 28, 255); WHITE = (234, 236, 234, 255); BLUE = (64, 140, 200, 255)
MARKS = []
def stamp(im_, ac, qc, W_, H_, side, along=True, alpha=0.95, cl=(0,), rough_to=0.45, xr=None, zr=None):
    A0 = np.asarray(im_, np.float32) / 255.0; hp, wp = A0.shape[:2]
    vm, Q_ = ((nz > 0.35, x) if side == 'top' else (nz < -0.35, x) if side == 'bot' else (nx > 0.30, z) if side == 'r' else (nx < -0.30, z))
    if along: ins = vm & (np.abs(a - ac) < W_ / 2) & (np.abs(Q_ - qc) < H_ / 2)
    else: ins = vm & (np.abs(Q_ - qc) < W_ / 2) & (np.abs(a - ac) < H_ / 2)
    ins &= (mat == 0) & np.isin(cls, cl) & cov
    if xr is not None: ins &= (ax > xr[0]) & (ax < xr[1])
    if zr is not None: ins &= (z > zr[0]) & (z < zr[1])
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
    wear = (0.90 + 0.10 * smooth(0.3, 0.7, si3[ins])) * (1 - 0.7 * np.clip(dmg[ins], 0, 1)) * (1 - 0.30 * smooth(0.6, 0.9, sc5[ins]))
    S_ = S_ / 5.0; al = S_[:, 3] * alpha * wear
    S_[:, :3] = np.where(S_[:, 3:4] > 1e-3, S_[:, :3] / np.maximum(S_[:, 3:4], 1e-3), 0.0)
    fadec = S_[:, :3] * (0.93 + 0.07 * fine[ins, None]) + 0.02
    col[ins] = col[ins] * (1 - al[..., None]) + fadec * al[..., None]; rough[ins] = rough[ins] * (1 - al) + rough_to * al; metal[ins] = metal[ins] * (1 - al)
    MARKS.append((side, float(ac), float(qc)))
def _star_pts(cx, cy, R):
    return [(cx + (R if i % 2 == 0 else R * 0.382) * math.cos(-math.pi / 2 + i * math.pi / 5), cy + (R if i % 2 == 0 else R * 0.382) * math.sin(-math.pi / 2 + i * math.pi / 5)) for i in range(10)]
def star(W=1000, up=True):
    """Красная звезда с белой и красной каймой (нарисовано здесь). up: верхний луч вверх картинки."""
    im_ = Image.new('RGBA', (W, W), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); c = W / 2; R = W / 2 - 6
    d_.polygon(_star_pts(c, c, R), fill=RED); d_.polygon(_star_pts(c, c, R * 0.90), fill=WHITE); d_.polygon(_star_pts(c, c, R * 0.74), fill=RED)
    return im_ if up else im_.rotate(180)
def text_img(t, H=240, ink=(32, 34, 36, 255), font=FNB, pad=20, outline=None):
    f_ = ImageFont.truetype(font, int(H * 0.86)); tmp = ImageDraw.Draw(Image.new('L', (8, 8))); bb = tmp.textbbox((0, 0), t, font=f_); W = bb[2] - bb[0] + pad * 2
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_)
    if outline: d_.text((W / 2, H / 2), t, font=f_, fill=outline, anchor='mm', stroke_width=int(H * 0.05), stroke_fill=outline)
    d_.text((W / 2, H / 2), t, font=f_, fill=ink, anchor='mm'); return im_
def block_img(W=600, H=300, rows=5, seed=1, ink=INK):
    """Блок мелких надписей: штрихи разной длины (буквы такого размера в игре не читаются)."""
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); r_ = np.random.RandomState(seed)
    for i in range(rows):
        y0 = H * (i + 0.2) / rows; x0 = 0
        while x0 < W * r_.uniform(0.6, 1.0):
            w_ = r_.uniform(0.05, 0.16) * W; d_.rectangle((x0, y0, x0 + w_, y0 + H * 0.5 / rows), fill=ink); x0 += w_ + W * 0.03
    return im_
def tri_line(W=1500, H=1000, apex_left=True, lw=0.035 / 1.0):
    """Контур треугольника перед заборником: основание у губы, вершина вперёд к носу (02, 04, 07). lw - толщина линии в долях высоты."""
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); t = int(H * lw)
    P = [(t, H / 2), (W - t, t), (W - t, H - t)] if apex_left else [(W - t, H / 2), (t, t), (t, H - t)]
    d_.line(P + [P[0]], fill=RED, width=t * 2, joint='curve'); return im_
def flag_img(W=900, H=600, hoist_left=True):
    """Флаг ВМФ (упрощённо): белое полотнище, голубая полоса внизу, красная звезда у древка, красные серп и молот у свободного края (нарисовано здесь)."""
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_)
    d_.rectangle((0, 0, W, H), fill=WHITE); d_.rectangle((0, H * 0.80, W, H), fill=BLUE); d_.rectangle((0, 0, W - 1, H - 1), outline=(150, 152, 150, 255), width=4)
    d_.polygon(_star_pts(W * 0.28, H * 0.36, H * 0.20), fill=RED)
    cx, cy, r = W * 0.70, H * 0.38, H * 0.17
    d_.arc((cx - r, cy - r, cx + r, cy + r), 200, 520 - 180, fill=RED, width=int(H * 0.05))                     # серп
    d_.line([(cx - r * 0.7, cy + r * 0.7), (cx + r * 0.55, cy - r * 0.55)], fill=RED, width=int(H * 0.05))        # рукоять молота
    d_.polygon([(cx + r * 0.25, cy - r * 0.95), (cx + r * 0.95, cy - r * 0.25), (cx + r * 0.75, cy - r * 0.05), (cx + r * 0.05, cy - r * 0.75)], fill=RED)
    return im_ if hoist_left else im_.transpose(Image.FLIP_LEFT_RIGHT)
def slot_img(W=200, H=600):
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); d_.rounded_rectangle((8, 8, W - 8, H - 8), radius=int(W * 0.25), fill=(18, 19, 20, 255)); return im_
def tri_warn(S_=400):
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); P_ = [(S_ / 2, S_ * 0.06), (S_ * 0.96, S_ * 0.92), (S_ * 0.04, S_ * 0.92)]; d_.polygon(P_, fill=RED)
    d_.polygon([(S_ / 2, S_ * 0.30), (S_ * 0.78, S_ * 0.80), (S_ * 0.22, S_ * 0.80)], fill=WHITE); return im_
def arrow_img(W=640, H=170, ink=(214, 172, 28, 255), out=(24, 24, 24, 255)):
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dr = ImageDraw.Draw(im_); P_ = [(10, H * 0.32), (W - 170, H * 0.32), (W - 170, 8), (W - 10, H / 2), (W - 170, H - 8), (W - 170, H * 0.68), (10, H * 0.68)]
    dr.polygon(P_, fill=ink, outline=out, width=8); return im_
def ring_img(S_=300, c=(178, 30, 28, 255)):
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); d_.ellipse((6, 6, S_ - 6, S_ - 6), outline=c, width=int(S_ * 0.12)); d_.ellipse((S_ * 0.36, S_ * 0.36, S_ * 0.64, S_ * 0.64), fill=(60, 62, 64, 255)); return im_
def lift_img(S_=200, ink=(24, 24, 24, 255)):
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); d_.polygon([(S_ / 2, S_ * 0.08), (S_ * 0.92, S_ * 0.90), (S_ * 0.08, S_ * 0.90)], fill=ink); return im_
NUM = '47'                                                                                                  # номер придуман
STAR_FIN = (14.566, 3.069, 0.80)                                                                          # правило 17: центр площади киля без руля (a, z), диаметр
STAR_WING = (10.186, 2.625, 0.80)                                                                         # правило 17: центр складной консоли без элерона (a, x)
SLOT_A, SLOT_Z = 4.47, (1.29, 1.53, 1.77)
for sd in ('r', 'l'):
    L_side = sd == 'l'
    stamp(star(), STAR_FIN[0], STAR_FIN[1], STAR_FIN[2], STAR_FIN[2], sd, cl=(0,), alpha=0.96, xr=(0.0, 0.3))
    stamp(text_img(NUM, 300, ink=P_['num'], outline=P_["nout"]), 6.18, 1.55, 0.98, 0.72, sd, alpha=0.96, xr=(0.5, 1.2))            # номер на заборнике (02, 04, 07): высота 0,78 м, как на фото
    if SCHEME == 'grey': stamp(flag_img(hoist_left=L_side), 5.10, 1.80, 0.50, 0.33, sd, alpha=0.97, xr=(0.5, 1.2))               # флаг ВМФ только на серой пробе (Mark: на тёмно-серой и сине-зелёной флагов нет)
    if SCHEME != 'dark': stamp(tri_line(apex_left=L_side), 3.20, 1.53, 1.36, 0.84, sd, alpha=0.95, xr=(0.0, 0.62), zr=(0.98, 2.02))   # контур треугольника: опасная зона заборника (на 05 нет)
    for zc in SLOT_Z: stamp(slot_img(), SLOT_A, zc, 0.085, 0.24, sd, alpha=0.97, xr=(0.5, 1.2), rough_to=0.8)                    # щели подпитки за губой (05, 07)
    stamp(block_img(seed=3 + L_side, rows=4), 3.40, 1.42, 0.30, 0.12, sd, alpha=0.75, xr=(0.0, 0.62))                           # надписи в треугольнике (07)
    for k_, (ac_, zc_, w_, h_) in enumerate(((1.6, 1.55, 0.26, 0.11), (8.4, 1.25, 0.28, 0.12), (9.5, 1.95, 0.24, 0.10), (12.4, 1.35, 0.26, 0.11), (13.6, 1.95, 0.22, 0.10), (7.2, 2.05, 0.24, 0.10))):
        stamp(block_img(seed=k_ + 10 + 20 * L_side), ac_, zc_, w_, h_, sd, alpha=0.75)
for sg in (1, -1):                                                                                          # звёзды на консолях сверху и снизу (04, 06, 08)
    stamp(star(), STAR_WING[0], sg * STAR_WING[1], STAR_WING[2], STAR_WING[2], 'top', along=False, alpha=0.96, cl=(1,))
    stamp(star(up=False), STAR_WING[0], sg * STAR_WING[1], STAR_WING[2], STAR_WING[2], 'bot', along=False, alpha=0.96, cl=(1,))
    stamp(text_img('НЕ СТУПАТЬ', 110, ink=INK, font=FNN), 10.55, sg * 1.45, 0.50, 0.08, 'top', along=False, alpha=0.75, cl=(0, 4))
    stamp(block_img(seed=40 + (sg > 0)), 9.2, sg * 1.30, 0.24, 0.11, 'bot', along=False, alpha=0.72, cl=(0,))
INKT = (24, 26, 28, 255) if SCHEME != 'blue' else (226, 228, 224, 255)
for sd in ('r', 'l'):                                                                                       # правило 13: больше вымышленных трафаретов
    stamp(tri_warn(), 2.02, 1.86, 0.16, 0.16, sd, alpha=0.95)                                               # катапульта
    stamp(arrow_img(), 2.42, 1.82, 0.36, 0.09, sd, alpha=0.9, rough_to=0.5)                                  # аварийный сброс фонаря
    stamp(text_img('АВАРИЙНЫЙ СБРОС', 110, ink=INKT, font=FNN), 2.42, 1.73, 0.40, 0.055, sd, alpha=0.8)
    for ac_ in (5.75, 11.30): stamp(lift_img(ink=INKT), ac_, 1.02, 0.10, 0.10, sd, alpha=0.9)               # точки подъёма
    stamp(text_img('ЗАЗЕМЛЕНИЕ', 110, ink=INKT, font=FNN), 3.05, 1.05, 0.34, 0.06, sd, alpha=0.8)
    stamp(block_img(seed=71 + (sd == 'l'), rows=3, ink=INKT), 12.9, 1.55, 0.22, 0.08, sd, alpha=0.75)        # табличка данных
for ac_, xc_ in ((9.05, 0.0), (10.85, 0.0)): stamp(ring_img(), ac_, xc_, 0.15, 0.15, 'top', along=False, alpha=0.92)      # заливные горловины
for sg in (1, -1):
    stamp(ring_img(), 9.35, sg * 1.62, 0.13, 0.13, 'top', along=False, alpha=0.92, cl=(0,))
    stamp(text_img('ТОПЛИВО', 110, ink=INKT, font=FNN), 9.58, sg * 1.62, 0.26, 0.05, 'top', along=False, alpha=0.8, cl=(0,))
    stamp(block_img(seed=81 + (sg > 0), rows=3, ink=INKT), 8.55, sg * 0.64, 0.20, 0.08, 'bot', along=False, alpha=0.8, cl=(7,))   # давление в шинах на створках
log('знаки', len(MARKS))

# ── материалы без краски обшивки ──
def solid(m, c, r, me=0.0, nz_=0.08):
    col[m] = np.array(c, np.float32) * (1 - nz_ / 2 + nz_ * fine[m])[..., None]; rough[m] = r; metal[m] = me
solid(mat == 10, (0.20, 0.21, 0.22), 0.85); solid(mat == 2, (0.030, 0.030, 0.032), 0.9); solid(mat == 4, (0.050, 0.050, 0.053), 0.88)
solid(mat == 6, (0.30, 0.31, 0.22), 0.92, 0, 0.2); solid(mat == 8, (0.30, 0.28, 0.21), 0.9, 0, 0.14)
solid(mat == 7, (0.018, 0.038, 0.032), 0.12); solid(mat == 9, (0.74, 0.60, 0.06), 0.42)
cock = cls == 11; solid(cock & (mat == 5), (0.34, 0.52, 0.50), 0.66, 0, 0.14)                          # кабина: бирюзовая (советская)
bayw = (mat == 5) & ~cock; solid(bayw, (0.56, 0.60, 0.55), 0.62, 0.05, 0.12)                            # ниши и отсеки подъёмных двигателей: светлый грунт
col[bayw | cock] *= (0.55 + 0.45 * smooth(0.15, 0.95, ao2[bayw | cock]))[..., None]
solid((mat == 1) & (cls != 12) & (cls != 13), (0.42, 0.42, 0.42), 0.40, 0.9, 0.10)
duct = mat == 11; dd = np.clip((a - 4.4) / 1.4, 0, 1)
col[duct] = np.where((a[duct] < (4.70 if SCHEME != 'dark' else -9.0))[:, None], RED_[None] * 0.92, np.array((0.80, 0.81, 0.79), np.float32)[None] * (0.30 + 0.70 * (1 - dd[duct]))[:, None]); rough[duct] = 0.55; metal[duct] = 0.0   # канал: красное начало, светлый грунт, вглубь темнее
tn = fbm(2.4, 8.0, 8.0, 4, 59.0)
nz_m = cls == 10                                                                                           # поворотные сопла: жаропрочная сталь с побежалостью
col[nz_m] = np.array((0.36, 0.34, 0.31), np.float32) * (0.80 + 0.35 * tn[nz_m, None]); rough[nz_m] = 0.52; metal[nz_m] = 0.85
hot = nz_m & (mat != 2) & (smooth(0.25, -0.25, nz) > 0.5); col = mix(col, (0.20, 0.17, 0.20), hot * 0.45 * smooth(0.3, 0.7, tn))
pit = cls == 13; boom = pit & (a < 0.02) & (a > -0.955); strip_ = np.floor((a + 2.0) / 0.10) % 2 == 0      # ПВД: штанга красно-белыми полосами (02, 07), датчик на конце - металл
solid(pit & ~boom, (0.55, 0.55, 0.55), 0.30, 0.9); solid(boom & strip_, (0.72, 0.14, 0.12), 0.40); solid(boom & ~strip_, (0.86, 0.87, 0.85), 0.40)
gr_ = cls == 12; g_p = gr_ & (mat == 0); g_c = gr_ & (mat == 1); g_s = gr_ & (mat == 8)
gm1 = fbm(4.8, 4.8, 4.8, 4, 91.0); gm2 = fbm(36.0, 36.0, 36.0, 3, 93.0); gst = fbm(2.0, 30.0, 4.4, 4, 87.0)
solid(g_p, (0.60, 0.62, 0.62), 0.48, 0.30, 0.10); solid(g_c, (0.54, 0.54, 0.53), 0.28, 0.9, 0.06); solid(g_s, (0.16, 0.155, 0.15), 0.56, 0.75, 0.14)
hub = gr_ & (mat == 1) & ((np.hypot(a - 3.32, z - 0.28) < 0.17) | ((np.hypot(a - 9.60, z - 0.40) < 0.24) & (ax > 0.9)))
solid(hub, (0.22, 0.50, 0.36), 0.50, 0.10, 0.10)                                                         # диски колёс зелёные (07)
col[g_p] *= (0.86 + 0.26 * gm1[g_p])[..., None]
goil = smooth(0.46, 0.68, gst) * (g_p | g_c); col = mix(col, (0.15, 0.125, 0.095), goil * 0.45); rough += goil * 0.12 * g_p
tyr = (mat == 4); col = mix(col, (0.17, 0.16, 0.145), smooth(0.40, 0.68, gm2) * tyr * 0.45); col = mix(col, (0.21, 0.19, 0.16), smooth(0.20, 0.0, z) * tyr * 0.45)
col[gr_] *= (0.60 + 0.40 * smooth(0.15, 0.95, ao2[gr_]))[..., None]
door_in = (cls == 7) & (((z > 2.0) & (nz < -0.2)) | ((z < 1.3) & (nz > 0.2))); solid(door_in & (mat == 0), (0.56, 0.60, 0.55), 0.60, 0.05, 0.12)    # изнанка створок - грунт
lv = (cls == 15) & (z > 2.1) & (a > 4.9) & (a < 6.8); solid(lv & (mat == 0), (0.30, 0.31, 0.32), 0.5, 0.5, 0.1)     # жалюзи подъёмных двигателей под створкой
rough = np.clip(rough, 0.08, 0.97); metal = np.clip(metal, 0, 1); col = np.clip(col, 0, 1)
for c_ in range(16):
    m_ = (cls == c_) & cov
    if m_.sum() > 300: print('деталь', c_, 'цвет', (col[m_].mean(0) * 255).round(0), 'G', round(float(rough[m_].mean()), 2), 'B', round(float(metal[m_].mean()), 2))
log('материалы')

# ── высота и нормали: канавки швов, крышки, заклёпки, подушки листов, вмятины, щели подпитки; фаски с запекания Bevel ──
gw = max(0.003, 0.9 * DS)
height -= smooth(gw, 0.0, seamd) * 0.0007 * skin_m
height += smooth(0.0, 2.5 * gw, hedge) * 0.0003 * (hedge < 8); height -= smooth(gw, 0.0, hedge) * 0.0007 * (hedge < 8)
height += smooth(0.1, 0.8, riv) * 0.0005 * skin_m
height += smooth(0.0, 0.08, np.minimum(seamd, 0.08)) * (seamd < 8) * 0.0007 * skin_m
height += (fbm(3.2, 3.2, 3.2, 2, 79.0) - 0.5) * 0.003 * skin_m
height += (fbm(120.0, 120.0, 120.0, 2, 73.0) - 0.5) * 0.00010 * skin_m - smooth(0.6, 0.9, sc5) * 0.00008 * skin_m
height += smooth(0.20, 0.42, dmg) * 0.00010 * skin_m - smooth(0.5, 0.9, dmg) * 0.00008 * skin_m
slot = intk & ~inner & (np.abs(a - SLOT_A) < 0.035) & np.any([np.abs(z - zc) < 0.11 for zc in SLOT_Z], axis=0); height -= slot * 0.004
gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * DS); gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / (2 * DS)
flat = np.isin(mat, (2, 7, 9, 11)) | np.isin(cls, (11, 12)); gx[flat] = 0; gy[flat] = 0
dpx = np.linalg.norm(np.roll(pos, -1, 1) - np.roll(pos, 1, 1), axis=-1); dpy = np.linalg.norm(np.roll(pos, -1, 0) - np.roll(pos, 1, 0), axis=-1)
okx = (dpx < 6 * DS) & np.roll(cov, -1, 1) & np.roll(cov, 1, 1); oky = (dpy < 6 * DS) & np.roll(cov, -1, 0) & np.roll(cov, 1, 0)
gx = np.where(okx, gx, 0.0); gy = np.where(oky, gy, 0.0); log('градиент внутри островов: доля', round(float(okx[cov].mean()), 4))
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
Image.fromarray(lift(col)[::-1]).save(f'{OUT}/yak38_color.png', compress_level=1)
Image.fromarray(lift(nn * 0.5 + 0.5)[::-1]).save(f'{OUT}/yak38_normal.png', compress_level=1)
Image.fromarray(lift(np.stack([occ, rough, metal], -1))[::-1]).save(f'{OUT}/yak38_orm.png', compress_level=1)
for nm_, pm in (('верх', skin_m & cov & fus & (nz > 0.3) & (a > 2.0)), ('борт', skin_m & cov & fus & side_ & (a > 2.0)), ('низ', skin_m & cov & (cls == 0) & (nz < -0.3) & (a > 2.0))):
    print('средний цвет обшивки,', nm_, 'sRGB', (np.clip(col[pm], 0, 1) * 255).mean(0).round(1), 'шероховатость', round(float(rough[pm].mean()), 3), 'металл', round(float(metal[pm].mean()), 3))
log('сохранено', OUT)
if os.environ.get('YK_PREV'):
    K = 70.0
    def plan(name, keep, U, V, D, w, h, lv):
        ii = np.nonzero(keep & cov); u_ = ((U[ii] + w / 2) * K).astype(int); v_ = ((V[ii] + 0.6) * K).astype(int); d_ = D[ii]
        W_, H_ = int(w * K) + 2, int(h * K) + 2; ok = (u_ >= 0) & (u_ < W_) & (v_ >= 0) & (v_ < H_); u_, v_, d_ = u_[ok], v_[ok], d_[ok]
        c_ = col[ii][ok] * (0.55 + 0.45 * np.clip(nor[ii][ok] @ np.array(lv), 0, 1))[:, None]
        o_ = np.argsort(d_); im = np.full((H_, W_, 3), 0.8, np.float32); im[v_[o_], u_[o_]] = c_[o_]
        Image.fromarray(lift(im)).save(os.path.join(OUT, name))
    plan('план_сверху.png', nz > -0.05, x, a, z, 7.2, 17.0, [0.3, 0.2, 0.93])
    plan('план_снизу.png', nz < 0.05, -x, a, -z, 7.2, 17.0, [0.3, 0.2, -0.93])
    plan('план_справа.png', nx > -0.05, 8.1 - a, 3.6 - z, x, 17.0, 4.4, [0.6, 0.2, 0.75])
    log('планы')
