# paint.py - краска F-4 из данных gbuf.py: цвет (только краска и грязь, без света), нормали, карта блеска glTF (R затенение, G шероховатость, B металл). Без Blender: /usr/bin/python3 -I paint.py
# MIG21_TEX=2048|4096, MIG21_OUT=<папка>, MIG21_GRY, MIG21_OLV=r,g,b - серый и зелёный камуфляжа (sRGB 0…1), MIG21_CAMO - зерно рисунка. Схема по f1_01, 06, 07 (французский двухцветный серо-зелёный), пиксели фото не используются, знаки нарисованы здесь.
import json, math, os, site, sys, time, types
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image, ImageDraw, ImageFont
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__)); DAT = os.path.join(HERE, '_проба')
S = int(os.environ.get('MIG21_TEX', '2048')); OUT = os.environ.get('MIG21_OUT', DAT); os.makedirs(OUT, exist_ok=True)
def envc(n, d): return np.array([float(v) for v in os.environ.get(n, d).split(',')], np.float32)
GRY = envc('MIG21_GRY', '0.447,0.473,0.499'); OLV = envc('MIG21_OLV', '0.328,0.354,0.286')     # фото 07: серый ~117/120/113, зелёный ~90/95/80 sRGB; на 4 % светлее, чтобы не темнее фото; COL0 = GRY
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f} с]', *a, flush=True)
L2 = 7.70; NOZ_Y = 0.152; NOZ_X = 0.0; GROUND = -1.60; SCHEME = os.environ.get('MIG21_SCHEME', 'silver')   # silver - серебристо-серый советский (mig21_06, 12); camo - болгарский полосами (mig21_07, 10)
pos = np.load(f'{DAT}/gb_pos_{S}.npy'); nor = np.load(f'{DAT}/gb_nor_{S}.npy'); idd = np.load(f'{DAT}/gb_id_{S}.npy'); aob = np.load(f'{DAT}/gb_ao_{S}.npy')
ATLAS = json.load(open(f'{DAT}/uv.json', encoding='utf-8'))['atlas_m']; PXM = 0.985 * S / ATLAS; DS = 1.0 / PXM
mat = np.round(idd[..., 0] * 16).astype(np.int8); cls = np.round(idd[..., 1] * 32).astype(np.int8); cov = idd[..., 2] > 0.5
a = (L2 - pos[..., 1]).astype(np.float32); x = pos[..., 0].astype(np.float32); z = pos[..., 2].astype(np.float32); ax = np.abs(x)
nx, ny, nz = nor[..., 0], nor[..., 1], nor[..., 2]
ao1, ao2, bev = aob[..., 0], aob[..., 1], aob[..., 2]
ao1 = np.where(cls == 7, 1.0, ao1); ao2 = np.where(cls == 7, 1.0, ao2)     # створки запекались закрытыми, сквозь них проходят стойки: иначе на открытой створке тёмный отпечаток
log('данные загружены', S, 'плотность', round(PXM), 'пикс/м')
# линии разделки: mig21_lines.py
sys.path.insert(0, HERE); import mig21_lines as FL
TOP, BOT, SIDE, WLN = FL.TOP_LINES, FL.BOT_LINES, FL.SIDE_PANELS, FL.WING_LINES
RINGS_FORE = (1.60, 2.90, 5.05, 7.00, 9.00, 10.60, 12.00)
# консоль в файле повёрнута на 10° от положения 16°: её точки переводятся в координаты крыла
aw = a; axw = ax




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
# ── основа: французский двухцветный камуфляж (f1_01, 06, 07): крупные серые и зелёные пятна с мягкой границей распылителя, заходят и на низ; рисунок по точке самолёта, левая и правая стороны разные ──
# ── основа: камуфляж Юго-Восточной Азии (f111_01, 02, 03, 10): два зелёных и песочный крупными пятнами с мягкой границей, низ светло-серый; рисунок свой, по точке самолёта ──
pm0 = cov & (mat == 0) & (cls == 0)
if SCHEME == 'camo':
    LG = envc('MIG21_LG', '0.400,0.540,0.330'); DG = envc('MIG21_DG', '0.200,0.290,0.200'); RB = envc('MIG21_RB', '0.540,0.275,0.235'); UND = envc('MIG21_UND', '0.560,0.690,0.780')
    c1 = fbm(0.30, 0.50, 0.50, 3, 5.0); t_ = a * 0.62 + (c1 - 0.5) * 1.9 + z * 0.22 - ax * 0.10; fi = np.floor(t_); fr_ = t_ - fi; k_ = fi.astype(np.int32) % 3
    PAL = np.stack([LG, DG, RB]); e_ = smooth(0.93, 1.0, fr_)[..., None]; BASE = PAL[k_] * (1 - e_) + PAL[(k_ + 1) % 3] * e_
    LOW = smooth(-0.45, -0.70, nz) * ((cls <= 8) & (mat == 0)) * (cls != 7); BASE = BASE * (1 - LOW[..., None]) + UND * LOW[..., None]; CM = np.zeros_like(a); CG = np.zeros_like(a); METAL0 = 0.05
elif SCHEME == 'orange':                                       # оранжево-жёлтый, чёрный нос (mig21_02)
    ORG = envc('MIG21_ORG', '0.800,0.470,0.060'); BASE = np.broadcast_to(ORG, a.shape + (3,)).copy(); LOW = np.zeros_like(a); CM = np.zeros_like(a); CG = np.zeros_like(a); METAL0 = 0.05; UND = ORG
    nose_ = (cls == 0) & (a < 1.95 + 0.25 * np.clip(z / 0.6, -1, 1)); BASE = np.where(nose_[..., None], np.array((0.050, 0.050, 0.055), np.float32), BASE)
elif SCHEME == 'pale':                                         # светло-серый с серыми пятнами, низ бирюзовый (mig21_03)
    PG = envc('MIG21_PG', '0.700,0.705,0.690'); SP = envc('MIG21_SP', '0.470,0.475,0.470'); UND = envc('MIG21_UND', '0.420,0.760,0.760')
    c1 = fbm(0.42, 0.70, 0.70, 3, 9.0); e_ = smooth(0.565, 0.60, c1)[..., None]; BASE = PG * (1 - e_) + SP * e_
    LOW = smooth(-0.30, -0.55, nz) * ((cls <= 8) & (mat == 0)) * (cls != 7); BASE = BASE * (1 - LOW[..., None]) + UND * LOW[..., None]; CM = np.zeros_like(a); CG = np.zeros_like(a); METAL0 = 0.12
else:
    SIL = envc('MIG21_SIL', '0.600,0.612,0.625'); BASE = np.broadcast_to(SIL, a.shape + (3,)).copy(); LOW = np.zeros_like(a); CM = np.zeros_like(a); CG = np.zeros_like(a); METAL0 = 0.55; UND = SIL
GRN = np.array((0.16, 0.36, 0.20), np.float32)                  # радиопрозрачные законцовки киля и гребня
diel = ((cls == 1) & (z > 2.26) & (a < 15.0)) | ((cls == 0) & (z < -0.98) & (a > 10.4) & (a < 13.2) & (np.abs(x) < 0.12))
BASE = np.where(diel[..., None], GRN, BASE).astype(np.float32)
col = BASE.astype(np.float32).copy(); rough = np.full((S, S), 0.42, np.float32); metal = np.where((mat == 0) & (cls <= 8) & (~diel), METAL0, 0.0).astype(np.float32); height = np.zeros((S, S), np.float32)
# тон панелей: границы совпадают со швами геометрии
FR = np.array([0.85, 1.60, 2.90, 5.05, 7.00, 9.00, 10.60, 12.00, 13.62, 40.0], np.float32)
band = np.searchsorted(FR, a); lat = (x > 0).astype(np.int32) * 2 + (z > 0.3).astype(np.int32)
tt = rng_tab(64, 7, 0.955, 1.045) if SCHEME != 'camo' else rng_tab(64, 7, 0.972, 1.028); rt = rng_tab(64, 8, -0.07, 0.07) if SCHEME != 'camo' else rng_tab(64, 8, -0.04, 0.04); hue = rng_tab(64, 9, -0.009, 0.009)
idx = (band * 4 + lat) % 64; tone = tt[idx]; rtone = rt[idx]
LEW = (5.99 + 1.465 * (ax - 0.61)).astype(np.float32); TEW = 10.70; s1 = a - (LEW + 0.45); s2 = a - 8.30; s3 = a - 10.02
wing = (cls == 0) & (ax > 0.68) & (np.abs(z + 0.25) < 0.22)
wb = (s1 > 0).astype(np.int32) + (s2 > 0) + (s3 > 0); wr = (ax > 1.30).astype(np.int32) + (ax > 2.00) + (ax > 2.70); wi = (wb * 3 + wr) * 4 + (x > 0) * 2 + (nz > 0)
tone = np.where(wing, tt[(wi + 17) % 64], tone); rtone = np.where(wing, rt[(wi + 17) % 64], rtone)
for c_, sd in ((1, 21), (2, 23), (3, 25), (4, 27), (6, 31), (8, 35)):
    ix_ = (x > 0).astype(np.int32) + sd; tone = np.where(cls == c_, 1.0 + (tt[ix_ % 64] - 1.0) * 0.5, tone); rtone = np.where(cls == c_, rt[ix_ % 64], rtone)
col *= tone[..., None]; rough += rtone
col[..., 0] *= 1 + hue[idx]; col[..., 2] *= 1 - hue[idx]
# подкраски и заменённые листы
RS = np.random.RandomState(31); fresh = np.zeros((S, S), np.float32)
tup = nz > 0.45; tdn = nz < -0.45; tsd = np.abs(nx) > 0.45
for vm, A_, Q_, n_, qa, qb in ((tup, a, x, 16, -5.6, 5.6), (tsd, a, z, 9, -0.4, 1.4)):
    ids = np.nonzero((vm & (cls <= 8)).ravel())[0]; AA, QQ = A_.ravel()[ids], Q_.ravel()[ids]
    for k in range(n_):
        a0 = RS.uniform(1.5, 13.0); w = RS.uniform(0.22, 1.05); q0 = RS.uniform(qa, qb); h_ = RS.uniform(0.16, 0.65); e_ = 0.06
        d = np.minimum.reduce([AA - a0, a0 + w - AA, QQ - q0, q0 + h_ - QQ]); sel = d > -e_
        if not sel.any(): continue
        t_ = np.clip((d[sel] + e_) / (2 * e_), 0, 1); kk = RS.uniform(0.975, 1.025); cc = ids[sel]
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
fin_hinge = (np.interp(z, [1.12, 2.02], [13.60, 14.515])).astype(np.float32)
m = cls == 1; dq = np.abs(a[m] - (fin_hinge[m] - 0.05)); ph = (z[m] / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH; riv[m] = np.maximum(riv[m], np.clip(1 - np.hypot(dph, dq) / RV, 0, 1))
for c_, Q, st in ((3, ax, 0.50), (4, ax, 0.55)):
    m = (cls == c_); rr = (Q[m] / st) % 1.0; dq = np.minimum(rr, 1 - rr) * st; ph = (a[m] / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH
    riv[m] = np.maximum(riv[m], np.clip(1 - np.hypot(dph, dq) / RV, 0, 1))
log('заклёпки', float((riv > 0).mean()))
# ── пятна, выгорание, потёки, копоть, грязь ──
mott = fbm(0.55, 0.55, 0.55, 4, 1.0); fine = fbm(11.0, 11.0, 11.0, 2, 5.0); patch = fbm(1.4, 1.4, 1.4, 4, 9.0)
low_ = smooth(-0.05, -0.5, nz); col *= (1 + (mott - 0.5) * (0.14 - 0.08 * low_) + (fine - 0.5) * 0.02)[..., None]
polish = smooth(0.55, 0.72, fbm(0.9, 0.9, 0.9, 3, 13.0)); rough += (mott - 0.5) * 0.10 - polish * 0.09
sun = smooth(0.25, 0.9, nz); col = mix(col, BASE * np.array([1.08, 1.07, 1.06], np.float32), sun * smooth(0.40, 0.72, patch) * 0.30)
stre = fbm(0.75, 11.0, 11.0, 4, 3.0); stre2 = fbm(0.42, 26.0, 26.0, 3, 17.0)
flow = smooth(0.50, 0.70, stre) * (0.35 + 0.65 * smooth(0.35, 0.70, patch)); flow2 = smooth(0.58, 0.74, stre2)
rearw = 0.45 + 0.55 * smooth(4.0, 12.0, a)
dirty = flow * rearw * 0.62 * (1 - 0.75 * smooth(-0.05, -0.5, nz))
col = mix(col, (0.20, 0.195, 0.18), dirty * 0.24); rough += dirty * 0.16
rough += flow2 * 0.04
under = smooth(-0.15, -0.75, nz); oil = under * smooth(0.46, 0.68, fbm(1.0, 5.0, 5.0, 4, 23.0))
col = mix(col, (0.30, 0.27, 0.22), oil * 0.10); rough -= oil * 0.10   # на чёрном низу масло и гидравлика светлее и глянцевее
for a0_, a1_, q0_, q1_ in ((1.55, 2.85, 0.0, 0.20), (6.95, 7.95, 0.70, 1.65), (8.6, 10.4, 0.0, 0.34)):
    m_ = smooth(a0_ - 0.10, a0_ + 0.10, a) * smooth(a1_ + 0.45, a1_ - 0.10, a) * smooth(q0_ - 0.1, q0_ + 0.1, ax) * smooth(q1_ + 0.12, q1_ - 0.12, ax) * under * smooth(0.36, 0.66, fbm(1.6, 7.0, 7.0, 3, 29.0))
    col = mix(col, (0.22, 0.215, 0.21), m_ * 0.10); rough += m_ * 0.12
# копоть у сопла: мягко, без края (f1_06, 07)
soot = (smooth(12.3, 13.6, a) * np.isin(cls, (0, 3)) + smooth(5.0, 5.5, a) * smooth(7.6, 6.2, a) * smooth(-0.50, -0.70, z) * (ax < 0.30) * (cls == 0) * 1.2) * (0.45 + 0.55 * smooth(0.28, 0.72, fbm(0.7, 2.6, 2.6, 4, 31.0))) * 0.42   # копоть у сопла и у пушки
col = mix(col, (0.11, 0.105, 0.10), soot * 0.55); rough += soot * 0.28
# наслоение у швов, заклёпки
hair = smooth(0.0125, 0.0035, seamd); col *= (1 - 0.07 * hair * skin_m)[..., None]; rough += hair * 0.05 * skin_m
halo = smooth(0.05, 0.0, seamd) * smooth(0.30, 0.66, stre) * skin_m; col *= (1 - 0.035 * halo)[..., None]
stain = aft * smooth(0.45, 0.78, stre) * skin_m * smooth(-0.3, 0.1, nz); col = mix(col, (0.15, 0.14, 0.12), stain * 0.50); rough += stain * 0.16
crev = smooth(0.70, 0.30, ao1) * skin_m; col = mix(col, (0.11, 0.105, 0.10), crev * 0.58); rough += crev * 0.18
body_ = smooth(0.15, 0.95, ao2); col *= (0.86 + 0.14 * body_)[..., None]; col *= (0.96 + 0.04 * smooth(0.45, 0.95, ao1))[..., None]
fade = smooth(-0.7, 0.8, nz); col *= (0.95 + 0.08 * fade)[..., None]
rv_d = smooth(0.0, 0.5, riv); rv_top = smooth(0.4, 0.9, riv); col *= (1 - rv_d * 0.10 * skin_m)[..., None]; col += (rv_top * 0.010 * skin_m)[..., None]
# ── кромки и сколы ──
edge = smooth(0.985, 0.90, bev) * skin_m
da_le = aw - LEW
LE_w = smooth(0.13, 0.02, da_le) * smooth(-0.02, 0.02, da_le) * ((cls == 4) | wing)
col = mix(col, BASE * 1.10, LE_w * 0.40); rough -= LE_w * 0.14
eros = smooth(0.46, 0.60, fbm(9.0, 9.0, 9.0, 3, 37.0))
chip = np.maximum(edge * smooth(0.52, 0.62, fbm(14.0, 14.0, 14.0, 3, 41.0)), LE_w * smooth(0.66, 0.78, eros) * 0.40)
scuff = smooth(0.020, 0.006, hedge) * smooth(0.60, 0.70, fbm(22.0, 22.0, 22.0, 3, 43.0)) * 0.5
scr = smooth(0.74, 0.77, fbm(5.0, 70.0, 70.0, 2, 47.0)) * smooth(0.52, 0.70, patch) * (0.4 + 0.6 * sun) * 0.34
walk = np.zeros_like(a); col = col
rough -= (edge * 0.14 + scuff * 0.16)
mov = np.isin(cls, (2, 4, 6, 7)); chip = chip * np.where(mov, 0.16, 0.80); edge = edge * np.where(mov, 0.2, 1.0)
bare = np.clip(chip * 0.9 + scuff * 0.55 + scr * 0.6, 0, 1) * skin_m
bare = bare * np.where(np.isin(cls, (1, 3, 4)), 0.30, 1.0)    # кромки киля, стабилизатора, предкрылков: сильная потёртость блестела зубцами на дальнем объективе
BARE = np.array((0.60, 0.61, 0.63), np.float32)
col = mix(col, BARE, bare); rough = rough * (1 - bare) + bare * (0.36 + 0.05 * fine); metal = np.maximum(metal, smooth(0.45, 0.75, bare))
wear_ = (cls == 0) * smooth(0.50, 0.66, fbm(3.0, 3.0, 3.0, 3, 67.0)) * smooth(3.0, 3.3, a) * smooth(5.2, 4.9, a) * smooth(0.25, 0.45, z) * smooth(0.75, 0.6, z)
col = mix(col, BASE * 1.16, wear_ * 0.30); rough -= wear_ * 0.08
# ── усиленный износ (Mark 2026-11-12: «ещё больше текстурных деталей, подтёков, рельефа»; образец - mig21_09) ──
KW = float(os.environ.get('MIG21_WEAR', '1.0')); pnt = skin_m & (cls <= 8) & (cls != 7)
side_ = smooth(0.35, 0.75, np.abs(nx)) * pnt
rain = smooth(0.50, 0.70, fbm(9.0, 9.0, 0.50, 4, 101.0)) * side_ * (0.35 + 0.65 * smooth(0.42, 0.66, fbm(0.9, 0.9, 0.9, 3, 102.0)))          # дождевые потёки по бортам сверху вниз
col = mix(col, (0.15, 0.14, 0.12), rain * 0.26 * KW); rough += rain * 0.12 * KW
lum_ = col.mean(-1, keepdims=True); faded = sun * smooth(0.42, 0.70, fbm(0.8, 0.8, 0.8, 4, 103.0)) * pnt                                    # выцветание пятнами на верхних поверхностях
col = mix(col, (col * 0.55 + lum_ * 0.45) * 1.13 + 0.015, faded * 0.50 * KW); rough += faded * 0.08 * KW
pn_ = fbm(2.6, 2.6, 2.6, 4, 107.0); prim = smooth(0.690, 0.715, pn_) * pnt * (1 - smooth(-0.2, -0.6, nz) * 0.5); core = smooth(0.745, 0.760, pn_) * pnt  # пятна грунта и металл в их середине
col = mix(col, (0.60, 0.63, 0.36), prim * 0.62 * KW); rough += prim * 0.10 * KW; col = mix(col, (0.52, 0.53, 0.55), core * 0.85 * KW); metal = np.maximum(metal, core * 0.85 * KW); rough = rough * (1 - core * 0.5) + core * 0.5 * 0.38
drip = smooth(0.018, 0.0, hedge) * 0.0 + aft * smooth(0.30, 0.70, fbm(0.6, 16.0, 16.0, 3, 111.0)) * pnt; col = mix(col, (0.10, 0.09, 0.075), drip * 0.42 * KW); rough -= drip * 0.10 * KW          # тёмные масляные потёки от лючков и стыков
und_ = smooth(-0.25, -0.75, nz) * pnt; ostr = smooth(0.50, 0.72, fbm(0.45, 20.0, 20.0, 4, 113.0)) * und_ * smooth(4.0, 9.0, a); col = mix(col, (0.11, 0.10, 0.085), ostr * 0.45 * KW); rough -= ostr * 0.14 * KW   # масло и керосин по низу вдоль потока
dust = smooth(0.55, 0.95, nz) * pnt * smooth(0.40, 0.70, fbm(1.7, 1.7, 1.7, 4, 115.0)); col = mix(col, (0.47, 0.44, 0.38), dust * 0.16 * KW); rough += dust * 0.14 * KW                           # пыль на горизонталях
wroot = pnt * sun * smooth(0.62, 0.75, ax) * smooth(1.45, 1.15, ax) * smooth(7.2, 7.6, a) * smooth(10.4, 10.0, a) * smooth(0.36, 0.62, fbm(3.2, 3.2, 3.2, 3, 117.0)); col = mix(col, (0.30, 0.30, 0.30), wroot * 0.34 * KW); rough += wroot * 0.10   # натоптано у корня крыла
gsoot = smooth(4.9, 5.4, a) * smooth(8.6, 6.0, a) * smooth(-0.45, -0.66, z) * (ax < 0.34) * pnt * (0.5 + 0.5 * smooth(0.3, 0.7, fbm(0.6, 9.0, 9.0, 3, 119.0))); col = mix(col, (0.06, 0.058, 0.055), gsoot * 0.62 * KW); rough += gsoot * 0.2   # копоть за стволами пушки
tsoot = smooth(11.6, 13.5, a) * np.isin(cls, (0, 3)) * skin_m * (0.4 + 0.6 * smooth(0.30, 0.70, fbm(0.5, 7.0, 7.0, 4, 121.0))); col = mix(col, (0.075, 0.07, 0.065), tsoot * 0.40 * KW); rough += tsoot * 0.16 * KW
DENT = -smooth(0.66, 0.74, fbm(3.4, 3.4, 3.4, 3, 123.0)) * 0.0022 * pnt                                                                      # мелкие вмятины листов
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
    """Треугольник у кабины (se_13): белое поле, красная кромка, вершина вниз."""
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

def stamp(im_, ac, qc, W_, H_, side, along=True, alpha=0.92, rough_to=None, cl=None):
    """Картинка на обшивку. along: ширина вдоль корпуса; иначе ширина вдоль размаха, верх картинки к носу."""
    A0 = np.asarray(im_, np.float32) / 255.0; hp, wp = A0.shape[:2]
    vm, Q_ = ((nz > 0.35, x) if side == 'top' else (nz < -0.35, x) if side == 'bot' else (nx > 0.35, z) if side == 'r' else (nx < -0.35, z))
    if along: ins = vm & (np.abs(a - ac) < W_ / 2) & (np.abs(Q_ - qc) < H_ / 2)
    else: ins = vm & (np.abs(Q_ - qc) < W_ / 2) & (np.abs(a - ac) < H_ / 2)
    ins &= (mat == 0) & (np.isin(cls, cl) if cl else (cls <= 8))
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


def fr_roundel(W=1000, blue=(30, 52, 120, 255), white=(236, 238, 236, 255), red=(190, 36, 36, 255)):
    """Французский круг: красное кольцо снаружи, белое, синий центр. Нарисован здесь."""
    im_ = Image.new('RGBA', (W, W), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); c = W / 2; R = W / 2 - 4
    for r_, c_ in ((R, red), (R * 0.667, white), (R * 0.333, blue)): d_.ellipse((c - r_, c - r_, c + r_, c + r_), fill=c_)
    return im_


def arrow_img(W=720, H=180, ink=(214, 176, 44, 255), rev=False):
    """Жёлтый знак спасения: своя стрелка с чёрной окантовкой, без текста."""
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); y0, y1, x1 = H * 0.28, H * 0.72, W * 0.74; P_ = [(4, y0), (x1, y0), (x1, 4), (W - 4, H / 2), (x1, H - 4), (x1, y1), (4, y1)]
    d_.polygon(P_, fill=ink, outline=(30, 30, 30, 255)); d_.line(P_ + [P_[0]], fill=(30, 30, 30, 255), width=6)
    return im_.transpose(Image.FLIP_LEFT_RIGHT) if rev else im_


def usaf(W=1100):
    """Опознавательный знак: звезда в синем круге, белые полосы с красной чертой, синяя кромка. Нарисован здесь."""
    H = int(W * 0.53); im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); BL = (28, 44, 92, 255); WH = (232, 234, 232, 255); RD = (178, 36, 40, 255)
    R = H / 2 - 4; cx, cy = W / 2, H / 2; bh = R * 0.50; t = max(4, int(R * 0.085))
    d_.rectangle((4, cy - bh, W - 4, cy + bh), fill=BL); d_.rectangle((4 + t, cy - bh + t, W - 4 - t, cy + bh - t), fill=WH); d_.rectangle((4 + t, cy - bh / 3 + t / 3, W - 4 - t, cy + bh / 3 - t / 3), fill=RD)
    d_.ellipse((cx - R, cy - R, cx + R, cy + R), fill=BL); d_.polygon(_star_pts(cx, cy, R * 0.96), fill=WH)
    return im_


INK = (30, 32, 34, 255); WHT = (232, 234, 230, 255); YEL = (214, 176, 44, 255); REDC = (196, 34, 30, 255)
def star_img(S_=900):
    """Красная звезда с белой и красной окантовкой, нарисована здесь."""
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); c = S_ / 2
    for R_, c_ in ((S_ * 0.495, REDC), (S_ * 0.455, WHT), (S_ * 0.405, REDC)): d_.polygon(_star_pts(c, c * 1.04, R_), fill=c_)
    return im_
def ring_img(S_=900):
    """Круг трёх цветов для камуфляжного варианта: красный, зелёный, белый центр. Нарисован здесь."""
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); c = S_ / 2
    for R_, c_ in ((S_ * 0.495, WHT), (S_ * 0.47, REDC), (S_ * 0.33, (30, 120, 60, 255)), (S_ * 0.17, WHT)): d_.ellipse((c - R_, c - R_, c + R_, c + R_), fill=c_)
    return im_
def num_img(t, ink, edge, H=320):
    f_ = ImageFont.truetype(FNB, int(H * 0.86)); tmp = ImageDraw.Draw(Image.new('L', (8, 8))); bb = tmp.textbbox((0, 0), t, font=f_); W = bb[2] - bb[0] + 60
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(im_).text((W / 2, H / 2), t, font=f_, fill=ink, anchor='mm', stroke_width=10, stroke_fill=edge); return im_
SIGN = ring_img() if SCHEME == 'camo' else star_img()
def teeth_img(W=900, H=420):
    """Пасть на носу для оранжевого варианта: свой рисунок."""
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); d_.polygon([(0, H * .30), (W * .95, H * .05), (W, H * .50), (W * .95, H * .95), (0, H * .70)], fill=(150, 26, 22, 255))
    for i in range(7):
        x0 = W * (0.10 + 0.12 * i); d_.polygon([(x0, H * (0.29 - 0.03 * i)), (x0 + W * .10, H * (0.26 - 0.03 * i)), (x0 + W * .05, H * 0.47)], fill=WHT); d_.polygon([(x0, H * (0.71 + 0.03 * i)), (x0 + W * .10, H * (0.74 + 0.03 * i)), (x0 + W * .05, H * 0.53)], fill=WHT)
    return im_
NUM = num_img('417', WHT, (40, 44, 40, 255)) if SCHEME == 'camo' else num_img('1907', REDC, (236, 236, 230, 255)) if SCHEME == 'orange' else num_img('27', REDC, (120, 20, 18, 255)) if SCHEME == 'pale' else num_img('47', (86, 150, 212, 255), (40, 70, 130, 255))
def bar_img(W=600, H=60, ink=YEL):
    return Image.new('RGBA', (W, H), ink)
for sd in ('r', 'l'):
    stamp(SIGN, 12.75, 1.52, 0.86, 0.86, sd, cl=(1, 2), alpha=0.97)                           # знак на киле
    stamp(NUM, 1.95 if SCHEME != 'orange' else 3.25, -0.02 if SCHEME != 'orange' else -0.33, {'camo': 1.05, 'orange': 1.20}.get(SCHEME, 0.86), 0.50 if SCHEME != 'orange' else 0.42, sd, alpha=0.96, cl=(0,))
    if SCHEME == 'orange': stamp(teeth_img().transpose(Image.FLIP_LEFT_RIGHT), 1.72, -0.08, 0.95, 0.44, sd, alpha=0.97, cl=(0,))   # придуманный бортовой номер
    stamp(arrow_img(rev=(sd == 'l')), 3.95, 0.30, 0.50, 0.12, sd, alpha=0.95, rough_to=0.44, cl=(0,))
    if SCHEME != 'orange': stamp(bar_img(ink=REDC), 2.72, -0.30, 0.30, 0.035, sd, alpha=0.9, cl=(0,))
    stamp(bar_img(ink=REDC), 7.45, -0.42, 0.45, 0.035, sd, alpha=0.9, cl=(0,))
for sg in (1, -1):
    stamp(SIGN, 9.10, sg * 1.60, 1.00, 1.00, 'top', along=False, alpha=0.97, cl=(0, 4)); stamp(SIGN, 9.10, sg * 1.60, 1.00, 1.00, 'bot', along=False, alpha=0.97, cl=(0, 4))   # Mark: знаки на крыле ближе к центру
    decal(u'НЕ СТАНОВИТЬСЯ', 10.36, sg * 1.30, 0.80, 0.10, 'top', (0.62, 0.10, 0.08), 0.75, cl=4); decal(u'НЕ СТАНОВИТЬСЯ', 10.45, sg * 2.70, 0.70, 0.09, 'top', (0.62, 0.10, 0.08), 0.75, cl=4)

_bad = 0
for i_, m1 in enumerate(MARKS):
    for m2 in MARKS[i_ + 1:]:
        if m1[1] == m2[1] and m1[2] - 0.04 < m2[3] and m2[2] - 0.04 < m1[3] and m1[4] - 0.04 < m2[5] and m2[4] - 0.04 < m1[5]: _bad += 1; log(f'НАЛОЖЕНИЕ {m1[1]}: {m1[0]} ({m1[2]:.2f}-{m1[3]:.2f}, {m1[4]:.2f}-{m1[5]:.2f}) и {m2[0]} ({m2[2]:.2f}-{m2[3]:.2f}, {m2[4]:.2f}-{m2[5]:.2f})')
log(f'знаков {len(MARKS)}, наложений с запасом 4 см: {_bad}')
lip_d = a - 0.85
log('надписи')
# ── нос: чёрный конус, резко отделён (f1_02, 03, 07) ──
rad = cls == 7; RAD = (np.array((0.050, 0.050, 0.055), np.float32) if SCHEME == 'orange' else np.array((0.16, 0.36, 0.20), np.float32)) * (0.94 + 0.12 * mott)[..., None]   # конус оранжевый (Mark: «попробуем оранжевый»)
col[rad] = RAD[rad]; rough[rad] = (0.46 + 0.08 * (mott - 0.5))[rad]; metal[rad] = 0
col[diel] = col[diel] * 0.0 + (GRN * (0.90 + 0.2 * mott[diel])[..., None]); rough[diel] = 0.5; metal[diel] = 0
# ── сопло: светлая обечайка, тёмные лепестки (f1_06, 07) ──
tn = fbm(1.2, 4.0, 4.0, 4, 59.0); ts = fbm(0.8, 14.0, 14.0, 3, 61.0)
noz = cls == 10
rr0 = np.maximum(np.hypot(ax - NOZ_X, z - NOZ_Y), 1e-3); outw = (nx * np.sign(x) * (ax - NOZ_X) + nz * (z - NOZ_Y)) / rr0 > 0.15
ncol = np.array((0.66, 0.66, 0.64), np.float32) * (0.88 + 0.24 * ts)[..., None]; sn = smooth(13.72, 13.78, a) * (0.7 + 0.3 * tn); ncol = ncol * (1 - 0.50 * sn)[..., None] + np.array((0.30, 0.285, 0.27), np.float32) * (0.50 * sn)[..., None]   # лепестки серые, выгоревшие (f111_04, 07)
col[noz] = ncol[noz]; metal[noz] = np.where(a[noz] < 13.72, 0.70, 1.0); rough[noz] = np.clip(np.where(a[noz] < 13.72, 0.50, 0.55) + (tn[noz] - 0.5) * 0.10, 0.42, 0.66)     # обечайка светлая, матовее (f1_07)
ins_ = noz & (~outw); iv = (0.17 + 0.07 * ts) * (1 - 0.40 * smooth(14.15, 13.7, a)); col[ins_] = (np.stack([iv * 1.0, iv * 0.96, iv * 0.92], -1))[ins_]; metal[ins_] = 0.5; rough[ins_] = 0.72
pipe = (cls == 0) & (mat == 1); col[pipe] = np.array((0.20, 0.195, 0.19), np.float32) * (0.8 + 0.4 * tn[pipe])[..., None]; metal[pipe] = 1.0; rough[pipe] = 0.55
fan_ = cls == 13; col[fan_] = np.array((0.05, 0.05, 0.055), np.float32); metal[fan_] = 0.3; rough[fan_] = 0.6
# хвостовой жёлоб за соплами: голый жаропрочный металл с копотью (f111_03, 05, 06)
trg = (cls == 0) & (a > 12.85) & (mat == 0) & (np.abs(x) < 0.75) & (z > -0.75) & (z < 0.74); tw_ = smooth(12.90, 13.20, a)[trg]
col[trg] = col[trg] * (1 - tw_[..., None]) + (np.array((0.36, 0.33, 0.30), np.float32) * (0.62 + 0.55 * tn[trg])[..., None] * (1 - 0.45 * smooth(0.40, 0.75, ts[trg]))[..., None]) * tw_[..., None]; metal[trg] = np.maximum(metal[trg], 0.9 * tw_); rough[trg] = rough[trg] * (1 - tw_) + 0.52 * tw_
log('сопло')
# ── материалы без краски обшивки ──
def solid(m, c, r, me=0.0, nz_=0.08):
    col[m] = np.array(c, np.float32) * (1 - nz_ / 2 + nz_ * fine[m])[..., None]; rough[m] = r; metal[m] = me
solid(mat == 10, (0.20, 0.21, 0.22), 0.85)              # швы
solid(mat == 2, (0.030, 0.030, 0.032), 0.9)             # нутро
solid(mat == 4, (0.045, 0.045, 0.048), 0.86)            # резина
solid(mat == 5, (0.20, 0.205, 0.21), 0.62, 0, 0.16)     # кабина
bore_ = (mat == 5) & (cls == 0); col[bore_] = np.array((0.14, 0.135, 0.13), np.float32); rough[bore_] = 0.7
# канал: у кромки тёплый серый, вглубь плавно темнеет (цветом, а не затенением, иначе в тени сплошной чёрный); ниши шасси светлые
# канал: у кромки тёмно-серый, вглубь в чёрное, глухая стенка (задание); ниши шасси светлые, ниша щитка тёмная: сквозь отверстия не светится
duct_m = mat == 11; duct_col = np.array((0.15, 0.15, 0.16), np.float32); solid(duct_m, duct_col, 0.72, 0, 0.12)
in_duct = duct_m & (a < 3.2)
col[in_duct] *= (0.30 + 0.70 * smooth(1.6, 0.0, lip_d[in_duct]))[..., None]
brk_ = duct_m & (a < 0); col[brk_] = np.array((0.07, 0.07, 0.075), np.float32)
bay_ = duct_m & (~in_duct) & (~brk_); col[bay_] = np.array((0.60, 0.60, 0.58), np.float32) * (0.45 + 0.55 * ao2[bay_])[..., None]; rough[bay_] = 0.6
solid(mat == 6, (0.42, 0.36, 0.26), 0.92, 0, 0.2)       # подушки
solid(mat == 8, (0.30, 0.28, 0.21), 0.9, 0, 0.14)       # ремни
solid(mat == 7, (0.018, 0.038, 0.032), 0.12, 0, 0.0)    # экраны
solid(mat == 12, (0.16, 0.70, 0.30), 0.18, 0, 0.0)      # зелёный экран и стекло прицела, зелёный огонь
hs = ((pos[..., 0] + pos[..., 1] + pos[..., 2]) / 0.035) % 1.0 > 0.5
solid(mat == 9, (0.74, 0.60, 0.06), 0.42); col[(mat == 9) & hs] = np.array((0.035, 0.035, 0.035), np.float32)   # рукоятка: жёлто-чёрная
mm = (mat == 1) & (cls == 11); solid(mm, (0.46, 0.47, 0.48), 0.38, 1.0)
gr_ = cls == 12                                         # шасси: потёртая серо-белая краска, тусклый шток, тёмная сталь, серая резина, пыль
g_p = gr_ & (mat == 0); g_c = gr_ & (mat == 1); g_s = gr_ & (mat == 8); g_d = gr_ & (mat == 5)
gm1 = fbm(2.4, 2.4, 2.4, 4, 91.0); gm2 = fbm(18.0, 18.0, 18.0, 3, 93.0); gst = fbm(1.0, 16.0, 2.2, 4, 87.0); gst2 = fbm(0.7, 34.0, 1.3, 3, 89.0)
solid(g_p, (0.545, 0.545, 0.515), 0.62, 0, 0.10); solid(g_c, (0.47, 0.47, 0.46), 0.30, 0.85, 0.08); solid(g_s, (0.145, 0.142, 0.14), 0.58, 0.75, 0.14)
solid(g_d, (0.335, 0.35, 0.365), 0.60, 0, 0.10); solid(gr_ & (mat == 9), (0.60, 0.56, 0.40), 0.28, 0, 0.1); solid(gr_ & (mat == 2), (0.05, 0.048, 0.046), 0.72, 0, 0.14)
painted = g_p | g_d
col[painted] *= (0.84 + 0.30 * gm1[painted] + 0.06 * gm2[painted])[..., None]
oil_ = smooth(0.46, 0.68, gst) * (0.5 + 0.5 * smooth(0.40, 0.70, gst2)); col = mix(col, (0.15, 0.125, 0.095), oil_ * 0.58 * (painted | g_c)); rough = rough + oil_ * 0.20 * painted - oil_ * 0.10 * g_c
gd = smooth(-0.60, -1.60, z) * gr_ * (0.45 + 0.55 * smooth(0.36, 0.66, gm1)); col = mix(col, (0.215, 0.195, 0.165), gd * 0.62 * (painted | g_s)); rough = rough + gd * 0.22 * painted
for ac_, xc_, zc_, rw_ in ((2.55, 0.0, GROUND + 0.25, 0.25), (7.45, 1.395, GROUND + 0.40, 0.40), (7.45, -1.395, GROUND + 0.40, 0.40)):
    rd_ = np.hypot(a - ac_, z - zc_); md_ = gr_ & (rd_ < rw_ * 0.68) & (np.abs(x - xc_) < 0.30)
    dust = smooth(rw_ * 0.68, rw_ * 0.10, rd_) * (0.45 + 0.55 * smooth(0.34, 0.62, gm2)) * md_; col = mix(col, (0.115, 0.10, 0.085), dust * 0.72); rough = rough + dust * 0.15
g_e = smooth(0.985, 0.90, bev) * painted * smooth(0.50, 0.62, gm2); col = mix(col, (0.26, 0.255, 0.24), g_e * 0.8); rough = rough + g_e * 0.05
tyr = mat == 4; rt_ = smooth(0.40, 0.68, gm2) * tyr; col[tyr] = np.array((0.070, 0.070, 0.072), np.float32); col = mix(col, (0.165, 0.158, 0.145), rt_ * 0.50); col = mix(col, (0.20, 0.19, 0.17), smooth(-1.30, -1.58, z) * tyr * 0.45); rough[tyr] = 0.90
col[gr_] *= (0.50 + 0.50 * smooth(0.15, 0.95, ao2[gr_]))[..., None]

h_m = (cls == 14) & (mat == 1); solid(h_m, (0.27, 0.28, 0.29), 0.52, 0.25, 0.12)   # антенны, щупы, упоры: тёмные, без зеркала
c9 = cls == 9
m_can = c9 & (mat == 1); solid(m_can, (0.44, 0.45, 0.46), 0.38, 1.0)
c9_s = c9 & (mat == 0); col[c9_s] = {'camo': np.array((0.215, 0.265, 0.195), np.float32), 'orange': np.array((0.70, 0.41, 0.06), np.float32), 'pale': np.array((0.60, 0.61, 0.60), np.float32)}.get(SCHEME, np.array((0.50, 0.51, 0.52), np.float32)) * (0.92 + 0.16 * mott[c9_s])[..., None]; rough[c9_s] = 0.46
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
height += smooth(0.1, 0.8, riv) * 0.0019 * skin_m; height += smooth(0.0, 0.075, seamd) * 0.0044 * (seamd < 8) * skin_m; height -= smooth(0.010, 0.0, seamd) * 0.0016 * skin_m; height += (fbm(1.1, 1.1, 1.1, 3, 109.0) - 0.5) * 0.010 * skin_m + DENT     # заклёпки выпуклые, панель подушкой от шва
ins_h = hedge < 8; height += smooth(0.0, 0.010, hedge) * 0.0005 * ins_h
height += scr * -0.0002
gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * DS); gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / (2 * DS)
nn = np.stack([-gx, -gy, np.ones_like(gx)], -1); nn /= np.linalg.norm(nn, axis=-1, keepdims=True)
solidm = np.isin(mat, (2, 10, 7, 9, 11, 12)) | (cls == 11) | (cls == 12) | (cls == 10) | (cls == 13) | (cls == 14)
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
occ = np.where(in_duct, 0.20 + 0.30 * smooth(1.6, 0.0, lip_d), occ)
bleed([col, rough, metal, occ, nn], cov)
def lift(arr): return (np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)
Image.fromarray(lift(col)[::-1]).save(f'{OUT}/mig21_color.png', compress_level=1)
Image.fromarray(lift(nn * 0.5 + 0.5)[::-1]).save(f'{OUT}/mig21_normal.png', compress_level=1)
orm = np.stack([occ, rough, metal], -1); Image.fromarray(lift(orm)[::-1]).save(f'{OUT}/mig21_orm.png', compress_level=1)
pm = skin_m & cov & (cls == 0) & (a > 1.0) & (a < 12.5)
up_ = pm & (LOW < 0.1)
print('средний цвет обшивки sRGB', (col[pm].mean(0) * 255).round(1), 'шероховатость', round(float(rough[pm].mean()), 3), 'доля голого металла', round(float((metal[pm] > 0.5).mean()), 4))
log('сохранено', OUT)
