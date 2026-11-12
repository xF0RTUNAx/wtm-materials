# paint.py - краска F-5E Tiger II (с образца JAS 39 Gripen) из данных gbuf.py: цвет (только краска и грязь, без света), нормали (заклёпки, крышки, шагрень), карта блеска glTF (R затенение, G шероховатость, B металл).
# Без Blender: /usr/bin/python3 -I paint.py. F5_TEX=2048|4096, F5_OUT=<папка>, F5_TOP, F5_LOW=r,g,b (0…1, sRGB).
# Окраска: светло-серая, как на фото f5e_01 и f5e_07; знаки США малой заметности, номер вымышленный; без швейцарских крестов и настоящих номеров.
import math, os, site, sys, time, json
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__)); DAT = os.path.join(HERE, '_проба')
S = int(os.environ.get('F5_TEX', '2048')); OUT = os.environ.get('F5_OUT', DAT); os.makedirs(OUT, exist_ok=True)
def envc(n, d): return np.array([float(v) for v in os.environ.get(n, d).split(',')], np.float32)
TOPC = envc('F5_TOP', '0.618,0.642,0.668'); LOWC = envc('F5_LOW', '0.650,0.670,0.690')     # проба 1: Blender темнее фото (138 против 190-205), игра при 0,72 почти белая (~220) - середина
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f} с]', *a, flush=True)
L2 = 7.225; WZC = -1.170; GROUND = 1.49 - 4.11
pos = np.load(f'{DAT}/gb_pos_{S}.npy'); nor = np.load(f'{DAT}/gb_nor_{S}.npy'); idd = np.load(f'{DAT}/gb_id_{S}.npy'); aob = np.load(f'{DAT}/gb_ao_{S}.npy')
ATLAS = json.load(open(f'{DAT}/uv.json', encoding='utf-8'))['atlas_m']; PXM = 0.985 * S / ATLAS; DS = 1.0 / PXM
mat = np.round(idd[..., 0] * 16).astype(np.int8); cls = np.round(idd[..., 1] * 32).astype(np.int8); cov = idd[..., 2] > 0.5
a = (L2 - pos[..., 1]).astype(np.float32); x = pos[..., 0].astype(np.float32); z = pos[..., 2].astype(np.float32); ax = np.abs(x)
nx, ny, nz = nor[..., 0], nor[..., 1], nor[..., 2]
ao1, ao2, bev = aob[..., 0], aob[..., 1], aob[..., 2]
log('данные загружены', S, 'плотность', round(PXM), 'пикс/м')
SCHEME = ''
# классы деталей (gbuf.py): 0 обшивка, 1 киль, 2 руль, 3 стабилизатор, 4 закрылки и элероны, 5 носки, 6 щитки, 7 створки подпитки, 8 пилоны, 9 рамы фонаря,
# 10 сопла, 11 кабина, 12 шасси, 13 рельсы и отсекатели, 14 мелочь (пушки, ПВД); материалы: 0 краска, 1 металл, 2 нутро, 4 резина, 5 кабина, 7 канал, 8 тёмная сталь
def W_LE(x_): return 7.66 + (x_ - 0.85) * 0.6395
def W_TE(x_): return 10.50 - 0.080 * (x_ - 0.85)
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
wing = (cls == 0) & (ax > 1.10) & (np.abs(z - WZC) < 0.16)
finm = (cls == 1) | (cls == 2)
hull = (cls == 0) & ~wing
# ── основа: светло-серая; снизу чуть светлее ──
U = smooth(-0.30, 0.30, nz) * (0.75 + 0.25 * smooth(-1.6, -0.6, z))
BASE = LOWC * (1 - U[..., None]) + TOPC * U[..., None]
col = np.ones((S, S, 3), np.float32) * BASE; rough = np.full((S, S), 0.46, np.float32); metal = np.zeros((S, S), np.float32); height = np.zeros((S, S), np.float32)
# тон листов: полосы между кольцевыми швами и по сторонам
RINGS = np.array([1.20, 2.25, 3.40, 4.40, 7.10, 8.40, 9.80, 10.55, 12.0, 13.45], np.float32)
band = np.searchsorted(np.append(RINGS, 40.0), a); lat = (x > 0).astype(np.int32) * 2 + (z > -0.62).astype(np.int32)
tt = rng_tab(64, 7, 0.975, 1.025); rt = rng_tab(64, 8, -0.022, 0.022); hue = rng_tab(64, 9, -0.006, 0.006)
idx = (band * 4 + lat) % 64; tone = tt[idx]; rtone = rt[idx]
cw = np.maximum(W_TE(ax) - W_LE(ax), 0.3); uc = (a - W_LE(ax)) / cw
wb = (uc > 0.18).astype(np.int32) + (uc > 0.68); wr = (ax > 1.6).astype(np.int32) + (ax > 2.4) + (ax > 3.1); wi = (wb * 4 + wr) * 4 + (x > 0) * 2 + (nz > 0)
tone = np.where(wing, tt[(wi + 17) % 64], tone); rtone = np.where(wing, rt[(wi + 17) % 64], rtone)
for c_, sd in ((1, 21), (2, 23), (3, 25), (4, 27), (5, 29), (6, 31), (7, 33), (8, 35), (13, 37)):      # своя краска у каждой детали
    ix_ = (x > 0).astype(np.int32) + sd + (ax > 2.1) * 3 * (c_ == 4); tone = np.where(cls == c_, 1.0 + (tt[ix_ % 64] - 1.0) * 0.45, tone); rtone = np.where(cls == c_, rt[ix_ % 64], rtone)
col *= tone[..., None]; rough += rtone
col[..., 0] *= 1 + hue[idx]; col[..., 2] *= 1 - hue[idx]
# подкраски и заменённые листы: прямоугольники с мягким краем распылителя
RS = np.random.RandomState(31)
tup = nz > 0.45; tdn = nz < -0.45; tsd = np.abs(nx) > 0.45
for vm, A_, Q_, n_, qa, qb in ((tup, a, x, 9, -3.6, 3.6), (tdn, a, x, 5, -3.6, 3.6), (tsd, a, z, 6, -1.4, -0.2)):
    ids = np.nonzero((vm & (cls <= 8)).ravel())[0]; AA, QQ = A_.ravel()[ids], Q_.ravel()[ids]
    for k in range(n_):
        a0 = RS.uniform(1.5, 13.5); w = RS.uniform(0.25, 1.1); q0 = RS.uniform(qa, qb); h_ = RS.uniform(0.15, 0.6); e_ = 0.012
        d = np.minimum.reduce([AA - a0, a0 + w - AA, QQ - q0, q0 + h_ - QQ]); sel = d > -e_
        if not sel.any(): continue
        t_ = np.clip((d[sel] + e_) / (2 * e_), 0, 1); kk = RS.uniform(0.98, 1.025); cc = ids[sel]
        for ch_ in range(3): col[..., ch_].ravel()[cc] *= 1 + (kk * (1 + RS.uniform(-0.012, 0.012)) - 1) * t_
        rough.ravel()[cc] += t_ * RS.uniform(-0.03, 0.02)
# ── панели и люки (фото f5e_01 сверху, чертёж f5e_15): прямоугольники - крышки, ломаные - швы ──
def loop(a0, a1, q0, q1): return [(a0, q0), (a1, q0), (a1, q1), (a0, q1), (a0, q0)]
def wline(u, x0, x1, n=6): return [(W_LE(x0 + (x1 - x0) * k / n) + u * (W_TE(x0 + (x1 - x0) * k / n) - W_LE(x0 + (x1 - x0) * k / n)), x0 + (x1 - x0) * k / n) for k in range(n + 1)]
def wrib(xr, u0=0.03, u1=0.70): return [(W_LE(xr) + u0 * (W_TE(xr) - W_LE(xr)), xr), (W_LE(xr) + u1 * (W_TE(xr) - W_LE(xr)), xr)]
WING = [wline(0.18, 1.12, 3.58), wline(0.68, 1.12, 3.58)] + [wrib(xr) for xr in (1.55, 2.05, 2.55, 3.05, 3.45)]
TOP = [loop(2.25, 3.85, 0.05, 0.30),                                  # створки пушечного отсека на носу
       [(4.40, 0.0), (4.40, 0.45)],
       loop(7.55, 8.30, 0.0, 0.16), loop(8.75, 9.55, 0.0, 0.16), loop(10.05, 10.85, 0.0, 0.18), loop(11.35, 11.75, 0.04, 0.16),   # крышки на гаргроте
       [(7.10, 0.20), (12.70, 0.20)], [(7.30, 0.52), (10.6, 0.56)],    # продольные швы гаргрота и стык короба
       loop(1.40, 2.15, 0.06, 0.22)] + WING + [loop(W_LE(1.7) + 0.55, W_LE(1.7) + 1.10, 1.30, 1.95), loop(W_LE(2.6) + 0.45, W_LE(2.6) + 0.85, 2.25, 2.85)]
BOT = [loop(3.18, 4.50, 0.0, 0.165), [(3.18, 0.004), (4.50, 0.004)],  # створки носовой ниши (сами створки - только в файле стоек)
       loop(8.85, 9.75, 0.25, 0.98), [(8.85, 0.61), (9.75, 0.61)],     # створки ниш основных стоек
       loop(10.60, 13.40, 0.04, 0.55), [(12.0, 0.04), (12.0, 0.55)],   # крышки двигательного отсека
       [(4.55, 0.004), (13.5, 0.004)], loop(5.2, 6.4, 0.08, 0.30), loop(1.40, 2.25, 0.04, 0.20)] + WING + [loop(W_LE(1.8) + 0.40, W_LE(1.8) + 1.05, 1.35, 2.05)]
SIDE = [loop(1.35, 2.25, -1.28, -0.98), loop(2.40, 3.30, -1.25, -0.90), loop(3.45, 4.30, -1.30, -1.00),   # люки оборудования на носу
        loop(4.55, 5.10, -0.92, -0.62),                                                                    # люк у кабины
        [(7.10, -0.62), (13.45, -0.62)], loop(10.60, 13.40, -1.32, -0.70), [(12.0, -1.32), (12.0, -0.70)],  # продольный шов и двигательные крышки
        loop(8.60, 9.30, -0.55, -0.30)]
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
Hk = 0
for lst, vmask, Q in ((TOP, top_m, ax), (BOT, bot_m, ax), (SIDE, sr_m | sl_m, z)):
    for r in lst:
        if len(r) >= 5 and r[0] == r[-1] and not (r in WING):
            ins, d = rect_mask(a, Q, r); ins &= vmask & (cls == 0); hatch[ins] = 1.0; hedge[ins] = np.minimum(hedge[ins], d[ins]); col[ins] *= 1.0 + 0.012 * ((Hk % 3) - 1); rough[ins] -= 0.05; Hk += 1
for L_ in TOP: lines(L_, a, ax, top_m & hullm)
for L_ in BOT: lines(L_, a, ax, bot_m & hullm)
for L_ in SIDE: lines(L_, a, z, (sr_m | sl_m) & hullm)
# кольцевые швы фюзеляжа
fus = (cls == 0) & ~wing & (ax < 1.15)
for rA in RINGS:
    m = (np.abs(a - rA) < 0.08) & fus; phi = np.arctan2(x, z + 0.75) * 0.55; seamd[m] = np.minimum(seamd[m], np.abs(a[m] - rA))
    for sgn in (1, -1):
        ph = (phi[m] / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH; dr = np.hypot(dph, a[m] - rA - sgn * OFF); riv[m] = np.maximum(riv[m], np.clip(1 - dr / RV, 0, 1))
# нервюры киля, стабилизатора, рулей: ряды поперёк хорды
for m, Q, st, A__ in ((cls == 1, z, 0.42, a), (cls == 3, ax, 0.40, a), (cls == 4, ax, 0.45, a), (cls == 5, ax, 0.55, a), (cls == 8, a, 0.5, z)):
    rr = (Q[m] / st) % 1.0; dq = np.minimum(rr, 1 - rr) * st; ph = (A__[m] / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH
    riv[m] = np.maximum(riv[m], np.clip(1 - np.hypot(dph, dq) / RV, 0, 1))
log('панели и заклёпки', float((riv > 0).mean()))
# ── пятна, фотомаски CC0, выгорание, потёки, грязь. Снизу пятна слабее ──
mott = fbm(0.55, 0.55, 0.55, 4, 1.0); fine = fbm(11.0, 11.0, 11.0, 2, 5.0); patch = fbm(1.4, 1.4, 1.4, 4, 9.0)
under = smooth(-0.15, -0.75, nz); amp = 1.0 - 0.5 * under
col *= (1 + (0.06 * (mott - 0.5) + 0.020 * (fine - 0.5)) * amp)[..., None]
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
col *= (1 - 0.035 * (imp - 0.5) * skin_m)[..., None]; rough += (imp - 0.5) * 0.10 * skin_m
walk = (smooth(1.2, 0.5, np.abs(a - 5.0)) * smooth(0.75, 0.45, ax) + smooth(0.9, 0.3, np.abs(a - 8.6)) * smooth(1.5, 1.0, ax)) * smooth(0.3, 0.7, nz)     # где ходят: у кабины, у корня крыла
scr_cc = smooth(0.35, 0.75, scrm) * skin_m * (0.25 + 0.75 * walk) * smooth(-0.2, 0.4, nz)
col = mix(col, BASE * 1.08, scr_cc * 0.30); rough -= scr_cc * 0.10
lk_ = smooth(0.25, 0.70, leak) * skin_m * (0.30 + 0.70 * smooth(0.0, 0.35, np.abs(nx))) * (1 - 0.8 * smooth(-0.3, -0.7, nz))
col = mix(col, (0.24, 0.245, 0.25), lk_ * 0.10); rough += lk_ * 0.05
polish = smooth(0.55, 0.72, fbm(0.9, 0.9, 0.9, 3, 13.0)); rough += (mott - 0.5) * 0.04 - polish * 0.025
sun = smooth(0.25, 0.9, nz); col = mix(col, BASE * np.array([1.05, 1.05, 1.045], np.float32), sun * smooth(0.40, 0.72, patch) * 0.14)     # выгорело сверху
stre = fbm(0.75, 11.0, 11.0, 4, 3.0); stre2 = fbm(0.42, 26.0, 26.0, 3, 17.0)
flow = smooth(0.50, 0.70, stre) * (0.35 + 0.65 * smooth(0.35, 0.70, patch)); flow2 = smooth(0.58, 0.74, stre2)
rearw = 0.45 + 0.55 * smooth(6.0, 12.5, a)
dirty = flow * rearw * np.where(nz < -0.2, 0.05, 0.26)
col = mix(col, (0.26, 0.265, 0.27), dirty * 0.07); rough += dirty * 0.04
col = mix(col, (0.18, 0.18, 0.18), flow2 * 0.012 * rearw)
oil = under * smooth(0.50, 0.72, fbm(1.0, 2.0, 2.0, 4, 23.0)) * np.where(ax > 1.2, 0.15, 1.0) * smooth(6.0, 11.0, a)
col = mix(col, (0.32, 0.32, 0.315), oil * 0.09); rough += oil * 0.08
# у щитков и ниш снизу: грязь и масло
for a0_, a1_, q0_, q1_ in ((3.18, 4.50, 0.0, 0.17), (7.30, 8.45, 0.10, 0.46), (8.85, 9.75, 0.25, 0.98), (10.6, 13.4, 0.04, 0.55)):
    m_ = smooth(a0_ - 0.10, a0_ + 0.10, a) * smooth(a1_ + 0.30, a1_ - 0.25, a) * smooth(q0_ - 0.1, q0_ + 0.1, ax) * smooth(q1_ + 0.12, q1_ - 0.12, ax) * under * smooth(0.36, 0.66, fbm(1.6, 3.0, 3.0, 3, 29.0))
    col = mix(col, (0.25, 0.24, 0.23), m_ * 0.14); rough += m_ * 0.08
# брызги от колёс: веером назад по низу от каждой стойки, полосами по потоку
for ac_, xc_, w0_ in ((9.25, 1.80, 0.24), (9.25, -1.80, 0.24), (4.15, 0.0, 0.20)):
    da_ = a - ac_; fan_ = smooth(-0.1, 0.5, da_) * smooth(3.4, 1.0, da_) * np.exp(-((x - xc_) / (w0_ + 0.26 * np.clip(da_, 0, None))) ** 2)
    spr_ = under * fan_ * (0.30 + 0.70 * smooth(0.42, 0.70, fbm(0.55, 17.0, 17.0, 3, 61.0 + ac_ + xc_))) * (mat == 0) * (cls <= 8)
    col = mix(col, (0.27, 0.245, 0.21), spr_ * 0.17); rough += spr_ * 0.07
# копоть пушек: стволы на носу сверху, назад по потоку (фото f5e_01)
for sg in (1, -1):
    dx_ = x - sg * 0.23; gun_ = smooth(2.45, 2.62, a) * smooth(4.6, 2.9, a) * np.exp(-(dx_ / (0.045 + 0.05 * np.clip(a - 2.6, 0, None))) ** 2) * (nz > -0.2) * ((cls == 0) | (cls == 14))
    gun_ *= (0.55 + 0.45 * smooth(0.35, 0.70, fbm(1.2, 18.0, 18.0, 3, 101.0 + sg)))
    col = mix(col, (0.10, 0.095, 0.09), gun_ * 0.75); rough += gun_ * 0.20
# копоть и гарь у сопел: две трубы, у основания мягко
rn = np.minimum(np.hypot(x - 0.29, z + 0.875), np.hypot(x + 0.29, z + 0.875))
soot = smooth(12.6, 13.6, a) * (0.45 + 0.55 * smooth(0.28, 0.72, fbm(0.7, 2.6, 2.6, 4, 31.0))) * ((cls == 0) | (cls == 3)) * (rn < 0.75) * (mat == 0)
col = mix(col, (0.13, 0.125, 0.12), soot * 0.50); rough += soot * 0.26
# наслоение у швов, заклёпки, затенение в цвете у стыков
hair = smooth(0.0085, 0.002, seamd); col *= (1 - 0.19 * hair * skin_m)[..., None]; rough += hair * 0.04 * skin_m
halo = smooth(0.07, 0.0, seamd) * smooth(0.30, 0.66, stre) * skin_m; col *= (1 - 0.035 * halo)[..., None]
stain = aft * smooth(0.38, 0.72, stre) * skin_m * (1 - 0.7 * under); col = mix(col, (0.20, 0.205, 0.21), stain * 0.09); rough += stain * 0.03
crev = smooth(0.92, 0.45, ao1) * skin_m; col = mix(col, (0.12, 0.12, 0.12), crev * 0.45); rough += crev * 0.26
body_ = smooth(0.15, 0.95, ao2); col *= (0.95 + 0.05 * body_)[..., None]
fade = smooth(-0.7, 0.8, nz); col *= (0.97 + 0.05 * fade)[..., None]
rv_d = smooth(0.0, 0.25, riv); rv_top = smooth(0.25, 0.75, riv); col *= (1 - rv_d * 0.045 * skin_m)[..., None]; col += (rv_top * 0.008 * skin_m)[..., None]
# ── кромки: передние глаже и выцветшие, сколы: по краю грунт, в глубине металл ──
edge = smooth(0.985, 0.90, bev) * skin_m
sL = a - W_LE(ax); LE_w = smooth(0.13, 0.02, sL) * (sL > -0.03) * (wing | (cls == 5))
col = mix(col, BASE * 1.08, LE_w * 0.40); rough -= LE_w * 0.12
eros = smooth(0.46, 0.60, fbm(9.0, 9.0, 9.0, 3, 37.0))
chip = np.maximum(edge * smooth(0.52, 0.62, fbm(14.0, 14.0, 14.0, 3, 41.0)), LE_w * smooth(0.66, 0.78, eros) * 0.45)
scuff = smooth(0.030, 0.006, hedge) * smooth(0.52, 0.64, fbm(22.0, 22.0, 22.0, 3, 43.0))
scr = smooth(0.76, 0.78, fbm(5.0, 70.0, 70.0, 2, 47.0)) * smooth(0.60, 0.72, patch) * sun * 0.05
rough -= (edge * 0.14 + scuff * 0.16)
mov = np.isin(cls, (2, 3, 4, 5, 6, 7)); chip = chip * np.where(mov, 0.12, 0.55) * smooth(13.6, 12.6, a); edge = edge * np.where(mov, 0.2, 1.0)
dmg = np.clip(chip * 0.9 + scuff * 0.20 + scr * 0.6, 0, 1) * skin_m
prim = smooth(0.20, 0.42, dmg); bare = smooth(0.50, 0.88, dmg)
PRIM = np.array((0.70, 0.71, 0.67), np.float32); BARE = np.array((0.60, 0.61, 0.63), np.float32)
col = mix(col, PRIM, prim * 0.55); rough += prim * 0.05
col = mix(col, BARE, bare); rough = rough * (1 - bare) + bare * (0.36 + 0.05 * fine); metal = np.maximum(metal, smooth(0.45, 0.75, bare))
log('краска')
from PIL import ImageDraw, ImageFont
FNT = '/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf'
def decal(text, ac, qc, W_, H_, side, col_, alpha=0.82, rot=False):
    if SCHEME: return
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
    if SCHEME: return
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


INS = insignia_img()
for sd in ('r', 'l'):
    stamp(INS, 11.55, -0.74, 1.10, 0.44, sd, alpha=0.92)                                           # на ровном борту за коробом заборника (Mark: на 10,95 налезал на изгиб)                                           # знак на борту за крылом
    stamp(text_img('AF 99-0712', 260, ink=DKI), 12.42, 0.52, 0.95, 0.17, sd, alpha=0.92, cl=(1,))  # вымышленный номер на киле
    stamp(text_img('712', 300, ink=DKI), 3.05, -1.05, 0.42, 0.20, sd, alpha=0.90)                  # бортовой на носу (вымышленный)
    stamp(box_text(['U.S. AIR FORCE'], 90, ink=DKI, frame=False), 8.95, -0.42, 0.95, 0.10, sd, alpha=0.85)
    stamp(tri_img(S_=400, ink=RED), 4.70, -0.48, 0.12, 0.12, sd)                                   # катапульта
    stamp(arrow_img(), 4.95, -0.62, 0.40, 0.11, sd, alpha=0.90)                                    # стрелка спасения
    stamp(box_text(['RESCUE'], 90, ink=RED, frame=False), 4.95, -0.72, 0.40, 0.08, sd, alpha=0.85)
    stamp(box_text(['DANGER', 'JET INTAKE'], 80, ink=RED, frame=True), 6.75, -0.70, 0.42, 0.16, sd, alpha=0.82)
    stamp(box_text(['OXY'], 70, ink=(32, 108, 62, 255)), 3.85, -1.12, 0.12, 0.06, sd, alpha=0.82)
    stamp(box_text(['GROUND'], 60, ink=DKI, frame=False), 3.60, -1.30, 0.15, 0.04, sd, alpha=0.75)
    stamp(box_text(['HYD'], 70, ink=DKI), 11.6, -1.05, 0.11, 0.055, sd, alpha=0.78)
    stamp(box_text(['DANGER', 'SPEED BRAKE'], 60, ink=RED), 8.0, -1.30, 0.26, 0.09, sd, alpha=0.80)
    stamp(box_text(['F-5E TIGER II', 'S/N 99-0712', 'EMPTY 4410 KG'], 50, ink=DKI), 4.35, -0.85, 0.18, 0.10, sd, alpha=0.72)     # табличка у кабины
    stamp(tri_img(S_=400, ink=RED, letter='!'), 2.85, -0.80, 0.10, 0.10, sd, alpha=0.85)                                           # пушка
for sg in (1, -1):
    stamp(text_img('NO STEP', 140, ink=DKI), W_LE(2.2) + 1.45, sg * 2.2, 0.36, 0.08, 'top', alpha=0.78)    # перед закрылком и элероном
    stamp(text_img('NO STEP', 140, ink=DKI), W_LE(2.6) + 0.12, sg * 2.6, 0.30, 0.07, 'top', alpha=0.72)    # носок
    stamp(box_text(['WALK'], 70, ink=DKI, frame=True), 8.75, sg * 1.30, 0.22, 0.10, 'top', alpha=0.65)
    stamp(box_text(['DANGER GUN'], 70, ink=RED, frame=True), 3.50, sg * 0.15, 0.24, 0.055, 'top', alpha=0.80)
    stamp(box_text(['FUEL', 'JP-8'], 70, ink=DKI), 9.15, sg * 0.10, 0.16, 0.10, 'top', alpha=0.78)
    stamp(box_text(['JACK'], 70, ink=DKI), 6.0, sg * 0.24, 0.12, 0.05, 'bot', alpha=0.78)
    stamp(box_text(['LIFT'], 70, ink=DKI), 11.5, sg * 0.30, 0.12, 0.05, 'bot', alpha=0.78)
    stamp(box_text(['TIE DOWN'], 60, ink=DKI), 12.6, sg * 0.40, 0.20, 0.045, 'bot', alpha=0.75)
stamp(INS, W_LE(2.6) + 0.70, -2.60, 0.95, 0.38, 'top', along=False); stamp(INS, W_LE(2.6) + 0.70, 2.60, 0.95, 0.38, 'bot', along=False)    # на крыльях: левое сверху, правое снизу
log('надписи')
# ── обтекатель носа: чуть другим тоном ──
rad = (a < 1.20) & (cls == 0)
RAD = np.array((0.545, 0.565, 0.58), np.float32) * (0.985 + 0.03 * mott)[..., None]
col[rad] = RAD[rad]; rough[rad] = (0.50 + 0.06 * (mott - 0.5))[rad]; metal[rad] = 0
# ── хвост у сопел и сопла: побежалость, гарь, потемневший металл ──
tn = fbm(1.2, 4.0, 4.0, 4, 59.0); ts = fbm(0.8, 14.0, 14.0, 3, 61.0)
def heat(t):
    st = np.array([0.0, 0.40, 0.72, 1.0], np.float32); p = np.array([[0.46, 0.46, 0.455], [0.42, 0.415, 0.405], [0.35, 0.34, 0.335], [0.27, 0.265, 0.265]], np.float32)
    return np.stack([np.interp(t, st, p[:, i]) for i in range(3)], -1).astype(np.float32)
t_ti = np.clip((a - 13.30) / 0.40 + (tn - 0.5) * 0.45 + (ts - 0.5) * 0.25, 0, 1)
hc = heat(t_ti) * (0.95 + 0.10 * ts)[..., None]
tw_ = smooth(13.45, 13.76, a) * smooth(0.48, 0.38, rn) * (cls == 0) * (mat == 0); col = mix(col, hc, tw_); metal = np.maximum(metal, tw_ * 0.55); rough = rough * (1 - tw_) + tw_ * np.clip(0.56 + (tn - 0.5) * 0.08, 0.48, 0.64)
noz = cls == 10
ncol = np.array((0.58, 0.54, 0.48), np.float32) * (0.96 + 0.08 * ts)[..., None]     # светлый металл с бронзой (фото 01, 05)
sn = smooth(14.20, 14.52, a) * (0.8 + 0.2 * tn); ncol = ncol * (1 - 0.30 * sn)[..., None] + np.array((0.12, 0.115, 0.11), np.float32) * (0.40 * sn)[..., None]
tmp_k = (smooth(13.85, 14.05, a) * smooth(14.35, 14.15, a) * (0.6 + 0.4 * tn))[..., None]; ncol = ncol * (1 - 0.22 * tmp_k) + np.array((0.48, 0.41, 0.31), np.float32) * (0.22 * tmp_k)     # побежалость: соломенный
tmp_b = (smooth(14.15, 14.30, a) * smooth(14.48, 14.35, a) * smooth(0.45, 0.65, ts))[..., None]; ncol = ncol * (1 - 0.12 * tmp_b) + np.array((0.33, 0.35, 0.44), np.float32) * (0.12 * tmp_b)   # и синеватый
col[noz] = ncol[noz]; metal[noz] = 1.0; rough[noz] = np.clip(0.45 + (tn[noz] - 0.5) * 0.10, 0.35, 0.55)
ins_ = noz & (mat == 2); iv = (0.16 + 0.08 * ts); col[ins_] = np.stack([iv, iv * 0.97, iv * 0.93], -1)[ins_]; metal[ins_] = 0.4; rough[ins_] = 0.75
log('металл')
# ── материалы без краски обшивки ──
def solid(m, c, r, me=0.0, nz_=0.08):
    col[m] = np.array(c, np.float32) * (1 - nz_ / 2 + nz_ * fine[m])[..., None]; rough[m] = r; metal[m] = me
solid(mat == 2, (0.030, 0.030, 0.032), 0.9)             # нутро
solid(mat == 4, (0.045, 0.045, 0.048), 0.86)            # резина
solid((mat == 5) & (cls == 11), (0.20, 0.21, 0.22), 0.62, 0, 0.16)    # кабина
duct = (mat == 7) & (cls != 11); deep_ = smooth(6.4, 8.6, a); col[duct] = (np.array((0.52, 0.53, 0.53), np.float32) * (1 - deep_[..., None]) + np.array((0.07, 0.072, 0.075), np.float32) * deep_[..., None])[duct] * (0.85 + 0.30 * mott[duct])[..., None]; rough[duct] = 0.7     # канал: у губы светлый, в глубине тёмный
solid(mat == 8, (0.15, 0.15, 0.155), 0.55, 0.6, 0.12)   # тёмная сталь
ck = cls == 11                                          # кабина: серая, подушки оливковые, ремни, рукоятки жёлто-чёрные, циферблаты чёрные
solid(ck & (mat == 5), (0.27, 0.285, 0.30), 0.62, 0, 0.16); solid(ck & (mat == 6), (0.33, 0.31, 0.22), 0.92, 0, 0.2); solid(ck & (mat == 8), (0.30, 0.28, 0.21), 0.9, 0, 0.14)
solid(ck & (mat == 2), (0.035, 0.035, 0.038), 0.6); solid(ck & (mat == 1), (0.70, 0.70, 0.68), 0.35, 0.8)
hs = ((pos[..., 0] + pos[..., 1] + pos[..., 2]) / 0.035) % 1.0 > 0.5
solid(ck & (mat == 7), (0.74, 0.60, 0.06), 0.42); col[ck & (mat == 7) & hs] = np.array((0.035, 0.035, 0.035), np.float32)
mm = (mat == 1) & ~np.isin(cls, (10, 12)); solid(mm, (0.46, 0.47, 0.48), 0.38, 1.0)
gm_ = (cls == 14) & (mat == 0); solid(gm_, (0.20, 0.20, 0.21), 0.5, 0.6, 0.12)     # стволы, ПВД
gr_ = cls == 12                                         # шасси: потёртая серо-белая краска, тусклый шток в масле, тёмная сталь, серые щитки, серая резина
g_p = gr_ & (mat == 0); g_c = gr_ & (mat == 1); g_s = gr_ & (mat == 8); g_d = gr_ & (mat == 5)
gm1 = fbm(2.4, 2.4, 2.4, 4, 91.0); gm2 = fbm(18.0, 18.0, 18.0, 3, 93.0); gst = fbm(1.0, 16.0, 2.2, 4, 87.0); gst2 = fbm(0.7, 34.0, 1.3, 3, 89.0)
solid(g_p, (0.545, 0.545, 0.515), 0.62, 0, 0.10); solid(g_c, (0.47, 0.47, 0.46), 0.30, 0.85, 0.08); solid(g_s, (0.145, 0.142, 0.14), 0.58, 0.75, 0.14)
solid(g_d, (0.50, 0.52, 0.535), 0.60, 0, 0.10); solid(gr_ & (mat == 3), (0.60, 0.56, 0.40), 0.28, 0, 0.1); solid(gr_ & (mat == 2), (0.05, 0.048, 0.046), 0.72, 0, 0.14)
painted = g_p | g_d
col[painted] *= (0.84 + 0.30 * gm1[painted] + 0.06 * gm2[painted])[..., None]
oil_ = smooth(0.46, 0.68, gst) * (0.5 + 0.5 * smooth(0.40, 0.70, gst2)); col = mix(col, (0.15, 0.125, 0.095), oil_ * 0.58 * (painted | g_c)); rough = rough + oil_ * 0.20 * painted - oil_ * 0.10 * g_c
gd = smooth(-1.9, -2.55, z) * gr_ * (0.45 + 0.55 * smooth(0.36, 0.66, gm1)); col = mix(col, (0.215, 0.195, 0.165), gd * 0.62 * (painted | g_s)); rough = rough + gd * 0.22 * painted
WHEELS = ((4.15, 0.0, GROUND + 0.23, 0.23, 0.15), (9.25, 1.80, GROUND + 0.305, 0.305, 0.20), (9.25, -1.80, GROUND + 0.305, 0.305, 0.20))
for ac_, xc_, zc_, rw_, ww_ in WHEELS:
    rd_ = np.hypot(a - ac_, z - zc_); md_ = gr_ & (rd_ < rw_ * 0.68) & (np.abs(x - xc_) < 0.20)
    dust = smooth(rw_ * 0.68, rw_ * 0.10, rd_) * (0.45 + 0.55 * smooth(0.34, 0.62, gm2)) * md_; col = mix(col, (0.115, 0.10, 0.085), dust * 0.72); rough = rough + dust * 0.15
g_e = smooth(0.985, 0.90, bev) * painted * smooth(0.50, 0.62, gm2); col = mix(col, (0.26, 0.255, 0.24), g_e * 0.8); rough = rough + g_e * 0.05
tyr = mat == 4; rt_ = smooth(0.40, 0.68, gm2) * tyr; col[tyr] = np.array((0.070, 0.070, 0.072), np.float32); col = mix(col, (0.165, 0.158, 0.145), rt_ * 0.50); col = mix(col, (0.20, 0.19, 0.17), smooth(GROUND + 0.20, GROUND, z) * tyr * 0.45); rough[tyr] = 0.90
def _tyre_strip(t, W=2400, H=120):
    im_ = Image.new('L', (W, H), 0); d_ = ImageDraw.Draw(im_); f_ = ImageFont.truetype(FNT, int(H * 0.8)); tw = d_.textlength(t, font=f_)
    for k in range(2): d_.text((W * (0.25 + 0.5 * k), H / 2), t, font=f_, fill=255, anchor='mm')
    return np.asarray(im_, np.float32) / 255.0
TSTR = _tyre_strip('NORDRUN AERO  18 PLY  TUBELESS')
for ac_, xc_, zc_, rw_, ww_ in WHEELS:
    rr_ = np.hypot(a - ac_, z - zc_); side_ = (mat == 4) & (np.abs(nx) > 0.55) & (np.abs(x - xc_) > ww_ * 0.25) & (np.abs(x - xc_) < ww_ * 0.75)
    r0_, r1_ = rw_ * 0.66, rw_ * 0.86; m_ = side_ & (rr_ > r0_) & (rr_ < r1_)
    if m_.any():
        ang_ = (np.arctan2(z[m_] - zc_, a[m_] - ac_) / (2 * np.pi)) % 1.0; vv_ = 1 - (rr_[m_] - r0_) / (r1_ - r0_)
        L_ = TSTR[np.clip((vv_ * TSTR.shape[0]).astype(int), 0, TSTR.shape[0] - 1), np.clip((ang_ * TSTR.shape[1]).astype(int), 0, TSTR.shape[1] - 1)]
        c_ = col[m_]; col[m_] = c_ + (np.array((0.13, 0.13, 0.13), np.float32) - c_) * (L_ * 0.55)[..., None]; rough[m_] = rough[m_] - L_ * 0.12
col[gr_] *= (0.50 + 0.50 * smooth(0.15, 0.95, ao2[gr_]))[..., None]       # под самолётом стойки в тени: в игре тени самолёта на них нет
gdoor_in = gr_ & (mat == 0) & (np.abs(ny) < 0.5) & (z > -1.6) & (ax < 0.2); solid(gdoor_in, (0.60, 0.61, 0.60), 0.55, 0, 0.14)
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
height += smooth(0.1, 0.8, riv) * 0.0004 * skin_m
ins_h = hedge < 8; height += smooth(0.0, 0.008, hedge) * 0.0009 * ins_h
height -= smooth(0.0035, 0.0, seamd) * 0.0006 * skin_m                 # швы чуть утоплены
height += scr * -0.0002
height = np.where(a < 1.20, height * 0.25, height)
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
occ = np.where(duct_m, np.minimum(np.maximum(occ, 0.45), 1.0 - 0.45 * smooth(6.4, 8.6, a)), occ)
occ = np.where(np.isin(cls, (6, 7)), np.maximum(occ, 0.8), occ)
bleed([col, rough, metal, occ, nn], cov)
def lift(arr): return (np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)
Image.fromarray(lift(col)[::-1]).save(f'{OUT}/f5_color.png', compress_level=1)
Image.fromarray(lift(nn * 0.5 + 0.5)[::-1]).save(f'{OUT}/f5_normal.png', compress_level=1)
orm = np.stack([occ, rough, metal], -1); Image.fromarray(lift(orm)[::-1]).save(f'{OUT}/f5_orm.png', compress_level=1)
pm = skin_m & cov & (cls == 0) & (a > 3) & (a < 13)
print('средний цвет обшивки sRGB', (col[pm].mean(0) * 255).round(1), 'шероховатость', round(float(rough[pm].mean()), 3), 'доля голого металла', round(float((metal[pm] > 0.5).mean()), 4))
log('сохранено', OUT)
