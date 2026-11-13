# paint_su.py - краска Су-25 из данных gbuf.py (с образца F-5E): цвет (краска и грязь, без света), нормали (заклёпки, крышки, шагрень), карта блеска glTF (R затенение, G шероховатость, B металл).
# Без Blender: /usr/bin/python3 -I paint_su.py. S25_SCHEME=base|light|pixel|bulg, S25_TEX=2048|4096, S25_OUT=<папка>, S25_GAIN=<множитель яркости краски>.
# Схемы: base - тёмно-зелёный и коричневый верх, голубой низ, красные номер и звёзды (фото 05, 08); light - песок и светло-зелёный по голубому (фото 06, 07);
# pixel - украинский цифровой (фото 03); bulg - выгоревшая болгарская (фото 255). Номера вымышленные.
import math, os, site, sys, time, json
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__)); DAT = os.path.join(HERE, '_проба')
S = int(os.environ.get('S25_TEX', '2048')); SCH = os.environ.get('S25_SCHEME', 'base'); OUT = os.environ.get('S25_OUT', os.path.join(DAT, SCH)); os.makedirs(OUT, exist_ok=True)
GAIN = float(os.environ.get('S25_GAIN', '1.0'))
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f} с]', *a, flush=True)
L2 = 15.53 / 2; GROUND = -1.58
pos = np.load(f'{DAT}/gb_pos_{S}.npy'); nor = np.load(f'{DAT}/gb_nor_{S}.npy'); idd = np.load(f'{DAT}/gb_id_{S}.npy'); aob = np.load(f'{DAT}/gb_ao_{S}.npy')
ATLAS = json.load(open(f'{DAT}/uv.json', encoding='utf-8'))['atlas_m']; PXM = 0.985 * S / ATLAS; DS = 1.0 / PXM
mat = np.round(idd[..., 0] * 16).astype(np.int8); cls = np.round(idd[..., 1] * 32).astype(np.int8); cov = idd[..., 2] > 0.5
a = (L2 - pos[..., 1]).astype(np.float32); x = pos[..., 0].astype(np.float32); z = pos[..., 2].astype(np.float32); ax = np.abs(x)
nx, ny, nz = nor[..., 0], nor[..., 1], nor[..., 2]
ao1, ao2, bev = aob[..., 0], aob[..., 1], aob[..., 2]
def _med5(m):                                                      # медиана креста 5 пикселей: убирает одиночные тёмные точки шума запекания (пятно «как надпись» у заборника), щели и стыки остаются
    st = np.stack([m, np.roll(m, 1, 0), np.roll(m, -1, 0), np.roll(m, 1, 1), np.roll(m, -1, 1)]); st.sort(axis=0); return st[2]
ao1 = np.maximum(ao1, _med5(ao1)); ao2 = np.maximum(ao2, _med5(ao2)); bev = np.maximum(bev, _med5(bev))
log('данные загружены', S, 'плотность', round(PXM), 'пикс/м, схема', SCH)
SCHEME = ''
# классы деталей (gbuf.py): 0 обшивка, 1 киль, 2 руль, 3 стабилизатор, 4 закрылки, элероны, рули высоты, 5 предкрылки, 6 щитки, 7 законцовочные гондолы, 8 пилоны, 9 рамы фонаря,
# 10 сопла, 11 кабина, 12 шасси, 13 кассеты, 14 мелочь (пушка, ПВД); материалы: 0 краска, 1 металл, 2 нутро, 4 резина, 5 кабина, 7 канал, 8 тёмная сталь
def W_LE(x_): return 7.05 + (x_ - 1.20) * 0.335
def W_TE(x_): return 10.05 - (x_ - 1.20) * 0.020
def W_ZC(x_): return 0.830 - 0.0625 * (x_ - 1.25)
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


R3 = np.array([[0.80, 0.36, -0.48], [-0.60, 0.48, -0.64], [0.0, 0.80, 0.60]], np.float32)     # поворот на каждой октаве: иначе у шума видна решётка (ромбы)


def fbm(fa, fx_, fz_, octv=3, seed=0.0):
    r = 0.0; w = 0.5; tot = 0.0; k = 1.0
    pa, px, pz = a * fa, x * fx_, z * fz_
    # лёгкое коробление координат: пятна без прямых краёв
    wa = vnoise(pa * 0.7 + seed + 11.3, px * 0.7 - seed, pz * 0.7 + 5.1) - 0.5; wb = vnoise(pa * 0.7 - 7.7, px * 0.7 + seed + 3.3, pz * 0.7 - seed) - 0.5
    pa, px, pz = pa + wa * 0.9, px + wb * 0.9, pz + (wa - wb) * 0.6
    for i in range(octv):
        qa = R3[0, 0] * pa + R3[0, 1] * px + R3[0, 2] * pz; qx = R3[1, 0] * pa + R3[1, 1] * px + R3[1, 2] * pz; qz = R3[2, 0] * pa + R3[2, 1] * px + R3[2, 2] * pz
        pa, px, pz = qa * 2.03, qx * 2.03, qz * 2.03
        r = r + w * vnoise(qa + seed + i * 3.1, qx - seed * 0.7, qz + seed * 1.3 + i); tot += w; w *= 0.5
    return r / tot


def rng_tab(n, seed, lo, hi):
    return np.random.RandomState(seed).uniform(lo, hi, n).astype(np.float32)


def mix(c, col, t):
    t = np.clip(t, 0, 1)[..., None]; return c * (1 - t) + np.asarray(col, np.float32) * t




skin_m = (mat == 0)
wing = (cls == 0) & (ax > 1.30) & (np.abs(z - W_ZC(ax)) < 0.16)
finm = (cls == 1) | (cls == 2)
# ── схемы: цвета sRGB 0…1 (сняты с фото кластерами и на глаз; Blender темнее фото, игра светлее - середина) ──
def C(*v): return np.array(v, np.float32) / 255.0
PAL = {
    'base': dict(top=[C(84, 106, 72), C(96, 78, 72)], th=[0.50], low=C(150, 190, 214), num=C(168, 40, 34), num_edge=C(226, 226, 220)),
    'light': dict(top=[C(178, 154, 112), C(118, 134, 88)], th=[0.47], low=C(160, 196, 216), num=C(170, 44, 36), num_edge=C(228, 228, 222)),
    'pixel': dict(top=[C(192, 195, 192), C(142, 149, 149), C(98, 107, 110), C(64, 74, 80)], th=[0.30, 0.54, 0.76], low=None, num=C(38, 56, 112), num_edge=C(222, 196, 70)),
    'bulg': dict(top=[C(112, 124, 84), C(126, 110, 88), C(82, 98, 70)], th=[0.38, 0.66], low=C(142, 180, 206), num=C(232, 232, 226), num_edge=None),
}[SCH]
# камуфляж: крупные пятна 1,5-3 м по 3D-координатам с короблением; край пятна 3-5 см (краскопульт)
def bands(v, th, soft):
    w = np.zeros(v.shape + (len(th) + 1,), np.float32); prev = np.ones(v.shape, np.float32)
    for i, t in enumerate(th):
        s_ = smooth(t - soft, t + soft, v); w[..., i] = prev - s_; prev = s_
    w[..., len(th)] = prev; return w
if SCH == 'pixel':
    Q = 0.11                                                        # клетка цифрового узора, м
    topv = np.abs(nz) >= np.maximum(np.abs(nx), np.abs(ny)); sidev_ = (np.abs(nx) > np.abs(ny)) & ~topv
    U_ = np.where(topv | sidev_, a, x); V_ = np.where(topv, x, z)
    cu, cv = (np.floor(U_ / Q) + 0.5) * Q, (np.floor(V_ / Q) + 0.5) * Q
    side_id = np.where(topv, 0.0, np.where(sidev_, 7.3, 13.1)) + np.where(np.where(topv, nz, np.where(sidev_, nx, ny)) > 0, 0.0, 3.7)
    def vq(f, sd): return vnoise(cu * f + sd, cv * f - sd * 0.7, side_id * 0 + sd * 1.3)
    v = 0.56 * vq(0.55, 3.0) + 0.26 * vq(1.6, 11.0) + 0.12 * vq(4.5, 23.0)
    hq = vnoise(np.floor(U_ / Q) * 7.31 + 0.5, np.floor(V_ / Q) * 5.17 + 0.5, side_id * 3.3 + 0.5)          # своя добавка каждой клетке: рваный край, одиночные пиксели
    hq2 = vnoise(np.floor(U_ / (Q * 2)) * 3.71 + 0.5, np.floor(V_ / (Q * 2)) * 4.13 + 0.5, side_id * 2.1 + 9.5)   # и блоками 2×2
    v = v + 0.10 * (hq - 0.5) + 0.06 * (hq2 - 0.5)
    v = (v - 0.18) / 0.64
    wts = bands(v, PAL['th'], 0.002)
else:
    v = fbm(0.42, 0.42, 0.42, 3, 5.0 + 17.0 * (SCH == 'light') + 31.0 * (SCH == 'bulg'))
    v = (v - 0.22) / 0.56
    wts = bands(v, PAL['th'], 0.012)
TOP = sum(PAL['top'][i] * wts[..., i:i + 1] for i in range(len(PAL['top'])))
# низ: голубой; граница по борту волной (фото 05: нос снизу, гондолы почти целиком, под крылом и стабилизатором)
def zline(a_):
    return np.interp(a_, [0.0, 1.6, 2.4, 4.0, 5.5, 6.2, 9.5, 11.6, 12.5, 15.5], [-0.12, -0.14, -0.10, -0.02, 0.12, 0.62, 0.66, 0.55, 0.62, 0.78]).astype(np.float32)
wav = fbm(0.9, 0.9, 0.9, 2, 7.0) - 0.5
planef = wing | np.isin(cls, (3, 4, 5, 7, 8)) & (ax > 1.3)
und_side = smooth(0.03, -0.03, z - zline(a) + 0.10 * wav)
und_plane = smooth(0.05, -0.20, nz)
U_low = np.where(planef | (cls == 3) | (cls == 4) & (ax > 0.5), und_plane, np.maximum(und_side * smooth(0.65, 0.2, nz), smooth(-0.35, -0.6, nz)))
U_low = np.where(finm, 0.0, U_low)
if PAL['low'] is None:                                            # пиксель: снизу тот же узор, светлее
    LOW = TOP * 0.78 + C(196, 199, 199) * 0.22                    # снизу узор тот же, чуть светлее (в игре низ и так светлее)
else:
    LOW = np.ones_like(TOP) * PAL['low']
BASE = TOP * (1 - U_low[..., None]) + LOW * U_low[..., None]
BASE = BASE * GAIN
col = BASE.copy(); rough = np.full((S, S), 0.62 if SCH != 'pixel' else 0.58, np.float32); metal = np.zeros((S, S), np.float32); height = np.zeros((S, S), np.float32)
# тон листов
RINGS = np.array([1.40, 2.40, 2.95, 5.08, 6.00, 7.20, 8.40, 9.60, 10.80, 11.60, 12.6, 13.6, 14.6], np.float32)
band = np.searchsorted(np.append(RINGS, 40.0), a); lat = (x > 0).astype(np.int32) * 2 + (z > 0.2).astype(np.int32)
tt = rng_tab(64, 7, 0.975, 1.025); rt = rng_tab(64, 8, -0.025, 0.025); hue = rng_tab(64, 9, -0.006, 0.006)
idx = (band * 4 + lat) % 64; tone = tt[idx]; rtone = rt[idx]
cw = np.maximum(W_TE(ax) - W_LE(ax), 0.3); uc = (a - W_LE(ax)) / cw
wb = (uc > 0.15).astype(np.int32) + (uc > 0.68); wr = (ax > 2.4).astype(np.int32) + (ax > 3.6) + (ax > 4.8); wi = (wb * 4 + wr) * 4 + (x > 0) * 2 + (nz > 0)
tone = np.where(wing, tt[(wi + 17) % 64], tone); rtone = np.where(wing, rt[(wi + 17) % 64], rtone)
for c_, sd in ((1, 21), (2, 23), (3, 25), (4, 27), (5, 29), (6, 31), (7, 33), (8, 35), (13, 37)):
    ix_ = (x > 0).astype(np.int32) + sd + (ax > 3.0) * 3 * (c_ == 4); tone = np.where(cls == c_, 1.0 + (tt[ix_ % 64] - 1.0) * 0.45, tone); rtone = np.where(cls == c_, rt[ix_ % 64], rtone)
col *= tone[..., None]; rough += rtone
col[..., 0] *= 1 + hue[idx]; col[..., 2] *= 1 - hue[idx]
# подкраски: прямоугольники свежей краски (на штурмовиках их много)
RS = np.random.RandomState(31)
tup = nz > 0.45; tdn = nz < -0.45; tsd = np.abs(nx) > 0.45
for vm, A_, Q_, n_, qa, qb in ((tup, a, x, 14, -6.5, 6.5), (tdn, a, x, 8, -6.5, 6.5), (tsd, a, z, 10, -0.5, 1.0)):
    ids = np.nonzero((vm & (cls <= 8)).ravel())[0]; AA, QQ = A_.ravel()[ids], Q_.ravel()[ids]
    for k in range(n_):
        a0 = RS.uniform(1.5, 14.0); w = RS.uniform(0.25, 1.1); q0 = RS.uniform(qa, qb); h_ = RS.uniform(0.15, 0.6); e_ = 0.012
        d = np.minimum.reduce([AA - a0, a0 + w - AA, QQ - q0, q0 + h_ - QQ]); sel = d > -e_
        if not sel.any(): continue
        t_ = np.clip((d[sel] + e_) / (2 * e_), 0, 1); kk = RS.uniform(0.96, 1.04); cc = ids[sel]
        for ch_ in range(3): col[..., ch_].ravel()[cc] *= 1 + (kk * (1 + RS.uniform(-0.015, 0.015)) - 1) * t_
        rough.ravel()[cc] += t_ * RS.uniform(-0.04, 0.02)
# ── панели и люки (чертежи 01, 13): прямоугольники - крышки, ломаные - швы ──
def loop(a0, a1, q0, q1): return [(a0, q0), (a1, q0), (a1, q1), (a0, q1), (a0, q0)]
def wline(u, x0, x1, n=8): return [(W_LE(x0 + (x1 - x0) * k / n) + u * (W_TE(x0 + (x1 - x0) * k / n) - W_LE(x0 + (x1 - x0) * k / n)), x0 + (x1 - x0) * k / n) for k in range(n + 1)]
def wrib(xr, u0=0.03, u1=0.70): return [(W_LE(xr) + u0 * (W_TE(xr) - W_LE(xr)), xr), (W_LE(xr) + u1 * (W_TE(xr) - W_LE(xr)), xr)]
WING = [wline(0.15, 1.35, 6.70), wline(0.68, 1.35, 6.70)] + [wrib(xr) for xr in (2.0, 2.8, 3.6, 4.4, 5.1, 5.9)]
TOP_P = [[(2.95, 0.0), (2.95, 0.30)], loop(5.30, 6.10, 0.0, 0.18), loop(6.40, 7.30, 0.0, 0.20), loop(9.70, 10.70, 0.0, 0.20), loop(11.2, 12.1, 0.0, 0.16),
         [(5.2, 0.24), (12.6, 0.24)], [(6.2, 0.55), (11.4, 0.55)], loop(7.4, 8.6, 0.62, 1.05), loop(9.0, 10.1, 0.62, 1.05)] + WING
BOT_P = [loop(3.55, 4.55, 0.0, 0.16), [(3.55, 0.004), (4.55, 0.004)], loop(7.95, 9.35, 0.95, 1.40), loop(5.0, 6.2, 0.05, 0.30), [(4.6, 0.004), (11.5, 0.004)], loop(9.6, 11.2, 0.10, 0.40)] + WING
SIDE_P = [loop(1.80, 2.35, -0.20, 0.20), loop(3.10, 3.90, -0.45, -0.05), loop(4.10, 4.90, -0.40, 0.10), loop(5.30, 5.85, -0.35, 0.20),
          [(6.0, 0.30), (11.6, 0.30)], loop(8.0, 9.6, -0.30, 0.20), loop(9.8, 11.4, -0.25, 0.25), [(12.0, 0.75), (15.2, 0.85)], loop(12.4, 13.6, 0.50, 0.95)]
seamd = np.full((S, S), 9.0, np.float32); riv = np.zeros((S, S), np.float32); aft = np.zeros((S, S), np.float32)
PITCH = 0.048; RV = 0.0055; OFF = 0.032
def lines(pts, A, Q, mask):
    ids = np.nonzero(mask.ravel())[0]; AA, QQ = A.ravel()[ids], Q.ravel()[ids]
    for p0, p1 in zip(pts, pts[1:]):
        da, dq = p1[0] - p0[0], p1[1] - p0[1]; Ln = (da * da + dq * dq) ** 0.5
        if Ln < 1e-6: continue
        ta, tq = da / Ln, dq / Ln; w = (AA - p0[0]) * ta + (QQ - p0[1]) * tq; hh = (AA - p0[0]) * -tq + (QQ - p0[1]) * ta
        if abs(ta) < 0.6:           # поперечный шов: потёк назад по потоку
            s2_ = (w > -0.02) & (w < Ln + 0.02) & (AA > p0[0] + (w * ta)) & (AA < p0[0] + w * ta + 0.55)
            if s2_.any():
                id3 = ids[s2_]; dA = AA[s2_] - (p0[0] + w[s2_] * ta); aft.ravel()[id3] = np.maximum(aft.ravel()[id3], np.exp(-dA / 0.16))
        sel = (w > -0.02) & (w < Ln + 0.02) & (np.abs(hh) < 0.08)
        if not sel.any(): continue
        id2 = ids[sel]; wv, hv = w[sel], hh[sel]; dd = np.abs(hv)
        seamd.ravel()[id2] = np.minimum(seamd.ravel()[id2], dd)
        ph = (wv / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH
        for sgn in (1, -1):
            dr = np.hypot(dph, hv - sgn * OFF); riv.ravel()[id2] = np.maximum(riv.ravel()[id2], np.clip(1 - dr / RV, 0, 1))

hullm = (cls == 0) | (cls == 1) | (cls == 7)
top_m = nz > 0.5; bot_m = nz < -0.5; sr_m = nx > 0.45; sl_m = nx < -0.45
hatch = np.zeros((S, S), np.float32); hedge = np.full((S, S), 9.0, np.float32)
def rect_mask(A, Q, r):
    a0, a1 = min(p[0] for p in r), max(p[0] for p in r); q0, q1 = min(p[1] for p in r), max(p[1] for p in r)
    ins = (A > a0) & (A < a1) & (Q > q0) & (Q < q1); d = np.minimum.reduce([A - a0, a1 - A, Q - q0, q1 - Q]); return ins, d
# люки по бортам, низу и верху: сверх ручных - по одному-два в каждом отсеке между кольцевыми швами (чертёж 01 сбоку: штурмовик весь в люках)
RH = np.random.RandomState(53)
for a0_, a1_ in zip(RINGS[:-1], RINGS[1:]):
    if a1_ - a0_ < 0.5 or a0_ > 14.2: continue
    for k_ in range(RH.randint(1, 3)):
        w_ = RH.uniform(0.22, min(0.75, a1_ - a0_ - 0.12)); s_ = RH.uniform(a0_ + 0.06, a1_ - 0.06 - w_); zlo, zhi = (-0.40, 0.45) if a0_ < 5.8 else ((-0.30, 0.50) if a0_ < 11.8 else (0.55, 0.95))
        h_ = RH.uniform(0.14, 0.38); q_ = RH.uniform(zlo, zhi - h_)
        if not any(min(p_[0] for p_ in r_) < s_ + w_ + 0.06 and max(p_[0] for p_ in r_) > s_ - 0.06 and min(p_[1] for p_ in r_) < q_ + h_ + 0.06 and max(p_[1] for p_ in r_) > q_ - 0.06 for r_ in SIDE_P if len(r_) == 5):
            SIDE_P.append(loop(s_, s_ + w_, q_, q_ + h_))                # без наложения на соседние крышки
    if 2.0 < a0_ < 11.5:
        w_ = RH.uniform(0.25, 0.6); s_ = RH.uniform(a0_ + 0.05, max(a0_ + 0.06, a1_ - 0.05 - w_)); q_ = RH.uniform(0.04, 0.18); BOT_P.append(loop(s_, s_ + w_, q_, q_ + RH.uniform(0.12, 0.26)))
for xr0, xr1 in ((2.1, 2.7), (3.0, 3.5), (3.9, 4.3), (4.7, 5.0)):                                       # лючки на крыле у пилонов, сверху и снизу
    for vv in (0.30, 0.52):
        aa = W_LE(xr0) + vv * (W_TE(xr0) - W_LE(xr0)); TOP_P.append(loop(aa, aa + 0.22, xr0, xr0 + 0.18)); BOT_P.append(loop(aa - 0.05, aa + 0.20, xr0 + 0.05, xr0 + 0.25))
fast = np.zeros((S, S), np.float32)                                                                       # винты по краю крышек: шаг 5 см, 1,6 см от края
Hk = 0
for lst, vmask, Q in ((TOP_P, top_m, ax), (BOT_P, bot_m, ax), (SIDE_P, sr_m | sl_m, z)):
    for r in lst:
        if len(r) >= 5 and r[0] == r[-1] and not (r in WING):
            ins, d = rect_mask(a, Q, r); ins &= vmask & ((cls == 0) | (cls == 7)); hatch[ins] = 1.0; hedge[ins] = np.minimum(hedge[ins], d[ins]); col[ins] *= 1.0 + 0.018 * ((Hk % 3) - 1); rough[ins] -= 0.04; Hk += 1
            a0_, a1_ = min(p_[0] for p_ in r), max(p_[0] for p_ in r); q0_, q1_ = min(p_[1] for p_ in r), max(p_[1] for p_ in r)
            m_ = ins & (d < 0.03)
            if m_.any():
                A_, Q_, D_ = a[m_], Q[m_], d[m_]; onA = np.minimum(A_ - a0_, a1_ - A_) <= np.minimum(Q_ - q0_, q1_ - Q_)
                t_ = np.where(onA, Q_, A_); ph = (t_ / 0.05) % 1.0; dph = np.minimum(ph, 1 - ph) * 0.05
                fast[m_] = np.maximum(fast[m_], np.clip(1 - np.hypot(dph, D_ - 0.016) / 0.0065, 0, 1))
# стрингеры: продольные ряды заклёпок по бортам фюзеляжа и гондол через 0,22 м
for zk in np.arange(-0.44, 1.10, 0.22):
    m_ = (sr_m | sl_m) & (cls == 0) & (np.abs(z - zk) < 0.02) & ~wing & (a > 2.4)                 # носовой обтекатель без стрингеров
    ph = (a[m_] / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH; riv[m_] = np.maximum(riv[m_], 0.7 * np.clip(1 - np.hypot(dph, z[m_] - zk) / RV, 0, 1))
for xk in np.arange(0.18, 1.3, 0.24):
    m_ = (top_m | bot_m) & (cls == 0) & (np.abs(ax - xk) < 0.02) & ~wing & (a > 2.4)
    ph = (a[m_] / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH; riv[m_] = np.maximum(riv[m_], 0.7 * np.clip(1 - np.hypot(dph, ax[m_] - xk) / RV, 0, 1))
# лонжероны крыла: ряды на 15 и 68 % хорды, нервюры через 0,4 м
for uk in (0.15, 0.40, 0.68):
    m_ = wing & (np.abs(uc - uk) * cw < 0.02); ph = (ax[m_] / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH
    riv[m_] = np.maximum(riv[m_], np.clip(1 - np.hypot(dph, (uc[m_] - uk) * cw[m_]) / RV, 0, 1))
m_ = wing; rr = (ax[m_] / 0.40) % 1.0; dq = np.minimum(rr, 1 - rr) * 0.40; ph = (a[m_] / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH
riv[m_] = np.maximum(riv[m_], 0.8 * np.clip(1 - np.hypot(dph, dq) / RV, 0, 1))
for L_ in TOP_P: lines(L_, a, ax, top_m & hullm)
for L_ in BOT_P: lines(L_, a, ax, bot_m & hullm)
for L_ in SIDE_P: lines(L_, a, z, (sr_m | sl_m) & hullm)
fus = (cls == 0) & ~wing & (ax < 1.35)
for rA in RINGS:
    m = (np.abs(a - rA) < 0.08) & fus; phi = np.arctan2(x, z - 0.3) * 0.55; seamd[m] = np.minimum(seamd[m], np.abs(a[m] - rA))
    for sgn in (1, -1):
        ph = (phi[m] / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH; dr = np.hypot(dph, a[m] - rA - sgn * OFF); riv[m] = np.maximum(riv[m], np.clip(1 - dr / RV, 0, 1))
for m, Q, st, A__ in ((cls == 1, z, 0.42, a), (cls == 3, ax, 0.40, a), (cls == 4, ax, 0.45, a), (cls == 5, ax, 0.55, a), (cls == 8, a, 0.5, z), (cls == 7, a, 0.35, z)):
    rr = (Q[m] / st) % 1.0; dq = np.minimum(rr, 1 - rr) * st; ph = (A__[m] / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH
    riv[m] = np.maximum(riv[m], np.clip(1 - np.hypot(dph, dq) / RV, 0, 1))
log('панели и заклёпки', float((riv > 0).mean()))
# ── пятна, фотомаски CC0, выгорание, потёки, грязь (штурмовик с грунтовых аэродромов: грязнее F-5E) ──
mott = fbm(0.55, 0.55, 0.55, 4, 1.0); fine = fbm(11.0, 11.0, 11.0, 2, 5.0); patch = fbm(1.4, 1.4, 1.4, 4, 9.0)
under = smooth(-0.15, -0.75, nz); amp = 1.0 - 0.4 * under
col *= (1 + (0.08 * (mott - 0.5) + 0.024 * (fine - 0.5)) * amp)[..., None]
CC0D = os.path.join(HERE, '..', '_текстуры_CC0')
def _ld(rel):
    return np.asarray(Image.open(os.path.join(CC0D, rel)).convert('L').resize((1024, 1024), Image.BILINEAR), np.float32) / 255.0
SI3 = _ld('SurfaceImperfections003/SurfaceImperfections003_2K-JPG_Opacity.jpg'); SC3 = _ld('Scratches003/Scratches003_2K-JPG_Opacity.jpg'); SC5 = _ld('Scratches005/Scratches005_2K-JPG_Opacity.jpg'); LK = _ld('Leaking012A/Leaking012A_2K-JPG_Color.jpg')
sidev = np.abs(nx) > np.abs(nz)
def cc0(M, size, flow=False):
    Qp = np.where(sidev, -z, x); Ap = a
    if flow: u_, v_ = (Qp / size) % 1.0, (Ap / size) % 1.0
    else: u_, v_ = (Ap / size) % 1.0, (Qp / size) % 1.0
    if flow: u_ = np.where(sidev, (Ap / size) % 1.0, u_); v_ = np.where(sidev, (-z / size) % 1.0, v_)
    return M[(v_ * 1023).astype(np.int32), (u_ * 1023).astype(np.int32)]
imp = cc0(SI3, 1.30); scrm = np.maximum(cc0(SC3, 0.90), cc0(SC5, 1.40) * 0.8); leak = 1.0 - cc0(LK, 1.60, flow=True)
col *= (1 - 0.05 * (imp - 0.5) * skin_m)[..., None]; rough += (imp - 0.5) * 0.10 * skin_m
walk = (smooth(1.2, 0.5, np.abs(a - 4.6)) * smooth(0.75, 0.45, ax) + smooth(0.9, 0.3, np.abs(a - 8.0)) * smooth(2.2, 1.4, ax)) * smooth(0.3, 0.7, nz)
scr_cc = smooth(0.35, 0.75, scrm) * skin_m * (0.25 + 0.75 * walk) * smooth(-0.2, 0.4, nz)
col = mix(col, BASE * 1.10, scr_cc * 0.30); rough -= scr_cc * 0.10
lk_ = smooth(0.25, 0.70, leak) * skin_m * (0.30 + 0.70 * smooth(0.0, 0.35, np.abs(nx))) * (1 - 0.8 * smooth(-0.3, -0.7, nz))
col = mix(col, (0.22, 0.21, 0.19), lk_ * 0.13); rough += lk_ * 0.05
polish = smooth(0.55, 0.72, fbm(0.9, 0.9, 0.9, 3, 13.0)); rough += (mott - 0.5) * 0.05 - polish * 0.025
sun = smooth(0.25, 0.9, nz); col = mix(col, BASE * np.array([1.10, 1.08, 1.03], np.float32), sun * smooth(0.40, 0.72, patch) * (0.30 if SCH == 'bulg' else 0.16))     # выгорело сверху
stre = fbm(0.75, 11.0, 11.0, 4, 3.0); stre2 = fbm(0.42, 26.0, 26.0, 3, 17.0)
flow = smooth(0.50, 0.70, stre) * (0.35 + 0.65 * smooth(0.35, 0.70, patch)); flow2 = smooth(0.58, 0.74, stre2)
rearw = 0.45 + 0.55 * smooth(6.0, 13.0, a)
dirty = flow * rearw * np.where(nz < -0.2, 0.10, 0.30)
col = mix(col, (0.22, 0.21, 0.19), dirty * 0.10); rough += dirty * 0.04
col = mix(col, (0.16, 0.15, 0.14), flow2 * 0.02 * rearw)
oil = under * smooth(0.50, 0.72, fbm(1.0, 2.0, 2.0, 4, 23.0)) * np.where(ax > 1.4, 0.25, 1.0) * smooth(5.5, 11.0, a)
col = mix(col, (0.30, 0.29, 0.27), oil * 0.12); rough += oil * 0.08
for a0_, a1_, q0_, q1_ in ((3.55, 4.55, 0.0, 0.17), (7.95, 9.35, 0.95, 1.40), (9.6, 11.2, 0.10, 0.40)):
    m_ = smooth(a0_ - 0.10, a0_ + 0.10, a) * smooth(a1_ + 0.30, a1_ - 0.25, a) * smooth(q0_ - 0.1, q0_ + 0.1, ax) * smooth(q1_ + 0.12, q1_ - 0.12, ax) * under * smooth(0.36, 0.66, fbm(1.6, 3.0, 3.0, 3, 29.0))
    col = mix(col, (0.24, 0.22, 0.20), m_ * 0.18); rough += m_ * 0.08
# брызги от колёс: грунт, веером назад
for ac_, xc_, w0_ in ((9.05, 1.27, 0.28), (9.05, -1.27, 0.28), (4.10, -0.12, 0.22)):
    da_ = a - ac_; fan_ = smooth(-0.1, 0.5, da_) * smooth(3.6, 1.0, da_) * np.exp(-((x - xc_) / (w0_ + 0.28 * np.clip(da_, 0, None))) ** 2)
    spr_ = under * fan_ * (0.30 + 0.70 * smooth(0.42, 0.70, fbm(0.55, 17.0, 17.0, 3, 61.0 + ac_ + xc_))) * (mat == 0) * (cls <= 8)
    col = mix(col, (0.28, 0.24, 0.19), spr_ * 0.24); rough += spr_ * 0.08
# копоть пушки ГШ-30-2: снизу слева у ствола, назад по потоку
dxg = x + 0.235; gun_ = smooth(2.05, 2.25, a) * smooth(4.8, 3.0, a) * np.exp(-(dxg / (0.06 + 0.06 * np.clip(a - 2.2, 0, None))) ** 2) * (z < 0.0) * ((cls == 0) | (cls == 14))
gun_ *= (0.55 + 0.45 * smooth(0.35, 0.70, fbm(1.2, 18.0, 18.0, 3, 101.0)))
col = mix(col, (0.09, 0.085, 0.08), gun_ * 0.80); rough += gun_ * 0.20
# копоть у сопел: две трубы, у основания мягко
NXC, NZC = 0.89, 0.35
rn = np.minimum(np.hypot(x - NXC, z - NZC), np.hypot(x + NXC, z - NZC))
soot = smooth(10.9, 11.6, a) * (0.45 + 0.55 * smooth(0.28, 0.72, fbm(0.7, 2.6, 2.6, 4, 31.0))) * ((cls == 0) | (cls == 3) | (cls == 4)) * smooth(0.85, 0.45, rn) * (mat == 0)
col = mix(col, (0.11, 0.105, 0.10), soot * 0.55); rough += soot * 0.26
hair = smooth(0.0085, 0.002, seamd); col *= (1 - 0.22 * hair * skin_m)[..., None]; rough += hair * 0.04 * skin_m
halo = smooth(0.07, 0.0, seamd) * smooth(0.30, 0.66, stre) * skin_m; col *= (1 - 0.04 * halo)[..., None]
stain = aft * smooth(0.38, 0.72, stre) * skin_m * (1 - 0.7 * under); col = mix(col, (0.18, 0.18, 0.17), stain * 0.10); rough += stain * 0.03
crev = smooth(0.92, 0.45, ao1) * skin_m; col = mix(col, (0.10, 0.10, 0.10), crev * 0.45); rough += crev * 0.26
body_ = smooth(0.15, 0.95, ao2); col *= (0.95 + 0.05 * body_)[..., None]
fs_ = smooth(0.0, 0.5, fast) * skin_m; col *= (1 - 0.10 * fs_)[..., None]; rough -= fs_ * 0.06
rv_d = smooth(0.0, 0.25, riv); rv_top = smooth(0.25, 0.75, riv); col *= (1 - rv_d * 0.05 * skin_m)[..., None]; col += (rv_top * 0.008 * skin_m)[..., None]
# кромки и сколы: по краю грунт (жёлто-зелёный АК-070), в глубине металл
edge = smooth(0.985, 0.90, bev) * skin_m
sL = a - W_LE(ax); LE_w = smooth(0.13, 0.02, sL) * (sL > -0.03) * (wing | (cls == 5))
col = mix(col, BASE * 1.10, LE_w * 0.35); rough -= LE_w * 0.10
eros = smooth(0.46, 0.60, fbm(9.0, 9.0, 9.0, 3, 37.0))
chip = np.maximum(edge * smooth(0.52, 0.62, fbm(14.0, 14.0, 14.0, 3, 41.0)), LE_w * smooth(0.66, 0.78, eros) * 0.55)
scuff = smooth(0.030, 0.006, hedge) * smooth(0.52, 0.64, fbm(22.0, 22.0, 22.0, 3, 43.0))
scr = smooth(0.76, 0.78, fbm(5.0, 70.0, 70.0, 2, 47.0)) * smooth(0.60, 0.72, patch) * sun * 0.06
rough -= (edge * 0.12 + scuff * 0.14)
mov = np.isin(cls, (2, 4, 5, 6)); chip = chip * np.where(mov, 0.15, 0.65) * smooth(15.0, 14.0, a); edge = edge * np.where(mov, 0.2, 1.0)
dmg = np.clip(chip * 0.9 + scuff * 0.25 + scr * 0.6, 0, 1) * skin_m
prim = smooth(0.20, 0.42, dmg); bare = smooth(0.50, 0.88, dmg)
CHIP = os.environ.get('S25_CHIP', 'old')                       # сколы (Mark: жёлтый грунт «кислотный»): old - старая тёмная краска, metal - алюминий, grey - светло-серый грунт
PRIM = {'old': np.array((0.36, 0.38, 0.38), np.float32), 'metal': np.array((0.52, 0.53, 0.55), np.float32), 'grey': np.array((0.64, 0.65, 0.63), np.float32)}[CHIP]
BARE = np.array((0.60, 0.61, 0.63), np.float32)
col = mix(col, PRIM, prim * (0.55 if CHIP != 'metal' else 0.25)); rough += prim * 0.05
col = mix(col, BARE, bare); rough = rough * (1 - bare) + bare * (0.36 + 0.05 * fine); metal = np.maximum(metal, smooth(0.45, 0.75, bare))
# ── проход реалистичности (Mark: «максимум реалистичности, а не пластиковости»): матовость, выцветание, подкраски, потёки, утечки, сколы, грязь ──
RR = np.random.RandomState(97)
pm_ = skin_m & (cls <= 8)                                           # крашеная обшивка и плоскости
sidev2 = np.abs(nx) > 0.45; topv2 = nz > 0.45; botv2 = nz < -0.45
# 1. матовая краска: шероховатость выше и неровная по листам и пятнами (у цифрового камуфляжа краска матовая)
rough += pm_ * (0.08 + 0.05 * (fbm(2.2, 2.2, 2.2, 3, 201.0) - 0.5) + 0.03 * (fine - 0.5))
prow = rng_tab(64, 211, -0.05, 0.05); rough += pm_ * prow[idx]
# 2. выцветание: верх светлее и «меловее» (меньше насыщенность), пятнами; по листам разная степень
lum = col.mean(-1, keepdims=True); fadeT = (sun * (0.55 + 0.45 * smooth(0.35, 0.7, fbm(0.8, 0.8, 0.8, 3, 223.0))) * pm_)[..., None]
col = col * (1 - 0.30 * fadeT) + (lum * 1.10 + 0.03) * 0.30 * fadeT; rough += fadeT[..., 0] * 0.05
ptone = rng_tab(64, 227, 0.95, 1.05); col *= np.where(pm_, ptone[(idx + 13) % 64], 1.0)[..., None]
# 3. подкраски: свежая краска одним серым поверх узора, с жёстким краем кисти/распылителя (частая картина на штурмовиках)
TOUCH = [C(150, 156, 156), C(118, 126, 128), C(170, 174, 172), C(96, 104, 108)]
for vm, A_, Q_, n_, qa, qb in ((topv2, a, x, 16, -6.5, 6.5), (sidev2, a, z, 18, -0.5, 1.05), (botv2, a, x, 8, -2.0, 2.0)):
    ids = np.nonzero((vm & pm_).ravel())[0]; AA, QQ = A_.ravel()[ids], Q_.ravel()[ids]
    for k in range(n_):
        a0 = RR.uniform(1.6, 14.0); w = RR.uniform(0.10, 0.55); q0 = RR.uniform(qa, qb); h_ = RR.uniform(0.06, 0.32)
        e_ = RR.uniform(0.004, 0.02); d = np.minimum.reduce([AA - a0, a0 + w - AA, QQ - q0, q0 + h_ - QQ])
        d = d + 0.025 * (vnoise(AA * 9 + k, QQ * 9 - k, np.full_like(AA, k * 1.7)) - 0.5)       # неровный край
        sel = d > -e_
        if not sel.any(): continue
        t_ = np.clip((d[sel] + e_) / (2 * e_), 0, 1) * RR.uniform(0.75, 1.0); cc = ids[sel]; tc = TOUCH[RR.randint(len(TOUCH))] * RR.uniform(0.96, 1.04)
        for ch_ in range(3): col[..., ch_].ravel()[cc] = col[..., ch_].ravel()[cc] * (1 - t_) + tc[ch_] * t_
        rough.ravel()[cc] -= t_ * 0.06
# 4. потёки дождя по бортам: вертикальные полосы вниз от люков, швов и винтов; на крыле и сверху - назад по потоку
vstr = fbm(16.0, 16.0, 0.9, 3, 233.0); vstr2 = fbm(40.0, 40.0, 1.6, 2, 239.0)
src = np.clip(smooth(0.06, 0.0, seamd) + smooth(0.5, 0.0, hedge) * 0.6 + smooth(0.1, 0.6, fast), 0, 1)
rain = sidev2 * pm_ * smooth(0.52, 0.72, vstr) * (0.45 + 0.55 * smooth(0.45, 0.75, vstr2)) * (0.35 + 0.65 * smooth(0.2, 0.7, patch))
col = mix(col, (0.24, 0.24, 0.23), rain * 0.16); rough += rain * 0.05
rainL = sidev2 * pm_ * smooth(0.60, 0.78, fbm(14.0, 14.0, 0.7, 3, 241.0)) * smooth(0.4, 0.7, mott)          # светлые известковые разводы
col = mix(col, (0.80, 0.80, 0.77), rainL * 0.10)
hstr = fbm(0.9, 22.0, 22.0, 3, 251.0)
flowS = (topv2 | botv2) * pm_ * smooth(0.55, 0.74, hstr) * (0.4 + 0.6 * smooth(0.0, 1.0, src + aft)) * (0.6 + 0.4 * smooth(6.0, 13.0, a))
col = mix(col, (0.22, 0.22, 0.21), flowS * 0.14); rough += flowS * 0.04
# 5. утечки: гидрожидкость (красно-бурая, блестит), масло (тёмно-бурое), керосин (светлые разводы с тёмным краем); стекают назад и вниз
def leak(a0, q0, side, L, w0, colr, k, gloss, sd):
    if side in ('r', 'l'):
        vm = (nx > 0.4) if side == 'r' else (nx < -0.4); u = a - a0; zc = q0 - 0.18 * np.clip(u, 0, None); d_ = (z - zc)
    else:
        vm = botv2 if side == 'bot' else topv2; u = a - a0; d_ = (x - q0)
    w = w0 * (1 + 1.6 * np.clip(u, 0, None) / L)
    br = 0.45 + 0.55 * smooth(0.35, 0.70, fbm(1.2, 18.0, 18.0, 3, sd))
    m = vm * pm_ * smooth(-0.02, 0.06, u) * smooth(L, L * 0.35, u) * np.exp(-(d_ / (w * 1.35)) ** 2) * br
    global col, rough
    col = mix(col, colr, np.clip(m * k * 1.5, 0, 0.85)); rough -= m * gloss
LEAKS = [(8.00, 1.10, 'bot', 1.4, 0.06, (0.28, 0.12, 0.08), 0.45, 0.20), (8.00, -1.10, 'bot', 1.3, 0.06, (0.28, 0.12, 0.08), 0.40, 0.20),     # из ниш основных стоек: гидро
         (4.55, -0.12, 'bot', 1.2, 0.05, (0.20, 0.13, 0.08), 0.45, 0.15),                                                              # из ниши носовой
         (10.15, 0.0, 'r', 1.0, 0.04, (0.16, 0.12, 0.08), 0.45, 0.18), (10.15, 0.0, 'l', 0.9, 0.04, (0.16, 0.12, 0.08), 0.42, 0.18),     # масло
         (11.0, 0.05, 'r', 0.8, 0.035, (0.30, 0.12, 0.08), 0.40, 0.20), (11.0, 0.05, 'l', 0.7, 0.035, (0.30, 0.12, 0.08), 0.38, 0.20),   # гидро
         (9.70, 0.55, 'bot', 1.6, 0.08, (0.18, 0.14, 0.10), 0.40, 0.12), (9.70, -0.55, 'bot', 1.6, 0.08, (0.18, 0.14, 0.10), 0.40, 0.12),   # двигательные отсеки снизу
         (10.6, 1.20, 'bot', 1.0, 0.07, (0.20, 0.15, 0.10), 0.35, 0.12), (10.6, -1.20, 'bot', 1.0, 0.07, (0.20, 0.15, 0.10), 0.35, 0.12),
         (9.95, 0.30, 'top', 1.2, 0.05, (0.40, 0.38, 0.33), 0.25, 0.05), (9.95, -0.30, 'top', 1.2, 0.05, (0.40, 0.38, 0.33), 0.25, 0.05),   # керосин у горловин
         (5.30, 0.55, 'r', 0.7, 0.03, (0.20, 0.17, 0.13), 0.35, 0.10), (5.30, 0.55, 'l', 0.7, 0.03, (0.20, 0.17, 0.13), 0.35, 0.10),
         (7.30, 0.30, 'r', 0.9, 0.04, (0.22, 0.15, 0.10), 0.32, 0.12), (8.80, -0.10, 'l', 0.9, 0.04, (0.22, 0.15, 0.10), 0.32, 0.12)]
for i_, (a0_, q0_, sd_, L_, w_, c_, k_, g_) in enumerate(LEAKS): leak(a0_, q0_, sd_, L_, w_, c_, k_, g_, 300.0 + i_ * 7)
# 6. сколы и потёртости: больше на кромках, у углов люков, вокруг винтов (отвёртка), по зонам хождения; грунт АК-070 и металл
corner = smooth(0.06, 0.0, hedge) * smooth(0.04, 0.0, np.abs(seamd - 0.0) + 0.02) * 0.0
scrw = smooth(0.15, 0.7, fast) * smooth(0.55, 0.68, fbm(30.0, 30.0, 30.0, 2, 263.0))
walk2 = (smooth(0.9, 0.3, np.abs(a - 3.0)) * smooth(0.45, 0.25, ax) + smooth(0.6, 0.2, np.abs(a - 5.3)) * smooth(0.6, 0.35, ax) +
         smooth(1.4, 0.4, np.abs(a - 8.4)) * smooth(2.4, 1.6, ax) * smooth(1.1, 1.4, ax)) * topv2 * pm_
wchip = walk2 * smooth(0.56, 0.70, fbm(7.0, 7.0, 7.0, 3, 269.0))                   # крупные затёртые пятна, не россыпь
echip = smooth(0.985, 0.88, bev) * pm_ * smooth(0.48, 0.60, fbm(20.0, 20.0, 20.0, 3, 271.0)) * np.where(mov, 0.3, 1.0)
lechip = LE_w * smooth(0.50, 0.66, fbm(12.0, 30.0, 30.0, 3, 277.0))
dm2 = np.clip(scrw * 0.8 + echip * 0.9 + lechip * 0.8, 0, 1)
wornP = wchip * smooth(0.3, 0.6, fbm(25.0, 25.0, 25.0, 2, 270.0)); col = mix(col, (0.36, 0.38, 0.38), wornP * 0.55); rough -= wornP * 0.12   # стёрт верхний слой: проступает старая тёмная краска
pr2 = smooth(0.15, 0.40, dm2); br2 = smooth(0.55, 0.90, dm2)
col = mix(col, PRIM, pr2 * (0.45 if CHIP != 'metal' else 0.20)); rough += pr2 * 0.03
if CHIP == 'metal': br2 = smooth(0.30, 0.70, dm2)                  # металл: оголяется раньше и шире
col = mix(col, BARE * (0.92 + 0.12 * fine[..., None]), br2); rough = rough * (1 - br2) + br2 * (0.32 + 0.08 * fine); metal = np.maximum(metal, smooth(0.5, 0.85, br2))
bare = np.maximum(bare, br2)
walkd = walk2 * smooth(0.3, 0.7, fbm(5.0, 5.0, 5.0, 3, 281.0)); col = mix(col, (0.30, 0.30, 0.29), walkd * 0.22); rough -= walkd * 0.10          # затёрто подошвами
scr2 = smooth(0.40, 0.70, np.maximum(cc0(SC3, 0.55), cc0(SC5, 0.75))) * pm_ * (0.3 + 0.7 * smooth(0.0, 1.0, walk2 + sidev2 * 0.3))
col = mix(col, col * 1.12 + 0.02, scr2 * 0.35); rough -= scr2 * 0.08
# 7. грязь и пыль в стыках и углублениях; низ и зона за колёсами грязнее; пыль сверху в швах
gr_ao = smooth(0.95, 0.55, ao1) * pm_; col = mix(col, (0.20, 0.19, 0.17), gr_ao * 0.35); rough += gr_ao * 0.08
dust = topv2 * pm_ * smooth(0.03, 0.0, seamd) * smooth(0.4, 0.7, fbm(6.0, 6.0, 6.0, 2, 283.0)); col = mix(col, (0.62, 0.58, 0.50), dust * 0.25)
lowd = smooth(-0.1, -0.7, nz) * pm_ * smooth(0.40, 0.68, fbm(1.6, 4.0, 4.0, 3, 287.0)); col = mix(col, (0.30, 0.28, 0.24), lowd * 0.14); rough += lowd * 0.05
# 8. копоть: пушка (шире), хвостовая балка за соплами, кромки щитков
dxg2 = x + 0.235; gun2 = smooth(2.0, 2.3, a) * smooth(6.2, 3.2, a) * np.exp(-(dxg2 / (0.08 + 0.09 * np.clip(a - 2.2, 0, None))) ** 2) * (z < 0.1) * pm_ * (0.5 + 0.5 * smooth(0.3, 0.7, fbm(1.0, 14.0, 14.0, 3, 291.0)))
col = mix(col, (0.08, 0.075, 0.07), gun2 * 0.55); rough += gun2 * 0.15
tail_s = smooth(11.4, 12.4, a) * smooth(15.5, 12.8, a) * pm_ * (np.abs(x) < 0.5) * (0.4 + 0.6 * smooth(0.3, 0.7, fbm(0.9, 6.0, 6.0, 3, 293.0)))
pass                                                                                # (ровный слой на балке убран: давал «овал», Mark)
log('реализм: подкраски, потёки, утечки, сколы, грязь')
# ── износ 2 (Mark: «до сих пор идеально»): под пикселем старая советская окраска (зелёный/коричневый верх, голубой низ), хлопья облезшей краски,
#    протёртости по краям листов, заменённые неокрашенные листы, винты до металла, эрозия кромок, губа заборника до металла, больше копоти ──
vO = (fbm(0.42, 0.42, 0.42, 3, 5.0) - 0.22) / 0.56; wO = smooth(0.49, 0.51, vO)[..., None]
OLD_T = C(84, 106, 72) * (1 - wO) + C(96, 78, 72) * wO; OLD = OLD_T * (1 - U_low[..., None]) + C(150, 190, 214) * U_low[..., None]
OLD = OLD * (0.80 + 0.12 * mott[..., None]); OLD = OLD * 0.62 + OLD.mean(-1, keepdims=True) * 0.38 + 0.02     # старая краска тусклая, выгоревшая, серее
expo = (0.5 + 0.5 * sun + 0.6 * walk2 + 0.4 * smooth(0.985, 0.9, bev)) * pm_
# хлопья: участки 3-20 см, гуще на верху, кромках, у швов
fl_n = fbm(3.4, 3.4, 3.4, 4, 401.0); fl_r = smooth(0.50, 0.80, fbm(0.7, 0.7, 0.7, 3, 403.0))
flake = smooth(0.72, 0.745, fl_n + 0.06 * smooth(0.03, 0.0, seamd) + 0.05 * expo - 0.12 * (1 - fl_r))     # меньше (Mark: «перебор по износу») * pm_ * (1 - np.isin(cls, (2, 4, 5, 6)) * 0.6)
fl_core = smooth(0.78, 0.82, fl_n + 0.06 * smooth(0.03, 0.0, seamd))                           # в глубине хлопьев - металл
fl_edge = flake * (1 - smooth(0.735, 0.755, fl_n))                                                 # тонкий светлый край скола
col = mix(col, OLD, flake * 0.92); col = mix(col, col * 1.18 + 0.03, fl_edge * 0.5); rough += flake * 0.06
coreM = fl_core * flake; col = mix(col, BARE * (0.9 + 0.15 * fine[..., None]), coreM); metal = np.maximum(metal, coreM * 0.9); rough = rough * (1 - coreM) + coreM * 0.34
# протёртости по краям листов: полоса 1-3 см вдоль швов, рваная
rub = smooth(0.028, 0.004, seamd) * smooth(0.58, 0.74, fbm(6.0, 6.0, 6.0, 3, 409.0)) * pm_ * (0.4 + 0.8 * expo)
col = mix(col, OLD, np.clip(rub, 0, 1) * 0.40); rough -= rub * 0.03
# эрозия передних кромок крыла, стабилизатора, киля, пилонов: полосами до металла
LEe = smooth(0.10, 0.0, sL) * (sL > -0.03) * (wing | (cls == 5))
fin_le = (cls == 1) & (a < 13.2 + (z - 1.2) * 0.62) & (a > 11.2 + (z - 1.2) * 0.62)            # передняя треть киля
stab_le = (cls == 3) & (a < 12.55 + (ax - 0.1) * 0.52)
ero = np.clip(LEe + 0.8 * fin_le * smooth(0.985, 0.92, bev) + 0.8 * stab_le * smooth(0.985, 0.92, bev), 0, 1) * smooth(0.45, 0.62, fbm(3.0, 40.0, 40.0, 3, 413.0))
col = mix(col, OLD, ero * 0.35); col = mix(col, BARE, ero * smooth(0.68, 0.88, fbm(8.0, 30.0, 30.0, 2, 415.0)) * 0.8); metal = np.maximum(metal, ero * 0.6); rough -= ero * 0.12
# губа заборника и кромка сопел: до металла, затёрто
lip = (a > 5.90) & (a < 6.08) & (ax > 0.55) & (ax < 1.45) & (mat == 0) & smooth(0.40, 0.65, fbm(10.0, 10.0, 10.0, 3, 417.0)).astype(bool)
col[lip] = mix(col, BARE * 0.95, np.ones((S, S), np.float32))[lip] * 0.6 + col[lip] * 0.4; metal[lip] = 0.75; rough[lip] = 0.36
# винты: часть головок стёрта до металла, часть ржавая
fsel = smooth(0.4, 0.8, fast) * pm_; frnd = vnoise(a * 37.0, x * 37.0 + z * 29.0, z * 41.0)
fm_ = fsel * (frnd > 0.80); fr_ = fsel * (frnd < 0.06)
col = mix(col, BARE * 0.9, fm_); metal = np.maximum(metal, fm_ * 0.9); rough = rough * (1 - fm_) + fm_ * 0.35
col = mix(col, (0.30, 0.18, 0.10), fr_ * 0.8); rough += fr_ * 0.2
# заменённые листы: один в зелёно-сером грунте, один голый алюминий, один в старой краске (поставлен с другого самолёта)
REPL = [((9.65, 10.55, 0.04, 0.44), 'top', 'prim'), ((3.95, 4.55, -0.25, 0.15), 'r', 'alu'), ((7.45, 8.25, 0.05, 0.45), 'l', 'old'), ((10.8, 11.4, 0.6, 0.95), 'l', 'prim')]
for (a0_, a1_, q0_, q1_), sd_, kind in REPL:
    vm_ = topv2 if sd_ == 'top' else ((nx > 0.45) if sd_ == 'r' else (nx < -0.45)); Q_ = ax if sd_ == 'top' else z
    m_ = vm_ & pm_ & (a > a0_) & (a < a1_) & (Q_ > q0_) & (Q_ < q1_)
    if kind == 'prim': col[m_] = (np.array((0.50, 0.53, 0.47), np.float32) * (0.92 + 0.12 * fine[m_])[..., None]); rough[m_] = 0.78; metal[m_] = 0.0
    elif kind == 'alu': col[m_] = BARE * (0.88 + 0.14 * fine[m_])[..., None] * (0.95 + 0.06 * mott[m_])[..., None]; rough[m_] = 0.30 + 0.08 * fine[m_]; metal[m_] = 1.0
    else: col[m_] = OLD[m_] * 0.95; rough[m_] = 0.72
# больше копоти: выхлоп на хвостовой балке и стабилизаторе, пушка
tail_s2 = smooth(11.3, 12.0, a) * smooth(15.6, 13.0, a) * pm_ * (0.5 + 0.5 * smooth(0.3, 0.7, fbm(1.2, 8.0, 8.0, 3, 421.0))) * np.exp(-((ax - 0.89) / 0.55) ** 2)
pass                                                                                # (то же)
col = mix(col, (0.07, 0.065, 0.06), gun2 * 0.30)
# кромки рулей и закрылков: светлые затёртости по задней кромке
te_w = np.isin(cls, (2, 4)) * smooth(0.985, 0.90, bev) * smooth(0.55, 0.70, fbm(12.0, 12.0, 12.0, 2, 427.0)); col = mix(col, OLD, te_w * 0.4)
# гарь за соплами (Mark): два шлейфа от среза сопел назад по хвостовой балке, стабилизатору снизу и торцу гондолы; к соплу плотнее, полосами по потоку
NZA = 11.62
SI13 = _ld('SurfaceImperfections013/SurfaceImperfections013_2K-JPG_Opacity.jpg')
for sx_ in (1, -1):
    u_ = a - NZA; xc_ = sx_ * (0.89 - 0.32 * smooth(0.0, 2.2, u_)); zc_ = 0.35 + 0.10 * smooth(0.0, 2.0, u_); rr_ = 0.30 + 0.26 * np.clip(u_, 0, 3.5)
    lat = np.arctan2(z - zc_, (x - xc_) * sx_)                       # угол вокруг оси шлейфа: полосы по потоку
    dpl = np.hypot((x - xc_) / rr_, (z - zc_) / (rr_ * 0.9))
    env = smooth(-0.15, 0.20, u_) * smooth(3.6, 0.3, u_) * smooth(1.8, 0.2, dpl + 0.45 * (fbm(1.1, 3.5, 3.5, 3, 437.0 + sx_) - 0.5))   # рваный край
    # много узких полос: шум высокой частоты поперёк потока, низкой - вдоль; ширина и плотность у каждой своя
    bands_ = 0.0
    for k_, (fl, fa, w_) in enumerate(((22.0, 0.35, 0.45), (48.0, 0.6, 0.30), (9.0, 0.25, 0.35))):
        b_ = fbm(fa, fl, fl, 3, 441.0 + 13 * k_ + sx_); bands_ = bands_ + w_ * smooth(0.40 + 0.04 * k_, 0.75, b_)
    blot = smooth(0.25, 0.75, cc0(SI13, 1.1)) * 0.5 + smooth(0.45, 0.80, fbm(3.0, 3.0, 3.0, 3, 449.0 + sx_)) * 0.5      # пятна и затёртости
    wipe = smooth(0.62, 0.78, fbm(1.8, 6.0, 6.0, 3, 453.0 + sx_))                                                        # местами стёрто тряпкой
    pl = env * np.clip(0.15 + bands_ * 0.9, 0, 1) * (0.55 + 0.45 * blot) * (1 - 0.65 * wipe)
    pl += env * smooth(0.02, 0.0, seamd) * 0.5 + env * smooth(0.2, 0.7, riv) * 0.35                                        # сажа в швах и у заклёпок
    pl *= (1.0 - 0.65 * smooth(0.0, 3.2, u_)) * ((cls == 0) | (cls == 3) | (cls == 4) | (cls == 2) | (cls == 13)) * (mat == 0)
    sc_ = np.array((0.085, 0.075, 0.065), np.float32) * (0.85 + 0.3 * fine[..., None])
    col = mix(col, sc_, np.clip(pl * 0.80, 0, 0.78)); rough += pl * 0.20; metal *= (1 - np.clip(pl, 0, 1) * 0.8)
ring_ = smooth(11.15, 11.55, a) * smooth(11.80, 11.62, a) * (np.minimum(np.hypot(x - 0.89, z - 0.35), np.hypot(x + 0.89, z - 0.35)) < 0.55) * (mat == 0) * (cls == 0)
col = mix(col, (0.06, 0.055, 0.05), ring_ * 0.75); rough += ring_ * 0.2                      # торцы гондол вокруг сопел - в саже
bare = np.maximum(bare, np.maximum(coreM, ero * 0.5))
log('износ 2: старая краска, хлопья, протёртости, заменённые листы, винты')

log('краска')
from PIL import ImageDraw, ImageFont
FNT = '/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf'
def decal(text, ac, qc, W_, H_, side, col_, alpha=0.82, rot=False):
    wp, hp = 512, max(32, int(512 * H_ / W_)); im_ = Image.new('L', (wp, hp), 0); dr = ImageDraw.Draw(im_)
    if text is None: dr.rectangle((0, 0, wp, hp), fill=255)
    else:
        f_ = ImageFont.truetype(FNT, int(hp * 0.92)); tw = dr.textlength(text, font=f_); f_ = ImageFont.truetype(FNT, max(8, int(hp * 0.92 * min(1.0, wp / max(tw, 1)))))
        dr.text((wp / 2, hp / 2), text, font=f_, fill=255, anchor='mm')
    D_ = np.asarray(im_, np.float32) / 255.0
    vm, Q_ = ((nz > 0.35, x) if side == 'top' else (nz < -0.35, x) if side == 'bot' else (nx > 0.35, z) if side == 'r' else (nx < -0.35, z))
    ins = vm & (np.abs(a - ac) < W_ / 2) & (np.abs(Q_ - qc) < H_ / 2) & (cls <= 8) & (mat == 0)
    if not ins.any(): return
    u_ = (a[ins] - ac) / W_ + 0.5; v_ = 0.5 - (Q_[ins] - qc) / H_
    if side == 'r': u_ = 1 - u_                     # читается слева направо со стороны зрителя
    A_ = D_[np.clip((v_ * hp).astype(int), 0, hp - 1), np.clip((u_ * wp).astype(int), 0, wp - 1)] * alpha * (0.72 + 0.28 * smooth(0.35, 0.6, fine[ins]))
    c_ = np.asarray(col_, np.float32); col[ins] = col[ins] * (1 - A_[..., None]) + c_ * A_[..., None]; rough[ins] += A_ * -0.05
def text_img(t, H=220, ink=(44, 48, 54, 255), halo=(0, 0, 0, 0), hw=0, W=None):
    f_ = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', int(H * 0.86)); tmp = ImageDraw.Draw(Image.new('L', (8, 8))); bb = tmp.textbbox((0, 0), t, font=f_); tw = bb[2] - bb[0]; W = W or (tw + 40)
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dr = ImageDraw.Draw(im_); dr.text((W / 2, H / 2), t, font=f_, fill=ink, anchor='mm', stroke_width=hw, stroke_fill=halo); return im_


def stamp(im_, ac, qc, W_, H_, side, along=True, alpha=0.96, rough_to=None, cl=None):
    """Картинка на обшивку. along: ширина вдоль корпуса; иначе ширина вдоль размаха, верх картинки к носу."""
    A0 = np.asarray(im_, np.float32) / 255.0; hp, wp = A0.shape[:2]
    vm, Q_ = ((nz > 0.35, x) if side == 'top' else (nz < -0.35, x) if side == 'bot' else (nx > 0.35, z) if side == 'r' else (nx < -0.35, z))
    if along: ins = vm & (np.abs(a - ac) < W_ / 2) & (np.abs(Q_ - qc) < H_ / 2)
    else: ins = vm & (np.abs(Q_ - qc) < W_ / 2) & (np.abs(a - ac) < H_ / 2)
    ins &= ((mat == 0) | ((mat == 5) & (cl == (12,)))) & (np.isin(cls, cl) if cl else ((cls <= 8) & (cls != 8)))
    if not ins.any(): return
    if along:
        u_ = (a[ins] - ac) / W_ + 0.5; v_ = 0.5 - (Q_[ins] - qc) / H_
        if side == 'r': u_ = 1 - u_
    else:
        u_ = (Q_[ins] - qc) / W_ + 0.5; v_ = (a[ins] - ac) / H_ + 0.5
        if side == 'bot': u_ = 1 - u_
    du, dv = DS / W_ * 0.5, DS / H_ * 0.5; S_ = 0                       # четыре выборки на пиксель: края знаков без лесенки
    for ou, ov in ((-du, -dv), (du, -dv), (-du, dv), (du, dv)):
        S_ = S_ + A0[np.clip(((v_ + ov) * hp).astype(int), 0, hp - 1), np.clip(((u_ + ou) * wp).astype(int), 0, wp - 1)] * 0.25
    al = S_[:, 3] * alpha * (0.90 + 0.10 * smooth(0.30, 0.62, fine[ins])) * (1 - 0.35 * bare[ins])
    col[ins] = col[ins] * (1 - al[..., None]) + S_[:, :3] * al[..., None]; rough[ins] = rough[ins] * (1 - al) + (0.40 if rough_to is None else rough_to) * al

INK = (46, 50, 56, 255); RED = (138, 42, 34, 255); LIGHT = (205, 208, 210, 255)
def tri_img(S_=400, ink=RED, letter='E', fill=None):
    """Предупреждающий треугольник."""
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); P_ = [(S_ / 2, S_ * 0.05), (S_ * 0.96, S_ * 0.92), (S_ * 0.04, S_ * 0.92)]
    if fill: d_.polygon(P_, fill=fill)
    d_.line(P_ + [P_[0]], fill=ink, width=int(S_ * 0.07))
    if letter: d_.text((S_ / 2, S_ * 0.60), letter, font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', int(S_ * 0.42)), fill=ink, anchor='mm')
    return im_
def box_text(lines, H=90, ink=INK, frame=True, W=None):
    f_ = ImageFont.truetype(FNT, H); tmp = ImageDraw.Draw(Image.new('L', (8, 8))); tw = max(tmp.textlength(t_, font=f_) for t_ in lines); W = W or int(tw + H * 1.2); Ht = int(len(lines) * H * 1.18 + H * 0.5)
    im_ = Image.new('RGBA', (W, Ht), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_)
    if frame: d_.rectangle((2, 2, W - 3, Ht - 3), outline=ink, width=max(4, H // 11))
    for i_, t_ in enumerate(lines): d_.text((W / 2, H * 0.72 + i_ * H * 1.18), t_, font=f_, fill=ink, anchor='mm')
    return im_


INK = (52, 56, 62, 255); RED = (140, 44, 36, 255); DKI = (62, 66, 72, 255); LV = (88, 93, 100, 255)
def tri_img(S_=400, ink=RED, letter='', fill=None):
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); P_ = [(S_ / 2, S_ * 0.05), (S_ * 0.96, S_ * 0.92), (S_ * 0.04, S_ * 0.92)]
    if fill: d_.polygon(P_, fill=fill)
    d_.line(P_ + [P_[0]], fill=ink, width=int(S_ * 0.07))
    if letter: d_.text((S_ / 2, S_ * 0.60), letter, font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', int(S_ * 0.42)), fill=ink, anchor='mm')
    return im_
def box_text(lines_, H=90, ink=INK, frame=True, W=None):
    f_ = ImageFont.truetype(FNT, H); tmp = ImageDraw.Draw(Image.new('L', (8, 8))); tw = max(tmp.textlength(t_, font=f_) for t_ in lines_); W = W or int(tw + H * 1.2); Ht = int(len(lines_) * H * 1.18 + H * 0.5)
    im_ = Image.new('RGBA', (W, Ht), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_)
    if frame: d_.rectangle((2, 2, W - 3, Ht - 3), outline=ink, width=max(4, H // 11))
    for i_, t_ in enumerate(lines_): d_.text((W / 2, H * 0.72 + i_ * H * 1.18), t_, font=f_, fill=ink, anchor='mm')
    return im_
def arrow_img(W_=600, H_=180, ink=RED):
    im_ = Image.new('RGBA', (W_, H_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); d_.rectangle((0, H_ * 0.32, W_ * 0.66, H_ * 0.68), fill=ink); d_.polygon([(W_ * 0.60, 0), (W_, H_ / 2), (W_ * 0.60, H_)], fill=ink); return im_


def star_img(r, cx, cy, d_, fill):
    P = []
    for k in range(10):
        ang = -math.pi / 2 + k * math.pi / 5; rr = r if k % 2 == 0 else r * 0.382; P.append((cx + rr * math.cos(ang), cy + rr * math.sin(ang)))
    d_.polygon(P, fill=fill)


def insignia_img(W=1200, ink=LV, bg=(0, 0, 0, 0)):
    """Опознавательный знак США малой заметности: звезда в круге с полосами, одним серым контуром (рисунок свой, по общему образцу)."""
    H = int(W * 0.40); im_ = Image.new('RGBA', (W, H), bg); d_ = ImageDraw.Draw(im_); cx, cy, R = W / 2, H / 2, H * 0.46; lw = max(6, int(H * 0.035))
    bw, bh = W * 0.48, H * 0.30
    d_.rectangle((cx - bw, cy - bh / 2, cx + bw, cy + bh / 2), outline=ink, width=lw)
    d_.ellipse((cx - R, cy - R, cx + R, cy + R), fill=(0, 0, 0, 0)); d_.ellipse((cx - R, cy - R, cx + R, cy + R), outline=ink, width=lw)
    m_ = Image.new('L', (W, H), 0); dm = ImageDraw.Draw(m_); dm.ellipse((cx - R + lw, cy - R + lw, cx + R - lw, cy + R - lw), fill=255)
    clr = Image.new('RGBA', (W, H), (0, 0, 0, 0)); im_.paste(clr, (0, 0), m_)                        # внутри круга - без полос
    d_.ellipse((cx - R, cy - R, cx + R, cy + R), outline=ink, width=lw)
    star_img(R * 0.93, cx, cy + R * 0.04, d_, ink)
    return im_



FB = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
def star_ru(W=800):
    """Звезда ВВС России: красная, белая кайма, тонкий красный край (рисунок свой)."""
    im_ = Image.new('RGBA', (W, W), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); c = W / 2
    for r_, f_ in ((0.49, (150, 36, 32, 255)), (0.44, (232, 232, 228, 255)), (0.36, (172, 40, 34, 255))): star_img(W * r_, c, c + W * 0.03, d_, f_)
    return im_
def roundel(cols, W=800):
    im_ = Image.new('RGBA', (W, W), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); c = W / 2; n = len(cols)
    for i, cc in enumerate(cols): r_ = W * 0.49 * (n - i) / n; d_.ellipse((c - r_, c - r_, c + r_, c + r_), fill=cc)
    return im_
def flag_ua(W=600):
    H = W * 2 // 3; im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); d_.rectangle((0, 0, W, H // 2), fill=(40, 78, 150, 255)); d_.rectangle((0, H // 2, W, H), fill=(226, 192, 52, 255)); return im_
def num_img(t, ink, edge):
    if edge is None: return text_img(t, 300, ink=tuple(int(v * 255) for v in ink) + (255,))
    return text_img(t, 300, ink=tuple(int(v * 255) for v in ink) + (255,), halo=tuple(int(v * 255) for v in edge) + (255,), hw=10)
NUM = {'base': '27', 'light': '15', 'pixel': '36', 'bulg': '241'}[SCH]
NI = num_img(NUM, PAL['num'], PAL['num_edge']); nw_ = 0.33 * len(NUM)
STRED = (150, 40, 34, 255); STD = (40, 42, 44, 255) if SCH != 'pixel' else (44, 48, 54, 255)
for sd in ('r', 'l'):
    stamp(NI, 2.95, 0.27, nw_, 0.38, sd, alpha=0.95)                                                  # бортовой номер на носу (вымышленный)
    if SCH in ('base', 'light'): stamp(star_ru(), 13.45, 2.35, 0.62, 0.62, sd, alpha=0.95, cl=(1,))   # звезда на киле
    if SCH == 'bulg': stamp(roundel([(236, 236, 232, 255), (40, 120, 70, 255), (178, 40, 36, 255)]), 13.45, 2.35, 0.58, 0.58, sd, alpha=0.93, cl=(1,))
    stamp(tri_img(S_=400, ink=STRED), 4.15, 0.62, 0.13, 0.13, sd)                                       # катапульта
    stamp(box_text(['ОПАСНО'], 80, ink=STRED, frame=True), 6.55, 0.05, 0.36, 0.10, sd, alpha=0.82)   # у заборника
    stamp(box_text(['ЗАПРАВКА', 'Т-1'], 60, ink=STD), 9.6, 0.40, 0.22, 0.10, sd, alpha=0.75)
    stamp(box_text(['ГИДРО'], 60, ink=STD), 11.0, 0.10, 0.16, 0.06, sd, alpha=0.75)
for sg in (1, -1):
    stamp(text_img('НЕ СТУПАТЬ', 140, ink=STD), W_TE(3.0) - 0.40, sg * 3.0, 0.50, 0.08, 'top', alpha=0.72)
    stamp(text_img('НЕ СТУПАТЬ', 140, ink=STD), W_LE(4.0) + 0.12, sg * 4.0, 0.42, 0.07, 'top', alpha=0.70)
    if SCH in ('base', 'light'): stamp(star_ru(), W_LE(5.3) + 0.80, sg * 5.3, 0.78, 0.78, 'bot', along=False, alpha=0.95)   # звёзды снизу на крыльях
    if SCH == 'bulg':
        for sd2 in ('top', 'bot'): stamp(roundel([(236, 236, 232, 255), (40, 120, 70, 255), (178, 40, 36, 255)]), W_LE(5.3) + 0.80, sg * 5.3, 0.70, 0.70, sd2, along=False, alpha=0.93)
# трафареты (вымышленные, по образцу советских): заправка, заземление, подъём, азот, воздух, масло, опасные зоны
SM = [('ЗАЗЕМЛЕНИЕ', 4.80, -0.38, 0.22, 0.045), ('АЗОТ', 5.25, 0.55, 0.12, 0.05), ('ВОЗДУХ 150', 7.70, -0.10, 0.20, 0.05), ('МАСЛО', 10.15, 0.05, 0.14, 0.05),
      ('ТОЧКА ПОДЪЁМА', 5.40, -0.46, 0.28, 0.045), ('НЕ ВСТАВАТЬ', 12.10, 0.80, 0.24, 0.045), ('ЭЛЕКТРОПИТАНИЕ', 3.40, -0.30, 0.28, 0.045), ('АККУМУЛЯТОР', 2.10, 0.05, 0.24, 0.045)]
for sd in ('r', 'l'):
    for t_, ac_, qc_, w_, h_ in SM: stamp(box_text([t_], 70, ink=STD, frame=False), ac_, qc_, w_, h_, sd, alpha=0.70)
    stamp(box_text(['ОПАСНО', 'ПУШКА'], 60, ink=STRED, frame=True), 2.75, -0.25, 0.22, 0.11, sd, alpha=0.80)
    stamp(arrow_img(ink=STRED), 4.70, 0.72, 0.36, 0.09, sd, alpha=0.85)                                # стрелка аварийного сброса фонаря
    stamp(box_text(['СБРОС ФОНАРЯ'], 60, ink=STRED, frame=False), 4.70, 0.64, 0.36, 0.05, sd, alpha=0.80)
    stamp(box_text(['ОПАСНО', 'СТРУЯ ГАЗОВ'], 60, ink=STRED, frame=True), 11.05, 0.45, 0.30, 0.12, sd, alpha=0.78)
for sg in (1, -1):
    stamp(box_text(['ТОПЛИВО Т-1'], 70, ink=STD, frame=True), 8.30, sg * 0.20, 0.26, 0.07, 'top', alpha=0.75)
    stamp(box_text(['ПОДЪЁМ'], 60, ink=STD, frame=True), 6.30, sg * 0.30, 0.16, 0.06, 'bot', alpha=0.72)
    stamp(box_text(['ШВАРТОВКА'], 60, ink=STD, frame=False), 12.40, sg * 0.25, 0.22, 0.045, 'bot', alpha=0.70)
    stamp(text_img('НЕ СТУПАТЬ', 140, ink=STD), W_TE(5.5) - 0.30, sg * 5.5, 0.42, 0.07, 'top', alpha=0.70)
log('надписи')
# ── хвост у сопел и сопла: побежалость, гарь, потемневший металл ──
tn = fbm(1.2, 4.0, 4.0, 4, 59.0); ts = fbm(0.8, 14.0, 14.0, 3, 61.0)
def heat(t):
    st = np.array([0.0, 0.40, 0.72, 1.0], np.float32); p = np.array([[0.46, 0.46, 0.455], [0.42, 0.415, 0.405], [0.35, 0.34, 0.335], [0.27, 0.265, 0.265]], np.float32)
    return np.stack([np.interp(t, st, p[:, i]) for i in range(3)], -1).astype(np.float32)
t_ti = np.clip((a - 11.20) / 0.40 + (tn - 0.5) * 0.45 + (ts - 0.5) * 0.25, 0, 1)
hc = heat(t_ti) * (0.95 + 0.10 * ts)[..., None]
tw_ = smooth(11.30, 11.60, a) * smooth(0.44, 0.34, rn) * (cls == 0) * (mat == 0); col = mix(col, hc, tw_); metal = np.maximum(metal, tw_ * 0.55); rough = rough * (1 - tw_) + tw_ * np.clip(0.56 + (tn - 0.5) * 0.08, 0.48, 0.64)
noz = cls == 10
ncol = np.array((0.50, 0.47, 0.43), np.float32) * (0.96 + 0.08 * ts)[..., None]     # потемневший металл (фото 10, 11)
sn = smooth(11.55, 11.75, a) * (0.8 + 0.2 * tn); ncol = ncol * (1 - 0.30 * sn)[..., None] + np.array((0.12, 0.115, 0.11), np.float32) * (0.40 * sn)[..., None]
tmp_k = (smooth(11.20, 11.40, a) * smooth(11.65, 11.48, a) * (0.6 + 0.4 * tn))[..., None]; ncol = ncol * (1 - 0.22 * tmp_k) + np.array((0.48, 0.41, 0.31), np.float32) * (0.22 * tmp_k)     # побежалость: соломенный
tmp_b = (smooth(11.45, 11.58, a) * smooth(11.75, 11.62, a) * smooth(0.45, 0.65, ts))[..., None]; ncol = ncol * (1 - 0.12 * tmp_b) + np.array((0.33, 0.35, 0.44), np.float32) * (0.12 * tmp_b)   # и синеватый
col[noz] = ncol[noz]; metal[noz] = 1.0; rough[noz] = np.clip(0.45 + (tn[noz] - 0.5) * 0.10, 0.35, 0.55)
ins_ = noz & (mat == 2); iv = (0.16 + 0.08 * ts); col[ins_] = np.stack([iv, iv * 0.97, iv * 0.93], -1)[ins_]; metal[ins_] = 0.4; rough[ins_] = 0.75
log('металл')
# ── материалы без краски обшивки ──
def solid(m, c, r, me=0.0, nz_=0.08):
    col[m] = np.array(c, np.float32) * (1 - nz_ / 2 + nz_ * fine[m])[..., None]; rough[m] = r; metal[m] = me
solid(mat == 2, (0.030, 0.030, 0.032), 0.9)             # нутро
lzw = (mat == 2) & (cls == 0) & (a < 1.7); solid(lzw, (0.10, 0.07, 0.14), 0.10, 0.3, 0.10)     # окно лазерного дальномера: тёмно-фиолетовое стекло (фото 34)
solid(mat == 4, (0.045, 0.045, 0.048), 0.86)            # резина
solid((mat == 5) & (cls == 11), (0.20, 0.21, 0.22), 0.62, 0, 0.16)    # кабина
duct = (mat == 7) & (cls != 11); deep_ = smooth(6.1, 8.2, a); col[duct] = (np.array((0.52, 0.53, 0.53), np.float32) * (1 - deep_[..., None]) + np.array((0.07, 0.072, 0.075), np.float32) * deep_[..., None])[duct] * (0.85 + 0.30 * mott[duct])[..., None]; rough[duct] = 0.7     # канал: у губы светлый, в глубине тёмный
solid(mat == 8, (0.15, 0.15, 0.155), 0.55, 0.6, 0.12)   # тёмная сталь
ck = cls == 11                                          # кабина: бирюзовая (советская), подушки, ремни, рукоятки жёлто-чёрные, циферблаты чёрные
solid(ck & (mat == 5), (0.30, 0.55, 0.52), 0.62, 0, 0.16); solid(ck & (mat == 6), (0.33, 0.31, 0.22), 0.92, 0, 0.2); solid(ck & (mat == 8), (0.30, 0.28, 0.21), 0.9, 0, 0.14)
solid(ck & (mat == 2), (0.035, 0.035, 0.038), 0.6); solid(ck & (mat == 1), (0.70, 0.70, 0.68), 0.35, 0.8)
hs = ((pos[..., 0] + pos[..., 1] + pos[..., 2]) / 0.035) % 1.0 > 0.5
solid(ck & (mat == 7), (0.74, 0.60, 0.06), 0.42); col[ck & (mat == 7) & hs] = np.array((0.035, 0.035, 0.035), np.float32)
mm = (mat == 1) & ~np.isin(cls, (10, 12, 14)); solid(mm, (0.46, 0.47, 0.48), 0.38, 1.0)
gm_ = (cls == 14) & (mat == 0) & (a > 2.1); solid(gm_, (0.20, 0.20, 0.21), 0.62, 0.55, 0.14)     # стволы пушки
pvd = (cls == 14) & (mat == 0) & (a <= 2.1)                         # ПВД и лопатка: крашены в цвет носа, матовые, грязные (Mark: «не глянцевые»; фото 34, 35)
pg_ = smooth(0.35, 0.70, fbm(2.5, 20.0, 20.0, 3, 331.0)); col[pvd] = (col[pvd] * (0.86 + 0.10 * fine[pvd])[..., None]) * (1 - 0.25 * pg_[pvd])[..., None] + np.array((0.20, 0.19, 0.17), np.float32) * (0.25 * pg_[pvd])[..., None]
rough[pvd] = 0.74 + 0.06 * (fine[pvd] - 0.5); metal[pvd] = 0.0
pt_ = (cls == 14) & (mat == 1); solid(pt_, (0.40, 0.40, 0.39), 0.58, 0.70, 0.18)    # наконечники, хомут, флюгарки: тусклый потёртый металл
gr_ = cls == 12                                         # шасси: потёртая серо-белая краска, тусклый шток в масле, тёмная сталь, серые щитки, серая резина
g_p = gr_ & (mat == 0); g_c = gr_ & (mat == 1); g_s = gr_ & (mat == 8); g_d = gr_ & (mat == 5)
gm1 = fbm(2.4, 2.4, 2.4, 4, 91.0); gm2 = fbm(18.0, 18.0, 18.0, 3, 93.0); gst = fbm(1.0, 16.0, 2.2, 4, 87.0); gst2 = fbm(0.7, 34.0, 1.3, 3, 89.0)
solid(g_p, (0.56, 0.58, 0.57), 0.62, 0, 0.10); solid(g_c, (0.47, 0.47, 0.46), 0.30, 0.85, 0.08); solid(g_s, (0.145, 0.142, 0.14), 0.58, 0.75, 0.14)
solid(g_d, (0.50, 0.52, 0.535), 0.60, 0, 0.10); solid(gr_ & (mat == 3), (0.60, 0.56, 0.40), 0.28, 0, 0.1); solid(gr_ & (mat == 2), (0.05, 0.048, 0.046), 0.72, 0, 0.14)
painted = g_p | g_d
col[painted] *= (0.84 + 0.30 * gm1[painted] + 0.06 * gm2[painted])[..., None]
oil_ = smooth(0.46, 0.68, gst) * (0.5 + 0.5 * smooth(0.40, 0.70, gst2)); col = mix(col, (0.15, 0.125, 0.095), oil_ * 0.58 * (painted | g_c)); rough = rough + oil_ * 0.20 * painted - oil_ * 0.10 * g_c
gd = smooth(-0.9, -1.5, z) * gr_ * (0.45 + 0.55 * smooth(0.36, 0.66, gm1)); col = mix(col, (0.215, 0.195, 0.165), gd * 0.62 * (painted | g_s)); rough = rough + gd * 0.22 * painted
WHEELS = ((4.10, -0.12, GROUND + 0.33, 0.33, 0.20), (9.05, 1.27, GROUND + 0.42, 0.42, 0.30), (9.05, -1.27, GROUND + 0.42, 0.42, 0.30))
for ac_, xc_, zc_, rw_, ww_ in WHEELS:
    rd_ = np.hypot(a - ac_, z - zc_); md_ = gr_ & (rd_ < rw_ * 0.68) & (np.abs(x - xc_) < 0.20)
    dust = smooth(rw_ * 0.68, rw_ * 0.10, rd_) * (0.45 + 0.55 * smooth(0.34, 0.62, gm2)) * md_; col = mix(col, (0.115, 0.10, 0.085), dust * 0.72); rough = rough + dust * 0.15
g_e = smooth(0.985, 0.90, bev) * painted * smooth(0.50, 0.62, gm2); col = mix(col, (0.26, 0.255, 0.24), g_e * 0.8); rough = rough + g_e * 0.05
tyr = mat == 4; rt_ = smooth(0.40, 0.68, gm2) * tyr; col[tyr] = np.array((0.070, 0.070, 0.072), np.float32); col = mix(col, (0.165, 0.158, 0.145), rt_ * 0.50); col = mix(col, (0.20, 0.19, 0.17), smooth(GROUND + 0.20, GROUND, z) * tyr * 0.45); rough[tyr] = 0.90
def _tyre_strip(t, W=2400, H=120):
    im_ = Image.new('L', (W, H), 0); d_ = ImageDraw.Draw(im_); f_ = ImageFont.truetype(FNT, int(H * 0.8)); tw = d_.textlength(t, font=f_)
    for k in range(2): d_.text((W * (0.25 + 0.5 * k), H / 2), t, font=f_, fill=255, anchor='mm')
    return np.asarray(im_, np.float32) / 255.0
TSTR = _tyre_strip('КТ-163  840×360  НОРМА 9')
for ac_, xc_, zc_, rw_, ww_ in WHEELS:
    rr_ = np.hypot(a - ac_, z - zc_); side_ = (mat == 4) & (np.abs(nx) > 0.55) & (np.abs(x - xc_) > ww_ * 0.25) & (np.abs(x - xc_) < ww_ * 0.75)
    r0_, r1_ = rw_ * 0.66, rw_ * 0.86; m_ = side_ & (rr_ > r0_) & (rr_ < r1_)
    if m_.any():
        ang_ = (np.arctan2(z[m_] - zc_, a[m_] - ac_) / (2 * np.pi)) % 1.0; vv_ = 1 - (rr_[m_] - r0_) / (r1_ - r0_)
        L_ = TSTR[np.clip((vv_ * TSTR.shape[0]).astype(int), 0, TSTR.shape[0] - 1), np.clip((ang_ * TSTR.shape[1]).astype(int), 0, TSTR.shape[1] - 1)]
        c_ = col[m_]; col[m_] = c_ + (np.array((0.13, 0.13, 0.13), np.float32) - c_) * (L_ * 0.55)[..., None]; rough[m_] = rough[m_] - L_ * 0.12
col[gr_] *= (0.50 + 0.50 * smooth(0.15, 0.95, ao2[gr_]))[..., None]       # под самолётом стойки в тени: в игре тени самолёта на них нет
gdoor_in = gr_ & (mat == 0) & (np.abs(ny) < 0.5) & (z > -0.7) & (ax < 0.3); solid(gdoor_in, (0.56, 0.58, 0.57), 0.55, 0, 0.14)
hub = gr_ & (mat == 0) & (np.abs(nx) > 0.6) & (np.minimum.reduce([np.hypot(a - w_[0], z - w_[2]) / w_[3] for w_ in WHEELS]) < 0.62); solid(hub, (0.24, 0.40, 0.28), 0.55, 0, 0.12)     # зелёные диски колёс (фото 255)
c9 = (cls == 9); m_can = c9 & (mat == 1); solid(m_can, (0.44, 0.45, 0.46), 0.38, 1.0)
duct_m = duct; rough = np.where(duct_m, 0.85, rough); metal = np.where(duct_m, 0.0, metal)
under_r = smooth(-0.1, -0.55, nz) * (mat == 0) * (cls <= 8); rough = rough + (np.maximum(rough, 0.58) - rough) * under_r
rough = np.clip(rough, 0.08, 0.97); metal = np.clip(metal, 0, 1)
for c_ in range(16):
    m_ = (cls == c_) & cov
    if m_.sum() > 500: print('деталь', c_, 'цвет', (col[m_].mean(0) * 255).round(0), 'G', round(float(rough[m_].mean()), 2), 'B', round(float(metal[m_].mean()), 2))
col = np.clip(col, 0, 1)
log('материалы')
# ── высота и нормали ──
shag = fbm(150.0, 150.0, 150.0, 2, 73.0) if S >= 4096 else fbm(70.0, 70.0, 70.0, 2, 73.0)
height += (shag - 0.5) * 0.00018 * skin_m
wav = fbm(1.6, 1.6, 1.6, 2, 79.0); height += (wav - 0.5) * 0.0008 * skin_m
can = fbm(3.2, 3.2, 3.2, 2, 307.0); height += (can - 0.5) * 0.0012 * skin_m * (1 - smooth(0.0, 0.04, -seamd + 0.04))     # листы чуть «гуляют» между заклёпками
height -= bare * 0.00025 + smooth(0.15, 0.4, dm2) * 0.00012                                # сколы утоплены на толщину краски
height += smooth(0.1, 0.8, riv) * 0.0004 * skin_m
height -= smooth(0.1, 0.9, fast) * 0.0005 * skin_m                    # винты чуть утоплены, со шлицем-тенью
ins_h = hedge < 8; height += smooth(0.0, 0.008, hedge) * 0.0009 * ins_h
height -= smooth(0.0035, 0.0, seamd) * 0.0006 * skin_m                 # швы чуть утоплены
height += scr * -0.0002
gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * DS); gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / (2 * DS)
nn = np.stack([-gx, -gy, np.ones_like(gx)], -1); nn /= np.linalg.norm(nn, axis=-1, keepdims=True)
solidm = np.isin(mat, (2, 4)) | (cls == 11) | (cls == 12) | (cls == 10) | (cls == 14)
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
occ = np.where(duct_m, np.minimum(np.maximum(occ, 0.45), 1.0 - 0.45 * smooth(6.1, 8.2, a)), occ)
occ = np.where(np.isin(cls, (6, 7)), np.maximum(occ, 0.8), occ)
bleed([col, rough, metal, occ, nn], cov)
def lift(arr): return (np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)
Image.fromarray(lift(col)[::-1]).save(f'{OUT}/su_color.png', compress_level=1)
Image.fromarray(lift(nn * 0.5 + 0.5)[::-1]).save(f'{OUT}/su_normal.png', compress_level=1)
orm = np.stack([occ, rough, metal], -1); Image.fromarray(lift(orm)[::-1]).save(f'{OUT}/su_orm.png', compress_level=1)
pm = skin_m & cov & (cls == 0) & (a > 2) & (a < 12) & (nz > 0.3); pl = skin_m & cov & (cls == 0) & (a > 2) & (a < 12) & (nz < -0.3); ps = skin_m & cov & (cls == 0) & (a > 2) & (a < 6) & (np.abs(nx) > 0.6) & (z > 0.25)
print('средний цвет sRGB: верх', (col[pm].mean(0) * 255).round(1), 'низ', (col[pl].mean(0) * 255).round(1), 'борт носа', (col[ps].mean(0) * 255).round(1), 'шероховатость', round(float(rough[pm].mean()), 3), 'доля голого металла', round(float((metal[pm] > 0.5).mean()), 4))
log('сохранено', OUT)
