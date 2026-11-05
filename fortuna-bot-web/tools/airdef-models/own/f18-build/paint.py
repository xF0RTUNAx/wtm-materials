# paint.py - краска F/A-18E из данных gbuf.py: цвет (только краска и грязь, без света), нормали (заклёпки, крышки, шагрень), карта блеска glTF (G шероховатость, B металл). Без Blender: /usr/bin/python3 paint.py
# F18_TEX=2048|4096, F18_OUT=<папка>, F18_BASE=r,g,b (0…1, sRGB)
import math, os, re, site, sys, time
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__)); DAT = os.path.join(HERE, '_проба')
S = int(os.environ.get('F18_TEX', '2048')); OUT = os.environ.get('F18_OUT', DAT); os.makedirs(OUT, exist_ok=True)
TOPC = np.array([float(v) for v in os.environ.get('F18_TOP', '0.405,0.43,0.455').split(',')], np.float32); LOWC = np.array([float(v) for v in os.environ.get('F18_LOW', '0.52,0.535,0.55').split(',')], np.float32)
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f} с]', *a, flush=True)
L2 = 9.035
pos = np.load(f'{DAT}/gb_pos_{S}.npy'); nor = np.load(f'{DAT}/gb_nor_{S}.npy'); idd = np.load(f'{DAT}/gb_id_{S}.npy'); aob = np.load(f'{DAT}/gb_ao_{S}.npy')
import json
ATLAS = json.load(open(f'{DAT}/uv.json', encoding='utf-8'))['atlas_m']; PXM = 0.985 * S / ATLAS; DS = 1.0 / PXM
mat = np.round(idd[..., 0] * 16).astype(np.int8); cls = np.round(idd[..., 1] * 32).astype(np.int8); cov = idd[..., 2] > 0.5
a = (L2 - pos[..., 1]).astype(np.float32); x = pos[..., 0].astype(np.float32); z = pos[..., 2].astype(np.float32); ax = np.abs(x)
nx, ny, nz = nor[..., 0], nor[..., 1], nor[..., 2]
ao1, ao2, bev = aob[..., 0], aob[..., 1], aob[..., 2]
log('данные загружены', S, 'плотность', round(PXM), 'пикс/м')
src = open(os.path.join(HERE, 'f18_detail.py'), encoding='utf-8').read()
ns = {}; exec(src[src.index('TOP_LINES = ['):src.index('RINGS_FORE = ')], ns); TOP, BOT, SIDE = ns['TOP_LINES'], ns['BOT_LINES'], ns['SIDE_PANELS']
RINGS_FORE = (1.95, 3.7, 8.2); RINGS_NAC = (15.95, 16.5)


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
SCHEME = os.environ.get('F18_SCHEME', '')
# серый флота: верх темнее, низ светлее, граница мягкая по наплыву и борту (fa18_02, 07). Корпус - по высоте над линией, плоскости - по стороне
ZB_A = np.array([0.0, 2.0, 4.0, 5.2, 6.5, 8.0, 10.0, 13.0, 16.0, 19.0], np.float32); ZB_Y = np.array([0.12, 0.34, 0.50, 0.60, 0.52, 0.42, 0.34, 0.28, 0.24, 0.20], np.float32)
zb = np.interp(a, ZB_A, ZB_Y).astype(np.float32); wv = (vnoise(a * 1.3 + 2.0, x * 1.3, z * 1.3 - 4.0) - 0.5) * 0.05
U_h = smooth(zb - 0.16 + wv, zb + 0.10 + wv, z); U_w = smooth(-0.15, 0.15, nz)
planew = (cls == 3) | (cls == 4) | (cls == 6) | ((cls == 0) & (ax > 2.0)) | ((cls == 0) & (nz < -0.5) & (z < 0.2))
U = np.where(planew, U_w, U_h); U = np.where((cls == 1) | (cls == 2), 0.90, U); U = np.where(cls == 8, 0.95, U); U = np.where(cls == 0, np.maximum(U, smooth(0.45, 0.70, nz) * (ax > 0.45)), U)
BASE = LOWC * (1 - U[..., None]) + TOPC * U[..., None]
sh_ = (smooth(-0.15, -0.75, nz) * ((cls <= 8) & (mat == 0)))[..., None]; BASE = BASE * (1 - sh_) + np.array((0.74, 0.74, 0.78), np.float32) * sh_; BASE = np.where((cls == 8)[..., None] & (nz[..., None] > -0.4), BASE * 0.82, BASE)   # бока пилонов на солнце светлее корпуса     # в игре снизу плоскость подсвечена только землёй: иначе темнее корпуса и зеленит
col = np.ones((S, S, 3), np.float32) * BASE; rough = np.full((S, S), 0.45, np.float32); metal = np.zeros((S, S), np.float32); height = np.zeros((S, S), np.float32)
# тон панелей: границы совпадают со швами геометрии
FR = np.array([1.95, 3.7, 6.35, 8.2, 10.4, 11.8, 13.2, 14.6, 15.95, 16.5, 40.0], np.float32)
band = np.searchsorted(FR, a); lat = (x > 0).astype(np.int32) * 2 + (z > 0.1).astype(np.int32)
tt = rng_tab(64, 7, 0.955, 1.045); rt = rng_tab(64, 8, -0.05, 0.05); hue = rng_tab(64, 9, -0.010, 0.010)
idx = (band * 4 + lat) % 64; tone = tt[idx]; rtone = rt[idx]
LEW = 9.73 + (ax - 1.94) * 0.4948 + 0.60; s1 = a - LEW; s2 = a - (10.65 + (ax - 2.05) * 0.60); s3 = a - (12.81 + (ax - 1.69) * 0.128)
wing = (cls == 0) & (ax > 1.98)
wb = (s1 > 0).astype(np.int32) + (s2 > 0) + (s3 > 0); wr = (ax > 3.0).astype(np.int32) + (ax > 4.0) + (ax > 4.85); wi = (wb * 3 + wr) * 4 + (x > 0) * 2 + (nz > 0)
tone = np.where(wing, tt[(wi + 17) % 64], tone); rtone = np.where(wing, rt[(wi + 17) % 64], rtone)
for c_, sd in ((1, 21), (2, 23), (3, 25), (4, 27), (5, 29), (6, 31), (7, 33), (8, 35)):      # кили, рули, стабилизаторы, закрылки, короба, щиток, створки: своя краска у каждой детали
    ix_ = (x > 0).astype(np.int32) + sd + (ax > 3.9) * 3 * (c_ == 4); tone = np.where(cls == c_, 1.0 + (tt[ix_ % 64] - 1.0) * 0.45, tone); rtone = np.where(cls == c_, rt[ix_ % 64], rtone)
col *= tone[..., None]; rough += rtone
col[..., 0] *= 1 + hue[idx]; col[..., 2] *= 1 - hue[idx]
# подкраски и заменённые листы: прямоугольники по плану, сверху, снизу и с бортов (мягкий край распылителя)
RS = np.random.RandomState(31); fresh = np.zeros((S, S), np.float32)
tup = nz > 0.45; tdn = nz < -0.45; tsd = np.abs(nx) > 0.45
for vm, A_, Q_, n_, qa, qb in ((tup, a, x, 26, -6.0, 6.0), (tdn, a, x, 8, -6.0, 6.0), (tsd, a, z, 12, -0.9, 1.2)):
    ids = np.nonzero((vm & (cls <= 8)).ravel())[0]; AA, QQ = A_.ravel()[ids], Q_.ravel()[ids]
    for k in range(n_):
        a0 = RS.uniform(2.2, 17.4); w = RS.uniform(0.25, 1.25); q0 = RS.uniform(qa, qb); h_ = RS.uniform(0.18, 0.8); e_ = 0.012
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
rn = np.hypot(ax - 0.49, z - 0.02)
for rA in RINGS_NAC:
    m = (np.abs(a - rA) < 0.08) & (cls == 0) & (rn < 0.62); phi = np.arctan2(ax - 0.49, z) * 0.5; seamd[m] = np.minimum(seamd[m], np.abs(a[m] - rA))
    for sgn in (1, -1):
        ph = (phi[m] / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH; dr = np.hypot(dph, a[m] - rA - sgn * OFF); riv[m] = np.maximum(riv[m], np.clip(1 - dr / RV, 0, 1))
# нервюры килей и плоскостей: ряды поперёк хорды
for c_, Q, st in ((1, z, 0.55), (3, ax, 0.52), (4, ax, 0.60), (8, a, 0.9)):
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
rearw = 0.45 + 0.55 * smooth(8.0, 14.5, a)
dirty = flow * rearw * np.where(nz < -0.2, 0.10, 0.26)
col = mix(col, (0.22, 0.225, 0.23), dirty * (0.09 if SCHEME == 'inferno' else 0.20)); rough += dirty * 0.20
col = mix(col, (0.15, 0.15, 0.15), flow2 * 0.04 * rearw); rough += flow2 * 0.05
# низ: масло и выхлоп ВСУ, лужицы у ниш
under = smooth(-0.15, -0.75, nz); oil = under * smooth(0.46, 0.68, fbm(1.0, 5.0, 5.0, 4, 23.0)) * np.where(ax > 1.5, 0.18, 1.0) * smooth(4.0, 9.0, a)
col = mix(col, (0.30, 0.30, 0.295), oil * 0.16); rough += oil * 0.12
for a0_, a1_, q0_, q1_ in ((4.2, 6.8, 0.0, 0.32), (10.7, 13.4, 0.75, 1.40)):
    m_ = smooth(a0_ - 0.10, a0_ + 0.10, a) * smooth(a1_ + 0.25, a1_ - 0.25, a) * smooth(q0_ - 0.1, q0_ + 0.1, ax) * smooth(q1_ + 0.12, q1_ - 0.12, ax) * under * smooth(0.36, 0.66, fbm(1.6, 7.0, 7.0, 3, 29.0))
    col = mix(col, (0.22, 0.215, 0.21), m_ * 0.25); rough += m_ * 0.15
# за решётками: потёки назад
for a_v, q0_, q1_ in ((12.72, 0.62, 1.02), (13.75, 0.56, 0.90)):
    mv = smooth(a_v - 0.01, a_v + 0.04, a) * smooth(a_v + 0.95, a_v + 0.05, a) * smooth(q0_ - 0.02, q0_ + 0.04, ax) * smooth(q1_ + 0.02, q1_ - 0.04, ax) * (nz > 0.3) * (0.4 + 0.6 * flow)
    col = mix(col, (0.12, 0.12, 0.12), mv * 0.5); rough += mv * 0.25
# копоть за гондолами, на балках и стабилизаторах
soot = smooth(15.2, 17.0, a) * (0.45 + 0.55 * smooth(0.28, 0.72, fbm(0.7, 2.6, 2.6, 4, 31.0))) * ((cls == 0) | (cls == 1)) * (ax < 1.5)
soot = np.maximum(soot, smooth(16.3, 18.0, a) * smooth(2.6, 1.3, ax) * (cls == 3) * (0.35 + 0.65 * smooth(0.30, 0.70, fbm(0.8, 3.0, 3.0, 4, 32.0))) * 0.55)
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
walk = smooth(8.4, 8.7, a) * smooth(11.4, 10.8, a) * smooth(1.25, 1.0, ax) * sun * smooth(0.44, 0.66, fbm(2.2, 2.2, 2.2, 3, 53.0)); col = mix(col, BASE * 1.13, walk * 0.40); rough -= walk * 0.16
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
    if SCHEME == 'inferno': return
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


def roundel_img(W=1400, H=560, ink=(46, 50, 56, 255), fill=None):
    """Знак США малозаметный: тёмно-серый контур круга и полос, звезда той же краской, без цвета (fa18_06, 02). Свой рисунок."""
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dr = ImageDraw.Draw(im_); cx, cy, R = W / 2, H / 2, H / 2 - 3; bh = R * 0.68; t = max(6, int(R * 0.055))
    dr.rectangle((cx - R * 2.06, cy - bh / 2, cx + R * 2.06, cy + bh / 2), outline=ink, width=t)
    dr.rectangle((cx - R * 1.92, cy - bh * 0.13, cx + R * 1.92, cy + bh * 0.13), fill=ink)
    dr.ellipse((cx - R, cy - R, cx + R, cy + R), fill=ink); dr.ellipse((cx - R + t, cy - R + t, cx + R - t, cy + R - t), fill=(0, 0, 0, 0))
    pts = []
    for i in range(10):
        an = -math.pi / 2 + i * math.pi / 5; r_ = R * 0.90 if i % 2 == 0 else R * 0.90 * 0.382; pts.append((cx + r_ * math.cos(an), cy + 2 + r_ * math.sin(an)))
    # внутри круга прозрачно, кроме звезды: полоса не проходит через звезду
    mask = Image.new('L', (W, H), 0); ImageDraw.Draw(mask).ellipse((cx - R + t, cy - R + t, cx + R - t, cy + R - t), fill=255); cl = Image.new('RGBA', (W, H), (0, 0, 0, 0)); im_.paste(cl, (0, 0), mask)
    dr = ImageDraw.Draw(im_); dr.polygon(pts, fill=ink)
    return im_


def text_img(t, H=220, ink=(44, 48, 54, 255), halo=(0, 0, 0, 0), hw=0, W=None):
    f_ = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', int(H * 0.86)); tmp = ImageDraw.Draw(Image.new('L', (8, 8))); bb = tmp.textbbox((0, 0), t, font=f_); tw = bb[2] - bb[0]; W = W or (tw + 40)
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dr = ImageDraw.Draw(im_); dr.text((W / 2, H / 2), t, font=f_, fill=ink, anchor='mm', stroke_width=hw, stroke_fill=halo); return im_


def stamp(im_, ac, qc, W_, H_, side, along=True, alpha=0.96, rough_to=None, cl=None):
    """Картинка на обшивку. along: ширина вдоль корпуса; иначе ширина вдоль размаха, верх картинки к носу."""
    if SCHEME == 'inferno': return
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
    S_ = A0[np.clip((v_ * hp).astype(int), 0, hp - 1), np.clip((u_ * wp).astype(int), 0, wp - 1)]
    al = S_[:, 3] * alpha * (0.90 + 0.10 * smooth(0.30, 0.62, fine[ins])) * (1 - 0.35 * bare[ins])
    col[ins] = col[ins] * (1 - al[..., None]) + S_[:, :3] * al[..., None]; rough[ins] = rough[ins] * (1 - al) + (0.40 if rough_to is None else rough_to) * al


RND = roundel_img()
INK = (44, 48, 54, 255); RED = (140, 40, 32, 255); YEL = (176, 150, 62, 255)
def emblem_img(S_=720, ink=INK):
    """Эмблема придуманной части: щит, дельта вниз и две звезды. Одной краской, малозаметная."""
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); c = S_ / 2; t = int(S_ * 0.03)
    sh = [(S_ * .14, S_ * .08), (S_ * .86, S_ * .08), (S_ * .86, S_ * .52), (S_ * .74, S_ * .72), (c, S_ * .94), (S_ * .26, S_ * .72), (S_ * .14, S_ * .52), (S_ * .14, S_ * .08)]
    d_.line(sh, fill=ink, width=t, joint='curve')
    d_.polygon([(c, S_ * .80), (S_ * .68, S_ * .30), (c, S_ * .42), (S_ * .32, S_ * .30)], fill=ink)
    for x_, y_ in ((.28, .20), (.72, .20)):
        pts = []
        for i in range(10):
            an = -math.pi / 2 + i * math.pi / 5; r_ = S_ * (.055 if i % 2 == 0 else .022); pts.append((S_ * x_ + r_ * math.cos(an), S_ * y_ + r_ * math.sin(an)))
        d_.polygon(pts, fill=ink)
    return im_
def tri_img(S_=400, ink=RED, letter='E', fill=None):
    """Предупреждающий треугольник."""
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); P_ = [(S_ / 2, S_ * 0.05), (S_ * 0.96, S_ * 0.92), (S_ * 0.04, S_ * 0.92)]
    if fill: d_.polygon(P_, fill=fill)
    d_.line(P_ + [P_[0]], fill=ink, width=int(S_ * 0.07))
    if letter: d_.text((S_ / 2, S_ * 0.60), letter, font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', int(S_ * 0.42)), fill=ink, anchor='mm')
    return im_
def outline_tri(W=1000, H=500, ink=INK, up=True):
    """Большой контурный клин на воздухозаборнике, как на fa18_03 и 07: своей формы."""
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); t = int(H * 0.05)
    d_.line([(W * 0.02, H * 0.95), (W * 0.98, H * 0.95), (W * 0.70, H * 0.05), (W * 0.02, H * 0.95)], fill=ink, width=t); d_.line([(W * 0.26, H * 0.82), (W * 0.84, H * 0.82), (W * 0.67, H * 0.28), (W * 0.26, H * 0.82)], fill=ink, width=max(3, t // 2))
    return im_
def chevron(S_=400, ink=INK):
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); t = int(S_ * 0.16); d_.line([(S_ * 0.08, S_ * 0.15), (S_ * 0.5, S_ * 0.85), (S_ * 0.92, S_ * 0.15)], fill=ink, width=t, joint='curve'); return im_
def box_text(lines, H=90, ink=INK, frame=True, W=None):
    f_ = ImageFont.truetype(FNT, H); tmp = ImageDraw.Draw(Image.new('L', (8, 8))); tw = max(tmp.textlength(t_, font=f_) for t_ in lines); W = W or int(tw + H * 1.2); Ht = int(len(lines) * H * 1.18 + H * 0.5)
    im_ = Image.new('RGBA', (W, Ht), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_)
    if frame: d_.rectangle((2, 2, W - 3, Ht - 3), outline=ink, width=max(4, H // 11))
    for i_, t_ in enumerate(lines): d_.text((W / 2, H * 0.72 + i_ * H * 1.18), t_, font=f_, fill=ink, anchor='mm')
    return im_
def pl(im_, ac, qc, W_, H_, side, **k): stamp(im_, ac, qc, W_ * 1.45, H_ * 1.45, side, **k)
for sd in ('r', 'l'):
    stamp(RND, 5.55, -0.16, 1.40, 0.56, sd)                                                  # на борту под наплывом (fa18_07, 14)
    stamp(text_img('207', 300), 3.05, 0.27, 0.70, 0.30, sd)                                  # номер свой
    # киль: буквы и номер придуманные, эмблема придуманной части
    stamp(text_img('NX', 300), 15.76, 1.48, 0.88, 0.56, sd, cl=(1,))
    stamp(emblem_img(), 16.20, 2.32, 0.54, 0.54, sd, cl=(1,))
    stamp(text_img('207', 200), 16.88, 2.905, 0.46, 0.15, sd, cl=(1,))
    stamp(text_img('NAVY', 120), 15.40, 0.84, 0.60, 0.12, sd, cl=(1,)); stamp(text_img('BUNO 000207', 90), 15.40, 0.68, 0.85, 0.07, sd, cl=(1,))
    stamp(text_img('VFA-199', 220), 10.45, 0.93, 1.55, 0.17, sd)                             # спина, как на fa18_07 и 14
    stamp(text_img('NAVY', 200), 13.15, -0.36, 0.90, 0.20, sd)                               # низ борта за воздухозаборником
    stamp(tri_img(), 4.20, 0.70, 0.13, 0.13, sd)                                             # катапульта
    stamp(outline_tri(ink=(70, 76, 82, 255)), 12.00, -0.22, 1.25, 0.60, sd, alpha=0.55, cl=(0,))   # клин на воздухозаборнике (fa18_03, 07)
    pl(box_text(['DANGER', 'JET INTAKE'], 70, ink=RED, frame=False), 10.60, 0.03, 0.30, 0.10, sd)
for sg in (1, -1):
    stamp(text_img('207', 300), 12.65, sg * 3.72, 0.62, 0.27, 'top', along=False)             # консоли сверху (fa18_01, 02)
    pl(box_text(['WING FOLD'], 70, ink=RED, frame=False), 12.30, sg * 4.45, 0.34, 0.06, 'top', along=False); pl(box_text(['NO STEP'], 70, frame=False), 13.45, sg * 2.60, 0.28, 0.06, 'top', along=False)
stamp(RND, 12.72, -5.75, 1.85, 0.74, 'top', along=False); stamp(RND, 12.72, 5.75, 1.85, 0.74, 'bot', along=False)    # левая консоль сверху, правая снизу (fa18_06)
stamp(text_img('NAVY', 300), 12.72, -5.75, 1.50, 0.52, 'bot', along=False)                   # левая снизу
LT = (0.66, 0.67, 0.66)
for sg in (1, -1):
    sd = 'r' if sg > 0 else 'l'
    decal(None, 8.3, 0.72, 0.70, 0.05, sd, (0.62, 0.64, 0.50), 0.55)                         # полосы строя (тусклые)
    decal(None, 15.72, 2.00, 0.55, 0.05, sd, (0.62, 0.64, 0.50), 0.55)
    # ходовые дорожки на наплыве: едва заметная рамка
    for ac_, q_, W_, H_ in ((9.9, sg * 0.86, 1.3, 0.03), (9.9, sg * 1.20, 1.3, 0.03), (9.25, sg * 1.03, 0.03, 0.34), (10.55, sg * 1.03, 0.03, 0.34)):
        decal(None, ac_, q_, W_, H_, 'top', LT, 0.35)
    # тёмное поле антенны снизу (fa18_06)
    decal(None, 2.92, sg * 0.14, 0.30, 0.14, 'bot', (0.20, 0.21, 0.225), 0.45)
decal(None, 2.10, 0.0, 0.09, 0.032, 'top', (0.05, 0.05, 0.055), 0.95)                        # окно пушки на верху носа (fa18_02)
log('надписи')
# ── обтекатель носа: тёмный и матовый ──
rad = (a < 1.95) & (cls == 0)
if True:
    RAD = np.array((0.44, 0.45, 0.46), np.float32) * (0.98 + 0.04 * mott)[..., None]
    col[rad] = RAD[rad]; rough[rad] = (0.44 + 0.06 * (mott - 0.5))[rad]; metal[rad] = 0
    
# ── титан хвостовой части и створки: металл с побежалостью ──
tita = (a > 16.35) & (cls == 0) & (rn < 0.60 - (a - 16.0) * 0.10) & (mat == 0) & (nz < 0.45)     # только сама гондола: плоская часть между ними остаётся в краске
tn = fbm(1.2, 4.0, 4.0, 4, 59.0); ts = fbm(0.8, 14.0, 14.0, 3, 61.0)
def heat(t):
    st = np.array([0.0, 0.40, 0.72, 1.0], np.float32); p = np.array([[0.50, 0.50, 0.49], [0.50, 0.495, 0.48], [0.44, 0.43, 0.43], [0.37, 0.37, 0.39]], np.float32)
    return np.stack([np.interp(t, st, p[:, i]) for i in range(3)], -1).astype(np.float32)
t_ti = np.clip((a - 16.35) / 0.75 + (tn - 0.5) * 0.45 + (ts - 0.5) * 0.25, 0, 1)
hc = heat(t_ti) * (0.95 + 0.10 * ts)[..., None]
col[tita] = hc[tita]; metal[tita] = 1.0; rough[tita] = np.clip(0.44 + (tn[tita] - 0.5) * 0.10 + (ts[tita] - 0.5) * 0.06, 0.35, 0.50)
sc_t = smooth(0.48, 0.74, stre) * tita; col = mix(col, (0.11, 0.105, 0.10), sc_t * 0.30); rough += sc_t * 0.14
noz = cls == 10
tz = np.clip((a - 17.1) / 0.95, 0, 1)
ncol = np.array((0.33, 0.32, 0.30), np.float32) * (0.90 + 0.20 * ts)[..., None]
sn = smooth(17.5, 18.05, a) * (0.4 + 0.6 * tn); ncol = ncol * (1 - 0.50 * sn)[..., None] + np.array((0.10, 0.095, 0.09), np.float32) * (0.50 * sn)[..., None]     # копоть к срезу
col[noz] = ncol[noz]; metal[noz] = 1.0; rough[noz] = np.clip(0.45 + (tn[noz] - 0.5) * 0.10, 0.35, 0.50)
ins_ = noz & (rn < 0.402 - (a - 17.1) * 0.0); iv = (0.24 + 0.10 * ts) * (1 - 0.45 * smooth(18.0, 17.4, a)); col[ins_] = (np.stack([iv * 1.0, iv * 0.97, iv * 0.93], -1))[ins_]; metal[ins_] = 0.5; rough[ins_] = 0.72
# нутро трубы и лицо двигателя
pipe = (cls == 0) & (mat == 1); col[pipe] = np.array((0.26, 0.25, 0.24), np.float32) * (0.8 + 0.4 * tn[pipe])[..., None]; metal[pipe] = 1.0; rough[pipe] = 0.5
fan_ = cls == 13; rough[fan_] = 0.5
log('титан')
# ── материалы без краски обшивки ──
def solid(m, c, r, me=0.0, nz_=0.08):
    col[m] = np.array(c, np.float32) * (1 - nz_ / 2 + nz_ * fine[m])[..., None]; rough[m] = r; metal[m] = me
solid(mat == 10, (0.15, 0.15, 0.155) if SCHEME == 'inferno' else (0.25, 0.26, 0.27), 0.85)            # швы
solid(mat == 2, (0.030, 0.030, 0.032), 0.9)             # нутро
solid(mat == 4, (0.045, 0.045, 0.048), 0.86)            # резина
solid(mat == 5, (0.25, 0.26, 0.27), 0.62, 0, 0.16)    # кабина, каналы
duct = (mat == 5) & (cls != 11); deep_ = smooth(9.2, 10.5, a); col[duct] = (np.array((0.36, 0.37, 0.38), np.float32) * (1 - deep_[..., None]) + np.array((0.13, 0.135, 0.14), np.float32) * deep_[..., None])[duct] * (0.75 + 0.5 * mott[duct])[..., None]; rough[duct] = 0.7   # канал: у губы светлый, в глубине тёмный (fa18_05)
col[duct] *= (0.35 + 0.65 * ao2[duct])[..., None]; fan_d = (cls == 13); col[fan_d] = np.array((0.05, 0.05, 0.055), np.float32); metal[fan_d] = 0.3
fan_f = (cls == 13) & (a < 13.0); hub_ = np.hypot(np.abs(x) - 1.03, z + 0.22) < 0.115; col[fan_f] = np.array((0.34, 0.35, 0.36), np.float32); col[fan_f & hub_] = np.array((0.11, 0.11, 0.12), np.float32); metal[fan_f] = 0.35; col[fan_f] *= (0.45 + 0.55 * ao1[fan_f])[..., None]      # вентилятор виден в глубине: лопатки светлее стенок, кок тёмный
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
for ac_, xc_, zc_, rw_ in ((4.90, 0.19, -1.63, 0.27), (4.90, -0.19, -1.63, 0.27), (10.65, 1.58, -1.51, 0.39), (10.65, -1.58, -1.51, 0.39)):
    rd_ = np.hypot(a - ac_, z - zc_); md_ = gr_ & (rd_ < rw_ * 0.68) & (np.abs(x - xc_) < 0.20)
    dust = smooth(rw_ * 0.68, rw_ * 0.10, rd_) * (0.45 + 0.55 * smooth(0.34, 0.62, gm2)) * md_; col = mix(col, (0.115, 0.10, 0.085), dust * 0.72); rough = rough + dust * 0.15
# сколы и потёртости кромок
g_e = smooth(0.985, 0.90, bev) * painted * smooth(0.50, 0.62, gm2); col = mix(col, (0.26, 0.255, 0.24), g_e * 0.8); rough = rough + g_e * 0.05
# резина: пыль на боковине, потёртая дорожка
tyr = mat == 4; rt_ = smooth(0.40, 0.68, gm2) * tyr; col[tyr] = np.array((0.070, 0.070, 0.072), np.float32); col = mix(col, (0.165, 0.158, 0.145), rt_ * 0.50); col = mix(col, (0.20, 0.19, 0.17), smooth(-1.25, -1.70, z) * tyr * 0.45); rough[tyr] = 0.90
# под самолётом стойки в тени: в игре тени самолёта на них нет
col[gr_] *= (0.50 + 0.50 * smooth(0.15, 0.95, ao2[gr_]))[..., None]
door_in = (cls == 7) & (nz > 0.2) & (z < 0.1); solid(door_in, (0.70, 0.70, 0.68), 0.55, 0, 0.14)
h_m = (cls == 14) & (mat == 1); solid(h_m, (0.36, 0.38, 0.40), 0.5, 0.5, 0.12)
h_b = (cls == 14) & (mat == 0)
c9 = (cls == 9)                                         # рама фонаря: краска обшивки, уплотнитель не отдельно
m_can = c9 & (mat == 1); solid(m_can, (0.44, 0.45, 0.46), 0.38, 1.0)
for sd in ('r', 'l'): stamp(text_img('207', 180, hw=0), 5.00, -0.70, 0.24, 0.12, sd, rough_to=0.5, cl=(12,))
duct_m = (mat == 5) & (cls != 11); rough = np.where(duct_m, 0.85, rough); metal = np.where(duct_m, 0.0, metal)      # канал без блеска: спереди просто чёрный, как на снимках
rough = np.where(cls == 10, np.maximum(rough, 0.62), rough)      # лепестки сопла: ровный блеск, без ступенчатого отражения
under_r = smooth(-0.1, -0.55, nz) * (mat == 0) * (cls <= 8); rough = rough + (np.maximum(rough, 0.60) - rough) * under_r      # снизу матовее: блеск от земли даёт пятна
rough = np.clip(rough, 0.08, 0.97); metal = np.clip(metal, 0, 1)
if os.environ.get('F18_TEST'):      # проверка карты на стенде: правая консоль сверху зеркальная, левая матовая, правый стабилизатор - голый металл
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
height = np.where(a < 1.95, height * 0.25, height)
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
occ = np.where(duct_m, np.minimum(occ, 1.0 - 0.4 * smooth(9.0, 10.5, a)), occ); occ = np.where(fan_f, 0.8, occ)      # в глубине канала меньше отражений неба: плавно темнеет, а не сплошной чёрный
bleed([col, rough, metal, occ, nn], cov)
# ── сохранение: строка 0 массива - низ текстуры ──
def lift(arr): return (np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)
Image.fromarray(lift(col)[::-1]).save(f'{OUT}/f18_color.png', compress_level=1)
Image.fromarray(lift(nn * 0.5 + 0.5)[::-1]).save(f'{OUT}/f18_normal.png', compress_level=1)
orm = np.stack([occ, rough, metal], -1); Image.fromarray(lift(orm)[::-1]).save(f'{OUT}/f18_orm.png', compress_level=1)
pm = skin_m & cov & (cls == 0) & (a > 3) & (a < 15)
print('верх', (col[pm & (U > 0.8)].mean(0) * 255).round(1), 'низ', (col[pm & (U < 0.2)].mean(0) * 255).round(1))
print('средний цвет обшивки sRGB', (col[pm].mean(0) * 255).round(1), 'шероховатость', round(float(rough[pm].mean()), 3), 'доля голого металла', round(float((metal[pm] > 0.5).mean()), 4))
log('сохранено', OUT)
