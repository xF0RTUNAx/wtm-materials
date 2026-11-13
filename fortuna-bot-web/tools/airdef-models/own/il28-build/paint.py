# paint.py - краска Ил-28 из данных gbuf.py: цвет (только краска и грязь, без света), нормали, карта блеска glTF (R затенение, G шероховатость, B металл). Без Blender: /usr/bin/python3 -I paint.py
# IL_TEX=2048|4096, IL_OUT=<папка>, IL_SCHEME=metal|sand|grey|green|winter, IL_PREV=1 - планы сверху и снизу.
#   metal  - неокрашенный алюминий (il28_04, 05, 08): листы разного тона и блеска, потемневшие и полированные, потёки, жёлтые пятна, копоть.
#   sand   - песочный верх с зелёными пятнами, голубой низ (il28_02) - только красные звёзды, без египетских знаков.
#   grey   - светло-серый верх и борта, светло-голубой низ (по мотиву il28_03) - только красные звёзды, без польских знаков.
#   green  - тёмно-зелёный и бурый верх пятнами, голубой низ; придумана.
#   winter - стёртая временная побелка по зелёному, голубой низ; придумана.
# Звёзды нарисованы здесь (красная с белой и красной каймой), номер 41 и трафареты придуманы; маски износа - ambientCG CC0 (Свои/_текстуры_CC0). Пиксели фото не используются.
import json, math, os, site, sys, time
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image, ImageDraw, ImageFont
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__)); DAT = os.path.join(HERE, '_проба'); CC0D = os.path.join(HERE, '..', '_текстуры_CC0')
S = int(os.environ.get('IL_TEX', '2048')); SCHEME = os.environ.get('IL_SCHEME', 'metal'); OUT = os.environ.get('IL_OUT', os.path.join(DAT, SCHEME)); os.makedirs(OUT, exist_ok=True)
env3 = lambda k, d: np.array([float(v) for v in os.environ.get(k, d).split(',')], np.float32)
C_AL = env3('IL_AL', '0.650,0.648,0.632')                       # алюминий: фото 05 светлый холодный, 08 теплее и тусклее - среднее
PAL = {'sand': ((0.735, 0.660, 0.500), (0.360, 0.420, 0.285), (0.640, 0.735, 0.775)),
       'grey': ((0.660, 0.670, 0.650), (0.600, 0.615, 0.600), (0.640, 0.725, 0.760)),
       'green': ((0.270, 0.330, 0.205), (0.400, 0.330, 0.225), (0.620, 0.715, 0.755)),
       'winter': ((0.800, 0.810, 0.800), (0.280, 0.335, 0.215), (0.640, 0.720, 0.750))}
METAL = SCHEME == 'metal'
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f} с]', *a, flush=True)
L_ = 17.65
pos = np.load(f'{DAT}/gb_pos_{S}.npy'); nor = np.load(f'{DAT}/gb_nor_{S}.npy'); idd = np.load(f'{DAT}/gb_id_{S}.npy'); aob = np.load(f'{DAT}/gb_ao_{S}.npy')
ATLAS = json.load(open(f'{DAT}/uv.json', encoding='utf-8'))['atlas_m']; PXM = 0.985 * S / ATLAS; DS = 1.0 / PXM
mat = np.round(idd[..., 0] * 16).astype(np.int8); cls = np.round(idd[..., 1] * 32).astype(np.int8); cov = idd[..., 2] > 0.5
a = (L_ / 2 - pos[..., 1]).astype(np.float32); x = pos[..., 0].astype(np.float32); z = pos[..., 2].astype(np.float32); ax = np.abs(x)
nx, ny, nz = nor[..., 0], nor[..., 1], nor[..., 2]
ao1, ao2, bev = aob[..., 0].copy(), aob[..., 1].copy(), aob[..., 2]
doors = np.isin(cls, (7, 3)); ao1[doors] = 1.0; ao2[doors] = 1.0                     # створки и шар турели: запечены в одном положении, а двигаются - затенения от соседей на них нет
log('данные загружены', S, SCHEME, 'плотность', round(PXM), 'пикс/м')

# ── геометрия (как в il28_geo.py) ──
WLE = 8.09
def TEf(q): return (11.88 - 0.1606 * q).astype(np.float32)
LEw = np.full_like(ax, WLE); TEw = TEf(ax); CHw = TEw - LEw; HNG = LEw + 0.66 * CHw
FUS_A = np.array([0.0, 0.29, 0.81, 1.6, 2.4, 2.8, 12.0, 13.6, 14.5, 15.4, 16.1, 16.55, 17.6]); FUS_W = np.array([0.01, 0.34, 0.575, 0.775, 0.835, 0.84, 0.84, 0.80, 0.745, 0.665, 0.585, 0.545, 0.50])
hw = np.interp(a, FUS_A, FUS_W).astype(np.float32)
NAC_X, NAC_Z = 3.40, -0.07
skin_m = mat == 0
nacm = (cls == 0) & (np.hypot(ax - NAC_X, z - NAC_Z) < 0.82) & (a > 5.0) & (a < 12.8)
wz = 0.38 + 0.01746 * ax
wing = (cls == 0) & (ax > hw + 0.04) & (np.abs(z - wz) < 0.36) & (a > LEw - 0.05) & (a < TEw + 0.05) & ~nacm & (a < 12.5)
finm = ((cls == 0) & (ax < 0.16) & (z > 0.95) & (a > 12.4)) | (cls == 2)
stabm = (cls == 0) & (z > 1.12) & (ax > 0.14) & (a > 14.0)
planes = wing | stabm | (cls == 4)
fus = (cls == 0) & ~wing & ~nacm & ~finm & ~stabm
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


mott = fbm(0.6, 0.6, 0.6, 4, 1.0); fine = fbm(11.0, 11.0, 11.0, 2, 5.0); patch = fbm(1.4, 1.4, 1.4, 4, 9.0)
sax = np.sqrt(x * x + 0.8)                                       # рисунок по сглаженному |x|: левая и правая стороны зеркально, без ступеньки на хребте

# ── основа ──
F3 = lambda c: np.asarray(c, np.float32)[None, None, :]
if METAL:
    BASE = np.broadcast_to(C_AL, (S, S, 3)).astype(np.float32).copy()
    col = BASE.copy(); rough = np.full((S, S), 0.48, np.float32); metal = np.where(skin_m, 0.74, 0.0).astype(np.float32); undm = np.zeros((S, S), np.float32)   # тусклый окисленный металл (08), не зеркало
else:
    P_ = PAL[SCHEME]; cA, cB, cU = F3(P_[0]), F3(P_[1]), F3(P_[2])
    cv = fbm(0.24, 0.24, 0.30, 3, 211.0, xs=sax); cv2 = fbm(1.5, 1.5, 1.5, 2, 223.0, xs=sax); cv = cv + (cv2 - 0.5) * 0.06
    if SCHEME == 'sand': m2 = smooth(0.490, 0.510, cv)                                  # зелёные пятна с мягкой кромкой распылителя (02)
    elif SCHEME == 'grey': m2 = smooth(0.56, 0.66, cv) * 0.6                            # почти однотонная, пятна - другая партия краски
    elif SCHEME == 'green': m2 = smooth(0.50, 0.52, cv)
    else: m2 = smooth(0.50, 0.52, cv)
    TOP = cA * (1 - m2[..., None]) + cB * m2[..., None]
    # низ голубой: на фюзеляже ниже линии по высоте (с волной), на плоскостях - нижняя сторона; на киле нет
    dl = -0.30 + 0.04 * (fbm(0.4, 0.4, 0.4, 2, 233.0) - 0.5)
    und_f = smooth(dl + 0.02, dl - 0.02, z) * (~nacm) + nacm * smooth(-0.05 - 0.40, -0.10 - 0.42, z - NAC_Z) + 0.0
    und_p = smooth(-0.05, -0.25, nz)
    undm = np.where(planes, und_p, und_f).astype(np.float32); undm = np.where(finm, 0.0, undm); undm = np.where(np.isin(cls, (7,)), 1.0, undm)
    BASE = (TOP * (1 - undm[..., None]) + cU * undm[..., None]).astype(np.float32)
    if SCHEME == 'winter':                                                               # побелка: смыта у кромок, вдоль швов и снизу, видна зелень пятнами
        wash = smooth(0.40, 0.62, fbm(0.9, 0.9, 0.9, 4, 241.0) + 0.25 * (fbm(4.0, 4.0, 4.0, 3, 243.0) - 0.5)) * (1 - undm)
        BASE = (TOP * (1 - wash[..., None]) + cB * wash[..., None]).astype(np.float32); BASE = (BASE * (1 - undm[..., None]) + cU * undm[..., None]).astype(np.float32)
    col = BASE.copy(); rough = np.full((S, S), 0.54, np.float32); metal = np.where(skin_m, 0.04, 0.0).astype(np.float32)
height = np.zeros((S, S), np.float32)

# ── листы: разный тон и блеск по раскрою ──
RING = np.array([0.81, 1.35, 2.05, 2.50, 3.95, 4.65, 5.35, 6.10, 6.90, 7.60, 8.40, 9.20, 10.00, 10.80, 11.60, 12.40, 13.20, 14.00, 14.80, 15.60, 16.40], np.float32)
FZ = np.array([-0.58, -0.28, 0.26, 0.56], np.float32)
WX = np.array([1.50, 2.40, 4.30, 5.40, 6.50, 7.60, 8.70, 9.80], np.float32)
NR = np.array([5.65, 6.60, 7.60, 8.60, 9.60, 10.60, 11.60, 12.20], np.float32)
ri = np.searchsorted(RING, a); wi_ = np.searchsorted(WX, ax); zi = np.searchsorted(FZ, z); ni_ = np.searchsorted(NR, a); nang = np.floor((np.arctan2(x - np.sign(x) * NAC_X, z - NAC_Z) + np.pi) / (np.pi / 3)).astype(np.int32)
wch = np.clip(np.floor((a - LEw) / np.maximum(CHw, 0.1) * 3.3), 0, 3).astype(np.int32)
tt = np.random.RandomState(7).uniform(0.955, 1.045, 1024).astype(np.float32); rt = np.random.RandomState(8).uniform(-0.08, 0.08, 1024).astype(np.float32); hh = np.random.RandomState(9).uniform(-0.014, 0.014, 1024).astype(np.float32)
pid = np.where(wing, ri * 3 + wi_ * 11 + wch * 37 + (x > 0) * 101 + (nz > 0) * 211 + 7, np.where(nacm, ni_ * 17 + nang * 5 + (x > 0) * 401 + 19, ri * 13 + zi * 5 + (x > 0) * 307 + 3)) % 1024
for c_, sd in ((2, 21), (4, 27), (7, 31), (9, 33), (15, 41)):
    k_ = (sd * 17 + (x > 0).astype(np.int32) * 3 + np.floor(a / 1.1).astype(np.int32) * 5 + np.floor(ax / 1.2).astype(np.int32) * 7) % 1024
    pid = np.where(cls == c_, k_, pid)
pid = np.where(cls == 3, 517, pid)                               # шар турели - один лист: блоки по координатам на сфере дают рваную ступеньку
kt = 1.0 if METAL else 0.55                                      # у краски разница партий меньше, чем у голых листов
col *= (1 + (tt[pid] - 1) * kt)[..., None]; col[..., 0] *= 1 + hh[pid] * kt; col[..., 2] *= 1 - hh[pid] * kt; rough += rt[pid] * (1.0 if METAL else 0.6)
if METAL:
    dark_sheet = (np.random.RandomState(11).uniform(0, 1, 1024) < 0.10)[pid] & skin_m
    col = mix(col, C_AL * 0.86, dark_sheet * 0.55); rough += dark_sheet * 0.08
    pol_sheet = (np.random.RandomState(12).uniform(0, 1, 1024) < 0.12)[pid] & skin_m & ~dark_sheet
    col = mix(col, C_AL * 1.05, pol_sheet * 0.5); rough -= pol_sheet * 0.12; metal += pol_sheet * 0.08
log('листы')

# ── швы, лючки, заклёпки ──
seamd = np.full((S, S), 9.0, np.float32); hedge = np.full((S, S), 9.0, np.float32)
def seam(m, d): seamd[m] = np.minimum(seamd[m], d[m])
for r_ in RING: seam(skin_m & np.isin(cls, (0,)) & fus & (a > 0.85), np.abs(a - r_))
for q_ in FZ: seam(fus & skin_m & side_ & (a > 0.9) & (a < 16.4), np.abs(z - q_))
seam(fus & skin_m & (top_ | bot_) & (a > 0.9) & (a < 16.4), np.abs(ax - 0.34))
for q_ in WX: seam(wing & skin_m, np.abs(ax - q_))
seam(wing & skin_m, np.abs(a - (LEw + 0.13 * CHw))); seam(wing & skin_m, np.abs(a - (LEw + 0.42 * CHw)))
for r_ in NR: seam(nacm & skin_m, np.abs(a - r_))
nphi = np.arctan2(x - np.sign(x) * NAC_X, z - NAC_Z)
for ph_ in (-1.9, -0.6, 0.6, 1.9): seam(nacm & skin_m & (a > 5.5), np.abs(np.angle(np.exp(1j * (nphi - ph_)))) * 0.72)
FLE = lambda zz: 13.69 + (16.65 - 13.69) * (zz - 1.34) / (4.12 - 1.34)
seam(finm & skin_m & (z > 1.4), np.abs(a - (FLE(z) + 0.45)) * 0.8); seam(finm & skin_m, np.abs(z - 2.20)); seam(finm & skin_m, np.abs(z - 3.20))
seam(stabm & skin_m, np.abs(ax - 1.3)); seam(stabm & skin_m, np.abs(ax - 2.4))
pr = np.random.RandomState(53)
def hatch(A, Q, a0, a1, q0, q1, vm, tone=1.0):
    ins = vm & (A > a0) & (A < a1) & (Q > q0) & (Q < q1) & skin_m
    d = np.minimum.reduce([A - a0, a1 - A, Q - q0, q1 - Q]); hedge[ins] = np.minimum(hedge[ins], d[ins]); col[ins] *= tone; rough[ins] -= 0.03
for k in range(46):                                                                                     # лючки по бортам фюзеляжа (02: много мелких)
    sg = 1 if k % 2 else -1; a0 = pr.uniform(2.6, 15.8); w_ = pr.uniform(0.12, 0.40); z0 = pr.uniform(-0.50, 0.45); h_ = pr.uniform(0.08, 0.22)
    hatch(a, z, a0, a0 + w_, z0, z0 + h_, fus & side_ & (sg * x > 0), pr.uniform(0.985, 1.02))
for k in range(26):                                                                                     # снизу фюзеляжа
    a0 = pr.uniform(1.4, 16.0); w_ = pr.uniform(0.12, 0.42); q0 = pr.uniform(-0.40, 0.28); h_ = pr.uniform(0.10, 0.24)
    if 6.9 < a0 < 14.2: continue
    hatch(a, x, a0, a0 + w_, q0, q0 + h_, fus & bot_, pr.uniform(0.985, 1.02))
for k in range(28):                                                                                     # на гондолах: капоты и лючки (02 сверху)
    sg = 1 if k % 2 else -1; a0 = pr.uniform(5.8, 11.4); w_ = pr.uniform(0.14, 0.40); q0 = pr.uniform(-1.8, 1.8); h_ = pr.uniform(0.12, 0.26)
    hatch(a, nphi, a0, a0 + w_, q0, q0 + h_ / 0.72, nacm & (sg * x > 0), pr.uniform(0.985, 1.02))
for k in range(50):                                                                                     # крыло, больше снизу
    sg = 1 if k % 2 else -1; xr = pr.uniform(1.0, 9.8); le = WLE; ch = float(11.88 - 0.1606 * xr) - le
    a0 = pr.uniform(le + 0.15 * ch, le + 0.55 * ch); w_ = pr.uniform(0.15, 0.45); h_ = pr.uniform(0.15, 0.42)
    hatch(a, sg * x, a0, a0 + w_, xr, xr + h_, wing & (bot_ if k % 3 else top_), pr.uniform(0.98, 1.025))
PITCH = 0.045; RV = max(0.006, 0.85 * DS)
near = (seamd < 0.05) & skin_m
along = np.where(wing, np.where(np.abs(seamd - np.min(np.abs(ax[..., None] - WX[None, None, :]), -1)) < 1e-3, a, ax), np.where(nacm, a + np.abs(nphi), np.where(fus & side_, a + z, a + ax)))
ph = (along / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH
riv = np.where(near, np.clip(1 - np.hypot(dph, np.abs(seamd - 0.022)) / RV, 0, 1), 0.0).astype(np.float32)
log('швы, люки, заклёпки', round(float((riv > 0).mean()), 4))

# ── износ: налёт, разводы, блеск, царапины (CC0) ──
si3 = tri('SurfaceImperfections003', 'SurfaceImperfections003_2K-JPG_Opacity.jpg', 1.6); si13 = tri('SurfaceImperfections013', 'SurfaceImperfections013_2K-JPG_Opacity.jpg', 2.1)
sc3 = tri('Scratches003', 'Scratches003_2K-JPG_Opacity.jpg', 1.2); sc5 = tri('Scratches005', 'Scratches005_2K-JPG_Opacity.jpg', 1.5)
lk12 = tri('Leaking012A', 'Leaking012A_2K-JPG_Displacement.jpg', 2.4, flow=True); lk17 = 1.0 - tri('Leaking017B', 'Leaking017B_2K-JPG_Color.jpg', 2.0, flow=True)
col *= (1 + (mott - 0.5) * (0.14 if METAL else 0.10) + (fine - 0.5) * 0.02)[..., None]
col = mix(col, (0.46, 0.46, 0.44) if METAL else BASE * 1.06, smooth(0.35, 0.85, si3) * 0.20 * skin_m)        # налёт
col = mix(col, (0.30, 0.30, 0.29), smooth(0.40, 0.90, si13) * (0.18 if METAL else 0.10) * skin_m)            # разводы
rough += smooth(0.35, 0.85, si3) * 0.10 * skin_m + smooth(0.4, 0.9, si13) * 0.06 * skin_m
polish = smooth(0.55, 0.72, fbm(0.9, 0.9, 0.9, 3, 13.0)); rough += (mott - 0.5) * 0.10 - polish * 0.08
sun = smooth(0.25, 0.9, nz)
if METAL: col = mix(col, BASE * 1.05, sun * smooth(0.45, 0.75, patch) * 0.16)
else:                                                                                                # выгорание краски сверху: светлее и холоднее, пятнами
    col = mix(col, BASE * np.array([1.12, 1.11, 1.08], np.float32) + 0.015, sun * smooth(0.36, 0.72, patch) * 0.34)
    chalk = sun * smooth(0.40, 0.80, fbm(0.35, 0.35, 0.35, 4, 251.0)) * skin_m; col = mix(col, BASE * 1.10 + 0.04, chalk * 0.22); rough += chalk * 0.10      # меление
scr = smooth(0.62, 0.86, sc5) * skin_m; col = mix(col, (C_AL * 1.10) if METAL else (BASE * 1.18 + 0.03), scr * (0.20 if METAL else 0.18)); rough -= scr * 0.08
scuff = smooth(0.05, 0.0, hedge) * smooth(0.5, 0.8, sc3) * 0.5; col = mix(col, (C_AL * 1.08) if METAL else (BASE * 1.12), scuff * 0.35); rough -= scuff * 0.10
log('износ')

# ── потёки по потоку, ржавые потёки, масло, гидравлика снизу ──
aft = np.zeros((S, S), np.float32)
for k in range(160):
    sg = 1 if k % 2 else -1; kind = k % 4
    if kind in (0, 1): xr = pr.uniform(1.0, 9.8); a0 = WLE + pr.uniform(0.3, 2.6); q0 = xr; mm = wing & bot_ & (sg * x > 0); Q = ax
    elif kind == 2: a0 = pr.uniform(2.0, 16.0); q0 = pr.uniform(-0.32, 0.32); mm = fus & bot_; Q = x
    else: a0 = pr.uniform(1.5, 15.5); q0 = pr.uniform(-0.55, 0.45); mm = fus & side_ & (sg * x > 0); Q = z
    ln = pr.uniform(0.4, 2.0); wd = pr.uniform(0.02, 0.08)
    d_ = (a - a0) / ln; lat = np.abs(Q - q0) / wd; t_ = mm & (d_ > 0) & (d_ < 1) & (lat < 1)
    aft[t_] = np.maximum(aft[t_], ((1 - d_[t_]) ** 1.4) * (1 - lat[t_] ** 2))
flow_ = aft * (0.5 + 0.5 * smooth(0.3, 0.8, lk12))
col = mix(col, (0.30, 0.295, 0.28) if METAL else (0.26, 0.255, 0.24), flow_ * (0.45 if METAL else 0.22) * skin_m); rough += flow_ * 0.10
rain = smooth(0.45, 0.85, lk12) * np.abs(nx) ** 2 * skin_m * smooth(0.40, 0.70, fbm(0.5, 0.5, 0.5, 3, 331.0)); col = mix(col, (0.16, 0.155, 0.15), rain * 0.22); rough += rain * 0.06   # дождевые потёки по бортам
rust = np.zeros((S, S), np.float32)                                                                       # ржавые потёки от дренажей и винтов (08)
for a0, q0, ln, wd, sgn, onw in ((11.0, 1.10, 1.7, 0.08, 1, 1), (10.6, 1.20, 1.3, 0.06, -1, 1), (12.3, 0.10, 1.1, 0.05, 1, 0), (9.2, 5.5, 0.9, 0.05, -1, 1), (10.0, 7.4, 1.0, 0.05, 1, 1), (5.2, 0.15, 1.4, 0.05, 1, 0), (14.4, -0.12, 1.2, 0.05, 1, 0)):
    d_ = (a - a0) / ln; lat = np.abs((ax if onw else x) - q0) / wd; t_ = bot_ & skin_m & ((sgn * x > 0) if onw else True) & (d_ > 0) & (d_ < 1) & (lat < 1)
    rust[t_] = np.maximum(rust[t_], ((1 - d_[t_]) ** 1.2) * (1 - lat[t_] ** 2) * (0.55 + 0.45 * smooth(0.3, 0.8, lk17[t_])))
col = mix(col, (0.50, 0.33, 0.18), rust * (0.60 if METAL else 0.45)); rough += rust * 0.18; metal -= rust * 0.5
if METAL:
    lowstreak = side_ * fus * smooth(0.0, -0.55, z) * smooth(0.35, 0.75, lk17) * smooth(0.30, 0.65, fbm(0.4, 3.0, 3.0, 3, 371.0)) * skin_m      # тёмные разводы по низу бортов (08)
    col = mix(col, (0.24, 0.235, 0.22), lowstreak * 0.40); rough += lowstreak * 0.10
    yel = smooth(0.55, 0.85, lk17) * bot_ * skin_m * smooth(6.0, 9.0, a) * smooth(15.0, 12.0, a) * smooth(0.6, 0.9, patch)   # желтоватые пятна (08)
    col = mix(col, (0.62, 0.58, 0.42), yel * 0.28)
under = smooth(-0.15, -0.75, nz)
oil = under * smooth(0.48, 0.72, fbm(1.0, 4.0, 4.0, 4, 23.0)) * skin_m; col = mix(col, (0.20, 0.19, 0.17), oil * 0.12); rough += oil * 0.10
ost = fbm(0.35, 9.0, 9.0, 4, 341.0)                                                                       # масло и гидравлика: назад от ниш стоек и низа гондол, за отсеком
om_ = under * (nacm * smooth(8.8, 9.4, a) * smooth(12.7, 10.5, a) * np.exp(-((ax - 3.575) / 0.30) ** 2) + fus * smooth(13.8, 14.2, a) * smooth(16.6, 14.6, a) * np.exp(-(x / 0.30) ** 2)
              + fus * smooth(2.0, 2.3, a) * smooth(5.0, 2.8, a) * np.exp(-(x / 0.22) ** 2)) * smooth(0.40, 0.66, ost)
col = mix(col, (0.085, 0.075, 0.062), np.clip(om_, 0, 1) * (0.50 if METAL else 0.36) * skin_m); rough -= np.clip(om_, 0, 1) * 0.20 * skin_m
dust = smooth(0.55, 0.95, nz) * smooth(0.42, 0.70, fbm(0.8, 0.8, 0.8, 4, 351.0)) * skin_m; col = mix(col, (0.52, 0.49, 0.43), dust * (0.08 if METAL else 0.12)); rough += dust * 0.08
mud = smooth(-0.45, -0.85, z - (-0.81)) * 0.0 + under * smooth(-0.6, -0.9, z) * smooth(0.40, 0.75, fbm(1.8, 1.8, 1.8, 3, 361.0)) * skin_m * fus; col = mix(col, (0.30, 0.27, 0.22), mud * 0.20); rough += mud * 0.12   # брызги снизу
log('потёки, масло')

# ── копоть: сопла, пушки в носу, кормовая установка ──
est = fbm(0.45, 6.0, 6.0, 4, 311.0)
nozm = nacm * smooth(11.8, 12.6, a); col = mix(col, (0.10, 0.095, 0.09), nozm * (0.45 + 0.35 * smooth(0.30, 0.70, est))); rough += nozm * 0.22; metal -= nozm * 0.4    # хвост гондолы
jet = np.exp(-((ax - NAC_X) / 0.55) ** 2)
esoot = (stabm | (cls == 4)) * smooth(14.0, 15.5, a) * jet * smooth(0.1, -0.6, nz) * smooth(0.36, 0.70, est) * 0.45 + fus * smooth(12.2, 13.0, a) * smooth(16.5, 14.0, a) * smooth(-0.1, -0.6, nz) * smooth(0.40, 0.72, est) * 0.18
col = mix(col, (0.11, 0.105, 0.10), np.clip(esoot, 0, 1)); rough += np.clip(esoot, 0, 1) * 0.15
if METAL:                                                                                                  # побежалость на хвосте гондолы: соломенная, без радуги
    straw = nacm * smooth(11.2, 11.9, a) * smooth(12.5, 12.0, a) * (0.5 + 0.5 * est); col = mix(col, (0.62, 0.53, 0.36), straw * 0.35)
gd_ = np.minimum(np.hypot(x - 0.612, z + 0.505), np.hypot(x + 0.612, z + 0.505))                          # пушки НР-23 в носу: нагар назад по низу борта
gsoot = 1.3 * np.exp(-gd_ / 0.22) * smooth(1.1, 1.5, a) * smooth(4.2, 1.8, a) * (0.35 + 0.65 * smooth(0.30, 0.66, fbm(0.55, 7.0, 7.0, 4, 301.0))) * (cls == 0) * skin_m
col = mix(col, (0.075, 0.072, 0.070), np.clip(gsoot, 0, 1) * 0.65); rough += np.clip(gsoot, 0, 1) * 0.20
tur = (cls == 3); tsoot = tur * smooth(0.0, -0.6, ny) * (0.4 + 0.6 * smooth(0.3, 0.7, est)) * 0.5      # шар турели сзади у щелей
col = mix(col, (0.10, 0.095, 0.09), tsoot); rough += tsoot * 0.15
log('копоть')

# ── кромки, сколы, тропы ──
dle = a - LEw
LEm = smooth(0.14, 0.02, dle) * smooth(-0.03, 0.02, dle) * wing
LEm = LEm + stabm * smooth(0.12, 0.02, a - (14.24 + 2.31 * ax / 3.55)) + finm * (z > 1.3) * smooth(0.12, 0.02, a - FLE(z))
LEm = np.clip(LEm, 0, 1)
edge = smooth(0.985, 0.90, bev) * skin_m
movm = np.isin(cls, (2, 3, 4, 7))
if METAL:
    col = mix(col, C_AL * 1.10, LEm * 0.40); rough -= LEm * 0.12
    chip = np.clip(edge * smooth(0.60, 0.80, sc3) + LEm * smooth(0.55, 0.75, sc5) * 0.6, 0, 1) * np.where(movm, 0.3, 1.0)
    col = mix(col, C_AL * 1.14, chip * 0.6); rough = rough * (1 - chip * 0.5) + 0.22 * chip * 0.5
else:                                                                                                    # краска слоями: под сколом грунт, в глубоком сколе металл (правило 9)
    eros = smooth(0.46, 0.60, fbm(9.0, 9.0, 9.0, 3, 37.0))
    walk = (smooth(8.2, 8.5, a) * smooth(11.4, 11.0, a) * smooth(0.90, 1.05, ax) * smooth(2.4, 2.2, ax) * wing * top_
            + fus * top_ * np.exp(-(x / 0.25) ** 2) * smooth(4.0, 4.4, a) * smooth(8.2, 7.8, a)
            + fus * side_ * (x < 0) * smooth(2.0, 2.4, a) * smooth(3.4, 3.0, a) * smooth(0.2, 0.5, z)) * smooth(0.40, 0.66, fbm(2.2, 2.2, 2.2, 3, 53.0))   # тропы: центроплан, спина, у фонаря слева
    dmg = np.clip(edge * smooth(0.52, 0.66, fbm(14.0, 14.0, 14.0, 3, 41.0)) + LEm * smooth(0.62, 0.76, eros) * 0.9 + smooth(0.020, 0.004, hedge) * smooth(0.60, 0.72, fbm(22.0, 22.0, 22.0, 3, 43.0)) * 0.7
                  + walk * smooth(0.45, 0.75, sc3) * 0.9, 0, 1) * np.where(movm, 0.35, 1.0) * skin_m
    prim = smooth(0.20, 0.42, dmg) * 0.55; bare = smooth(0.50, 0.88, dmg)
    col = mix(col, (0.47, 0.50, 0.40), prim)                                                             # серо-зелёный грунт
    col = mix(col, C_AL * 1.04, bare); rough = rough * (1 - bare) + 0.30 * bare; metal = np.maximum(metal, bare * 0.85)
    col = mix(col, BASE * 1.06, walk * 0.20); rough -= walk * 0.10
crev = smooth(0.75, 0.30, ao1) * skin_m; col = mix(col, (0.16, 0.16, 0.16), crev * 0.40); rough += crev * 0.14
col *= (0.88 + 0.12 * smooth(0.15, 0.95, ao2))[..., None]
hair = smooth(max(0.008, 1.0 * DS), 0.002, seamd) * skin_m; col *= (1 - (0.14 if METAL else 0.11) * hair)[..., None]
grime = smooth(0.08, 0.0, np.minimum(seamd, hedge)) * smooth(0.35, 0.8, si13) * skin_m; col = mix(col, (0.25, 0.25, 0.24), grime * 0.22)
col *= (1 - smooth(0.0, 0.5, riv) * 0.06 * skin_m)[..., None]
log('кромки')

# ── зоны другого цвета: обтекатель РЛС, губы заборников ──
rdm = (cls == 0) & skin_m & (a > 3.85) & (a < 6.15) & (z < -0.78) & (ax < 0.58)
col = mix(col, (0.30, 0.32, 0.31) if METAL else BASE * 0.90, rdm * 0.85); rough = np.where(rdm, 0.62, rough); metal = np.where(rdm, 0.0, metal)      # радиопрозрачный обтекатель: крашеный, матовый (08)
lip = nacm & (a < 5.18); col = mix(col, C_AL * 1.06, lip * (1.0 if METAL else 0.85)); rough = np.where(lip, 0.30, rough); metal = np.where(lip, 0.9, metal)   # губа заборника - голый металл, затёрта
log('зоны')

# ── знаки и трафареты (свои) ──
FNB = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'; FNN = '/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf'
INK = (24, 26, 30, 255); RED = (178, 30, 28, 255); WHITE = (234, 236, 234, 255); YEL = (214, 172, 28, 255)
NUMC = (52, 88, 150, 255) if METAL else (178, 30, 28, 255)
MARKS = []
def stamp(im_, ac, qc, W_, H_, side, along=True, alpha=0.95, cl=(0,), rough_to=0.45, xr=None):
    A0 = np.asarray(im_, np.float32) / 255.0; hp, wp = A0.shape[:2]
    vm, Q_ = ((nz > 0.35, x) if side == 'top' else (nz < -0.35, x) if side == 'bot' else (nx > 0.35, z) if side == 'r' else (nx < -0.35, z))
    if along: ins = vm & (np.abs(a - ac) < W_ / 2) & (np.abs(Q_ - qc) < H_ / 2)
    else: ins = vm & (np.abs(Q_ - qc) < W_ / 2) & (np.abs(a - ac) < H_ / 2)
    ins &= (mat == 0) & np.isin(cls, cl) & cov
    if xr is not None: ins &= (x > xr[0]) & (x < xr[1])
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
    wear = (0.88 + 0.12 * smooth(0.3, 0.7, si3[ins])) * (1 - 0.7 * np.clip(dmg[ins] if not METAL else chip[ins], 0, 1)) * (1 - 0.35 * smooth(0.6, 0.9, sc5[ins]))
    S_ = S_ / 5.0; al = S_[:, 3] * alpha * wear
    S_[:, :3] = np.where(S_[:, 3:4] > 1e-3, S_[:, :3] / np.maximum(S_[:, 3:4], 1e-3), 0.0)
    fadec = S_[:, :3] * (0.92 + 0.08 * fine[ins, None]) + (0.03 if not METAL else 0.0)                    # знаки тоже выгорели
    col[ins] = col[ins] * (1 - al[..., None]) + fadec * al[..., None]; rough[ins] = rough[ins] * (1 - al) + rough_to * al; metal[ins] = metal[ins] * (1 - al)
    MARKS.append((side, float(ac), float(qc)))
def _star_pts(cx, cy, R):
    return [(cx + (R if i % 2 == 0 else R * 0.382) * math.cos(-math.pi / 2 + i * math.pi / 5), cy + (R if i % 2 == 0 else R * 0.382) * math.sin(-math.pi / 2 + i * math.pi / 5)) for i in range(10)]
def star(W=1000, up=True):
    """Красная звезда с белой и красной каймой (нарисовано здесь). up: верхний луч вверх картинки."""
    im_ = Image.new('RGBA', (W, W), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); c = W / 2; R = W / 2 - 6
    d_.polygon(_star_pts(c, c, R), fill=RED); d_.polygon(_star_pts(c, c, R * 0.90), fill=WHITE); d_.polygon(_star_pts(c, c, R * 0.74), fill=RED)
    return im_ if up else im_.rotate(180)
def text_img(t, H=240, ink=INK, font=FNB, pad=20, outline=None):
    f_ = ImageFont.truetype(font, int(H * 0.86)); tmp = ImageDraw.Draw(Image.new('L', (8, 8))); bb = tmp.textbbox((0, 0), t, font=f_); W = bb[2] - bb[0] + pad * 2
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_)
    if outline: d_.text((W / 2, H / 2), t, font=f_, fill=outline, anchor='mm', stroke_width=int(H * 0.06), stroke_fill=outline)
    d_.text((W / 2, H / 2), t, font=f_, fill=ink, anchor='mm'); return im_
def block_img(W=600, H=300, rows=5, seed=1, ink=INK):
    """Блок мелких надписей: штрихи разной длины (буквы такого размера в игре не читаются)."""
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); r_ = np.random.RandomState(seed)
    for i in range(rows):
        y0 = H * (i + 0.2) / rows; x0 = 0
        while x0 < W * r_.uniform(0.6, 1.0):
            w_ = r_.uniform(0.05, 0.16) * W; d_.rectangle((x0, y0, x0 + w_, y0 + H * 0.5 / rows), fill=ink); x0 += w_ + W * 0.03
    return im_
def tri_warn(S_=400):
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); P_ = [(S_ / 2, S_ * 0.06), (S_ * 0.96, S_ * 0.92), (S_ * 0.04, S_ * 0.92)]; d_.polygon(P_, fill=RED)
    d_.polygon([(S_ / 2, S_ * 0.30), (S_ * 0.78, S_ * 0.80), (S_ * 0.22, S_ * 0.80)], fill=WHITE); return im_
def arrow_img(W=640, H=170, ink=RED):
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dr = ImageDraw.Draw(im_); dr.polygon([(10, H * 0.32), (W - 170, H * 0.32), (W - 170, 8), (W - 10, H / 2), (W - 170, H - 8), (W - 170, H * 0.68), (10, H * 0.68)], fill=ink); return im_
def ring_img(S_=300, c=RED):
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); d_.ellipse((6, 6, S_ - 6, S_ - 6), outline=c, width=int(S_ * 0.12)); d_.ellipse((S_ * 0.36, S_ * 0.36, S_ * 0.64, S_ * 0.64), fill=(60, 62, 64, 255)); return im_
ST = star(); NUM = '41'                                          # номер придуман
HULL = (-0.86, 0.86)
INKS = (32, 34, 36, 255) if SCHEME in ('metal', 'grey', 'winter', 'sand') else (226, 228, 224, 255)
for sd in ('r', 'l'):
    stamp(ST, 15.95, 2.55, 0.95, 0.95, sd, cl=(0,), alpha=0.96)                                              # звезда на киле (05)
    stamp(text_img(NUM, 300, ink=NUMC, outline=(WHITE if not METAL else None)), 3.40, 0.05, 0.62, 0.52, sd, alpha=0.95, xr=HULL)   # номер на носу (05)
    stamp(tri_warn(), 3.92, 0.52, 0.15, 0.15, sd, alpha=0.95, xr=HULL)                                        # катапульта
    stamp(arrow_img(), 2.75, 0.55, 0.42, 0.11, sd, alpha=0.9, rough_to=0.5, xr=HULL)                         # стрелка у фонаря
    stamp(arrow_img(ink=YEL), 16.10, 0.30, 0.38, 0.10, sd, alpha=0.9, rough_to=0.5, xr=HULL)                  # у кабины стрелка
    stamp(text_img('НЕ ТОЛКАТЬ', 110, ink=INKS, font=FNN), 16.35, 2.10, 0.42, 0.07, sd, cl=(2,), alpha=0.80)
    k_ = 0
    for ac_, zc_, w_, h_ in ((1.55, 0.20, 0.26, 0.13), (2.30, -0.35, 0.22, 0.11), (4.80, -0.25, 0.30, 0.14), (6.40, 0.40, 0.24, 0.12), (12.8, -0.30, 0.26, 0.13), (14.6, 0.10, 0.22, 0.11), (15.5, -0.40, 0.24, 0.11)):
        k_ += 1; stamp(block_img(seed=k_ + (0 if sd == 'r' else 20), ink=INKS), ac_, zc_, w_, h_, sd, alpha=0.78, xr=HULL)
for sg in (1, -1):                                                                                           # звёзды на крыле: сверху и снизу обеих консолей, ближе к середине консоли (Mark)
    stamp(ST, 9.30, sg * 6.55, 1.15, 1.15, 'top', along=False, alpha=0.96, cl=(0, 4))
    stamp(star(up=False), 9.30, sg * 6.55, 1.15, 1.15, 'bot', along=False, alpha=0.96, cl=(0, 4))
    for ac_, xc_ in ((8.55, 2.0), (8.40, 5.0), (8.45, 8.8)): stamp(ring_img(), ac_, sg * xc_, 0.15, 0.15, 'top', along=False, alpha=0.92)      # заливные горловины
    for ac_, xc_, s_ in ((10.6, 1.6, 3), (10.2, 4.9, 5), (9.9, 8.2, 7), (16.0, 1.0, 9)): stamp(block_img(seed=s_ + (sg > 0), ink=INKS), ac_, sg * xc_, 0.26, 0.12, 'top', along=False, alpha=0.72, cl=(0, 4))
    for ac_, xc_, s_ in ((9.0, 2.2, 11), (9.6, 5.2, 13), (9.0, 8.6, 15)): stamp(block_img(seed=s_ + (sg > 0), ink=INKS), ac_, sg * xc_, 0.26, 0.12, 'bot', along=False, alpha=0.72, cl=(0, 4))
    stamp(text_img('НЕ СТУПАТЬ', 110, ink=INKS, font=FNN), 10.95, sg * 1.70, 0.62, 0.10, 'top', along=False, alpha=0.75, cl=(0, 4))
    stamp(text_img('НЕ СТУПАТЬ', 110, ink=INKS, font=FNN), 10.60, sg * 5.20, 0.62, 0.10, 'top', along=False, alpha=0.75, cl=(0, 4))
log('знаки', len(MARKS))

# ── материалы без краски обшивки ──
def solid(m, c, r, me=0.0, nz_=0.08):
    col[m] = np.array(c, np.float32) * (1 - nz_ / 2 + nz_ * fine[m])[..., None]; rough[m] = r; metal[m] = me
solid(mat == 10, (0.20, 0.21, 0.22), 0.85); solid(mat == 2, (0.030, 0.030, 0.032), 0.9); solid(mat == 4, (0.050, 0.050, 0.053), 0.88)
solid(mat == 5, (0.24, 0.255, 0.25), 0.66, 0, 0.16); solid(mat == 6, (0.30, 0.31, 0.22), 0.92, 0, 0.2); solid(mat == 8, (0.30, 0.28, 0.21), 0.9, 0, 0.14)
solid(mat == 7, (0.018, 0.038, 0.032), 0.12); solid(mat == 9, (0.74, 0.60, 0.06), 0.42)
bayw = (mat == 5) & (cls == 0) & (a > 6.9) & (a < 14.3) & (z < 0.12); solid(bayw, (0.43, 0.47, 0.41), 0.6, 0.1, 0.12)          # стенки отсека: серо-зелёный грунт
bi = cls == 14; solid(bi & (mat == 5), (0.40, 0.44, 0.38), 0.62, 0.1, 0.14); solid(bi & (mat == 1), (0.36, 0.37, 0.36), 0.45, 0.8, 0.12)
col[bi | bayw] *= (0.55 + 0.45 * smooth(0.15, 0.95, ao2[bi | bayw]))[..., None]
solid(mat == 1, (0.42, 0.42, 0.42), 0.40, 0.9, 0.10)
duct = mat == 11; ia_ = np.clip((a - 5.1) / 0.9, 0, 1); col[duct] = (np.array((0.52, 0.53, 0.53), np.float32)[None] * (0.25 + 0.75 * (1 - ia_[duct]))[:, None]); rough[duct] = 0.55; metal[duct] = 0.5
core = (cls == 10) & (mat == 1); tn = fbm(1.2, 4.0, 4.0, 4, 59.0)
col[core] = np.where((a[core] < 7.0)[:, None], np.array((0.46, 0.14, 0.10), np.float32) * (0.85 + 0.3 * tn[core, None]), np.array((0.30, 0.28, 0.25), np.float32) * (0.75 + 0.4 * tn[core, None]))   # кок заборника красно-бурый (08)
rough[core] = 0.5; metal[core] = np.where(a[core] < 7.0, 0.2, 0.9)
noz = (cls == 0) & (mat == 1) & (a > 11.8); col[noz] = np.array((0.24, 0.22, 0.20), np.float32) * (0.75 + 0.4 * tn[noz, None]); metal[noz] = 0.9; rough[noz] = 0.58
gun = cls == 5; solid(gun & (mat == 1), (0.13, 0.13, 0.135), 0.42, 0.85, 0.12)
frm = cls == 9                                                                                                # рамы стёкол: как обшивка схемы, со сколами
frm_c = (C_AL * 1.0) if METAL else np.asarray(PAL[SCHEME][0], np.float32)
col[frm & skin_m] = (frm_c[None] * (0.86 + 0.24 * fine[frm & skin_m, None]) * (1 - 0.25 * smooth(0.6, 0.9, sc3[frm & skin_m, None]))); rough[frm & skin_m] = 0.42 if METAL else 0.52; metal[frm & skin_m] = 0.8 if METAL else 0.05
gr_ = cls == 12; g_p = gr_ & (mat == 0); g_c = gr_ & (mat == 1); g_s = gr_ & (mat == 8)
gm1 = fbm(2.4, 2.4, 2.4, 4, 91.0); gm2 = fbm(18.0, 18.0, 18.0, 3, 93.0); gst = fbm(1.0, 16.0, 2.2, 4, 87.0)
solid(g_p, (0.56, 0.57, 0.56), 0.48, 0.35, 0.10); solid(g_c, (0.50, 0.50, 0.49), 0.28, 0.9, 0.06); solid(g_s, (0.16, 0.155, 0.15), 0.56, 0.75, 0.14)
hub = gr_ & (mat == 1) & (np.hypot(*(np.stack([a - 9.3, z - (-2.23 + 0.55)]))) < 0.30) | gr_ & (mat == 1) & (np.hypot(a - 2.3, z - (-2.23 + 0.33)) < 0.18)
solid(hub, (0.24, 0.34, 0.24), 0.50, 0.15, 0.10)                                                             # диски колёс зелёные
col[g_p] *= (0.84 + 0.30 * gm1[g_p])[..., None]
goil = smooth(0.46, 0.68, gst) * (g_p | g_c); col = mix(col, (0.15, 0.125, 0.095), goil * 0.50); rough += goil * 0.15 * g_p
gd = smooth(-1.4, -2.2, z) * gr_; col = mix(col, (0.26, 0.23, 0.19), gd * 0.50 * (g_p | g_s | hub)); rough += gd * 0.15 * g_p
tyr = (mat == 4); col = mix(col, (0.17, 0.16, 0.145), smooth(0.40, 0.68, gm2) * tyr * 0.45); col = mix(col, (0.21, 0.19, 0.16), smooth(-1.95, -2.22, z) * tyr * 0.45)
col[gr_] *= (0.55 + 0.45 * smooth(0.15, 0.95, ao2[gr_]))[..., None]
door_in = (cls == 7) & (nz > 0.2); solid(door_in, (0.43, 0.47, 0.41), 0.58, 0.1, 0.14)                                # изнанка створок - грунт
ant = cls == 15; solid(ant & (mat == 1), (0.30, 0.30, 0.31), 0.5, 0.6, 0.1)
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
if not METAL: height += smooth(0.20, 0.42, dmg) * 0.00012 * skin_m - smooth(0.5, 0.9, dmg) * 0.00010 * skin_m    # ступенька краски у скола
gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * DS); gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / (2 * DS)
flat = np.isin(mat, (2, 7, 9, 11)) | np.isin(cls, (11, 12, 14)); gx[flat] = 0; gy[flat] = 0
# только внутри острова: на границе соседний пиксель лежит на другом куске модели - разность высот там мусор (полосы в нормалях, рваные пятна в бликах)
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
Image.fromarray(lift(col)[::-1]).save(f'{OUT}/il28_color.png', compress_level=1)
Image.fromarray(lift(nn * 0.5 + 0.5)[::-1]).save(f'{OUT}/il28_normal.png', compress_level=1)
Image.fromarray(lift(np.stack([occ, rough, metal], -1))[::-1]).save(f'{OUT}/il28_orm.png', compress_level=1)
for nm_, pm in (('верх', skin_m & cov & (cls == 0) & (nz > 0.3) & (a > 3.2)), ('борт', skin_m & cov & fus & side_ & (a > 3.2)), ('низ', skin_m & cov & (cls == 0) & (nz < -0.3) & (a > 3.2))):
    print('средний цвет обшивки,', nm_, 'sRGB', (np.clip(col[pm], 0, 1) * 255).mean(0).round(1), 'шероховатость', round(float(rough[pm].mean()), 3), 'металл', round(float(metal[pm].mean()), 3))
log('сохранено', OUT)
if os.environ.get('IL_PREV'):
    K = 50.0
    def plan(name, keep, U, V, D, w, h, lv):
        ii = np.nonzero(keep & cov); u_ = ((U[ii] + w / 2) * K).astype(int); v_ = ((V[ii]) * K).astype(int); d_ = D[ii]
        W_, H_ = int(w * K) + 2, int(h * K) + 2; ok = (u_ >= 0) & (u_ < W_) & (v_ >= 0) & (v_ < H_); u_, v_, d_ = u_[ok], v_[ok], d_[ok]
        c_ = col[ii][ok] * (0.55 + 0.45 * np.clip(nor[ii][ok] @ np.array(lv), 0, 1))[:, None]
        o_ = np.argsort(d_); im = np.full((H_, W_, 3), 0.8, np.float32); im[v_[o_], u_[o_]] = c_[o_]
        Image.fromarray(lift(im)).save(os.path.join(OUT, name))
    plan('план_сверху.png', nz > -0.05, x, a, z, 22.0, 18.6, [0.3, 0.2, 0.93])
    plan('план_снизу.png', nz < 0.05, -x, a, -z, 22.0, 18.6, [0.3, 0.2, -0.93])
    log('планы')
