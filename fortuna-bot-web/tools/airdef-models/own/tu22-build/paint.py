# paint.py - краска Ту-22 из данных gbuf.py: цвет (только краска и грязь, без света), нормали, карта блеска glTF (R затенение, G шероховатость, B металл). Без Blender: /usr/bin/python3 -I paint.py
# TU_TEX=2048|4096, TU_OUT=<папка>, TU_SCHEME=metal|grey|desert|aged, TU_PREV=1 - планы сверху и снизу.
#   metal  - неокрашенный алюминий (tu22_02, 03, 10): листы разного тона и блеска, потемневшие и полированные, потёки, копоть за соплами.
#   grey   - двухтонный серый камуфляж верха и бортов, светло-серый низ (tu22_01).
#   desert - песок, бурый и зелёный пятнами, голубой низ; придуман, только красные звёзды.
#   milk   - «Сгущёнка» (камуфляж магазина e_tu22:milk) по этикетке банки, как Камуфляжи/e_tu22/paint.py: голубая основа, тёмно-синие косые кресты
#            с белой каймой, белые клинья в нижней половине «этикетки»; фюзеляж, гондолы и гондолы шасси - вокруг своей оси, крылья по плану, киль сбоку. Текста этикетки нет.
#   aged   - старый алюминий музейной машины (tu22_07, 09): мел, окисел, коррозия у заклёпок, грязь и потёки сильнее.
# Звёзды нарисованы здесь, номер 37 и трафареты придуманы; маски износа - ambientCG CC0 (Свои/_текстуры_CC0). Пиксели фото не используются.
import json, math, os, site, sys, time
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image, ImageDraw, ImageFont
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__)); DAT = os.path.join(HERE, '_проба'); CC0D = os.path.join(HERE, '..', '_текстуры_CC0')
S = int(os.environ.get('TU_TEX', '2048')); SCHEME = os.environ.get('TU_SCHEME', 'metal'); OUT = os.environ.get('TU_OUT', os.path.join(DAT, SCHEME)); os.makedirs(OUT, exist_ok=True)
env3 = lambda k, d: np.array([float(v) for v in os.environ.get(k, d).split(',')], np.float32)
C_AL = env3('TU_AL', '0.665,0.664,0.650')                       # алюминий: фото 02 светлый, 10 тусклее - среднее
PAL = {'milk': ((0.149, 0.596, 0.886), (0.196, 0.212, 0.596), (0.957, 0.965, 0.980)),
       'grey': ((0.640, 0.655, 0.650), (0.455, 0.500, 0.535), (0.665, 0.680, 0.685)),
       'desert': ((0.730, 0.630, 0.460), (0.470, 0.360, 0.245), (0.630, 0.725, 0.765), (0.350, 0.375, 0.255))}
METAL = SCHEME in ('metal', 'aged'); AGED = SCHEME == 'aged'; WK = 1.8 if AGED else 1.0; DIRT = 0.5 if SCHEME == 'milk' else 1.0     # нарядная окраска магазина - грязи вдвое меньше
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f} с]', *a, flush=True)
L_ = 41.6
pos = np.load(f'{DAT}/gb_pos_{S}.npy'); nor = np.load(f'{DAT}/gb_nor_{S}.npy'); idd = np.load(f'{DAT}/gb_id_{S}.npy'); aob = np.load(f'{DAT}/gb_ao_{S}.npy')
ATLAS = json.load(open(f'{DAT}/uv.json', encoding='utf-8'))['atlas_m']; PXM = 0.985 * S / ATLAS; DS = 1.0 / PXM
mat = np.round(idd[..., 0] * 16).astype(np.int8); cls = np.round(idd[..., 1] * 32).astype(np.int8); cov = idd[..., 2] > 0.5
a = (L_ / 2 - pos[..., 1]).astype(np.float32); x = pos[..., 0].astype(np.float32); z = pos[..., 2].astype(np.float32); ax = np.abs(x)
nx, ny, nz = nor[..., 0], nor[..., 1], nor[..., 2]
ao1, ao2, bev = aob[..., 0].copy(), aob[..., 1].copy(), aob[..., 2]
doors = np.isin(cls, (7, 3, 6, 8)); ao1[doors] = np.maximum(ao1[doors], 0.85); ao2[doors] = np.maximum(ao2[doors], 0.85)                     # створки и шар турели: запечены в одном положении, а двигаются - затенения от соседей на них нет
log('данные загружены', S, SCHEME, 'плотность', round(PXM), 'пикс/м')

# ── геометрия (как в tu22_geo.py) ──
FUS_A = np.array([0.0, 0.54, 1.62, 2.97, 4.32, 5.67, 7.02, 8.37, 9.73, 11.35, 12.97, 15.13, 17.83, 20.53, 23.23, 25.93, 29.17, 31.33, 34.04, 36.74, 38.60, 39.50, 40.06])
FUS_W = np.array([0.016, 0.098, 0.278, 0.432, 0.590, 0.712, 0.810, 0.900, 0.985, 1.065, 1.135, 1.212, 1.285, 1.330, 1.318, 1.290, 1.240, 1.180, 1.150, 1.165, 1.080, 0.860, 0.300])
hw = np.interp(a, FUS_A, FUS_W).astype(np.float32)
def LEf(q): return np.where(q >= 1.98, 18.63 + (q - 1.98) * 1.4257, 15.50 + (np.clip(q, 1.05, 1.98) - 1.05) * 3.366).astype(np.float32)
def TEf(q): return np.where(q >= 3.79, 30.08 + (q - 3.79) * 0.7035, 29.50 + (q - 1.20) * 0.224).astype(np.float32)
LEw = LEf(ax); TEw = TEf(ax); CHw = np.maximum(TEw - LEw, 0.5)
wzf = -0.45 - 0.0524 * ax
NAC_X, NAC_Z = 0.95, 1.55
POD_X = 4.25; pzc = -0.45 - 0.0524 * POD_X - 0.33 - 0.06 * np.clip((a - 21.2) / 3.0, 0, 1)
skin_m = mat == 0
nacm = ((cls == 0) & (np.hypot(ax - NAC_X, z - NAC_Z) < 0.86) & (a > 29.4) & (a < 40.4)) | (cls == 8)
podm = (cls == 0) & (((ax - POD_X) / 0.62) ** 2 + ((z - pzc) / 0.70) ** 2 < 1.0) & (a > 21.2) & (a < 32.8)
tipm = (cls == 0) & (ax > 11.25) & (a > 31.0) & (a < 35.8)
wing = (cls == 0) & (ax > hw + 0.05) & (np.abs(z - wzf) < 0.55) & (a > LEw - 0.08) & (a < TEw + 0.08) & ~nacm & ~podm & ~tipm & (z < 0.4)
finm = ((cls == 0) & (ax < 0.36) & (z > 1.95) & (a > 30.0) & ~nacm) | (cls == 2) | (cls == 15) & (z > 5.5)
stabm = cls == 6
planes = wing | stabm | (cls == 4)
fus = (cls == 0) & ~wing & ~nacm & ~finm & ~podm & ~tipm
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
    col = BASE.copy(); rough = np.full((S, S), 0.56 if AGED else 0.46, np.float32); metal = np.where(skin_m, 0.66 if AGED else 0.76, 0.0).astype(np.float32); undm = np.zeros((S, S), np.float32)
    if AGED: col *= 0.93
elif SCHEME == 'milk':
    LB, DB, WH = np.array(PAL['milk'][0], np.float32), np.array(PAL['milk'][1], np.float32), np.array(PAL['milk'][2], np.float32)
    BANDm, EDGEm, GAPm, WFROM = 0.50, 0.13, 0.16, 0.56                                   # размеры узора - как у прежней «Сгущёнки», м
    AAW = 1.3 * DS                                                                          # сглаживание краёв узора: переход на 1,3 пикселя
    def sst(edge, d): return np.clip((edge - d) / AAW + 0.5, 0, 1)[..., None]
    def label(am, b, W, H):
        am = np.mod(am, W); bm = b * H; hy = np.hypot(W, H)
        d = np.minimum(np.abs(am * H - bm * W), np.abs((W - am) * H - bm * W)) / hy
        w1 = np.clip((b - WFROM) * H / AAW + 0.5, 0, 1)[..., None]
        c = LB * (1 - w1) + WH * w1
        wg = sst(BANDm / 2 + EDGEm + GAPm, d) * w1; c = c * (1 - wg) + LB * wg
        we = sst(BANDm / 2 + EDGEm, d); c = c * (1 - we) + WH * we
        wb = sst(BANDm / 2, d); c = c * (1 - wb) + DB * wb
        return c.astype(np.float32)
    FA_ = np.array([0.0, 1.62, 4.32, 7.02, 9.73, 12.97, 17.83, 23.23, 29.17, 34.04, 38.60, 40.06]); FTOP = np.array([-0.574, -0.300, 0.050, 0.420, 0.960, 1.320, 1.430, 1.385, 1.020, 0.815, 0.640, 0.500]); FBOT = np.array([-0.612, -0.862, -1.160, -1.330, -1.400, -1.416, -1.416, -1.395, -1.090, -0.880, -0.690, -0.585])
    BASE = np.broadcast_to(LB, (S, S, 3)).astype(np.float32).copy()
    def around(m, cx_, cz_, r_, W):
        th = np.abs(np.arctan2(x[m] - cx_, z[m] - cz_)); BASE[m] = label(a[m], th / np.pi, W, np.pi * r_)
    ftop = np.interp(a, FA_, FTOP); fbot = np.interp(a, FA_, FBOT); fcz = (ftop + fbot) / 2; fr = np.maximum((ftop - fbot) / 2, 0.15)
    mf = ((cls == 0) & ~wing & ~nacm & ~podm & ~tipm & ~finm) | np.isin(cls, (3, 7))                                       # с фюзеляжем - створки, люки, корпус турели
    th = np.abs(np.arctan2(x[mf], z[mf] - fcz[mf])); BASE[mf] = label(a[mf], th / np.pi, 5.2, np.pi * fr[mf])          # фюзеляж: верх этикетки - хребет
    for sg in (1, -1):
        m = nacm & (sg * x > 0); around(m, sg * NAC_X, NAC_Z, 0.80, 3.6)                                                    # гондолы двигателей
        m = podm & (sg * x > 0); th = np.abs(np.arctan2(x[m] - sg * POD_X, z[m] - pzc[m])); BASE[m] = label(a[m], th / np.pi, 3.6, np.pi * 0.58)   # гондолы шасси
    mw = wing | tipm | stabm | np.isin(cls, (4,))                                                                            # крылья, стабилизатор, закрылки, элероны - по плану
    v_ = ax[mw] - 1.0; BASE[mw] = label(a[mw], np.mod(v_, 4.2) / 4.2, 5.0, np.full(v_.shape, 4.2, np.float32))
    zt, zb = 6.29, 1.90; mfn = finm                                                                                          # киль и руль - сбоку, одна этикетка на высоту
    BASE[mfn] = label(a[mfn], np.clip((zt - z[mfn]) / (zt - zb), 0, 1), 4.2, np.full(int(mfn.sum()), zt - zb, np.float32))
    undm = np.zeros((S, S), np.float32); TOP = BASE
    col = BASE.copy(); rough = np.full((S, S), 0.46, np.float32); metal = np.where(skin_m, 0.04, 0.0).astype(np.float32)       # эмаль с лёгким блеском
else:
    P_ = PAL[SCHEME]; cA, cB, cU = F3(P_[0]), F3(P_[1]), F3(P_[2])
    cv = fbm(0.16, 0.16, 0.22, 3, 211.0, xs=sax); cv2 = fbm(1.2, 1.2, 1.2, 2, 223.0, xs=sax); cv = cv + (cv2 - 0.5) * 0.06
    if SCHEME == 'grey': m2 = smooth(0.50, 0.53, cv)                                              # крупные пятна с мягкой кромкой распылителя (01)
    else: m2 = smooth(0.47, 0.50, cv)
    TOP = cA * (1 - m2[..., None]) + cB * m2[..., None]
    if SCHEME == 'desert':
        cG = F3(P_[3]); m3 = smooth(0.58, 0.61, fbm(0.16, 0.16, 0.22, 3, 227.0, xs=sax)) * (1 - m2); TOP = TOP * (1 - m3[..., None]) + cG * m3[..., None]
    # низ: на фюзеляже ниже линии борта (с волной), на плоскостях - нижняя сторона; на киле нет
    dl = -0.55 + 0.06 * (fbm(0.3, 0.3, 0.3, 2, 233.0) - 0.5)
    und_f = smooth(dl + 0.03, dl - 0.03, z) * (~nacm) + nacm * smooth(-0.30, -0.55, z - NAC_Z)
    und_p = smooth(-0.05, -0.25, nz)
    undm = np.where(planes | podm, und_p, und_f).astype(np.float32); undm = np.where(finm, 0.0, undm); undm = np.where(np.isin(cls, (7,)), 1.0, undm)
    BASE = (TOP * (1 - undm[..., None]) + cU * undm[..., None]).astype(np.float32)
    col = BASE.copy(); rough = np.full((S, S), 0.54, np.float32); metal = np.where(skin_m, 0.04, 0.0).astype(np.float32)
height = np.zeros((S, S), np.float32)

# ── листы: разный тон и блеск по раскрою ──
RING = np.array([4.30, 5.25, 6.30, 7.40, 8.30, 9.60, 10.70, 11.80, 12.90, 14.00, 15.10, 16.20, 17.30, 18.40, 19.50, 20.60, 21.70, 22.80, 23.90, 25.00, 26.10, 27.20, 28.30, 29.40, 30.50, 31.60, 32.70, 33.80, 34.90, 36.00, 37.10, 38.20, 39.30], np.float32)
FZ = np.array([-1.00, -0.40, 0.30, 0.95], np.float32)
WX = np.array([2.60, 3.55, 5.00, 6.20, 7.35, 8.60, 9.80, 10.90], np.float32)
NR = np.array([30.25, 31.60, 33.10, 34.70, 36.30, 37.90, 39.30], np.float32)
PR = np.array([23.2, 25.2, 27.4, 29.6, 31.4], np.float32)
ri = np.searchsorted(RING, a); wi_ = np.searchsorted(WX, ax); zi = np.searchsorted(FZ, z); ni_ = np.searchsorted(NR, a); pi_ = np.searchsorted(PR, a)
nphi = np.arctan2(x - np.sign(x) * NAC_X, z - NAC_Z); nang = np.floor((nphi + np.pi) / (np.pi / 3)).astype(np.int32)
wch = np.clip(np.floor((a - LEw) / CHw * 3.3), 0, 3).astype(np.int32)
tt = np.random.RandomState(7).uniform(0.955, 1.045, 1024).astype(np.float32); rt = np.random.RandomState(8).uniform(-0.08, 0.08, 1024).astype(np.float32); hh = np.random.RandomState(9).uniform(-0.014, 0.014, 1024).astype(np.float32)
pid = np.where(wing, ri * 3 + wi_ * 11 + wch * 37 + (x > 0) * 101 + (nz > 0) * 211 + 7, np.where(nacm, ni_ * 17 + nang * 5 + (x > 0) * 401 + 19, np.where(podm, pi_ * 23 + (x > 0) * 43 + (nz > 0) * 61 + 29, ri * 13 + zi * 5 + (x > 0) * 307 + 3))) % 1024
for c_, sd in ((2, 21), (4, 27), (6, 29), (7, 31), (15, 41)):
    k_ = (sd * 17 + (x > 0).astype(np.int32) * 3 + np.floor(a / 1.4).astype(np.int32) * 5 + np.floor(ax / 1.5).astype(np.int32) * 7) % 1024
    pid = np.where(cls == c_, k_, pid)
pid = np.where(cls == 3, 517, pid)
kt = 1.0 if METAL else 0.55
col *= (1 + (tt[pid] - 1) * kt)[..., None]; col[..., 0] *= 1 + hh[pid] * kt; col[..., 2] *= 1 - hh[pid] * kt; rough += rt[pid] * (1.0 if METAL else 0.6)
if METAL:
    dark_sheet = (np.random.RandomState(11).uniform(0, 1, 1024) < (0.16 if AGED else 0.10))[pid] & skin_m
    col = mix(col, C_AL * 0.86, dark_sheet * 0.55); rough += dark_sheet * 0.08
    pol_sheet = (np.random.RandomState(12).uniform(0, 1, 1024) < 0.12)[pid] & skin_m & ~dark_sheet
    col = mix(col, C_AL * 1.05, pol_sheet * 0.5); rough -= pol_sheet * 0.12; metal += pol_sheet * 0.08
log('листы')

# ── швы, лючки, заклёпки ──
seamd = np.full((S, S), 9.0, np.float32); hedge = np.full((S, S), 9.0, np.float32)
def seam(m, d): seamd[m] = np.minimum(seamd[m], d[m])
for r_ in RING: seam(skin_m & fus & (a > 4.2) & (a < 39.5), np.abs(a - r_))
for q_ in FZ: seam(fus & skin_m & side_ & (a > 4.3) & (a < 39.4), np.abs(z - q_))
seam(fus & skin_m & (top_ | bot_) & (a > 4.3) & (a < 39.4), np.abs(ax - 0.45))
for q_ in WX: seam(wing & skin_m, np.abs(ax - q_))
seam(wing & skin_m, np.abs(a - (LEw + 0.12 * CHw))); seam(wing & skin_m, np.abs(a - (LEw + 0.50 * CHw)))
for r_ in NR: seam(nacm & skin_m, np.abs(a - r_))
for ph_ in (-2.1, -0.9, 0.0, 0.9, 2.1): seam(nacm & skin_m & (a > 30.3), np.abs(np.angle(np.exp(1j * (nphi - ph_)))) * 0.80)
for r_ in PR: seam(podm & skin_m, np.abs(a - r_))
seam(podm & skin_m & bot_, np.abs(ax - POD_X))
FLE = lambda zz: 32.54 + (38.48 - 32.54) * (zz - 2.35) / (6.29 - 2.35)
seam(finm & skin_m & (z > 2.4), np.abs(a - (FLE(z) + 0.55)) * 0.8); seam(finm & skin_m, np.abs(z - 3.40)); seam(finm & skin_m, np.abs(z - 4.60)); seam(finm & skin_m, np.abs(z - 5.60))
STLE = lambda q: 35.00 + (q - 1.0) * 1.3224
seam(stabm & skin_m, np.abs(ax - 2.3)); seam(stabm & skin_m, np.abs(ax - 3.6)); seam(stabm & skin_m, np.abs(a - (STLE(ax) + 0.35)))
pr = np.random.RandomState(53)
def hatch(A, Q, a0, a1, q0, q1, vm, tone=1.0):
    ins = vm & (A > a0) & (A < a1) & (Q > q0) & (Q < q1) & skin_m
    d = np.minimum.reduce([A - a0, a1 - A, Q - q0, q1 - Q]); hedge[ins] = np.minimum(hedge[ins], d[ins]); col[ins] *= tone; rough[ins] -= 0.03
for k in range(110):                                                                                    # лючки по бортам фюзеляжа (02, 10: много мелких)
    sg = 1 if k % 2 else -1; a0 = pr.uniform(4.6, 39.0); w_ = pr.uniform(0.15, 0.55); z0 = pr.uniform(-1.1, 0.95); h_ = pr.uniform(0.10, 0.30)
    hatch(a, z, a0, a0 + w_, z0, z0 + h_, fus & side_ & (sg * x > 0), pr.uniform(0.985, 1.02))
for k in range(55):                                                                                     # снизу фюзеляжа (кроме отсека и ниш)
    a0 = pr.uniform(4.6, 38.5); w_ = pr.uniform(0.15, 0.50); q0 = pr.uniform(-0.55, 0.40); h_ = pr.uniform(0.12, 0.30)
    if 16.4 < a0 < 24.6 or 9.0 < a0 < 13.0: continue
    hatch(a, x, a0, a0 + w_, q0, q0 + h_, fus & bot_, pr.uniform(0.985, 1.02))
for k in range(30):                                                                                     # сверху фюзеляжа
    a0 = pr.uniform(11.0, 29.0); w_ = pr.uniform(0.15, 0.50); q0 = pr.uniform(-0.45, 0.30); h_ = pr.uniform(0.12, 0.30)
    hatch(a, x, a0, a0 + w_, q0, q0 + h_, fus & top_, pr.uniform(0.985, 1.02))
for k in range(40):                                                                                     # капоты гондол (10: продольные панели и лючки)
    sg = 1 if k % 2 else -1; a0 = pr.uniform(30.6, 39.0); w_ = pr.uniform(0.18, 0.50); q0 = pr.uniform(-2.0, 2.0); h_ = pr.uniform(0.12, 0.28)
    hatch(a, nphi, a0, a0 + w_, q0, q0 + h_ / 0.80, nacm & (sg * x > 0), pr.uniform(0.985, 1.02))
for k in range(90):                                                                                     # крыло, больше снизу
    sg = 1 if k % 2 else -1; xr = pr.uniform(1.6, 10.6); le = float(LEf(np.float32(xr))); ch = float(TEf(np.float32(xr))) - le
    a0 = pr.uniform(le + 0.15 * ch, le + 0.60 * ch); w_ = pr.uniform(0.18, 0.55); h_ = pr.uniform(0.15, 0.45)
    hatch(a, sg * x, a0, a0 + w_, xr, xr + h_, wing & (bot_ if k % 3 else top_), pr.uniform(0.98, 1.025))
PITCH = 0.050; RV = max(0.006, 0.85 * DS)
near = (seamd < 0.06) & skin_m
along = np.where(wing, np.where(np.abs(seamd - np.min(np.abs(ax[..., None] - WX[None, None, :]), -1)) < 1e-3, a, ax), np.where(nacm, a + np.abs(nphi), np.where(fus & side_, a + z, a + ax)))
ph = (along / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH
riv = np.where(near, np.clip(1 - np.hypot(dph, np.abs(seamd - 0.024)) / RV, 0, 1), 0.0).astype(np.float32)
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
for k in range(int(300 * (1.3 if AGED else 1.0))):
    sg = 1 if k % 2 else -1; kind = k % 5
    if kind in (0, 1): xr = pr.uniform(1.6, 10.6); a0 = float(LEf(np.float32(xr))) + pr.uniform(0.4, 4.5); q0 = xr; mm = wing & bot_ & (sg * x > 0); Q = ax
    elif kind == 2: a0 = pr.uniform(5.0, 39.0); q0 = pr.uniform(-0.45, 0.45); mm = fus & bot_; Q = x
    elif kind == 3: a0 = pr.uniform(4.5, 38.5); q0 = pr.uniform(-1.1, 0.9); mm = fus & side_ & (sg * x > 0); Q = z
    else: a0 = pr.uniform(22.5, 31.0); q0 = POD_X + pr.uniform(-0.3, 0.3); mm = podm & (sg * x > 0); Q = ax
    ln = pr.uniform(0.6, 3.2); wd = pr.uniform(0.03, 0.10)
    d_ = (a - a0) / ln; lat = np.abs(Q - q0) / wd; t_ = mm & (d_ > 0) & (d_ < 1) & (lat < 1)
    aft[t_] = np.maximum(aft[t_], ((1 - d_[t_]) ** 1.4) * (1 - lat[t_] ** 2))
flow_ = aft * (0.5 + 0.5 * smooth(0.3, 0.8, lk12))
col = mix(col, (0.30, 0.295, 0.28) if METAL else (0.26, 0.255, 0.24), flow_ * (0.45 if METAL else 0.22) * WK ** 0.5 * DIRT * skin_m); rough += flow_ * 0.10
rain = smooth(0.45, 0.85, lk12) * np.abs(nx) ** 2 * skin_m * smooth(0.40, 0.70, fbm(0.5, 0.5, 0.5, 3, 331.0)); col = mix(col, (0.16, 0.155, 0.15), rain * 0.22 * WK * DIRT); rough += rain * 0.06
rust = np.zeros((S, S), np.float32)                                                                       # ржавые потёки от дренажей и винтов
for a0, q0, ln, wd, sgn, onw in ((25.6, 4.25, 2.2, 0.08, 1, 1), (26.0, 4.10, 1.6, 0.06, -1, 1), (30.4, 0.10, 1.8, 0.06, 1, 0), (14.8, -0.20, 1.4, 0.05, 1, 0), (24.6, 0.30, 1.6, 0.06, 1, 0),
                               (27.5, 6.6, 1.2, 0.05, -1, 1), (28.0, 8.4, 1.0, 0.05, 1, 1), (36.9, 0.05, 1.3, 0.05, 1, 0), (8.6, -0.15, 1.6, 0.05, 1, 0), (32.6, 1.1, 2.0, 0.06, -1, 1)):
    d_ = (a - a0) / ln; lat = np.abs((ax if onw else x) - q0) / wd; t_ = bot_ & skin_m & ((sgn * x > 0) if onw else True) & (d_ > 0) & (d_ < 1) & (lat < 1)
    rust[t_] = np.maximum(rust[t_], ((1 - d_[t_]) ** 1.2) * (1 - lat[t_] ** 2) * (0.55 + 0.45 * smooth(0.3, 0.8, lk17[t_])))
col = mix(col, (0.50, 0.33, 0.18), rust * (0.60 if METAL else 0.45) * DIRT); rough += rust * 0.18; metal -= rust * 0.5
if METAL:
    lowstreak = side_ * fus * smooth(-0.2, -1.1, z) * smooth(0.35, 0.75, lk17) * smooth(0.30, 0.65, fbm(0.4, 3.0, 3.0, 3, 371.0)) * skin_m      # тёмные разводы по низу бортов (10)
    col = mix(col, (0.24, 0.235, 0.22), lowstreak * 0.40 * WK ** 0.5); rough += lowstreak * 0.10
    yel = smooth(0.55, 0.85, lk17) * bot_ * skin_m * smooth(15.0, 18.0, a) * smooth(34.0, 30.0, a) * smooth(0.6, 0.9, patch)
    col = mix(col, (0.62, 0.58, 0.42), yel * 0.28)
if AGED:                                                                                                    # окисел пятнами, белая коррозия у заклёпок и швов (07, 09)
    ox = smooth(0.45, 0.80, fbm(0.7, 0.7, 0.7, 4, 401.0)) * skin_m; col = mix(col, (0.56, 0.57, 0.55), ox * 0.35); rough += ox * 0.18; metal -= ox * 0.25
    wcor = (smooth(0.0, 0.6, riv) + smooth(0.03, 0.0, seamd) * 0.6) * smooth(0.50, 0.80, fbm(6.0, 6.0, 6.0, 3, 403.0)) * skin_m
    col = mix(col, (0.80, 0.80, 0.77), np.clip(wcor, 0, 1) * 0.55); rough += np.clip(wcor, 0, 1) * 0.2
    lich = smooth(0.70, 0.86, fbm(2.2, 2.2, 2.2, 4, 407.0)) * smooth(0.2, 0.9, nz) * skin_m                 # лишайник сверху (07: на шаре)
    col = mix(col, (0.52, 0.53, 0.36), lich * 0.45); rough += lich * 0.2; metal -= lich * 0.6
under = smooth(-0.15, -0.75, nz)
oil = under * smooth(0.48, 0.72, fbm(1.0, 4.0, 4.0, 4, 23.0)) * skin_m; col = mix(col, (0.20, 0.19, 0.17), oil * 0.12 * WK * DIRT); rough += oil * 0.10
ost = fbm(0.35, 9.0, 9.0, 4, 341.0)                                                                       # масло и гидравлика: назад от ниш стоек, за отсеком и контейнером парашютов
om_ = under * (podm * smooth(24.5, 25.2, a) * smooth(32.6, 29.8, a) * np.exp(-((ax - POD_X) / 0.35) ** 2) + fus * smooth(12.6, 13.0, a) * smooth(16.0, 13.4, a) * np.exp(-(x / 0.35) ** 2)
              + fus * smooth(24.2, 24.6, a) * smooth(28.5, 25.0, a) * np.exp(-(x / 0.45) ** 2) + fus * smooth(36.6, 37.0, a) * smooth(40.0, 37.6, a) * np.exp(-(x / 0.30) ** 2)) * smooth(0.40, 0.66, ost)
col = mix(col, (0.085, 0.075, 0.062), np.clip(om_, 0, 1) * (0.50 if METAL else 0.36) * DIRT * skin_m); rough -= np.clip(om_, 0, 1) * 0.20 * skin_m
dust = smooth(0.55, 0.95, nz) * smooth(0.42, 0.70, fbm(0.8, 0.8, 0.8, 4, 351.0)) * skin_m; col = mix(col, (0.52, 0.49, 0.43), dust * (0.08 if METAL else 0.12) * WK * DIRT); rough += dust * 0.08
mud = under * smooth(-1.0, -1.35, z) * smooth(0.40, 0.75, fbm(1.8, 1.8, 1.8, 3, 361.0)) * skin_m * (fus | podm); col = mix(col, (0.30, 0.27, 0.22), mud * 0.20 * WK * DIRT); rough += mud * 0.12
log('потёки, масло')

# ── копоть: хвосты гондол, корма между соплами, кормовая установка ──
est = fbm(0.45, 6.0, 6.0, 4, 311.0)
nozm = nacm * smooth(38.9, 40.1, a); col = mix(col, (0.10, 0.095, 0.09), nozm * (0.40 + 0.35 * smooth(0.30, 0.70, est))); rough += nozm * 0.22; metal -= nozm * 0.4
rear = (fus | finm) * smooth(38.4, 39.9, a) * smooth(0.2, 0.9, z) * smooth(2.5, 1.9, z) * smooth(0.75, 0.35, ax) * smooth(0.36, 0.70, est) * 0.55                 # между соплами и над шаром - нагар от струй
col = mix(col, (0.11, 0.105, 0.10), np.clip(rear, 0, 1)); rough += np.clip(rear, 0, 1) * 0.15
if METAL:                                                                                                  # побежалость на хвосте гондолы
    straw = nacm * smooth(38.2, 39.0, a) * smooth(40.0, 39.4, a) * (0.5 + 0.5 * est); col = mix(col, (0.62, 0.53, 0.36), straw * 0.35)
tur = np.isin(cls, (3, 5)); tsoot = tur * smooth(0.0, -0.6, ny) * (0.4 + 0.6 * smooth(0.3, 0.7, est)) * 0.55
col = mix(col, (0.10, 0.095, 0.09), tsoot); rough += tsoot * 0.15
log('копоть')

# ── кромки, сколы, тропы ──
dle = a - LEw
LEm = smooth(0.18, 0.02, dle) * smooth(-0.03, 0.02, dle) * wing
LEm = LEm + stabm * smooth(0.14, 0.02, a - STLE(ax)) + finm * (z > 2.4) * smooth(0.14, 0.02, a - FLE(z))
LEm = np.clip(LEm, 0, 1)
edge = smooth(0.985, 0.90, bev) * skin_m
movm = np.isin(cls, (2, 3, 4, 6, 7, 8))
if METAL:
    col = mix(col, C_AL * 1.10, LEm * 0.40); rough -= LEm * 0.12
    chip = np.clip(edge * smooth(0.60, 0.80, sc3) + LEm * smooth(0.55, 0.75, sc5) * 0.6, 0, 1) * np.where(movm, 0.3, 1.0)
    col = mix(col, C_AL * 1.14, chip * 0.6); rough = rough * (1 - chip * 0.5) + 0.22 * chip * 0.5
else:
    eros = smooth(0.46, 0.60, fbm(9.0, 9.0, 9.0, 3, 37.0))
    walk = (smooth(20.0, 20.4, a) * smooth(28.5, 28.0, a) * smooth(1.5, 1.7, ax) * smooth(3.4, 3.1, ax) * wing * top_
            + fus * top_ * np.exp(-(x / 0.30) ** 2) * smooth(9.5, 10.0, a) * smooth(28.0, 27.0, a)) * smooth(0.40, 0.66, fbm(2.2, 2.2, 2.2, 3, 53.0))
    dmg = np.clip(edge * smooth(0.52, 0.66, fbm(14.0, 14.0, 14.0, 3, 41.0)) + LEm * smooth(0.62, 0.76, eros) * 0.9 + smooth(0.020, 0.004, hedge) * smooth(0.60, 0.72, fbm(22.0, 22.0, 22.0, 3, 43.0)) * 0.7
                  + walk * smooth(0.45, 0.75, sc3) * 0.9, 0, 1) * np.where(movm, 0.35, 1.0) * skin_m
    prim = smooth(0.20, 0.42, dmg) * 0.55; bare = smooth(0.50, 0.88, dmg)
    col = mix(col, (0.47, 0.50, 0.40), prim)
    col = mix(col, C_AL * 1.04, bare); rough = rough * (1 - bare) + 0.30 * bare; metal = np.maximum(metal, bare * 0.85)
    col = mix(col, BASE * 1.06, walk * 0.20); rough -= walk * 0.10
crev = smooth(0.75, 0.30, ao1) * skin_m; col = mix(col, (0.16, 0.16, 0.16), crev * 0.40); rough += crev * 0.14
col *= (0.88 + 0.12 * smooth(0.15, 0.95, ao2))[..., None]
hair = smooth(max(0.008, 1.0 * DS), 0.002, seamd) * skin_m; col *= (1 - (0.14 if METAL else 0.11) * hair)[..., None]
grime = smooth(0.08, 0.0, np.minimum(seamd, hedge)) * smooth(0.35, 0.8, si13) * skin_m; col = mix(col, (0.25, 0.25, 0.24), grime * 0.22 * WK * DIRT)
col *= (1 - smooth(0.0, 0.5, riv) * 0.06 * skin_m)[..., None]
log('кромки')

# ── зоны другого цвета: обтекатель РЛС в носу, наконечник киля, губы заборников ──
rdm = (cls == 0) & skin_m & (a < 4.25) & (np.abs(x) < 0.7)
col = mix(col, (0.58, 0.59, 0.58) if METAL else BASE * 0.97, rdm * 0.85); rough = np.where(rdm, 0.50, rough); metal = np.where(rdm, 0.0, metal)      # радиопрозрачный нос: крашен серебрянкой, без металла
ftip = finm & (z > 6.17); col = mix(col, (0.22, 0.23, 0.23), ftip * 0.9); rough = np.where(ftip, 0.62, rough); metal = np.where(ftip, 0.0, metal)
lip = (cls == 8) & skin_m; col = mix(col, C_AL * 1.06, lip * (1.0 if METAL else 0.85)); rough = np.where(lip, 0.30, rough); metal = np.where(lip, 0.9, metal)
log('зоны')

# ── знаки и трафареты (свои) ──
FNB = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'; FNN = '/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf'
INK = (24, 26, 30, 255); RED = (178, 30, 28, 255); WHITE = (234, 236, 234, 255); YEL = (214, 172, 28, 255)
NUMC = (178, 30, 28, 255)
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
ST = star(); NUM = '37'                                          # номер придуман
HULL = (-1.45, 1.45)
INKS = (32, 34, 36, 255) if SCHEME in ('metal', 'grey', 'aged', 'desert') else (226, 228, 224, 255)
for sd in ('r', 'l'):
    stamp(ST, 37.56, 4.00, 1.35, 1.35, sd, cl=(0, 2), alpha=0.96)                                           # звезда на киле: центр площади киля с рулём над гондолами (Mark 2026-11-13: «не оцентрована»)
    stamp(text_img(NUM, 300, ink=NUMC, outline=WHITE), 12.10, -0.05, 1.00, 0.78, sd, alpha=0.95, xr=HULL)   # номер на борту за кабиной (05)
    stamp(text_img(NUM, 300, ink=NUMC, outline=WHITE), 38.95, 5.55, 0.42, 0.32, sd, cl=(0, 2), alpha=0.92)  # номер на верхушке киля (05)
    stamp(tri_warn(), 5.40, -0.55, 0.18, 0.18, sd, alpha=0.95, xr=HULL)                                     # катапульта штурмана
    stamp(tri_warn(), 8.20, 0.55, 0.18, 0.18, sd, alpha=0.95, xr=HULL)                                      # катапульта лётчика
    stamp(tri_warn(), 13.70, 0.80, 0.18, 0.18, sd, alpha=0.95, xr=HULL)                                     # катапульта оператора
    stamp(arrow_img(), 7.10, 0.15, 0.50, 0.13, sd, alpha=0.9, rough_to=0.5, xr=HULL)                        # стрелка у фонаря
    stamp(arrow_img(ink=YEL), 13.20, -0.70, 0.44, 0.12, sd, alpha=0.9, rough_to=0.5, xr=HULL)                # у люка оператора
    stamp(text_img('НЕ ТОЛКАТЬ', 110, ink=INKS, font=FNN), 39.40, 3.20, 0.50, 0.08, sd, cl=(2,), alpha=0.80)
    k_ = 0
    for ac_, zc_, w_, h_ in ((2.40, -0.40, 0.30, 0.14), (6.60, -0.70, 0.28, 0.13), (10.2, 0.40, 0.34, 0.15), (15.5, -0.60, 0.34, 0.15), (19.8, 0.50, 0.30, 0.14), (24.5, 0.35, 0.32, 0.15),
                             (28.2, 0.25, 0.30, 0.14), (33.0, -0.40, 0.30, 0.14), (37.6, 0.05, 0.28, 0.13)):
        k_ += 1; stamp(block_img(seed=k_ + (0 if sd == 'r' else 20), ink=INKS), ac_, zc_, w_, h_, sd, alpha=0.78, xr=HULL)
    for ac_, s_ in ((32.6, 51), (36.2, 53)): stamp(block_img(seed=s_ + (sd == 'l'), ink=INKS), ac_, 1.55, 0.30, 0.14, sd, alpha=0.75, cl=(0,), xr=(-2.0, 2.0))   # на гондолах
for sg in (1, -1):                                                                                           # звёзды на крыле сверху и снизу у середины консоли (05)
    XS_ = 7.80; AS_ = float((LEf(np.float32(XS_)) + TEf(np.float32(XS_))) / 2)                            # середина внешней консоли (гондола 4,25 - конец 11,3) и середина хорды (Mark: по центру)
    stamp(ST, AS_, sg * XS_, 1.55, 1.55, 'top', along=False, alpha=0.96, cl=(0, 4))
    stamp(star(up=False), AS_, sg * XS_, 1.55, 1.55, 'bot', along=False, alpha=0.96, cl=(0, 4))
    for ac_, xc_ in ((23.2, 2.6), (26.4, 5.4), (29.4, 8.0)): stamp(ring_img(), ac_, sg * xc_, 0.17, 0.17, 'top', along=False, alpha=0.92)      # заливные горловины
    for ac_, xc_, s_ in ((27.6, 2.2, 3), (28.6, 4.9, 5), (31.8, 7.4, 7), (39.6, 2.4, 9)): stamp(block_img(seed=s_ + (sg > 0), ink=INKS), ac_, sg * xc_, 0.30, 0.14, 'top', along=False, alpha=0.72, cl=(0, 4, 6))
    for ac_, xc_, s_ in ((25.0, 2.8, 11), (28.0, 6.0, 13), (30.9, 9.6, 15)): stamp(block_img(seed=s_ + (sg > 0), ink=INKS), ac_, sg * xc_, 0.30, 0.14, 'bot', along=False, alpha=0.72, cl=(0, 4))
    stamp(text_img('НЕ СТУПАТЬ', 110, ink=INKS, font=FNN), 28.7, sg * 2.10, 0.75, 0.12, 'top', along=False, alpha=0.75, cl=(0, 4))
    stamp(text_img('НЕ СТУПАТЬ', 110, ink=INKS, font=FNN), 30.4, sg * 6.10, 0.75, 0.12, 'top', along=False, alpha=0.75, cl=(0, 4))
    stamp(text_img('НЕ СТУПАТЬ', 110, ink=INKS, font=FNN), 39.2, sg * 2.60, 0.55, 0.09, 'top', along=False, alpha=0.72, cl=(6,))
for ac_ in (15.4, 18.2, 25.8): stamp(ring_img(), ac_, 0.0, 0.17, 0.17, 'top', along=False, alpha=0.92)
log('знаки', len(MARKS))

# ── материалы без краски обшивки ──
def solid(m, c, r, me=0.0, nz_=0.08):
    col[m] = np.array(c, np.float32) * (1 - nz_ / 2 + nz_ * fine[m])[..., None]; rough[m] = r; metal[m] = me
solid(mat == 10, (0.20, 0.21, 0.22), 0.85); solid(mat == 2, (0.030, 0.030, 0.032), 0.9); solid(mat == 4, (0.050, 0.050, 0.053), 0.88)
solid(mat == 5, (0.24, 0.255, 0.25), 0.66, 0, 0.16); solid(mat == 6, (0.30, 0.31, 0.22), 0.92, 0, 0.2); solid(mat == 8, (0.30, 0.28, 0.21), 0.9, 0, 0.14)
solid(mat == 7, (0.018, 0.038, 0.032), 0.12); solid(mat == 9, (0.74, 0.60, 0.06), 0.42)
bayw = (mat == 5) & (cls == 0) & (a > 16.5) & (a < 24.5) & (z < 0.0); solid(bayw, (0.43, 0.47, 0.41), 0.6, 0.1, 0.12)          # стенки отсека: серо-зелёный грунт
bi = cls == 14; solid(bi & (mat == 5), (0.40, 0.44, 0.38), 0.62, 0.1, 0.14); solid(bi & (mat == 1), (0.36, 0.37, 0.36), 0.45, 0.8, 0.12)
col[bi | bayw] *= (0.55 + 0.45 * smooth(0.15, 0.95, ao2[bi | bayw]))[..., None]
probe_ = (cls == 0) & (mat == 1); solid(probe_, (0.55, 0.555, 0.55), 0.30, 0.95, 0.06)                                   # штанга дозаправки - полированная
solid((mat == 1) & ~probe_, (0.42, 0.42, 0.42), 0.40, 0.9, 0.10)
tn = fbm(1.2, 4.0, 4.0, 4, 59.0)
duct = mat == 11; ia_ = np.clip((a - 30.25) / 1.8, 0, 1); hot = a > 38.0
col[duct] = np.where(hot[duct, None], np.array((0.10, 0.095, 0.09), np.float32) * (0.8 + 0.4 * tn[duct, None]), np.array((0.52, 0.53, 0.53), np.float32)[None] * (0.25 + 0.75 * (1 - ia_[duct]))[:, None]); rough[duct] = np.where(hot[duct], 0.75, 0.55); metal[duct] = 0.5
core = (cls == 10) & (mat == 1)
cone = core & (a < 33.0); col[cone] = np.array((0.46, 0.46, 0.45), np.float32) * (0.85 + 0.3 * tn[cone, None]); rough[cone] = 0.45; metal[cone] = 0.9    # кок компрессора
petal = core & (a > 39.5); pt = smooth(40.15, 40.42, a)
col[petal] = (np.array((0.30, 0.28, 0.25), np.float32) * (1 - pt[petal, None]) + np.array((0.16, 0.15, 0.17), np.float32) * pt[petal, None]) * (0.75 + 0.4 * tn[petal, None]); metal[petal] = 0.85; rough[petal] = 0.55   # створки сопла: побежалость к срезу (07)
gun = cls == 5; solid(gun & (mat == 1), (0.13, 0.13, 0.135), 0.42, 0.85, 0.12)
gr_ = cls == 12; g_p = gr_ & (mat == 0); g_c = gr_ & (mat == 1); g_s = gr_ & (mat == 8)
gm1 = fbm(2.4, 2.4, 2.4, 4, 91.0); gm2 = fbm(18.0, 18.0, 18.0, 3, 93.0); gst = fbm(1.0, 16.0, 2.2, 4, 87.0)
solid(g_p, (0.56, 0.57, 0.56), 0.48, 0.35, 0.10); solid(g_c, (0.50, 0.50, 0.49), 0.28, 0.9, 0.06); solid(g_s, (0.16, 0.155, 0.15), 0.56, 0.75, 0.14)
GZ = -3.89
hub = gr_ & (mat == 1) & ((np.hypot(a - 26.025, z - (GZ + 0.52)) < 0.30) | (np.hypot(a - 27.375, z - (GZ + 0.52)) < 0.30) | (np.hypot(a - 11.5, z - (GZ + 0.42)) < 0.24))
solid(hub, (0.24, 0.34, 0.24), 0.50, 0.15, 0.10)                                                             # диски колёс зелёные
col[g_p] *= (0.84 + 0.30 * gm1[g_p])[..., None]
goil = smooth(0.46, 0.68, gst) * (g_p | g_c); col = mix(col, (0.15, 0.125, 0.095), goil * 0.50); rough += goil * 0.15 * g_p
gd = smooth(-2.6, -3.7, z) * gr_; col = mix(col, (0.26, 0.23, 0.19), gd * 0.50 * (g_p | g_s | hub)); rough += gd * 0.15 * g_p
tyr = (mat == 4); col = mix(col, (0.17, 0.16, 0.145), smooth(0.40, 0.68, gm2) * tyr * 0.45); col = mix(col, (0.21, 0.19, 0.16), smooth(GZ + 0.25, GZ, z) * tyr * 0.45)
col[gr_] *= (0.55 + 0.45 * smooth(0.15, 0.95, ao2[gr_]))[..., None]
door_in = (cls == 7) & (nz > 0.2) & (z < 0.5); solid(door_in, (0.43, 0.47, 0.41), 0.58, 0.1, 0.14)                                # изнанка створок и люков - грунт
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
Image.fromarray(lift(col)[::-1]).save(f'{OUT}/tu22_color.png', compress_level=1)
Image.fromarray(lift(nn * 0.5 + 0.5)[::-1]).save(f'{OUT}/tu22_normal.png', compress_level=1)
Image.fromarray(lift(np.stack([occ, rough, metal], -1))[::-1]).save(f'{OUT}/tu22_orm.png', compress_level=1)
for nm_, pm in (('верх', skin_m & cov & (cls == 0) & (nz > 0.3) & (a > 5.0)), ('борт', skin_m & cov & fus & side_ & (a > 5.0)), ('низ', skin_m & cov & (cls == 0) & (nz < -0.3) & (a > 5.0))):
    print('средний цвет обшивки,', nm_, 'sRGB', (np.clip(col[pm], 0, 1) * 255).mean(0).round(1), 'шероховатость', round(float(rough[pm].mean()), 3), 'металл', round(float(metal[pm].mean()), 3))
log('сохранено', OUT)
if os.environ.get('TU_PREV'):
    K = 30.0
    def plan(name, keep, U, V, D, w, h, lv):
        ii = np.nonzero(keep & cov); u_ = ((U[ii] + w / 2) * K).astype(int); v_ = ((V[ii]) * K).astype(int); d_ = D[ii]
        W_, H_ = int(w * K) + 2, int(h * K) + 2; ok = (u_ >= 0) & (u_ < W_) & (v_ >= 0) & (v_ < H_); u_, v_, d_ = u_[ok], v_[ok], d_[ok]
        c_ = col[ii][ok] * (0.55 + 0.45 * np.clip(nor[ii][ok] @ np.array(lv), 0, 1))[:, None]
        o_ = np.argsort(d_); im = np.full((H_, W_, 3), 0.8, np.float32); im[v_[o_], u_[o_]] = c_[o_]
        Image.fromarray(lift(im)).save(os.path.join(OUT, name))
    plan('план_сверху.png', nz > -0.05, x, a, z, 24.0, 41.8, [0.3, 0.2, 0.93])
    plan('план_снизу.png', nz < 0.05, -x, a, -z, 24.0, 41.8, [0.3, 0.2, -0.93])
    log('планы')
