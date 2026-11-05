# paint.py - краска F-15E из данных gbuf.py: цвет (только краска и грязь, без света), нормали (заклёпки, крышки, шагрень), карта блеска glTF (G шероховатость, B металл). Без Blender: /usr/bin/python3 paint.py
# F15_TEX=2048|4096, F15_OUT=<папка>, F15_BASE=r,g,b (0…1, sRGB)
import math, os, re, site, sys, time
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__)); DAT = os.path.join(HERE, '_проба')
S = int(os.environ.get('F15_TEX', '2048')); OUT = os.environ.get('F15_OUT', DAT); os.makedirs(OUT, exist_ok=True)
BASE = np.array([float(v) for v in os.environ.get('F15_BASE', '0.395,0.42,0.445').split(',')], np.float32)
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f} с]', *a, flush=True)
L2 = 9.715
pos = np.load(f'{DAT}/gb_pos_{S}.npy'); nor = np.load(f'{DAT}/gb_nor_{S}.npy'); idd = np.load(f'{DAT}/gb_id_{S}.npy'); aob = np.load(f'{DAT}/gb_ao_{S}.npy')
import json
ATLAS = json.load(open(f'{DAT}/uv.json', encoding='utf-8'))['atlas_m']; PXM = 0.985 * S / ATLAS; DS = 1.0 / PXM
mat = np.round(idd[..., 0] * 16).astype(np.int8); cls = np.round(idd[..., 1] * 32).astype(np.int8); cov = idd[..., 2] > 0.5
a = (L2 - pos[..., 1]).astype(np.float32); x = pos[..., 0].astype(np.float32); z = pos[..., 2].astype(np.float32); ax = np.abs(x)
nx, ny, nz = nor[..., 0], nor[..., 1], nor[..., 2]
ao1, ao2, bev = aob[..., 0], aob[..., 1], aob[..., 2]
log('данные загружены', S, 'плотность', round(PXM), 'пикс/м')
src = open(os.path.join(HERE, 'f15_detail.py'), encoding='utf-8').read()
ns = {}; exec(src[src.index('TOP_LINES = ['):src.index('RINGS_FORE = ')], ns); TOP, BOT, SIDE = ns['TOP_LINES'], ns['BOT_LINES'], ns['SIDE_PANELS']
RINGS_FORE = (2.39, 3.06, 5.15); RINGS_NAC = (13.9, 15.5, 16.65)


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
# ── основа ──
if os.environ.get('F15_SCHEME') == 'two':   # своя двухцветная схема: светло-серая основа, голубовато-серые пятна с волнистым краем; рисунок почти симметричный, нос темнее
    w1 = vnoise(a * 1.1 + 3.1, ax * 1.1 - 1.7, z * 0.9 + 0.4) - 0.5; w2 = vnoise(a * 2.6 - 5.3, ax * 2.6 + 2.2, z * 2.2 - 3.0) - 0.5
    pat = vnoise(a * 0.46 + 11.0 + w1 * 0.55 + w2 * 0.16, ax * 0.56 + 4.0 + w2 * 0.20 - w1 * 0.35, z * 0.35 + 7.0)
    pat = pat + smooth(7.2, 5.2, a) * 0.42 - smooth(16.8, 18.5, a) * 0.08
    mk_ = smooth(0.510, 0.528, pat)
    L_, D_ = np.array((0.505, 0.525, 0.525), np.float32), np.array((0.355, 0.405, 0.465), np.float32)
    BASE = L_ * (1 - mk_[..., None]) + D_ * mk_[..., None]
col = np.ones((S, S, 3), np.float32) * BASE; rough = np.full((S, S), 0.45, np.float32); metal = np.zeros((S, S), np.float32); height = np.zeros((S, S), np.float32)
# тон панелей: границы совпадают со швами геометрии
FR = np.array([2.39, 3.06, 5.15, 6.6, 8.7, 9.6, 10.7, 11.9, 13.6, 15.0, 16.1, 16.65, 40.0], np.float32)
band = np.searchsorted(FR, a); lat = (x > 0).astype(np.int32) * 2 + (z > 0.1).astype(np.int32)
tt = rng_tab(64, 7, 0.955, 1.045); rt = rng_tab(64, 8, -0.05, 0.05); hue = rng_tab(64, 9, -0.010, 0.010)
idx = (band * 4 + lat) % 64; tone = tt[idx]; rtone = rt[idx]
LEW = 9.70 + (ax - 2.14) * (4.40 / 4.26); s1 = a - LEW; s2 = a - (10.45 + (ax - 2.14) * (3.63 / 3.56)); s3 = a - (14.32 + (ax - 2.14) * (0.13 / 3.36))
wing = (cls == 0) & (ax > 2.14)
wb = (s1 > 0).astype(np.int32) + (s2 > 0) + (s3 > 0); wr = (ax > 3.2).astype(np.int32) + (ax > 4.4); wi = (wb * 3 + wr) * 4 + (x > 0) * 2 + (nz > 0)
tone = np.where(wing, tt[(wi + 17) % 64], tone); rtone = np.where(wing, rt[(wi + 17) % 64], rtone)
for c_, sd in ((1, 21), (2, 23), (3, 25), (4, 27), (5, 29), (6, 31), (7, 33), (8, 35)):      # кили, рули, стабилизаторы, закрылки, короба, щиток, створки: своя краска у каждой детали
    ix_ = (x > 0).astype(np.int32) + sd + (ax > 3.9) * 3 * (c_ == 4); tone = np.where(cls == c_, 1.0 + (tt[ix_ % 64] - 1.0) * 0.45, tone); rtone = np.where(cls == c_, rt[ix_ % 64], rtone)
col *= tone[..., None]; rough += rtone
col[..., 0] *= 1 + hue[idx]; col[..., 2] *= 1 - hue[idx]
# подкраски и заменённые листы: прямоугольники по плану, сверху, снизу и с бортов (мягкий край распылителя)
RS = np.random.RandomState(31); fresh = np.zeros((S, S), np.float32)
tup = nz > 0.45; tdn = nz < -0.45; tsd = np.abs(nx) > 0.45
for vm, A_, Q_, n_, qa, qb in ((tup, a, x, 26, -6.0, 6.0), (tdn, a, x, 18, -6.0, 6.0), (tsd, a, z, 12, -0.9, 1.2)):
    ids = np.nonzero((vm & (cls <= 8)).ravel())[0]; AA, QQ = A_.ravel()[ids], Q_.ravel()[ids]
    for k in range(n_):
        a0 = RS.uniform(2.6, 18.6); w = RS.uniform(0.25, 1.25); q0 = RS.uniform(qa, qb); h_ = RS.uniform(0.18, 0.8); e_ = 0.012
        d = np.minimum.reduce([AA - a0, a0 + w - AA, QQ - q0, q0 + h_ - QQ]); sel = d > -e_
        if not sel.any(): continue
        t_ = np.clip((d[sel] + e_) / (2 * e_), 0, 1); kk = RS.uniform(0.95, 1.06); cc = ids[sel]
        for ch_ in range(3): col[..., ch_].ravel()[cc] *= 1 + (kk * (1 + RS.uniform(-0.012, 0.012)) - 1) * t_
        rough.ravel()[cc] += t_ * RS.uniform(-0.09, 0.05); fresh.ravel()[cc] = np.maximum(fresh.ravel()[cc], t_)
# крышки люков: свежее и глаже, другой оттенок
hatch = np.zeros((S, S), np.float32); hedge = np.full((S, S), 9.0, np.float32)
def rect_mask(A, Q, r):
    a0, a1 = min(p[0] for p in r), max(p[0] for p in r); q0, q1 = min(p[1] for p in r), max(p[1] for p in r)
    ins = (A > a0) & (A < a1) & (Q > q0) & (Q < q1); d = np.minimum.reduce([A - a0, a1 - A, Q - q0, q1 - Q]); return ins, d
top_m = nz > 0.5; bot_m = nz < -0.5; sr_m = nx > 0.45; sl_m = nx < -0.45
Hk = 0
for lst, vmask, Q in ((TOP, top_m, ax), (BOT, bot_m, ax)):
    for r in lst:
        if len(r) >= 5 and r[0] == r[-1]:
            ins, d = rect_mask(a, Q, r); ins &= vmask & (cls == 0); hatch[ins] = 1.0; hedge[ins] = np.minimum(hedge[ins], d[ins]); col[ins] *= 1.05 + 0.03 * ((Hk % 3) - 1); rough[ins] -= 0.07; Hk += 1
for r in SIDE:
    if len(r) >= 5 and r[0] == r[-1]:
        ins, d = rect_mask(a, z, r); ins &= (sr_m | sl_m) & (cls == 0); hatch[ins] = 1.0; hedge[ins] = np.minimum(hedge[ins], d[ins]); col[ins] *= 0.96 + 0.045 * ((Hk % 3)); rough[ins] -= 0.07; Hk += 1
log('панели и крышки')
# ── заклёпки и близость швов ──
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
hullm = (cls == 0) | (cls == 5)
for L_ in TOP: lines(L_, a, ax, top_m & hullm)
for L_ in BOT: lines(L_, a, ax, bot_m & hullm)
for L_ in SIDE: lines(L_, a, z, (sr_m | sl_m) & hullm)
# кольцевые швы: носовая часть и гондолы
for rA in RINGS_FORE:
    m = (np.abs(a - rA) < 0.08) & (cls == 0); phi = np.arctan2(x, z - 0.3) * 0.72; seamd[m] = np.minimum(seamd[m], np.abs(a[m] - rA))
    for sgn in (1, -1):
        ph = (phi[m] / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH; dr = np.hypot(dph, a[m] - rA - sgn * OFF); riv[m] = np.maximum(riv[m], np.clip(1 - dr / RV, 0, 1))
rn = np.hypot(ax - 0.69, z)
for rA in RINGS_NAC:
    m = (np.abs(a - rA) < 0.08) & (cls == 0) & (rn < 0.72); phi = np.arctan2(ax - 0.69, z) * 0.6; seamd[m] = np.minimum(seamd[m], np.abs(a[m] - rA))
    for sgn in (1, -1):
        ph = (phi[m] / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH; dr = np.hypot(dph, a[m] - rA - sgn * OFF); riv[m] = np.maximum(riv[m], np.clip(1 - dr / RV, 0, 1))
# нервюры килей и плоскостей: ряды поперёк хорды
for c_, Q, st in ((1, z, 0.62), (3, ax, 0.55), (4, ax, 0.60), (8, a, 0.9)):
    m = (cls == c_); rr = (Q[m] / st) % 1.0; dq = np.minimum(rr, 1 - rr) * st; ph = (a[m] / PITCH) % 1.0 if c_ != 8 else (x[m] / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH
    riv[m] = np.maximum(riv[m], np.clip(1 - np.hypot(dph, dq) / RV, 0, 1))
log('заклёпки', float((riv > 0).mean()))
# ── пятна: мазки краски, выгорание, потёки, копоть, грязь ──
mott = fbm(0.55, 0.55, 0.55, 4, 1.0); fine = fbm(11.0, 11.0, 11.0, 2, 5.0); patch = fbm(1.4, 1.4, 1.4, 4, 9.0)
col *= (0.965 + 0.07 * mott + 0.022 * fine)[..., None]
polish = smooth(0.55, 0.72, fbm(0.9, 0.9, 0.9, 3, 13.0)); rough += (mott - 0.5) * 0.10 - polish * 0.09            # пятна полировки
sun = smooth(0.25, 0.9, nz); col = mix(col, BASE * np.array([1.08, 1.07, 1.06], np.float32), sun * smooth(0.40, 0.72, patch) * 0.30)     # выгорело сверху
stre = fbm(0.75, 11.0, 11.0, 4, 3.0); stre2 = fbm(0.42, 26.0, 26.0, 3, 17.0)
flow = smooth(0.50, 0.70, stre) * (0.35 + 0.65 * smooth(0.35, 0.70, patch)); flow2 = smooth(0.58, 0.74, stre2)
rearw = 0.45 + 0.55 * smooth(9.0, 15.5, a)
dirty = flow * rearw * (0.26 + 0.12 * (nz < -0.2))
col = mix(col, (0.22, 0.225, 0.23), dirty * 0.20); rough += dirty * 0.20
col = mix(col, (0.15, 0.15, 0.15), flow2 * (0.03 + 0.09 * (nz < -0.1)) * rearw); rough += flow2 * 0.05
# низ: масло и выхлоп ВСУ, лужицы у ниш
under = smooth(-0.15, -0.75, nz); oil = under * smooth(0.46, 0.68, fbm(1.0, 5.0, 5.0, 4, 23.0))
col = mix(col, (0.15, 0.145, 0.14), oil * 0.52); rough += oil * 0.30
for a0_, a1_, q0_, q1_ in ((4.9, 7.6, 0.0, 0.32), (9.4, 13.0, 0.95, 1.85)):
    m_ = smooth(a0_ - 0.10, a0_ + 0.10, a) * smooth(a1_ + 0.25, a1_ - 0.25, a) * smooth(q0_ - 0.1, q0_ + 0.1, ax) * smooth(q1_ + 0.12, q1_ - 0.12, ax) * under * smooth(0.36, 0.66, fbm(1.6, 7.0, 7.0, 3, 29.0))
    col = mix(col, (0.11, 0.105, 0.10), m_ * 0.6); rough += m_ * 0.34
# за решётками: потёки назад
for a_v, q0_, q1_ in ((9.02, 0.88, 1.26), (9.92, 1.12, 1.34), (7.14, 0.05, 0.24)):
    mv = smooth(a_v - 0.01, a_v + 0.04, a) * smooth(a_v + 0.95, a_v + 0.05, a) * smooth(q0_ - 0.02, q0_ + 0.04, ax) * smooth(q1_ + 0.02, q1_ - 0.04, ax) * (nz > 0.3) * (0.4 + 0.6 * flow)
    col = mix(col, (0.12, 0.12, 0.12), mv * 0.5); rough += mv * 0.25
# копоть за гондолами, на балках и стабилизаторах
soot = smooth(15.3, 17.5, a) * (0.45 + 0.55 * smooth(0.28, 0.72, fbm(0.7, 2.6, 2.6, 4, 31.0))) * ((cls == 0) | (cls == 1)) * (ax < 2.6)
soot = np.maximum(soot, smooth(16.9, 19.0, a) * smooth(3.3, 2.0, ax) * (cls == 3) * (0.35 + 0.65 * smooth(0.30, 0.70, fbm(0.8, 3.0, 3.0, 4, 32.0))) * 0.55)
col = mix(col, (0.10, 0.095, 0.09), soot * 0.62); rough += soot * 0.30
# наслоение у швов, заклёпки
hair = smooth(0.0085, 0.002, seamd); col *= (1 - 0.34 * hair * skin_m)[..., None]; rough += hair * 0.12 * skin_m
halo = smooth(0.07, 0.0, seamd) * smooth(0.30, 0.66, stre) * skin_m; col *= (1 - 0.075 * halo)[..., None]
stain = aft * smooth(0.38, 0.72, stre) * skin_m; col = mix(col, (0.17, 0.175, 0.18), stain * 0.34); rough += stain * 0.2
crev = smooth(0.92, 0.45, ao1) * skin_m; col = mix(col, (0.10, 0.10, 0.10), crev * 0.55); rough += crev * 0.26
body = smooth(0.15, 0.95, ao2); col *= (0.95 + 0.05 * body)[..., None]                                                  # слабое затенение: иначе объём пропадает, пока в игре нет теней на себе
fade = smooth(-0.7, 0.8, nz); col *= (0.94 + 0.10 * fade)[..., None]                                                     # сверху выгорело, снизу темнее               # грязь в щелях: физическая, не свет
rv_d = smooth(0.0, 0.25, riv); rv_top = smooth(0.25, 0.75, riv); col *= (1 - rv_d * 0.09 * skin_m)[..., None]; col += (rv_top * 0.018 * skin_m)[..., None]
# ── кромки: передние глаже и выцветшие, сколы до металла ──
edge = smooth(0.985, 0.90, bev) * skin_m
LE_w = smooth(0.11, 0.015, s1 + 0.02) * smooth(-0.14, 0.0, s1 + 0.02) * wing
col = mix(col, BASE * 1.14, LE_w * 0.45); rough -= LE_w * 0.14
eros = smooth(0.46, 0.60, fbm(9.0, 9.0, 9.0, 3, 37.0))
chip = np.maximum(edge * smooth(0.52, 0.62, fbm(14.0, 14.0, 14.0, 3, 41.0)), LE_w * smooth(0.66, 0.78, eros) * 0.45)
scuff = smooth(0.030, 0.006, hedge) * smooth(0.52, 0.64, fbm(22.0, 22.0, 22.0, 3, 43.0))
scr = smooth(0.76, 0.78, fbm(5.0, 70.0, 70.0, 2, 47.0)) * smooth(0.60, 0.72, patch) * sun * 0.22                         # царапины от обслуживания сверху
walk = smooth(6.75, 7.0, a) * smooth(10.2, 9.6, a) * smooth(1.45, 1.2, ax) * sun * smooth(0.44, 0.66, fbm(2.2, 2.2, 2.2, 3, 53.0)); col = mix(col, BASE * 1.13, walk * 0.40); rough -= walk * 0.16
rough -= (edge * 0.14 + scuff * 0.16)
mov = np.isin(cls, (2, 4, 7, 6)); chip = chip * np.where(mov, 0.12, 0.55); edge = edge * np.where(mov, 0.2, 1.0)
bare = np.clip(chip * 0.9 + scuff * 0.55 + scr * 0.6, 0, 1) * skin_m
BARE = np.array((0.60, 0.61, 0.63), np.float32)
col = mix(col, BARE, bare); rough = rough * (1 - bare) + bare * (0.36 + 0.05 * fine); metal = np.maximum(metal, smooth(0.45, 0.75, bare))
log('краска')
# ── служебные надписи и полосы строя: свои, нейтральные, без опознавательных знаков и номеров части ──
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
def _star(dr, cx, cy, R):
    pts = []
    for i in range(10):
        an = -math.pi / 2 + i * math.pi / 5; r_ = R if i % 2 == 0 else R * 0.382
        pts.append((cx + r_ * math.cos(an), cy + r_ * math.sin(an)))
    dr.polygon(pts, fill=(255, 255, 255, 255))


def roundel_img(W=1400, H=560):
    """Знак как на картинке Mark: синий круг, белая звезда, белые полосы в синей рамке, красная полоса посередине."""
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dr = ImageDraw.Draw(im_); cx, cy, R = W / 2, H / 2, H / 2 - 2; NAVY = (26, 33, 72, 255); RED = (150, 22, 14, 255); WH = (240, 240, 238, 255)
    bh = R * 0.70; bw = R * 1.05 * 2 + 0                    # высота и длина полос
    dr.rectangle((cx - R * 2.08, cy - bh / 2, cx + R * 2.08, cy + bh / 2), fill=NAVY)
    dr.rectangle((cx - R * 1.96, cy - bh / 2 + bh * 0.13, cx + R * 1.96, cy + bh / 2 - bh * 0.13), fill=WH)
    dr.rectangle((cx - R * 1.92, cy - bh * 0.13, cx + R * 1.92, cy + bh * 0.13), fill=RED)
    dr.ellipse((cx - R, cy - R, cx + R, cy + R), fill=NAVY); _star(dr, cx, cy + R * 0.03, R * 0.93)
    return im_


def text_img(t, H=220, ink=(26, 28, 30, 255), halo=(205, 208, 206, 255), hw=7, W=None):
    f_ = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', int(H * 0.86)); tmp = ImageDraw.Draw(Image.new('L', (8, 8))); bb = tmp.textbbox((0, 0), t, font=f_); tw = bb[2] - bb[0]; W = W or (tw + 40)
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dr = ImageDraw.Draw(im_); dr.text((W / 2, H / 2), t, font=f_, fill=ink, anchor='mm', stroke_width=hw, stroke_fill=halo); return im_


def stamp(im_, ac, qc, W_, H_, side, along=True, alpha=0.96, rough_to=None, cl=None):
    """Картинка на обшивку. along: ширина вдоль корпуса; иначе ширина вдоль размаха, верх картинки к носу."""
    A0 = np.asarray(im_, np.float32) / 255.0; hp, wp = A0.shape[:2]
    vm, Q_ = ((nz > 0.35, x) if side == 'top' else (nz < -0.35, x) if side == 'bot' else (nx > 0.35, z) if side == 'r' else (nx < -0.35, z))
    if along: ins = vm & (np.abs(a - ac) < W_ / 2) & (np.abs(Q_ - qc) < H_ / 2)
    else: ins = vm & (np.abs(Q_ - qc) < W_ / 2) & (np.abs(a - ac) < H_ / 2)
    ins &= ((mat == 0) | ((mat == 5) & (cl == (12,)))) & (np.isin(cls, cl) if cl else (cls <= 8))
    if not ins.any(): return
    if along:
        u_ = (a[ins] - ac) / W_ + 0.5; v_ = 0.5 - (Q_[ins] - qc) / H_
        if side == 'r': u_ = 1 - u_
    else:
        u_ = (Q_[ins] - qc) / W_ + 0.5; v_ = (a[ins] - ac) / H_ + 0.5
        if side == 'bot': u_ = 1 - u_
    S_ = A0[np.clip((v_ * hp).astype(int), 0, hp - 1), np.clip((u_ * wp).astype(int), 0, wp - 1)]
    al = S_[:, 3] * alpha * (0.90 + 0.10 * smooth(0.30, 0.62, fine[ins])) * (1 - 0.35 * bare[ins])
    col[ins] = col[ins] * (1 - al[..., None]) + S_[:, :3] * al[..., None]; rough[ins] = rough[ins] * (1 - al) + (0.40 if rough_to is None else rough_to) * al


RND = roundel_img()
for sd in ('r', 'l'):
    stamp(RND, 4.10, 0.25, 1.75, 0.70, sd)                                                  # на борту перед воздухозаборником
    # киль: буквы, часть, номер (свой), полоса с белой окантовкой, как на фото 10
    stamp(text_img('LN', 300), 16.15, 2.35, 0.95, 0.62, sd, cl=(1, 2))
    stamp(text_img('492 FS', 200, hw=5), 16.20, 1.42, 1.32, 0.33, sd, cl=(1, 2))
    stamp(text_img('AF 90 239', 90, hw=2), 16.85, 0.98, 0.72, 0.11, sd, cl=(1, 2))
    stamp(Image.new('RGBA', (32, 32), (235, 236, 232, 255)), 16.5, 3.495, 4.2, 0.205, sd, cl=(1, 2))
    stamp(Image.new('RGBA', (32, 32), (28, 92, 170, 255)), 16.5, 3.495, 4.2, 0.145, sd, cl=(1, 2))
stamp(RND, 12.9, -3.65, 2.7, 1.08, 'top', along=False); stamp(RND, 12.9, 3.65, 2.7, 1.08, 'bot', along=False)    # левое крыло сверху, правое снизу
DK = (0.13, 0.135, 0.14); LT = (0.66, 0.67, 0.66); WR = (0.62, 0.20, 0.13)
for sg in (1, -1):
    for ac, q_, t_ in ((12.2, 3.1, 'NO STEP'), (13.2, 4.2, 'NO STEP'), (11.0, 2.5, 'NO STEP'), (14.9, 3.0, 'NO STEP'), (18.0, 2.9, 'NO STEP'), (14.8, 4.6, 'NO STEP')):
        decal(t_, ac, sg * q_, 0.34, 0.075, 'top', DK, 0.72)
    decal('NO STEP', 16.2, sg * 1.85, 0.3, 0.07, 'top', DK, 0.6)
    sd = 'r' if sg > 0 else 'l'
    decal('RESCUE', 4.25, 0.79, 0.40, 0.085, sd, WR, 0.85); decal('CANOPY JETTISON', 5.75, 0.70, 0.62, 0.06, sd, DK, 0.7)
    decal('GROUND POWER', 11.55, -0.28, 0.42, 0.05, sd, DK, 0.65); decal('FUEL', 11.55, -0.40, 0.16, 0.06, sd, DK, 0.7); decal('CAUTION', 7.35, -0.02, 0.30, 0.06, sd, DK, 0.7); decal('OXYGEN', 3.45, -0.22, 0.24, 0.05, sd, DK, 0.6)
    decal('JACK POINT', 9.7, -0.70, 0.30, 0.045, sd, DK, 0.55); decal('STATIC PORT', 3.28, 0.70, 0.28, 0.04, sd, DK, 0.55)
    for ac_, q_, W_, H_ in ((4.10, -0.22, 0.62, 0.05), (15.0, -0.10, 0.70, 0.05)):           # полосы строя (светлые, тусклые)
        decal(None, ac_, q_, W_, H_, sd, (0.70, 0.72, 0.55), 0.72)
    decal(None, 16.2, 2.05, 0.75, 0.055, sd, (0.70, 0.72, 0.55), 0.72)
    # ходовые дорожки сверху на коробах: тонкая светлая рамка (фото 10)
    for ac_, q_, W_, H_ in ((9.4, sg * 1.02, 1.5, 0.03), (9.4, sg * 1.34, 1.5, 0.03), (8.66, sg * 1.18, 0.03, 0.33), (10.14, sg * 1.18, 0.03, 0.33)):
        decal(None, ac_, q_, W_, H_, 'top', LT, 0.8)
log('надписи')
# ── обтекатель носа: тёмный и матовый ──
rad = (a < 2.39) & (cls == 0)
if True:
    RAD = BASE * np.array((0.86, 0.87, 0.88), np.float32) * (0.97 + 0.06 * mott)[..., None]
    rc = RAD * (1 - 0.12 * flow2)[..., None]; col[rad] = rc[rad]; rough[rad] = (0.48 + 0.06 * (mott - 0.5) + 0.06 * flow2)[rad]; metal[rad] = 0
    tip = smooth(0.35, 0.05, a) * (cls == 0); col = mix(col, (0.46, 0.47, 0.48), tip * smooth(0.45, 0.6, eros) * 0.6)
# ── титан хвостовой части и створки: металл с побежалостью ──
tita = (a > 16.65) & (cls == 0) & (rn < 0.625 - (a - 16.9) * 0.067) & (mat == 0)     # только сама гондола: плоская часть между ними остаётся в краске
tn = fbm(1.2, 4.0, 4.0, 4, 59.0); ts = fbm(0.8, 14.0, 14.0, 3, 61.0)
def heat(t):
    st = np.array([0.0, 0.40, 0.72, 1.0], np.float32); p = np.array([[0.52, 0.51, 0.48], [0.53, 0.49, 0.43], [0.46, 0.41, 0.39], [0.38, 0.38, 0.41]], np.float32)
    return np.stack([np.interp(t, st, p[:, i]) for i in range(3)], -1).astype(np.float32)
t_ti = np.clip((a - 16.65) / 0.80 + (tn - 0.5) * 0.45 + (ts - 0.5) * 0.25, 0, 1)
hc = heat(t_ti) * (0.95 + 0.10 * ts)[..., None]
col[tita] = hc[tita]; metal[tita] = 1.0; rough[tita] = np.clip(0.44 + (tn[tita] - 0.5) * 0.10 + (ts[tita] - 0.5) * 0.06, 0.35, 0.50)
sc_t = smooth(0.48, 0.74, stre) * tita; col = mix(col, (0.11, 0.105, 0.10), sc_t * 0.30); rough += sc_t * 0.14
noz = cls == 10
tz = np.clip((a - 17.4) / 0.95, 0, 1)
ncol = np.array((0.45, 0.44, 0.42), np.float32) * (0.90 + 0.20 * ts)[..., None]
sn = smooth(17.9, 18.35, a) * (0.4 + 0.6 * tn); ncol = ncol * (1 - 0.50 * sn)[..., None] + np.array((0.10, 0.095, 0.09), np.float32) * (0.50 * sn)[..., None]     # копоть к срезу
col[noz] = ncol[noz]; metal[noz] = 1.0; rough[noz] = np.clip(0.45 + (tn[noz] - 0.5) * 0.10, 0.35, 0.50)
ins_ = noz & (np.hypot(ax - 0.69, z) < 0.475); iv = (0.26 + 0.12 * ts) * (1 - 0.45 * smooth(18.3, 17.7, a)); col[ins_] = (np.stack([iv * 1.0, iv * 0.97, iv * 0.93], -1))[ins_]; metal[ins_] = 0.5; rough[ins_] = 0.72
# нутро трубы и лицо двигателя
pipe = (cls == 0) & (mat == 1); col[pipe] = np.array((0.26, 0.25, 0.24), np.float32) * (0.8 + 0.4 * tn[pipe])[..., None]; metal[pipe] = 1.0; rough[pipe] = 0.5
fan_ = cls == 13; col[fan_] = np.array((0.52, 0.53, 0.55), np.float32); metal[fan_] = 1.0; rough[fan_] = 0.42
log('титан')
# ── материалы без краски обшивки ──
def solid(m, c, r, me=0.0, nz_=0.08):
    col[m] = np.array(c, np.float32) * (1 - nz_ / 2 + nz_ * fine[m])[..., None]; rough[m] = r; metal[m] = me
solid(mat == 10, (0.25, 0.26, 0.27), 0.85)            # швы
solid(mat == 2, (0.030, 0.030, 0.032), 0.9)             # нутро
solid(mat == 4, (0.045, 0.045, 0.048), 0.86)            # резина
solid(mat == 5, (0.25, 0.26, 0.27), 0.62, 0, 0.16)    # кабина, каналы
duct = (mat == 5) & (cls != 11); col[duct] = np.array((0.34, 0.35, 0.36), np.float32) * (0.75 + 0.5 * mott[duct])[..., None]; rough[duct] = 0.7   # нутро воздухозаборника: светло-серая краска, в глубине темнее по затенению
col[duct] *= (0.45 + 0.55 * ao2[duct])[..., None]
solid(mat == 6, (0.42, 0.36, 0.26), 0.92, 0, 0.2)       # подушки
solid(mat == 8, (0.30, 0.28, 0.21), 0.9, 0, 0.14)       # ремни
solid(mat == 7, (0.018, 0.038, 0.032), 0.12, 0, 0.0)    # экраны
hs = ((pos[..., 0] + pos[..., 1] + pos[..., 2]) / 0.035) % 1.0 > 0.5
solid(mat == 9, (0.74, 0.60, 0.06), 0.42); col[(mat == 9) & hs] = np.array((0.035, 0.035, 0.035), np.float32)   # рукоятка: жёлто-чёрная
mm = (mat == 1) & (cls == 11); solid(mm, (0.46, 0.47, 0.48), 0.38, 1.0)
gr_ = cls == 12                                         # шасси: потёртая серо-белая краска, тусклый шток в масле, тёмная сталь, серые щитки, пыльные фары, серая резина
g_p = gr_ & (mat == 0); g_c = gr_ & (mat == 1); g_s = gr_ & (mat == 8); g_d = gr_ & (mat == 5)
gm1 = fbm(2.4, 2.4, 2.4, 4, 91.0); gm2 = fbm(18.0, 18.0, 18.0, 3, 93.0); gst = fbm(1.0, 16.0, 2.2, 4, 87.0); gst2 = fbm(0.7, 34.0, 1.3, 3, 89.0)
solid(g_p, (0.545, 0.545, 0.515), 0.62, 0, 0.10); solid(g_c, (0.47, 0.47, 0.46), 0.30, 0.85, 0.08); solid(g_s, (0.145, 0.142, 0.14), 0.58, 0.75, 0.14)
solid(g_d, (0.335, 0.35, 0.365), 0.60, 0, 0.10); solid(gr_ & (mat == 9), (0.60, 0.56, 0.40), 0.28, 0, 0.1); solid(gr_ & (mat == 2), (0.05, 0.048, 0.046), 0.72, 0, 0.14)
painted = g_p | g_d
col[painted] *= (0.84 + 0.30 * gm1[painted] + 0.06 * gm2[painted])[..., None]                                                 # неровная старая краска
# потёки масла вниз от сальников и пальцев
oil_ = smooth(0.46, 0.68, gst) * (0.5 + 0.5 * smooth(0.40, 0.70, gst2)); col = mix(col, (0.15, 0.125, 0.095), oil_ * 0.58 * (painted | g_c)); rough = rough + oil_ * 0.20 * painted - oil_ * 0.10 * g_c
# грязь снизу, из-под колёс: сильнее к земле
gd = smooth(-0.45, -1.70, z) * gr_ * (0.45 + 0.55 * smooth(0.36, 0.66, gm1)); col = mix(col, (0.215, 0.195, 0.165), gd * 0.62 * (painted | g_s)); rough = rough + gd * 0.22 * painted
# тормозная пыль на дисках и ступицах
for ac_, xc_, zc_, rw_ in ((6.15, 0.0, -1.565, 0.295), (11.05, 1.46, -1.45, 0.41), (11.05, -1.46, -1.45, 0.41)):
    rd_ = np.hypot(a - ac_, z - zc_); md_ = gr_ & (rd_ < rw_ * 0.68) & (np.abs(x - xc_) < 0.20)
    dust = smooth(rw_ * 0.68, rw_ * 0.10, rd_) * (0.45 + 0.55 * smooth(0.34, 0.62, gm2)) * md_; col = mix(col, (0.115, 0.10, 0.085), dust * 0.72); rough = rough + dust * 0.15
# сколы и потёртости кромок
g_e = smooth(0.985, 0.90, bev) * painted * smooth(0.50, 0.62, gm2); col = mix(col, (0.26, 0.255, 0.24), g_e * 0.8); rough = rough + g_e * 0.05
# резина: пыль на боковине, потёртая дорожка
tyr = mat == 4; rt_ = smooth(0.40, 0.68, gm2) * tyr; col[tyr] = np.array((0.070, 0.070, 0.072), np.float32); col = mix(col, (0.165, 0.158, 0.145), rt_ * 0.50); col = mix(col, (0.20, 0.19, 0.17), smooth(-1.25, -1.70, z) * tyr * 0.45); rough[tyr] = 0.90
# под самолётом стойки в тени: в игре тени самолёта на них нет
col[gr_] *= (0.50 + 0.50 * smooth(0.15, 0.95, ao2[gr_]))[..., None]
door_in = (cls == 7) & (nz > 0.2); solid(door_in, (0.70, 0.70, 0.68), 0.55, 0, 0.14)
h_m = (cls == 14) & (mat == 1); solid(h_m, (0.36, 0.38, 0.40), 0.5, 0.5, 0.12)
h_b = (cls == 14) & (mat == 0)
c9 = (cls == 9)                                         # рама фонаря: краска обшивки, уплотнитель не отдельно
m_can = c9 & (mat == 1); solid(m_can, (0.44, 0.45, 0.46), 0.38, 1.0)
for sd in ('r', 'l'): stamp(text_img('239', 180, hw=0), 6.57, -0.62, 0.26, 0.13, sd, rough_to=0.5, cl=(12,))
rough = np.clip(rough, 0.08, 0.97); metal = np.clip(metal, 0, 1)
if os.environ.get('F15_TEST'):      # проверка карты на стенде: правая консоль сверху зеркальная, левая матовая, правый стабилизатор - голый металл
    rough[wing & (x > 0)] = 0.05; metal[wing & (x > 0)] = 0.0; rough[wing & (x < 0)] = 1.0; metal[wing & (x < 0)] = 0.0; rough[(cls == 3) & (x > 0)] = 0.30; metal[(cls == 3) & (x > 0)] = 1.0; rough[(cls == 3) & (x < 0)] = 0.30; metal[(cls == 3) & (x < 0)] = 0.0
for c_ in range(16):
    m_ = (cls == c_) & cov
    if m_.sum() > 500: print('деталь', c_, 'цвет', (col[m_].mean(0) * 255).round(0), 'G', round(float(rough[m_].mean()), 2), 'B', round(float(metal[m_].mean()), 2))
col = np.clip(col, 0, 1)
log('материалы')
# ── высота и нормали ──
shag = fbm(150.0, 150.0, 150.0, 2, 73.0) if S >= 4096 else fbm(70.0, 70.0, 70.0, 2, 73.0)
height += (shag - 0.5) * 0.00018 * skin_m
wav = fbm(1.6, 1.6, 1.6, 2, 79.0); height += (wav - 0.5) * 0.004 * skin_m                 # лёгкая волна обшивки
height += smooth(0.1, 0.8, riv) * 0.0007 * skin_m
ins_h = hedge < 8; height += smooth(0.0, 0.008, hedge) * 0.0009 * ins_h                  # крышки чуть выше обшивки
height += scr * -0.0002
gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * DS); gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / (2 * DS)
K_N = 1.0
nn = np.stack([-gx * K_N, -gy * K_N, np.ones_like(gx)], -1); nn /= np.linalg.norm(nn, axis=-1, keepdims=True)
solidm = np.isin(mat, (2, 10, 7, 9)) | (cls == 11) | (cls == 12) | (cls == 10) | (cls == 13) | (cls == 14)
nn[solidm] = (0, 0, 1)
# поля вокруг островов: наращиваем цвет и данные своими силами на 14 пикселей
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
# ── сохранение: строка 0 массива - низ текстуры ──
def lift(arr): return (np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)
Image.fromarray(lift(col)[::-1]).save(f'{OUT}/f15e_color.png', compress_level=1)
Image.fromarray(lift(nn * 0.5 + 0.5)[::-1]).save(f'{OUT}/f15e_normal.png', compress_level=1)
orm = np.stack([occ, rough, metal], -1); Image.fromarray(lift(orm)[::-1]).save(f'{OUT}/f15e_orm.png', compress_level=1)
pm = skin_m & cov & (cls == 0) & (a > 3) & (a < 15)
print('средний цвет обшивки sRGB', (col[pm].mean(0) * 255).round(1), 'шероховатость', round(float(rough[pm].mean()), 3), 'доля голого металла', round(float((metal[pm] > 0.5).mean()), 4))
log('сохранено', OUT)
