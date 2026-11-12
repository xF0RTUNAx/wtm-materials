# paint.py - краска A-10A из данных gbuf.py: цвет (только краска и грязь, без света), нормали, карта блеска glTF (R затенение, G шероховатость, B металл). Без Blender: /usr/bin/python3 -I paint.py
# A10_TEX=2048|4096, A10_OUT=<папка>, A10_SCHEME=grey|green. Серая: светло-серый низ и борта, более тёмный серый верх, ложный фонарь снизу (a10_03, 07). Зелёная: два зелёных и тёмно-серый кругом (a10_04, 05).
# Пятна камуфляжа свои (шум), пиксели фото не используются, знаки нарисованы здесь, код на киле и номера придуманы. Маски износа - ambientCG CC0 (Свои/_текстуры_CC0).
import json, math, os, site, sys, time, types
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image, ImageDraw, ImageFont
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__)); DAT = os.path.join(HERE, '_проба'); CC0 = os.path.join(HERE, '..', '_текстуры_CC0')
S = int(os.environ.get('A10_TEX', '2048')); SCHEME = os.environ.get('A10_SCHEME', 'grey'); OUT = os.environ.get('A10_OUT', os.path.join(DAT, SCHEME)); os.makedirs(OUT, exist_ok=True)
env3 = lambda k, d: np.array([float(v) for v in os.environ.get(k, d).split(',')], np.float32)
C_LG = env3('A10_LG', '0.570,0.600,0.625'); C_DG = env3('A10_DG', '0.455,0.480,0.505'); C_FC = env3('A10_FC', '0.300,0.315,0.335')            # серая схема: светлый, тёмный верх, ложный фонарь
C_G1 = env3('A10_G1', '0.235,0.285,0.190'); C_G2 = env3('A10_G2', '0.375,0.420,0.285'); C_G3 = env3('A10_G3', '0.250,0.265,0.280')            # зелёная схема: тёмно-зелёный, оливковый, тёмно-серый
GREEN = SCHEME in ('green', 'green2', 'mottle'); COL0 = C_G1 if GREEN else C_LG       # GREEN - тёмные схемы: чёрные знаки, сильнее выгорание
PAL = {'sand': ((0.640, 0.585, 0.455), (0.545, 0.480, 0.360)), 'winter': ((0.730, 0.750, 0.760), (0.300, 0.340, 0.315), (0.520, 0.550, 0.570)), 'mottle': ((0.500, 0.440, 0.310), (0.250, 0.300, 0.185), (0.320, 0.245, 0.170))}
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f} с]', *a, flush=True)
L2 = 8.06; ZA = 2.26; XK = 2.60; NAC_X, NAC_Z = 1.45, 0.83; FIN_X = 2.93
pos = np.load(f'{DAT}/gb_pos_{S}.npy'); nor = np.load(f'{DAT}/gb_nor_{S}.npy'); idd = np.load(f'{DAT}/gb_id_{S}.npy'); aob = np.load(f'{DAT}/gb_ao_{S}.npy')
ATLAS = json.load(open(f'{DAT}/uv.json', encoding='utf-8'))['atlas_m']; PXM = 0.985 * S / ATLAS; DS = 1.0 / PXM
mat = np.round(idd[..., 0] * 16).astype(np.int8); cls = np.round(idd[..., 1] * 32).astype(np.int8); cov = idd[..., 2] > 0.5
a = (L2 - pos[..., 1]).astype(np.float32); x = pos[..., 0].astype(np.float32); z = pos[..., 2].astype(np.float32); ax = np.abs(x)
nx, ny, nz = nor[..., 0], nor[..., 1], nor[..., 2]
ao1, ao2, bev = aob[..., 0], aob[..., 1], aob[..., 2]
ao1 = np.where(cls == 7, 1.0, ao1); ao2 = np.where(cls == 7, 1.0, ao2)     # створки запекались закрытыми, сквозь них проходят стойки: иначе на открытой створке тёмный отпечаток
log('данные загружены', S, 'плотность', round(PXM), 'пикс/м')
# линии разделки: те же, что режет геометрия
src = open(os.path.join(HERE, 'a10_detail.py'), encoding='utf-8').read()
LE0f = lambda x_: np.interp(x_, [0.0, 2.6, 8.78], [6.76, 6.76, 7.24]); TEf = lambda x_: np.interp(x_, [0.0, 2.6, 8.78], [9.90, 9.84, 9.33])
ns = {'g': types.SimpleNamespace(LE0=LE0f, HINGE_F=lambda x_: TEf(x_) - 0.30 * (TEf(x_) - LE0f(x_)), HINGE_A=lambda x_: TEf(x_) - 0.38 * (TEf(x_) - LE0f(x_)))}
exec(src[src.index('def rrect_line('):src.index('RINGS_FORE = ')], ns); TOP, BOT, SIDE = ns['TOP_LINES'], ns['BOT_LINES'], ns['SIDE_PANELS']
RINGS_FORE = (1.480, 13.050, 15.300)


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


R3 = np.array([[0.80, 0.36, -0.48], [-0.60, 0.48, -0.64], [0.0, 0.80, 0.60]], np.float32)     # поворот на каждой октаве: иначе у шума видна решётка


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


def rng_tab(n, seed, lo, hi):
    return np.random.RandomState(seed).uniform(lo, hi, n).astype(np.float32)


def mix(c, col_, t):
    t = np.clip(t, 0, 1)[..., None]; return c * (1 - t) + np.asarray(col_, np.float32) * t


skin_m = (mat == 0)
zg = z + ZA                                                     # высота над землёй
# ── зоны ──
nacm = (cls == 0) & (np.hypot(ax - NAC_X, z - NAC_Z) < 0.80) & (a > 9.5) & (a < 13.1)
finm = ((cls == 0) & (ax > FIN_X - 0.14) & (a > 13.4)) | (cls == 2)
wing = (cls == 0) & (ax > 0.78) & (a > 6.6) & (a < 10.0) & (z < 0.75) & (~nacm)
stabm = (cls == 0) & (a > 13.95) & (ax > 0.42) & (ax < FIN_X - 0.14) & (np.abs(z + 0.08) < 0.16)
planes = wing | stabm | (cls == 4)


def cc0(name, kind='Color'):
    f = os.path.join(CC0, name, f'{name}_2K-JPG_{kind}.jpg')
    if not os.path.exists(f): f = os.path.join(CC0, name, f'{name}_1K-JPG_{kind}.jpg')
    return np.asarray(Image.open(f).convert('L'), np.float32) / 255.0


def tex3(img, sc, rot=False):
    """Фотомаска по координатам модели: сверху и снизу (a, x), на бортах (a, z), на торцах (x, z). sc - метров на плитку."""
    h, w = img.shape
    def smp(u, v):
        if rot: u, v = v, u
        return img[(np.mod(v / sc, 1.0) * (h - 1)).astype(np.int32), (np.mod(u / sc, 1.0) * (w - 1)).astype(np.int32)]
    wt, ws, wf = np.abs(nz) ** 4, np.abs(nx) ** 4, np.abs(ny) ** 4; tot = wt + ws + wf + 1e-6
    return (smp(a, x) * wt + smp(a, z + 1.7) * ws + smp(x + 3.1, z) * wf) / tot


# ── основа ──
camo = fbm(0.26, 0.26, 0.26, 3, 211.0); camo2 = fbm(1.5, 1.5, 1.5, 2, 223.0); cv = camo + (camo2 - 0.5) * 0.05
F3 = lambda c: np.array(c, np.float32)[None, None, :]
if SCHEME in ('green', 'green2'):                               # два зелёных пятнами с мягкой кромкой (распыление), в green тёмно-серый третьим тоном; окраска кругом, низ такой же (a10_04, 05, 09)
    m2 = smooth(0.495, 0.525, cv); cg = fbm(0.30, 0.30, 0.30, 3, 251.0) + (camo2 - 0.5) * 0.05; m3 = smooth(0.585, 0.615, cg) * (SCHEME == 'green')
    TOPC = C_G1[None, None, :] * (1 - m2[..., None]) + C_G2[None, None, :] * m2[..., None]; TOPC = TOPC * (1 - m3[..., None]) + C_G3[None, None, :] * m3[..., None]
    BASE = TOPC.astype(np.float32); upm = np.ones((S, S), np.float32)
elif SCHEME == 'sand':                                          # песочная целиком, с редкими более тёмными подкрасками (a10_06)
    m2 = smooth(0.585, 0.640, cv); BASE = (F3(PAL['sand'][0]) * (1 - m2[..., None]) + F3(PAL['sand'][1]) * m2[..., None]).astype(np.float32); upm = np.ones((S, S), np.float32)
elif SCHEME == 'winter':                                        # зимняя: белёсая основа, тёмные серо-зелёные и серые пятна с чёткой кромкой; придумана
    m2 = smooth(0.535, 0.545, cv); cg = fbm(0.34, 0.34, 0.34, 3, 251.0) + (camo2 - 0.5) * 0.05; m3 = smooth(0.575, 0.585, cg) * (1 - m2)
    BASE = (F3(PAL['winter'][0]) * (1 - m2[..., None]) + F3(PAL['winter'][1]) * m2[..., None]); BASE = (BASE * (1 - m3[..., None]) + F3(PAL['winter'][2]) * m3[..., None]).astype(np.float32); upm = np.ones((S, S), np.float32)
elif SCHEME == 'mottle':                                        # пятнистая: песочно-бурая основа, мелкие размытые зелёные и коричневые пятна; придумана
    q1 = fbm(0.95, 0.95, 0.95, 3, 261.0); q2 = fbm(0.80, 0.80, 0.80, 3, 271.0); m2 = smooth(0.50, 0.58, q1); m3 = smooth(0.56, 0.64, q2) * (1 - 0.6 * m2)
    BASE = (F3(PAL['mottle'][0]) * (1 - m2[..., None]) + F3(PAL['mottle'][1]) * m2[..., None]); BASE = (BASE * (1 - m3[..., None]) + F3(PAL['mottle'][2]) * m3[..., None]).astype(np.float32); upm = np.ones((S, S), np.float32)
else:                                                           # серая: тёмный серый сверху, светлый на бортах и снизу; граница мягкая, по высоте на фюзеляже и по нормали на плоскостях (a10_03, 07)
    up_f = smooth(0.38, 0.62, z + 0.10 * (cv - 0.5)); up_w = smooth(-0.05, 0.25, nz)
    upm = np.where(planes, up_w, np.where(nacm, smooth(-0.1, 0.5, nz), np.where(finm, 0.0, up_f))).astype(np.float32); upm = np.where(np.isin(cls, (7, 8)), 0.0, upm)
    BASE = (C_DG[None, None, :] * upm[..., None] + C_LG[None, None, :] * (1 - upm)[..., None]).astype(np.float32)
    fcm = (cls == 0) & (nz < -0.45) & (((a - 3.05) / 1.45) ** 2 + (x / 0.44) ** 2 < 1.0) & (a > 1.75)        # ложный фонарь под носом
    BASE = np.where(fcm[..., None], C_FC[None, None, :], BASE)
col = BASE.astype(np.float32).copy(); rough = np.full((S, S), 0.56 if GREEN else 0.50, np.float32); metal = np.where(mat == 0, 0.04, 0.0).astype(np.float32); height = np.zeros((S, S), np.float32)
# тон панелей: границы совпадают со швами геометрии
FR = np.array([0.55, 1.48, 2.60, 3.50, 4.50, 5.60, 6.76, 8.30, 9.90, 11.40, 13.05, 14.00, 15.30, 40.0], np.float32)
band = np.searchsorted(FR, a); lat = (x > 0).astype(np.int32) * 2 + (z > 0.10).astype(np.int32)
tt = rng_tab(64, 7, 0.945, 1.055); rt = rng_tab(64, 8, -0.07, 0.07); hue = rng_tab(64, 9, -0.016, 0.016)
idx = (band * 4 + lat) % 64; tone = tt[idx]; rtone = rt[idx]
LEW = LE0f(ax).astype(np.float32); TEW = TEf(ax).astype(np.float32); s1 = a - (LEW + 0.55); s2 = a - (LEW + 1.40); s3 = a - (TEW - 0.30 * (TEW - LEW))
wb = (s1 > 0).astype(np.int32) + (s2 > 0) + (s3 > 0); wr = (ax > 1.5).astype(np.int32) + (ax > XK) + (ax > 3.9) + (ax > 5.115) + (ax > 6.6) + (ax > 8.2); wi = (wb * 7 + wr) * 4 + (x > 0) * 2 + (nz > 0)
tone = np.where(wing, tt[(wi + 17) % 64], tone); rtone = np.where(wing, rt[(wi + 17) % 64], rtone)
ni = (np.searchsorted(np.array([9.95, 10.55, 11.30, 12.05, 12.50], np.float32), a) * 4 + (x > 0) * 2 + (z > NAC_Z)).astype(np.int32)
tone = np.where(nacm, tt[(ni + 41) % 64], tone); rtone = np.where(nacm, rt[(ni + 41) % 64], rtone)
fi = (np.searchsorted(np.array([-0.30, 0.40, 1.10, 1.80], np.float32), z) * 4 + (x > 0) * 2 + (a > 15.13)).astype(np.int32)
tone = np.where(finm, tt[(fi + 5) % 64], tone); rtone = np.where(finm, rt[(fi + 5) % 64], rtone)
for c_, sd in ((2, 23), (4, 27), (7, 33), (8, 35)):
    ix_ = (x > 0).astype(np.int32) + sd + (np.floor(ax / 1.3).astype(np.int32) if c_ == 4 else 0); tone = np.where(cls == c_, 1.0 + (tt[ix_ % 64] - 1.0) * 0.7, tone); rtone = np.where(cls == c_, rt[ix_ % 64], rtone)
col *= tone[..., None]; rough += rtone
col[..., 0] *= 1 + hue[idx]; col[..., 2] *= 1 - hue[idx]
# подкраски и заменённые листы
RS = np.random.RandomState(31); fresh = np.zeros((S, S), np.float32)
tup = nz > 0.45; tdn = nz < -0.45; tsd = np.abs(nx) > 0.45
for vm, A_, Q_, n_, qa, qb in ((tup, a, x, 70, -8.4, 8.4), (tdn, a, x, 40, -8.4, 8.4), (tsd, a, z, 46, -0.7, 2.2)):
    ids = np.nonzero((vm & (cls <= 8)).ravel())[0]; AA, QQ = A_.ravel()[ids], Q_.ravel()[ids]
    for k in range(n_):
        a0 = RS.uniform(0.6, 15.6); w = RS.uniform(0.16, 0.90); q0 = RS.uniform(qa, qb); h_ = RS.uniform(0.12, 0.55); e_ = 0.012 if k % 3 else 0.05
        d = np.minimum.reduce([AA - a0, a0 + w - AA, QQ - q0, q0 + h_ - QQ]); sel = d > -e_
        if not sel.any(): continue
        t_ = np.clip((d[sel] + e_) / (2 * e_), 0, 1); kk = RS.uniform(0.86, 1.10) if k % 4 else RS.uniform(0.74, 0.84); cc = ids[sel]
        for ch_ in range(3): col[..., ch_].ravel()[cc] *= 1 + (kk * (1 + RS.uniform(-0.012, 0.012)) - 1) * t_
        rough.ravel()[cc] += t_ * RS.uniform(-0.09, 0.05); fresh.ravel()[cc] = np.maximum(fresh.ravel()[cc], t_)
# крышки люков
hatch = np.zeros((S, S), np.float32); hedge = np.full((S, S), 9.0, np.float32)
def rect_mask(A, Q, r):
    a0, a1 = min(p[0] for p in r), max(p[0] for p in r); q0, q1 = min(p[1] for p in r), max(p[1] for p in r)
    ins = (A > a0) & (A < a1) & (Q > q0) & (Q < q1); d = np.minimum.reduce([A - a0, a1 - A, Q - q0, q1 - Q]); return ins, d
top_m = nz > 0.5; bot_m = nz < -0.5; sr_m = nx > 0.45; sl_m = nx < -0.45
Hk = 0
for lst, vmask, Q in ((TOP, top_m, ax), (BOT, bot_m, ax)):
    for r in lst:
        if len(r) >= 5 and r[0] == r[-1]:
            ins, d = rect_mask(a, Q, r); ins &= vmask & (cls == 0); hatch[ins] = 1.0; hedge[ins] = np.minimum(hedge[ins], d[ins]); col[ins] *= 1.012 + 0.008 * ((Hk % 3) - 1); rough[ins] -= 0.03; Hk += 1
for r in SIDE:
    if len(r) >= 5 and r[0] == r[-1]:
        ins, d = rect_mask(a, z, r); ins &= (sr_m | sl_m) & (cls == 0); hatch[ins] = 1.0; hedge[ins] = np.minimum(hedge[ins], d[ins]); col[ins] *= 0.995 + 0.012 * (Hk % 3); rough[ins] -= 0.03; Hk += 1
log('панели и крышки')
# ── заклёпки и близость швов ──
seamd = np.full((S, S), 9.0, np.float32); riv = np.zeros((S, S), np.float32); aft = np.zeros((S, S), np.float32)
PITCH = 0.052; RV = 0.0075; OFF = 0.026
def lines(pts, A, Q, mask):
    closed = len(pts) >= 5 and pts[0] == pts[-1]
    ids = np.nonzero(mask.ravel())[0]; AA, QQ = A.ravel()[ids], Q.ravel()[ids]
    for p0, p1 in zip(pts, pts[1:]):
        da, dq = p1[0] - p0[0], p1[1] - p0[1]; Ln = (da * da + dq * dq) ** 0.5
        if Ln < 1e-6: continue
        ta, tq = da / Ln, dq / Ln; w = (AA - p0[0]) * ta + (QQ - p0[1]) * tq; hh = (AA - p0[0]) * -tq + (QQ - p0[1]) * ta
        if abs(ta) < 0.6 and not closed:
            s2_ = (w > -0.02) & (w < Ln + 0.02) & (AA > p0[0] + (w * ta)) & (AA < p0[0] + w * ta + 0.50)
            if s2_.any():
                id3 = ids[s2_]; dA = AA[s2_] - (p0[0] + w[s2_] * ta); aft.ravel()[id3] = np.maximum(aft.ravel()[id3], np.exp(-dA / 0.14))
        sel = (w > 0.0) & (w < Ln) & (np.abs(hh) < 0.08)
        if not sel.any(): continue
        id2 = ids[sel]; wv, hv = w[sel], hh[sel]; dd = np.abs(hv)
        if not closed: seamd.ravel()[id2] = np.minimum(seamd.ravel()[id2], dd)
        ph = (wv / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH
        for sgn in (1, -1):
            dr = np.hypot(dph, hv - sgn * OFF); riv.ravel()[id2] = np.maximum(riv.ravel()[id2], np.clip(1 - dr / RV, 0, 1))
hullm = cls == 0
for L_ in TOP: lines(L_, a, ax, top_m & hullm)
for L_ in BOT: lines(L_, a, ax, bot_m & hullm)
for L_ in SIDE: lines(L_, a, z, (sr_m | sl_m) & hullm)
for rA in RINGS_FORE:
    m = (np.abs(a - rA) < 0.08) & (cls == 0); phi = np.arctan2(x, z - 0.3) * 0.6; seamd[m] = np.minimum(seamd[m], np.abs(a[m] - rA))
    for sgn in (1, -1):
        ph = (phi[m] / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH; dr = np.hypot(dph, a[m] - rA - sgn * OFF); riv[m] = np.maximum(riv[m], np.clip(1 - dr / RV, 0, 1))
for mm_, Q, st, A_ in ((stabm, ax, 0.48, a), (cls == 4, ax, 0.55, a), (finm, z, 0.46, a), (nacm, a, 0.62, np.arctan2(x - np.sign(x) * NAC_X, z - NAC_Z) * 0.70)):
    m = mm_; rr = (Q[m] / st) % 1.0; dq = np.minimum(rr, 1 - rr) * st; ph = (A_[m] / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH
    riv[m] = np.maximum(riv[m], np.clip(1 - np.hypot(dph, dq) / RV, 0, 1)); seamd[m] = np.minimum(seamd[m], dq + 0.004)
log('заклёпки', float((riv > 0).mean()))
# ── пятна, выгорание, потёки, копоть, грязь ──
mott = fbm(0.55, 0.55, 0.55, 4, 1.0); fine = fbm(11.0, 11.0, 11.0, 2, 5.0); patch = fbm(1.4, 1.4, 1.4, 4, 9.0)
low_ = smooth(-0.05, -0.5, nz); col *= (1 + (mott - 0.5) * (0.14 - 0.08 * low_) + (fine - 0.5) * 0.02)[..., None]
polish = smooth(0.55, 0.72, fbm(0.9, 0.9, 0.9, 3, 13.0)); rough += (mott - 0.5) * 0.10 - polish * 0.09
sun = smooth(0.25, 0.9, nz); col = mix(col, BASE * np.array([1.12, 1.11, 1.08], np.float32) + 0.012, sun * smooth(0.36, 0.72, patch) * (0.42 if GREEN else 0.26))
stre = fbm(0.75, 11.0, 11.0, 4, 3.0); stre2 = fbm(0.42, 26.0, 26.0, 3, 17.0)
flow = smooth(0.50, 0.70, stre) * (0.35 + 0.65 * smooth(0.35, 0.70, patch)); flow2 = smooth(0.58, 0.74, stre2)
rearw = 0.45 + 0.55 * smooth(6.5, 14.5, a)
dirty = flow * rearw * 0.22 * (1 - 0.75 * smooth(-0.05, -0.5, nz))
col = mix(col, (0.24, 0.245, 0.25), dirty * 0.14); rough += dirty * 0.14
rough += flow2 * 0.04
under = smooth(-0.15, -0.75, nz); oil = under * smooth(0.46, 0.68, fbm(1.0, 5.0, 5.0, 4, 23.0))
col = mix(col, (0.14, 0.125, 0.105), oil * 0.20); rough -= oil * 0.10
# масло и гидравлика: тёмные глянцевые полосы назад от ниш стоек, под гондолами и по низу фюзеляжа
ost = fbm(0.35, 9.0, 9.0, 4, 341.0); om_ = under * (smooth(7.6, 8.0, a) * smooth(12.5, 9.0, a) * np.exp(-((ax - XK) / 0.28) ** 2) + smooth(3.3, 3.6, a) * smooth(8.5, 5.0, a) * np.exp(-((x - 0.31) / 0.25) ** 2) + nacm * smooth(10.2, 10.8, a) * smooth(-0.2, -0.8, nz) * 0.9) * smooth(0.40, 0.66, ost)
col = mix(col, (0.085, 0.075, 0.062), np.clip(om_, 0, 1) * 0.55 * skin_m); rough -= np.clip(om_, 0, 1) * 0.22 * skin_m
for a0_, a1_, q0_, q1_ in ((1.36, 3.42, 0.06, 0.52), (6.90, 8.70, 2.30, 2.90)):
    m_ = smooth(a0_ - 0.10, a0_ + 0.10, a) * smooth(a1_ + 0.45, a1_ - 0.10, a) * smooth(q0_ - 0.1, q0_ + 0.1, ax) * smooth(q1_ + 0.12, q1_ - 0.12, ax) * under * smooth(0.36, 0.66, fbm(1.6, 7.0, 7.0, 3, 29.0))
    col = mix(col, (0.22, 0.215, 0.21), m_ * 0.10); rough += m_ * 0.12
# фотомаски ambientCG (CC0): неровный блеск, потёки по бортам, тонкие царапины
imp = tex3(cc0('SurfaceImperfections003'), 2.3); rough += (imp - float(imp.mean())) * 0.30 * skin_m
lk = cc0('Leaking012A'); lo_, hi_ = np.percentile(lk, 8), np.percentile(lk, 70); lk = np.clip((hi_ - lk) / max(hi_ - lo_, 1e-3), 0, 1)
leak = tex3(lk, 3.1) * np.abs(nx) ** 2 * skin_m * smooth(0.42, 0.66, fbm(0.5, 0.5, 0.5, 3, 331.0)); col = mix(col, (0.13, 0.125, 0.115), leak * 0.20); rough += leak * 0.10
leak_t = tex3(lk, 2.6, rot=True) * smooth(0.5, 0.9, np.abs(nz)) * skin_m * (0.35 + 0.65 * smooth(0.4, 0.7, patch)); col = mix(col, (0.15, 0.145, 0.135), leak_t * 0.15); rough += leak_t * 0.08
sc3 = cc0('Scratches003'); sc3 = np.clip((sc3 - np.percentile(sc3, 60)) / max(1e-3, np.percentile(sc3, 99.5) - np.percentile(sc3, 60)), 0, 1); scrm = tex3(sc3, 1.7) * skin_m
col = mix(col, BASE * 1.25 + 0.05, scrm * 0.30); rough -= scrm * 0.10
rain = tex3(cc0('Leaking017B') if os.path.exists(os.path.join(CC0, 'Leaking017B')) else lk, 2.2); rain = np.clip((np.percentile(rain, 60) - rain) / 0.25, 0, 1) * np.abs(nx) ** 2 * smooth(0.10, 0.0, np.minimum(seamd, hedge + 0.02)) * skin_m
col = mix(col, (0.11, 0.105, 0.10), rain * 0.35)
dust = smooth(0.55, 0.95, nz) * smooth(0.42, 0.70, fbm(0.8, 0.8, 0.8, 4, 351.0)) * skin_m; col = mix(col, (0.52, 0.49, 0.43), dust * 0.10); rough += dust * 0.10
# верх фюзеляжа по центру: шпангоуты и стрингеры с рядами заклёпок, листы разного тона, тропа техников, следы подошв, разводы от луж, пролитое топливо, сколы у крышек
tcm = (cls == 0) & (nz > 0.30) & (ax < 0.95) & (a > 0.45) & (a < 15.9) & (~nacm) & (mat == 0); tcf = tcm.astype(np.float32) * smooth(0.30, 0.55, nz)
FRP = 0.52; fr_i = np.floor(a / FRP); dfr = np.abs(a - (fr_i + 0.5) * FRP - FRP / 2 + FRP / 2); dfr = np.minimum(a % FRP, FRP - a % FRP)       # расстояние до шпангоута
dst = np.minimum(np.abs(ax - 0.31), np.abs(ax - 0.62)); dln = np.minimum(dfr, dst)
seamd = np.where(tcm, np.minimum(seamd, dln + 0.003), seamd)
pc_ = (np.floor(a / FRP).astype(np.int32) * 7 + (ax > 0.31).astype(np.int32) * 2 + (ax > 0.62) + (x > 0) * 3) % 64; t2 = rng_tab(64, 71, 0.90, 1.09); r2 = rng_tab(64, 72, -0.12, 0.10)
col = np.where(tcm[..., None], col * t2[pc_][..., None], col); rough = np.where(tcm, rough + r2[pc_], rough)
ln_ = smooth(0.010, 0.002, dln) * tcf; col *= (1 - 0.30 * ln_)[..., None]                                                           # сами линии
for dd_, ph_ in ((dfr, ax), (dst, a)):                                                                                              # ряды заклёпок по обе стороны
    pq = (ph_ / 0.045) % 1.0; dq_ = np.minimum(pq, 1 - pq) * 0.045; rv_ = np.clip(1 - np.hypot(dq_, np.abs(dd_ - 0.024)) / 0.0075, 0, 1) * tcf; riv = np.maximum(riv, rv_); col *= (1 - 0.10 * rv_)[..., None]
aftf = np.exp(-(a % FRP) / 0.16) * smooth(0.34, 0.70, fbm(0.6, 14.0, 14.0, 4, 361.0)) * tcf; col = mix(col, (0.15, 0.15, 0.15), aftf * 0.34); rough += aftf * 0.10      # грязь за каждым шпангоутом
path = np.exp(-(x / 0.24) ** 2) * smooth(4.4, 4.9, a) * smooth(15.4, 14.6, a) * tcf; sc_h = fbm(26.0, 26.0, 26.0, 3, 371.0)
col = mix(col, BASE * 1.22 + 0.04, path * smooth(0.42, 0.62, sc_h) * 0.42); rough += path * (sc_h - 0.5) * 0.30                    # тропа: краска вытерта
boot = smooth(0.66, 0.74, fbm(3.2, 7.5, 7.5, 3, 381.0)) * np.exp(-(x / 0.42) ** 2) * tcf * smooth(4.4, 5.0, a); col = mix(col, (0.10, 0.10, 0.105), boot * 0.42); rough -= boot * 0.08   # следы подошв
pd_ = fbm(1.9, 1.9, 1.9, 3, 391.0); tide = smooth(0.012, 0.004, np.abs(pd_ - 0.56)) * tcf * smooth(0.6, 0.9, nz); pud = smooth(0.56, 0.60, pd_) * tcf * smooth(0.6, 0.9, nz)
col = mix(col, (0.36, 0.35, 0.32), pud * 0.16); col *= (1 - 0.20 * tide)[..., None]; rough += pud * 0.12                             # высохшие лужи с ободком
for af_, xf_ in ((1.05, 0.0), (7.4, 0.36), (8.6, -0.36), (10.9, 0.0)):                                                              # пролитое топливо и масло: пятно и хвост назад
    df_ = np.hypot((a - af_) * 0.55, x - xf_); tl_ = np.exp(-np.abs(x - xf_) / 0.16) * smooth(af_, af_ + 0.2, a) * np.exp(-(a - af_) / 1.1) * smooth(0.30, 0.66, fbm(0.5, 11.0, 11.0, 4, 401.0 + af_))
    fs_ = np.clip(np.exp(-df_ / 0.13) + tl_, 0, 1) * tcf; col = mix(col, (0.11, 0.10, 0.085), fs_ * 0.50); rough -= fs_ * 0.20
chp = smooth(0.016, 0.004, dln) * smooth(0.60, 0.70, fbm(30.0, 30.0, 30.0, 3, 411.0)) * tcf; col = mix(col, (0.52, 0.55, 0.33), chp * 0.55); col = mix(col, (0.62, 0.63, 0.64), chp * smooth(0.72, 0.80, fbm(30.0, 30.0, 30.0, 3, 411.0)) * 0.7)   # сколы у стыков: грунт и металл
gsp = tcf * smooth(9.6, 10.6, a) * smooth(13.6, 12.4, a) * smooth(0.36, 0.70, fbm(0.5, 5.0, 5.0, 4, 421.0)); col = mix(col, (0.10, 0.097, 0.092), gsp * 0.34); rough += gsp * 0.14      # копоть между гондолами
# вся обшивка: зерно и разводы с фото окрашенного металла, мелкие щербины, крупные выгоревшие поля
pm6 = cc0('PaintedMetal006'); pm6 = (pm6 - float(pm6.mean())) / max(float(pm6.std()), 1e-3); pmt = tex3(pm6, 1.9); col *= (1 + np.clip(pmt, -2.5, 2.5) * 0.045 * skin_m)[..., None]; rough += np.clip(pmt, -2.5, 2.5) * 0.035 * skin_m
col *= (1 - 0.10 * np.clip((imp - float(imp.mean())) * 3.0, 0, 1) * skin_m)[..., None]
pit = smooth(0.80, 0.86, fbm(46.0, 46.0, 46.0, 2, 431.0)) * skin_m * (0.3 + 0.7 * smooth(0.3, 0.7, patch)); col = mix(col, (0.14, 0.14, 0.14), pit * 0.5); rough += pit * 0.10
bleach = smooth(0.46, 0.74, fbm(0.33, 0.33, 0.33, 4, 441.0)) * smooth(0.2, 0.8, nz) * skin_m; col = mix(col, BASE * 1.16 + 0.03, bleach * 0.34); rough += bleach * 0.08
# нагар от пушки: вокруг дульной ниши и полосами назад по низу и левому борту носа (a10_03, 05)
gd_ = np.hypot(x + 0.13, z + 0.50); gst_ = fbm(0.55, 7.0, 7.0, 4, 301.0)
gsoot = (1.5 * np.exp(-gd_ / 0.55) * smooth(5.2, 0.4, a) * (0.35 + 0.65 * smooth(0.30, 0.66, gst_)) + 1.2 * np.exp(-gd_ / 0.26) * smooth(1.8, 0.3, a)) * (cls == 0) * skin_m
col = mix(col, (0.075, 0.072, 0.070), np.clip(gsoot, 0, 1) * 0.58); rough += np.clip(gsoot, 0, 1) * 0.20
# копоть за соплами: на стабилизаторе и рулях высоты в струе, на кромке гондолы, на балке (a10_03, 08)
est = fbm(0.45, 6.0, 6.0, 4, 311.0); jet = np.exp(-((ax - NAC_X) / 0.48) ** 2)
esoot = smooth(13.9, 14.5, a) * jet * smooth(0.2, 0.7, nz) * (stabm | (cls == 4)) * (0.45 + 0.55 * smooth(0.30, 0.70, est)) * 0.75
esoot = esoot + nacm * smooth(12.25, 12.78, a) * (0.35 + 0.65 * smooth(0.30, 0.70, est)) * 0.65 + (cls == 0) * (~nacm) * smooth(12.6, 13.4, a) * smooth(15.6, 14.4, a) * (ax < 0.5) * smooth(-0.1, 0.4, z) * smooth(0.40, 0.72, est) * 0.30
esoot = esoot + finm * (np.sign(x) * nx < -0.3) * smooth(0.9, -0.3, z) * smooth(0.36, 0.70, est) * 0.28
esoot = np.clip(esoot, 0, 1) * (mat == 0); col = mix(col, (0.085, 0.080, 0.076), esoot * 0.72); rough += esoot * 0.24
soot = esoot
# наслоение у швов, заклёпки
hair = smooth(0.0125, 0.0035, seamd); col *= (1 - 0.07 * hair * skin_m)[..., None]; rough += hair * 0.05 * skin_m
halo = smooth(0.07, 0.0, seamd) * smooth(0.30, 0.66, stre) * skin_m; col *= (1 - 0.085 * halo)[..., None]
hgr = smooth(0.030, 0.0, hedge) * (hedge < 8) * (0.4 + 0.6 * smooth(0.35, 0.65, patch)) * skin_m; col *= (1 - 0.16 * hgr)[..., None]; rough += hgr * 0.08     # грязь по контуру крышек
stain = aft * smooth(0.40, 0.74, stre) * skin_m * smooth(-0.3, 0.1, nz); col = mix(col, (0.16, 0.16, 0.155), stain * 0.30); rough += stain * 0.12
crev = smooth(0.70, 0.30, ao1) * skin_m; col = mix(col, (0.13, 0.13, 0.13), crev * 0.42); rough += crev * 0.18
body_ = smooth(0.15, 0.95, ao2); col *= (0.86 + 0.14 * body_)[..., None]; col *= (0.96 + 0.04 * smooth(0.45, 0.95, ao1))[..., None]
fade = smooth(-0.7, 0.8, nz); col *= (0.95 + 0.08 * fade)[..., None]
rv_d = smooth(0.0, 0.5, riv); rv_top = smooth(0.4, 0.9, riv); col *= (1 - rv_d * 0.055 * skin_m)[..., None]; col += (rv_top * 0.010 * skin_m)[..., None]
# ── кромки и сколы ──
edge = smooth(0.985, 0.90, bev) * skin_m
da_le = a - LEW
LE_w = smooth(0.13, 0.02, da_le) * smooth(-0.02, 0.02, da_le) * ((cls == 4) | wing)
col = mix(col, BASE * 1.08, LE_w * 0.35); rough -= LE_w * 0.12
eros = smooth(0.46, 0.60, fbm(9.0, 9.0, 9.0, 3, 37.0))
chip = np.maximum(edge * smooth(0.52, 0.62, fbm(14.0, 14.0, 14.0, 3, 41.0)), LE_w * smooth(0.66, 0.78, eros) * 0.40)
scuff = smooth(0.020, 0.006, hedge) * smooth(0.60, 0.70, fbm(22.0, 22.0, 22.0, 3, 43.0)) * 0.5
scr = smooth(0.76, 0.78, fbm(5.0, 70.0, 70.0, 2, 47.0)) * smooth(0.60, 0.72, patch) * sun * 0.20
walk = smooth(7.0, 7.3, a) * smooth(9.5, 9.2, a) * smooth(0.72, 0.85, ax) * smooth(2.25, 2.05, ax) * sun * smooth(0.44, 0.66, fbm(2.2, 2.2, 2.2, 3, 53.0)); col = mix(col, BASE * 1.08, walk * 0.22); rough -= walk * 0.10
rough -= (edge * 0.14 + scuff * 0.16)
mov = np.isin(cls, (2, 4, 7)); chip = chip * np.where(mov, 0.30, 0.95); edge = edge * np.where(mov, 0.2, 1.0)
bare = np.clip(chip * 0.9 + scuff * 0.55 + scr * 0.6, 0, 1) * skin_m
bare = bare * np.where(np.isin(cls, (2, 4)) | finm, 0.30, 1.0)
prim = np.clip(chip * 1.7 + scuff * 0.9 + LE_w * smooth(0.60, 0.74, eros) * 0.12, 0, 1) * skin_m * (1 - bare); col = mix(col, (0.52, 0.55, 0.33), prim * 0.75); rough += prim * 0.06     # под сколом сначала грунт, металл только в глубине    # кромки киля, стабилизатора, предкрылков: сильная потёртость блестела зубцами на дальнем объективе
BARE = np.array((0.60, 0.61, 0.63), np.float32)
col = mix(col, BARE, bare); rough = rough * (1 - bare) + bare * (0.36 + 0.05 * fine); metal = np.maximum(metal, smooth(0.45, 0.75, bare))
log('краска')
# ── надписи и знаки: свои, малозаметные, номера придуманы ──
FNT = '/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf'; FNB = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
def decal(text, ac, qc, W_, H_, side, col_, alpha=0.82, cl=8):
    wp, hp = 512, max(32, int(512 * H_ / W_)); im_ = Image.new('L', (wp, hp), 0); dr = ImageDraw.Draw(im_)
    if text is None: dr.rectangle((0, 0, wp, hp), fill=255)
    else:
        f_ = ImageFont.truetype(FNT, int(hp * 0.92)); tw = dr.textlength(text, font=f_); f_ = ImageFont.truetype(FNT, max(8, int(hp * 0.92 * min(1.0, wp / max(tw, 1)))))
        dr.text((wp / 2, hp / 2), text, font=f_, fill=255, anchor='mm')
    D_ = np.asarray(im_, np.float32) / 255.0
    vm, Q_ = ((nz > 0.35, x) if side == 'top' else (nz < -0.35, x) if side == 'bot' else (nx > 0.35, z) if side == 'r' else (nx < -0.35, z))
    ins = vm & (np.abs(a - ac) < W_ / 2) & (np.abs(Q_ - qc) < H_ / 2) & (cls <= cl) & (mat == 0)
    if not ins.any(): return
    u_ = (a[ins] - ac) / W_ + 0.5; v_ = 0.5 - (Q_[ins] - qc) / H_
    if side == 'r': u_ = 1 - u_
    A_ = D_[np.clip((v_ * hp).astype(int), 0, hp - 1), np.clip((u_ * wp).astype(int), 0, wp - 1)] * alpha * (0.72 + 0.28 * smooth(0.35, 0.6, fine[ins]))
    _mark(f'{text or "полоса"} {ac:.2f},{qc:.2f}', ins, A_, side) if 'MARKS' in globals() else None; c_ = np.asarray(col_, np.float32); col[ins] = col[ins] * (1 - A_[..., None]) + c_ * A_[..., None]; rough[ins] += A_ * -0.05


def _star_pts(cx, cy, R):
    return [(cx + (R if i % 2 == 0 else R * 0.382) * math.cos(-math.pi / 2 + i * math.pi / 5), cy + (R if i % 2 == 0 else R * 0.382) * math.sin(-math.pi / 2 + i * math.pi / 5)) for i in range(10)]


def roundel(W=1000, gold=(196, 160, 60, 255), red=(176, 40, 34, 255), white=(236, 238, 236, 255), blue=(34, 52, 112, 255)):
    """Круглый знак: золотая кромка, красное кольцо, белое поле. Без якоря (слово Mark)."""
    im_ = Image.new('RGBA', (W, W), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); c = W / 2; R = W / 2 - 4
    for r_, c_ in ((R, gold), (R * 0.94, red), (R * 0.66, white)): d_.ellipse((c - r_, c - r_, c + r_, c + r_), fill=c_)
    return im_


WHITE = (236, 238, 238, 255); RED = (176, 40, 34, 255)
def tri_mark(S_=400):
    """Треугольник у кабины (a10_13): белое поле, красная кромка, вершина вниз."""
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); P_ = [(S_ * 0.05, S_ * 0.10), (S_ * 0.95, S_ * 0.10), (S_ / 2, S_ * 0.94)]; d_.polygon(P_, fill=WHITE); d_.line(P_ + [P_[0]], fill=RED, width=int(S_ * 0.09), joint='curve'); return im_
def cross(S_=240, ink=RED):
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); t = int(S_ * 0.15); d_.line([(S_ * .14, S_ * .14), (S_ * .86, S_ * .86)], fill=ink, width=t); d_.line([(S_ * .86, S_ * .14), (S_ * .14, S_ * .86)], fill=ink, width=t); return im_
def box_red(W=400, H=300):
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); d_.rectangle((0, 0, W, H), fill=(226, 228, 226, 255)); d_.rectangle((W * .10, H * .14, W * .90, H * .86), fill=RED); return im_

def text_img(t, H=220, ink=(40, 44, 50, 255), W=None, font=FNB):
    f_ = ImageFont.truetype(font, int(H * 0.86)); tmp = ImageDraw.Draw(Image.new('L', (8, 8))); bb = tmp.textbbox((0, 0), t, font=f_); tw = bb[2] - bb[0]; W = W or (tw + 30)
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(im_).text((W / 2, H / 2), t, font=f_, fill=ink, anchor='mm'); return im_


def emblem_img(S_=720, ink=(44, 48, 54, 255)):
    """Эмблема придуманной части: круг, молния и звезда. Одной краской, своя."""
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); t = int(S_ * 0.035); d_.ellipse((t, t, S_ - t, S_ - t), outline=ink, width=t); d_.ellipse((S_ * .10, S_ * .10, S_ * .90, S_ * .90), outline=ink, width=max(3, t // 2))
    d_.polygon([(S_ * .58, S_ * .20), (S_ * .36, S_ * .54), (S_ * .50, S_ * .54), (S_ * .42, S_ * .82), (S_ * .66, S_ * .44), (S_ * .52, S_ * .44)], fill=ink)
    d_.polygon(_star_pts(S_ * .26, S_ * .36, S_ * .075), fill=ink); d_.polygon(_star_pts(S_ * .74, S_ * .64, S_ * .075), fill=ink); return im_

def rescue_img(W=640, H=170, ink=(120, 34, 26, 255)):
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dr = ImageDraw.Draw(im_); t = 7; dr.polygon([(150, 34), (W - 12, 34), (W - 12, H - 34), (150, H - 34), (150, H - 8), (10, H / 2), (150, 8)], outline=ink, width=t)
    return im_   # без надписи: буквы мельче 10 см в игре размываются



MARKS = []
def _mark(name, ins, A_, side):
    ys, xs = np.nonzero(ins); on = A_ > 0.25
    if not on.any(): return
    ys, xs = ys[on], xs[on]; Q_ = x[ys, xs] if side in ('top', 'bot') else z[ys, xs]; MARKS.append((name, side, float(a[ys, xs].min()), float(a[ys, xs].max()), float(Q_.min()), float(Q_.max())))

def Z_(zz): return zz - ZA


def stamp(im_, ac, qc, W_, H_, side, along=True, alpha=0.92, rough_to=None, cl=None, xr=None):
    """Картинка на обшивку. along: ширина вдоль корпуса; иначе ширина вдоль размаха, верх картинки к носу."""
    A0 = np.asarray(im_, np.float32) / 255.0; hp, wp = A0.shape[:2]
    vm, Q_ = ((nz > 0.35, x) if side == 'top' else (nz < -0.35, x) if side == 'bot' else (nx > 0.35, z) if side == 'r' else (nx < -0.35, z))
    if along: ins = vm & (np.abs(a - ac) < W_ / 2) & (np.abs(Q_ - qc) < H_ / 2)
    else: ins = vm & (np.abs(Q_ - qc) < W_ / 2) & (np.abs(a - ac) < H_ / 2)
    ins &= (mat == 0) & (np.isin(cls, cl) if cl else (cls <= 8))
    if xr is not None: ins &= (x > xr[0]) & (x < xr[1])
    if not ins.any(): return
    if along:
        u_ = (a[ins] - ac) / W_ + 0.5; v_ = 0.5 - (Q_[ins] - qc) / H_
        if side == 'r': u_ = 1 - u_
    else:
        u_ = (Q_[ins] - qc) / W_ + 0.5; v_ = (a[ins] - ac) / H_ + 0.5
        if side == 'bot': u_ = 1 - u_
    du, dv = 0.25 * DS / (W_ if along else W_), 0.25 * DS / (H_ if along else H_)
    S_ = 0.0
    for su, sv in ((-1, -1), (1, -1), (-1, 1), (1, 1), (0, 0)):
        S_ = S_ + A0[np.clip(((v_ + sv * dv) * hp).astype(int), 0, hp - 1), np.clip(((u_ + su * du) * wp).astype(int), 0, wp - 1)]
    S_ = S_ / 5.0; S_[:, :3] = S_[:, :3] / np.maximum(S_[:, 3:4], 1e-3) if False else S_[:, :3]
    al = S_[:, 3] * alpha * (0.96 + 0.04 * smooth(0.30, 0.62, fine[ins])) * (1 - 0.2 * bare[ins])
    S_[:, :3] = np.where(S_[:, 3:4] > 1e-3, S_[:, :3] / np.maximum(S_[:, 3:4], 1e-3), 0.0)
    _mark(f'картинка {ac:.2f},{qc:.2f}', ins, al, side); col[ins] = col[ins] * (1 - al[..., None]) + S_[:, :3] * al[..., None]; rough[ins] = rough[ins] * (1 - al) + (0.42 if rough_to is None else rough_to) * al


def roundel_raf(W=1000, red=(178, 34, 38, 255), white=(236, 238, 236, 255), blue=(28, 48, 120, 255)):
    """Круг RAF: синее кольцо, белое кольцо, красный центр (обычный знак, нарисован здесь)."""
    im_ = Image.new('RGBA', (W, W), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); c = W / 2; R_ = W / 2 - 4
    for r_, c_ in ((R_, blue), (R_ * 2 / 3, white), (R_ / 3, red)): d_.ellipse((c - r_, c - r_, c + r_, c + r_), fill=c_)
    return im_
def flash_img(W=600, H=440, red=(178, 34, 38, 255), white=(236, 238, 236, 255), blue=(28, 48, 120, 255)):
    """Полосы на киле: красная спереди, белая, синяя сзади (левый край картинки - к носу)."""
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_)
    for i, c_ in enumerate((red, white, blue)): d_.rectangle((W * i / 3, 0, W * (i + 1) / 3, H), fill=c_)
    return im_
def arrow_img(W=640, H=170, ink=(214, 170, 30, 255)):
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dr = ImageDraw.Draw(im_); dr.polygon([(10, H * 0.30), (W - 170, H * 0.30), (W - 170, 8), (W - 10, H / 2), (W - 170, H - 8), (W - 170, H * 0.70), (10, H * 0.70)], fill=ink); return im_
def tri_warn(S_=400):
    """Красный треугольник предупреждения у кабины, вершиной вверх, белое поле внутри."""
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); P_ = [(S_ / 2, S_ * 0.06), (S_ * 0.96, S_ * 0.92), (S_ * 0.04, S_ * 0.92)]; d_.polygon(P_, fill=RED)
    Q_ = [(S_ / 2, S_ * 0.30), (S_ * 0.78, S_ * 0.80), (S_ * 0.22, S_ * 0.80)]; d_.polygon(Q_, fill=WHITE); return im_
INK = (16, 17, 18, 255) if GREEN else (40, 42, 46, 255) if SCHEME in ('sand', 'winter') else (64, 68, 76, 255); INKF = tuple(v / 255 for v in INK[:3])
def star_lv(W=1400, H=740, ink=INK):
    """Знак малой заметности одной краской: кольцо, звезда, полосы контуром. Нарисовано здесь."""
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); cx, cy = W / 2, H / 2; R_ = H / 2 - 8; bh = R_ * 0.50; t = int(R_ * 0.085)
    d_.rectangle((8, cy - bh, W - 8, cy + bh), outline=ink, width=t); d_.line([(8, cy - bh / 3), (W - 8, cy - bh / 3)], fill=ink, width=t // 2); d_.line([(8, cy + bh / 3), (W - 8, cy + bh / 3)], fill=ink, width=t // 2)
    d_.ellipse((cx - R_, cy - R_, cx + R_, cy + R_), fill=(0, 0, 0, 0)); d_.ellipse((cx - R_, cy - R_, cx + R_, cy + R_), outline=ink, width=t); d_.polygon(_star_pts(cx, cy, R_ * 0.90), fill=ink); return im_
def strip_img(W=600, H=70, c=(168, 176, 110, 255)):
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); d_.rounded_rectangle((0, 0, W - 1, H - 1), 10, fill=(40, 42, 40, 255)); d_.rounded_rectangle((8, 8, W - 9, H - 9), 6, fill=c); return im_
def danger_img(W=900, H=260):
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); d_.rectangle((0, 0, W - 1, H - 1), outline=RED, width=18); f_ = ImageFont.truetype(FNB, int(H * 0.56)); d_.text((W / 2, H / 2), 'DANGER', font=f_, fill=RED, anchor='mm'); return im_
SB = star_lv(); CODE = 'QZ'; NUM = '412'                        # код на киле и номер придуманы: таких нет
OUTR = {'r': (2.80, 9.0), 'l': (-9.0, -2.80)}; NACO = {'r': (1.9, 2.4), 'l': (-2.4, -1.9)}; HULL = (-0.86, 0.86)
for sd in ('r', 'l'):
    stamp(SB, 5.70, 0.14, 1.20, 0.635, sd, alpha=0.93, xr=HULL)                              # знак на борту за кабиной
    stamp(text_img(NUM, 300, ink=INK), 1.22, 0.30, 0.46, 0.19, sd, alpha=0.92, xr=HULL)      # номер на носу
    stamp(text_img(CODE, 300, ink=INK), 14.72, 1.30, 0.86, 0.50, sd, alpha=0.94, xr=OUTR[sd])   # код на киле снаружи
    stamp(text_img('AF80', 200, ink=INK), 14.50, 0.82, 0.34, 0.11, sd, alpha=0.90, xr=OUTR[sd])
    stamp(text_img(NUM, 300, ink=INK), 14.92, 0.80, 0.44, 0.19, sd, alpha=0.92, xr=OUTR[sd])
    stamp(strip_img(), 14.62, 1.90, 0.62, 0.075, sd, alpha=0.95, rough_to=0.30, xr=OUTR[sd])   # светящиеся полосы строя
    stamp(strip_img(), 13.40, 0.20, 0.62, 0.075, sd, alpha=0.95, rough_to=0.30, xr=HULL)
    stamp(strip_img(), 1.95, 0.08, 0.50, 0.070, sd, alpha=0.95, rough_to=0.30, xr=HULL)
    stamp(tri_warn(), 3.55, 0.47, 0.17, 0.17, sd, alpha=0.97, xr=HULL)                       # треугольник: катапульта
    stamp(arrow_img(), 2.86, 0.47, 0.50, 0.13, sd, alpha=0.95, rough_to=0.44, xr=HULL)       # стрелка спасателей
    stamp(text_img('RESCUE', 150, ink=INK), 2.86, 0.345, 0.42, 0.085, sd, alpha=0.88, xr=HULL)
    stamp(danger_img(), 10.15, 0.86, 0.62, 0.18, sd, alpha=0.93, xr=NACO[sd])                # предупреждение у воздухозаборника
    stamp(arrow_img(ink=RED) if sd == 'l' else arrow_img(ink=RED).transpose(Image.FLIP_LEFT_RIGHT), 10.15, 0.66, 0.40, 0.10, sd, alpha=0.90, xr=NACO[sd])
    stamp(text_img('NO PUSH', 150, ink=INK), 15.50, 0.35, 0.34, 0.07, sd, alpha=0.85, xr=OUTR[sd], cl=(2,))
    stamp(text_img('JACK', 150, ink=INK), 4.62, -0.40, 0.22, 0.07, sd, alpha=0.82, xr=HULL)
def block_img(W=600, H=300, rows=5, seed=1):
    """Блок мелких надписей: строки-штрихи разной длины (буквы такого размера в игре не читаются)."""
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); r_ = np.random.RandomState(seed)
    for i in range(rows):
        y0 = H * (i + 0.2) / rows; x0 = 0
        while x0 < W * r_.uniform(0.6, 1.0):
            w_ = r_.uniform(0.05, 0.16) * W; d_.rectangle((x0, y0, x0 + w_, y0 + H * 0.5 / rows), fill=INK); x0 += w_ + W * 0.03
    return im_
def ring_img(S_=300, c=RED):
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); d_.ellipse((6, 6, S_ - 6, S_ - 6), outline=c, width=int(S_ * 0.12)); d_.ellipse((S_ * 0.36, S_ * 0.36, S_ * 0.64, S_ * 0.64), fill=(60, 62, 64, 255)); return im_
tb = nacm & (np.abs(a - 11.42) < 0.030) & (mat == 0); col[tb] = col[tb] * 0.12 + np.array((0.62, 0.12, 0.10), np.float32) * 0.88; rough[tb] = 0.5                    # красная полоса: плоскость турбины
k_ = 0
for sd in ('r', 'l'):
    for ac_, zc_, w_, h_ in ((1.30, -0.30, 0.26, 0.13), (2.32, -0.30, 0.22, 0.11), (3.90, -0.42, 0.30, 0.14), (4.95, 0.30, 0.24, 0.12), (6.48, -0.45, 0.26, 0.13), (10.60, -0.20, 0.24, 0.12), (12.30, 0.10, 0.22, 0.11), (14.20, -0.02, 0.24, 0.11)):
        k_ += 1; stamp(block_img(seed=k_), ac_, zc_, w_, h_, sd, alpha=0.80, xr=HULL)
    stamp(block_img(seed=40), 10.90, 0.55, 0.26, 0.13, sd, alpha=0.80, xr=NACO[sd]); stamp(block_img(seed=41), 14.30, 0.20, 0.26, 0.12, sd, alpha=0.80, xr=OUTR[sd])
for sg in (1, -1):
    for ac_, xc_ in ((7.75, 1.45), (7.95, 4.20), (7.62, 6.62)): stamp(ring_img(), ac_, sg * xc_, 0.17, 0.17, 'top', along=False, alpha=0.92)                              # заливные горловины
    for ac_, xc_ in ((7.60, 3.30), (8.75, 5.60), (7.50, 7.40), (14.70, 1.60)): k_ += 1; stamp(block_img(seed=k_), ac_, sg * xc_, 0.26, 0.12, 'top', alpha=0.75)
    for ac_, xc_ in ((7.70, 3.00), (8.40, 5.30), (7.60, 7.70)): k_ += 1; stamp(block_img(seed=k_), ac_, sg * xc_, 0.26, 0.12, 'bot', alpha=0.75)
stamp(SB, 8.30, -6.55, 1.45, 0.77, 'top', along=False, alpha=0.93)                           # знаки на крыле: сверху слева, снизу справа
stamp(SB, 8.30, 6.55, 1.45, 0.77, 'bot', along=False, alpha=0.93)
for sg in (1, -1):
    decal('NO STEP', 9.36, sg * 1.50, 0.62, 0.12, 'top', INKF, 0.72, cl=4)
    decal('NO STEP', 9.25, sg * 4.05, 0.62, 0.12, 'top', INKF, 0.72, cl=4)
    decal('NO STEP', 8.98, sg * 6.60, 0.62, 0.12, 'top', INKF, 0.72, cl=4)
    decal('NO STEP', 15.42, sg * 1.55, 0.50, 0.10, 'top', INKF, 0.70, cl=4)
    decal(None, 7.02, sg * 1.50, 0.022, 1.36, 'top', INKF, 0.55, cl=0)                       # граница хождения на центроплане
    decal(None, 8.86, sg * 1.50, 0.022, 1.36, 'top', INKF, 0.55, cl=0)
_bad = 0
for i_, m1 in enumerate(MARKS):
    for m2 in MARKS[i_ + 1:]:
        if m1[1] == m2[1] and m1[2] - 0.04 < m2[3] and m2[2] - 0.04 < m1[3] and m1[4] - 0.04 < m2[5] and m2[4] - 0.04 < m1[5]: _bad += 1; log(f'НАЛОЖЕНИЕ {m1[1]}: {m1[0]} ({m1[2]:.2f}-{m1[3]:.2f}, {m1[4]:.2f}-{m1[5]:.2f}) и {m2[0]} ({m2[2]:.2f}-{m2[3]:.2f}, {m2[4]:.2f}-{m2[5]:.2f})')
log(f'знаков {len(MARKS)}, наложений с запасом 4 см: {_bad}')
log('надписи')
# ── двигатели и пушка ──
tn = fbm(1.2, 4.0, 4.0, 4, 59.0); ts = fbm(0.8, 14.0, 14.0, 3, 61.0)
noz = cls == 10; col[noz] = (np.array((0.33, 0.315, 0.29), np.float32) * (0.80 + 0.40 * ts)[..., None] * (1 - 0.45 * smooth(12.5, 13.05, a) * tn)[..., None])[noz]; metal[noz] = 1.0; rough[noz] = np.clip(0.50 + (tn[noz] - 0.5) * 0.14, 0.38, 0.66)
pipe = (cls == 0) & (mat == 1); col[pipe] = np.array((0.20, 0.195, 0.19), np.float32) * (0.8 + 0.4 * tn[pipe])[..., None]; metal[pipe] = 1.0; rough[pipe] = 0.55
fan_ = cls == 13; fb_ = fan_ & (mat == 1); col[fb_] = (np.array((0.50, 0.51, 0.53), np.float32) * (0.85 + 0.30 * ts)[..., None])[fb_]; metal[fb_] = 0.9; rough[fb_] = 0.34
gun_ = cls == 5; gm_ = gun_ & (mat == 1); col[gm_] = (np.array((0.115, 0.115, 0.12), np.float32) * (0.85 + 0.30 * ts)[..., None] * (1 - 0.5 * smooth(0.35, -0.08, a))[..., None])[gm_]; metal[gm_] = 0.85; rough[gm_] = 0.46
log('двигатели')
# ── материалы без краски обшивки ──
def solid(m, c, r, me=0.0, nz_=0.08):
    col[m] = np.array(c, np.float32) * (1 - nz_ / 2 + nz_ * fine[m])[..., None]; rough[m] = r; metal[m] = me
solid(mat == 10, (0.20, 0.21, 0.22), 0.85)              # швы
solid(mat == 2, (0.030, 0.030, 0.032), 0.9)             # нутро
solid(mat == 4, (0.045, 0.045, 0.048), 0.86)            # резина
solid(mat == 5, (0.255, 0.275, 0.285), 0.66, 0, 0.16)     # кабина: серая
bore_ = (mat == 5) & (cls == 0); col[bore_] = np.array((0.14, 0.135, 0.13), np.float32); rough[bore_] = 0.7
# канал: у кромки тёплый серый, вглубь плавно темнеет (цветом, а не затенением, иначе в тени сплошной чёрный); ниши шасси светлые
# канал: у кромки тёмно-серый, вглубь в чёрное, глухая стенка (задание); ниши шасси светлые, ниша щитка тёмная: сквозь отверстия не светится
duct_m = mat == 11; solid(duct_m, (0.15, 0.15, 0.16), 0.72, 0, 0.12)
nd_ = np.hypot(ax - NAC_X, z - NAC_Z) < 0.75
in_duct = duct_m & nd_ & (a > 9.4) & (a < 10.7); col[in_duct] = (np.array((0.62, 0.63, 0.64), np.float32) * (0.40 + 0.60 * smooth(10.25, 9.62, a))[..., None])[in_duct]; rough[in_duct] = 0.42
ex_duct = duct_m & nd_ & (a > 11.6); col[ex_duct] = (np.array((0.20, 0.19, 0.175), np.float32) * (0.7 + 0.6 * ts)[..., None])[ex_duct]; metal[ex_duct] = 0.8; rough[ex_duct] = 0.6
bay_ = duct_m & (~nd_); col[bay_] = np.array((0.62, 0.63, 0.61), np.float32) * (0.45 + 0.55 * ao2[bay_])[..., None]; rough[bay_] = 0.6
solid(mat == 6, (0.30, 0.31, 0.22), 0.92, 0, 0.2)       # подушки
solid(mat == 8, (0.30, 0.28, 0.21), 0.9, 0, 0.14)       # ремни
solid(mat == 7, (0.018, 0.038, 0.032), 0.12, 0, 0.0)    # экраны
solid(mat == 12, (0.16, 0.70, 0.30), 0.18, 0, 0.0)      # зелёный экран и стекло прицела, зелёный огонь
hs = ((pos[..., 0] + pos[..., 1] + pos[..., 2]) / 0.035) % 1.0 > 0.5
solid(mat == 9, (0.74, 0.60, 0.06), 0.42); col[(mat == 9) & hs] = np.array((0.035, 0.035, 0.035), np.float32)   # рукоятка: жёлто-чёрная
lt_ = (mat == 9) & (cls == 14); solid(lt_ & (x > 0.3), (0.10, 0.62, 0.30), 0.14, 0, 0.0); solid(lt_ & (x < -0.3), (0.72, 0.08, 0.06), 0.14, 0, 0.0); solid(lt_ & (ax <= 0.3), (0.86, 0.86, 0.82), 0.14, 0, 0.0)   # огни
mm = (mat == 1) & (cls == 11); solid(mm, (0.46, 0.47, 0.48), 0.38, 1.0)
gr_ = cls == 12                                         # шасси: потёртая серо-белая краска, тусклый шток, тёмная сталь, серая резина, пыль
g_p = gr_ & (mat == 0); g_c = gr_ & (mat == 1); g_s = gr_ & (mat == 8); g_d = gr_ & (mat == 5)
gm1 = fbm(2.4, 2.4, 2.4, 4, 91.0); gm2 = fbm(18.0, 18.0, 18.0, 3, 93.0); gst = fbm(1.0, 16.0, 2.2, 4, 87.0); gst2 = fbm(0.7, 34.0, 1.3, 3, 89.0)
solid(g_p, (0.60, 0.61, 0.61), 0.48, 0.30, 0.10); solid(g_c, (0.47, 0.47, 0.46), 0.30, 0.85, 0.08); solid(g_s, (0.145, 0.142, 0.14), 0.58, 0.75, 0.14)
solid(g_d, (0.335, 0.35, 0.365), 0.60, 0, 0.10); solid(gr_ & (mat == 9), (0.60, 0.56, 0.40), 0.28, 0, 0.1); solid(gr_ & (mat == 2), (0.05, 0.048, 0.046), 0.72, 0, 0.14)
painted = g_p | g_d
col[painted] *= (0.84 + 0.30 * gm1[painted] + 0.06 * gm2[painted])[..., None]
oil_ = smooth(0.46, 0.68, gst) * (0.5 + 0.5 * smooth(0.40, 0.70, gst2)); col = mix(col, (0.15, 0.125, 0.095), oil_ * 0.58 * (painted | g_c)); rough = rough + oil_ * 0.20 * painted - oil_ * 0.10 * g_c
gd = smooth(-1.20, -2.20, z) * gr_ * (0.45 + 0.55 * smooth(0.36, 0.66, gm1)); col = mix(col, (0.215, 0.195, 0.165), gd * 0.62 * (painted | g_s)); rough = rough + gd * 0.22 * painted
for ac_, xc_, zc_, rw_ in ((3.07, 0.31, -1.995, 0.265), (8.60, 2.60, -1.85, 0.41), (8.60, -2.60, -1.85, 0.41), (7.37, 2.60, -0.92, 0.41), (7.37, -2.60, -0.92, 0.41)):
    rd_ = np.hypot(a - ac_, z - zc_); md_ = gr_ & (rd_ < rw_ * 0.68) & (np.abs(x - xc_) < 0.18)
    dust = smooth(rw_ * 0.68, rw_ * 0.10, rd_) * (0.45 + 0.55 * smooth(0.34, 0.62, gm2)) * md_; col = mix(col, (0.115, 0.10, 0.085), dust * 0.72); rough = rough + dust * 0.15
g_e = smooth(0.985, 0.90, bev) * painted * smooth(0.50, 0.62, gm2); col = mix(col, (0.26, 0.255, 0.24), g_e * 0.8); rough = rough + g_e * 0.05
tyr = mat == 4; rt_ = smooth(0.40, 0.68, gm2) * tyr; col[tyr] = np.array((0.070, 0.070, 0.072), np.float32); col = mix(col, (0.165, 0.158, 0.145), rt_ * 0.50); col = mix(col, (0.20, 0.19, 0.17), smooth(-1.95, -2.24, z) * tyr * 0.45); rough[tyr] = 0.90
col[gr_] *= (0.50 + 0.50 * smooth(0.15, 0.95, ao2[gr_]))[..., None]
door_in = (cls == 7) & (nz > 0.2) & (z < 0.1); solid(door_in, (0.66, 0.66, 0.64), 0.55, 0, 0.14)
h_m = (cls == 14) & (mat == 1); solid(h_m, (0.27, 0.28, 0.29), 0.52, 0.25, 0.12)   # антенны, щупы, упоры: тёмные, без зеркала
c9 = cls == 9
m_can = c9 & (mat == 1); solid(m_can, (0.44, 0.45, 0.46), 0.38, 1.0)
rough = np.clip(rough, 0.08, 0.97); metal = np.clip(metal, 0, 1)
for c_ in range(16):
    m_ = (cls == c_) & cov
    if m_.sum() > 500: print('деталь', c_, 'цвет', (col[m_].mean(0) * 255).round(0), 'G', round(float(rough[m_].mean()), 2), 'B', round(float(metal[m_].mean()), 2))
col = np.clip(col, 0, 1)
log('материалы')
# ── высота и нормали ──
shag = fbm(150.0, 150.0, 150.0, 2, 73.0) if S >= 4096 else fbm(70.0, 70.0, 70.0, 2, 73.0)
height += (shag - 0.5) * 0.00018 * skin_m
wav = fbm(1.6, 1.6, 1.6, 2, 79.0); height += (wav - 0.5) * 0.007 * skin_m
height += smooth(0.1, 0.8, riv) * 0.0011 * skin_m; height += smooth(0.0, 0.075, seamd) * 0.0028 * (seamd < 8) * skin_m     # заклёпки выпуклые, панель подушкой от шва
ins_h = hedge < 8; height += smooth(0.0, 0.010, hedge) * 0.0005 * ins_h
height += scr * -0.0002
gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * DS); gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / (2 * DS)
nn = np.stack([-gx, -gy, np.ones_like(gx)], -1); nn /= np.linalg.norm(nn, axis=-1, keepdims=True)
solidm = np.isin(mat, (2, 10, 7, 9, 11, 12)) | (cls == 11) | (cls == 12) | (cls == 10) | (cls == 13) | (cls == 14) | (cls == 5)
nn[solidm] = (0, 0, 1)
def bleed(arrs, mask, n=14):
    m = mask.copy()
    for _ in range(n):
        w_ = m.astype(np.float32); W_ = np.roll(w_, 1, 0) + np.roll(w_, -1, 0) + np.roll(w_, 1, 1) + np.roll(w_, -1, 1); new = (~m) & (W_ > 0)
        if not new.any(): break
        for A_ in arrs:
            ex = A_ if A_.ndim == 3 else A_[..., None]
            s_ = (np.roll(ex * w_[..., None], 1, 0) + np.roll(ex * w_[..., None], -1, 0) + np.roll(ex * w_[..., None], 1, 1) + np.roll(ex * w_[..., None], -1, 1)) / np.maximum(W_, 1)[..., None]
            ex[new] = s_[new]
        m |= new
occ = np.clip(0.35 + 0.65 * smooth(0.10, 0.92, ao2) * smooth(0.25, 0.90, ao1), 0, 1)
bleed([col, rough, metal, occ, nn], cov)
def lift(arr): return (np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)
Image.fromarray(lift(col)[::-1]).save(f'{OUT}/a10_color.png', compress_level=1)
Image.fromarray(lift(nn * 0.5 + 0.5)[::-1]).save(f'{OUT}/a10_normal.png', compress_level=1)
orm = np.stack([occ, rough, metal], -1); Image.fromarray(lift(orm)[::-1]).save(f'{OUT}/a10_orm.png', compress_level=1)
pm = skin_m & cov & (cls == 0) & (a > 2.2) & (a < 12)
print('средний цвет обшивки sRGB', (col[pm].mean(0) * 255).round(1), 'шероховатость', round(float(rough[pm].mean()), 3), 'доля голого металла', round(float((metal[pm] > 0.5).mean()), 4))
log('сохранено', OUT)
