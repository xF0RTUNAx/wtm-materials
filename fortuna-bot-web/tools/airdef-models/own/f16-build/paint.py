# paint.py - краска F-16D из данных gbuf.py: цвет (только краска и грязь, без света), нормали (заклёпки, крышки, шагрень), карта блеска glTF (R затенение, G шероховатость, B металл). Без Blender: /usr/bin/python3 -I paint.py
# F16_TEX=2048|4096, F16_OUT=<папка>, F16_L=r,g,b и F16_D=r,g,b - светлый и тёмный серый (sRGB 0…1). Пиксели фото не используются, знаки нарисованы здесь.
import json, math, os, site, sys, time, types
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image, ImageDraw, ImageFont
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__)); DAT = os.path.join(HERE, '_проба')
S = int(os.environ.get('F16_TEX', '2048')); OUT = os.environ.get('F16_OUT', DAT); os.makedirs(OUT, exist_ok=True)
LIGHT = np.array([float(v) for v in os.environ.get('F16_L', '0.500,0.520,0.540').split(',')], np.float32)
DARK = np.array([float(v) for v in os.environ.get('F16_D', '0.365,0.385,0.410').split(',')], np.float32)
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f} с]', *a, flush=True)
L2 = 7.515; NOZ_Y = 0.17
pos = np.load(f'{DAT}/gb_pos_{S}.npy'); nor = np.load(f'{DAT}/gb_nor_{S}.npy'); idd = np.load(f'{DAT}/gb_id_{S}.npy'); aob = np.load(f'{DAT}/gb_ao_{S}.npy')
ATLAS = json.load(open(f'{DAT}/uv.json', encoding='utf-8'))['atlas_m']; PXM = 0.985 * S / ATLAS; DS = 1.0 / PXM
mat = np.round(idd[..., 0] * 16).astype(np.int8); cls = np.round(idd[..., 1] * 32).astype(np.int8); cov = idd[..., 2] > 0.5
a = (L2 - pos[..., 1]).astype(np.float32); x = pos[..., 0].astype(np.float32); z = pos[..., 2].astype(np.float32); ax = np.abs(x)
nx, ny, nz = nor[..., 0], nor[..., 1], nor[..., 2]
ao1, ao2, bev = aob[..., 0], aob[..., 1], aob[..., 2]
ao1 = np.where(cls == 7, 1.0, ao1); ao2 = np.where(cls == 7, 1.0, ao2)     # створки запекались закрытыми, сквозь них проходят стойки: иначе на открытой створке тёмный отпечаток
log('данные загружены', S, 'плотность', round(PXM), 'пикс/м')
# линии разделки: те же, что режет геометрия
gsrc = open(os.path.join(HERE, 'f16_geo.py'), encoding='utf-8').read(); ns = {'math': math}
exec(gsrc[gsrc.index('class Track:'):gsrc.index('def tracks(table)')], ns); Track = ns['Track']
A_LE = Track([(0.700, 6.470), (1.440, 7.100), (4.600, 9.780)])
ns['g'] = types.SimpleNamespace(A_LE=A_LE)
src = open(os.path.join(HERE, 'f16_detail.py'), encoding='utf-8').read()
exec(src[src.index('def rrect_line('):src.index('RINGS_BODY = ')].replace('g.A_LE', 'A_LE'), {**ns, 'A_LE': A_LE}, ns); TOP, BOT, SIDE = ns['TOP_LINES'], ns['BOT_LINES'], ns['SIDE_PANELS']
RINGS_FORE = (2.02, 2.86); RINGS_AFT = (12.90, 13.42)


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
# ── основа: два серых, верх темнее, граница мягкая и слегка волнистая (f16_03, 07, 09) ──
w1 = vnoise(a * 0.9 + 3.1, ax * 0.9 - 1.7, z * 0.9 + 0.4) - 0.5; w2 = vnoise(a * 2.3 - 5.3, ax * 2.3 + 2.2, z * 2.3 - 3.0) - 0.5
wav_ = w1 * 0.20 + w2 * 0.07
hull = cls == 0
# корпус: тёмное выше линии борта; сзади линия поднимается к основанию киля
line_z = np.interp(a, [2.0, 3.0, 5.0, 8.0, 11.0, 13.0, 14.1], [0.62, 0.50, 0.42, 0.42, 0.50, 0.66, 0.74]).astype(np.float32) + wav_ * 0.55
d_body = smooth(line_z - 0.09, line_z + 0.09, z)
# наплыв и плечи сверху тёмные, крыло сверху тёмное клином от корня: диагональная граница
LEW = (7.10 + (ax - 1.44) * 0.848).astype(np.float32)
wedge = 2.10 + (a - LEW) * 0.34 + wav_ * 0.85
d_wing = smooth(wedge + 0.11, wedge - 0.11, ax)
up_ = smooth(0.10, 0.40, nz)
dk = np.where(hull, np.maximum(d_body * smooth(-0.30, 0.05, nz), d_wing * up_ * (ax > 1.1)), 0.0)
dk = np.where(hull & (ax > 1.2) & (z < 0.45) & (nz < 0.1), 0.0, dk)
# плавно: у носового обтекателя своя краска, носки как крыло, щитки и полка - как корпус сверху
dk = np.where(cls == 5, d_wing, dk)
dk = np.where((cls == 6) & (nz > 0.2), 0.75, dk)
dk = np.where(cls == 4, smooth(wedge + 0.11, wedge - 0.11, ax) * (nz > 0), dk)
dk = np.where((cls == 3) & (nz > 0), smooth(2.05 + wav_, 1.65 + wav_, ax) * 0.8, dk)
dk = np.where(cls == 7, (z > 0.6) * 1.0, dk)
dk = np.where(cls == 9, 1.0, dk)
# киль светлый, снизу у корня тёмная подпалина
dk = np.where((cls == 1) | (cls == 2), smooth(1.85 + wav_, 1.45 + wav_, z) * 0.7, dk)
BASE = LIGHT[None, None, :] * (1 - dk[..., None]) + DARK[None, None, :] * dk[..., None]
col = BASE.astype(np.float32).copy(); rough = np.full((S, S), 0.42, np.float32); metal = np.where(mat == 0, 0.10, 0.0).astype(np.float32); height = np.zeros((S, S), np.float32)
# тон панелей: границы совпадают со швами геометрии
FR = np.array([2.02, 2.86, 3.32, 4.30, 5.70, 6.70, 7.75, 9.00, 10.15, 11.20, 11.90, 12.70, 12.90, 13.42, 40.0], np.float32)
band = np.searchsorted(FR, a); lat = (x > 0).astype(np.int32) * 2 + (z > 0.3).astype(np.int32)
tt = rng_tab(64, 7, 0.972, 1.028); rt = rng_tab(64, 8, -0.04, 0.04); hue = rng_tab(64, 9, -0.009, 0.009)
idx = (band * 4 + lat) % 64; tone = tt[idx]; rtone = rt[idx]
s1 = a - (LEW + 0.55); s2 = a - (LEW + 1.25); s3 = a - 10.16
wing = (cls == 0) & (ax > 1.56)
wb = (s1 > 0).astype(np.int32) + (s2 > 0) + (s3 > 0); wr = (ax > 2.55).astype(np.int32) + (ax > 3.45); wi = (wb * 3 + wr) * 4 + (x > 0) * 2 + (nz > 0)
tone = np.where(wing, tt[(wi + 17) % 64], tone); rtone = np.where(wing, rt[(wi + 17) % 64], rtone)
for c_, sd in ((1, 21), (2, 23), (3, 25), (4, 27), (5, 29), (6, 31), (7, 33), (8, 35)):
    ix_ = (x > 0).astype(np.int32) + sd; tone = np.where(cls == c_, 1.0 + (tt[ix_ % 64] - 1.0) * 0.5, tone); rtone = np.where(cls == c_, rt[ix_ % 64], rtone)
col *= tone[..., None]; rough += rtone
col[..., 0] *= 1 + hue[idx]; col[..., 2] *= 1 - hue[idx]
# подкраски и заменённые листы
RS = np.random.RandomState(31); fresh = np.zeros((S, S), np.float32)
tup = nz > 0.45; tdn = nz < -0.45; tsd = np.abs(nx) > 0.45
for vm, A_, Q_, n_, qa, qb in ((tup, a, x, 14, -4.6, 4.6), (tsd, a, z, 8, -0.6, 1.3)):
    ids = np.nonzero((vm & (cls <= 8)).ravel())[0]; AA, QQ = A_.ravel()[ids], Q_.ravel()[ids]
    for k in range(n_):
        a0 = RS.uniform(2.2, 14.0); w = RS.uniform(0.22, 1.05); q0 = RS.uniform(qa, qb); h_ = RS.uniform(0.16, 0.65); e_ = 0.06
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
for rA in RINGS_FORE + RINGS_AFT:
    m = (np.abs(a - rA) < 0.08) & (cls == 0); phi = np.arctan2(x, z - 0.3) * 0.6; seamd[m] = np.minimum(seamd[m], np.abs(a[m] - rA))
    for sgn in (1, -1):
        ph = (phi[m] / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH; dr = np.hypot(dph, a[m] - rA - sgn * OFF); riv[m] = np.maximum(riv[m], np.clip(1 - dr / RV, 0, 1))
# ряды на киле вдоль оси руля и на плоскостях: f16_03
fin_hinge = np.interp(z, [1.18, 3.39], [13.21, 14.28]).astype(np.float32)
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
rearw = 0.45 + 0.55 * smooth(6.5, 12.5, a)
dirty = flow * rearw * 0.22 * (1 - 0.75 * smooth(-0.05, -0.5, nz))
col = mix(col, (0.24, 0.245, 0.25), dirty * 0.14); rough += dirty * 0.14
rough += flow2 * 0.04
under = smooth(-0.15, -0.75, nz); oil = under * smooth(0.46, 0.68, fbm(1.0, 5.0, 5.0, 4, 23.0))
col = mix(col, (0.24, 0.235, 0.23), oil * 0.06); rough += oil * 0.14
for a0_, a1_, q0_, q1_ in ((5.25, 6.45, 0.0, 0.30), (7.66, 9.28, 0.70, 1.34)):
    m_ = smooth(a0_ - 0.10, a0_ + 0.10, a) * smooth(a1_ + 0.45, a1_ - 0.10, a) * smooth(q0_ - 0.1, q0_ + 0.1, ax) * smooth(q1_ + 0.12, q1_ - 0.12, ax) * under * smooth(0.36, 0.66, fbm(1.6, 7.0, 7.0, 3, 29.0))
    col = mix(col, (0.22, 0.215, 0.21), m_ * 0.10); rough += m_ * 0.12
# за решётками на гаргроте: короткий потёк назад
mv = smooth(10.58, 10.64, a) * smooth(11.45, 10.65, a) * smooth(1.03, 1.06, z) * smooth(1.24, 1.20, z) * (np.abs(nx) > 0.3) * (0.4 + 0.6 * flow)
col = mix(col, (0.13, 0.13, 0.13), mv * 0.45); rough += mv * 0.25
# копоть у сопла: мягко, без края
soot = smooth(12.7, 13.9, a) * (0.45 + 0.55 * smooth(0.28, 0.72, fbm(0.7, 2.6, 2.6, 4, 31.0))) * (cls == 0) * (ax < 1.0)
soot = np.maximum(soot, smooth(13.6, 14.5, a) * smooth(2.4, 1.3, ax) * (cls == 3) * (0.35 + 0.65 * smooth(0.30, 0.70, fbm(0.8, 3.0, 3.0, 4, 32.0))) * 0.45)
soot = np.maximum(soot, smooth(13.5, 14.3, a) * (cls == 6) * 0.50)
col = mix(col, (0.11, 0.105, 0.10), soot * 0.55); rough += soot * 0.28
# наслоение у швов, заклёпки
hair = smooth(0.0125, 0.0035, seamd); col *= (1 - 0.07 * hair * skin_m)[..., None]; rough += hair * 0.05 * skin_m
halo = smooth(0.05, 0.0, seamd) * smooth(0.30, 0.66, stre) * skin_m; col *= (1 - 0.035 * halo)[..., None]
stain = aft * smooth(0.45, 0.78, stre) * skin_m * smooth(-0.3, 0.1, nz); col = mix(col, (0.20, 0.205, 0.21), stain * 0.14); rough += stain * 0.1
crev = smooth(0.70, 0.30, ao1) * skin_m; col = mix(col, (0.13, 0.13, 0.13), crev * 0.42); rough += crev * 0.18
body_ = smooth(0.15, 0.95, ao2); col *= (0.86 + 0.14 * body_)[..., None]; col *= (0.96 + 0.04 * smooth(0.45, 0.95, ao1))[..., None]
fade = smooth(-0.7, 0.8, nz); col *= (0.95 + 0.08 * fade)[..., None]
rv_d = smooth(0.0, 0.5, riv); rv_top = smooth(0.4, 0.9, riv); col *= (1 - rv_d * 0.055 * skin_m)[..., None]; col += (rv_top * 0.010 * skin_m)[..., None]
# ── кромки и сколы ──
edge = smooth(0.985, 0.90, bev) * skin_m
da_le = a - LEW
LE_w = smooth(0.13, 0.02, da_le) * smooth(-0.02, 0.02, da_le) * ((cls == 5) | wing)
col = mix(col, LIGHT * 1.12, LE_w * 0.40); rough -= LE_w * 0.14
eros = smooth(0.46, 0.60, fbm(9.0, 9.0, 9.0, 3, 37.0))
chip = np.maximum(edge * smooth(0.52, 0.62, fbm(14.0, 14.0, 14.0, 3, 41.0)), LE_w * smooth(0.66, 0.78, eros) * 0.40)
scuff = smooth(0.020, 0.006, hedge) * smooth(0.60, 0.70, fbm(22.0, 22.0, 22.0, 3, 43.0)) * 0.5
scr = smooth(0.76, 0.78, fbm(5.0, 70.0, 70.0, 2, 47.0)) * smooth(0.60, 0.72, patch) * sun * 0.20
walk = smooth(5.0, 5.3, a) * smooth(7.0, 6.4, a) * smooth(1.05, 0.85, ax) * sun * smooth(0.44, 0.66, fbm(2.2, 2.2, 2.2, 3, 53.0)); col = mix(col, BASE * 1.12, walk * 0.34); rough -= walk * 0.14
rough -= (edge * 0.14 + scuff * 0.16)
mov = np.isin(cls, (2, 4, 5, 6, 7)); chip = chip * np.where(mov, 0.12, 0.55); edge = edge * np.where(mov, 0.2, 1.0)
bare = np.clip(chip * 0.9 + scuff * 0.55 + scr * 0.6, 0, 1) * skin_m
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
    c_ = np.asarray(col_, np.float32); col[ins] = col[ins] * (1 - A_[..., None]) + c_ * A_[..., None]; rough[ins] += A_ * -0.05


def _star_pts(cx, cy, R):
    return [(cx + (R if i % 2 == 0 else R * 0.382) * math.cos(-math.pi / 2 + i * math.pi / 5), cy + (R if i % 2 == 0 else R * 0.382) * math.sin(-math.pi / 2 + i * math.pi / 5)) for i in range(10)]


def roundel_lv(W=2500, H=1000, ink=(48, 52, 58, 255), lite=(176, 180, 182, 255)):
    """Малозаметный знак одним серым: тёмный круг, светлая звезда, полосы со светлым полем и тёмной серединой. Без синего и красного."""
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dr = ImageDraw.Draw(im_); cx, cy, R = W / 2, H / 2, H / 2 - 4; bh = R * 0.74; t = R * 0.07
    dr.rectangle((cx - R * 2.05, cy - bh / 2, cx + R * 2.05, cy + bh / 2), fill=ink)
    dr.rectangle((cx - R * 2.05 + t, cy - bh / 2 + t, cx + R * 2.05 - t, cy + bh / 2 - t), fill=lite)
    dr.rectangle((cx - R * 2.05 + t, cy - bh * 0.11, cx + R * 2.05 - t, cy + bh * 0.11), fill=ink)
    dr.ellipse((cx - R, cy - R, cx + R, cy + R), fill=ink)
    dr.polygon(_star_pts(cx, cy + R * 0.03, R * 0.92), fill=lite)
    return im_


def text_img(t, H=220, ink=(40, 44, 50, 255), W=None, font=FNB):
    f_ = ImageFont.truetype(font, int(H * 0.86)); tmp = ImageDraw.Draw(Image.new('L', (8, 8))); bb = tmp.textbbox((0, 0), t, font=f_); tw = bb[2] - bb[0]; W = W or (tw + 30)
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(im_).text((W / 2, H / 2), t, font=f_, fill=ink, anchor='mm'); return im_


def rescue_img(W=640, H=170, ink=(120, 34, 26, 255)):
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dr = ImageDraw.Draw(im_); t = 7; dr.polygon([(150, 34), (W - 12, 34), (W - 12, H - 34), (150, H - 34), (150, H - 8), (10, H / 2), (150, 8)], outline=ink, width=t)
    f_ = ImageFont.truetype(FNT, 72); dr.text((W * 0.58, H / 2), 'RESCUE', font=f_, fill=ink, anchor='mm'); return im_


def seat_tri(S_=320, ink=(40, 44, 50, 255)):
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); dr = ImageDraw.Draw(im_); dr.polygon([(16, 40), (S_ - 16, 40), (S_ / 2, S_ - 22)], fill=ink)
    f_ = ImageFont.truetype(FNT, 38); dr.text((S_ / 2, 90), 'EJECTION', font=f_, fill=(206, 208, 206, 255), anchor='mm'); dr.text((S_ / 2, 130), 'SEAT', font=f_, fill=(206, 208, 206, 255), anchor='mm'); return im_


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
    col[ins] = col[ins] * (1 - al[..., None]) + S_[:, :3] * al[..., None]; rough[ins] = rough[ins] * (1 - al) + (0.42 if rough_to is None else rough_to) * al


RND = roundel_lv()
DK = (0.14, 0.145, 0.155); LT = (0.66, 0.67, 0.66); FORM = (0.68, 0.72, 0.52)
for sd in ('r', 'l'):
    stamp(RND, 6.20, -0.255, 0.90, 0.36, sd, alpha=0.97)                                    # на ровном борту воздухозаборника, между швами 5,70 и 6,70 (f16_06, 07)
    stamp(text_img('XF', 300), 12.98, 2.16, 0.82, 0.50, sd, cl=(1,))                        # буквы на киле придуманы
    stamp(text_img('AF', 90), 12.56, 1.70, 0.22, 0.13, sd, cl=(1,)); stamp(text_img('16', 90), 12.56, 1.56, 0.20, 0.12, sd, cl=(1,))     # год и номер придуманы
    stamp(text_img('042', 240), 13.04, 1.63, 0.66, 0.27, sd, cl=(1,))
    stamp(Image.new('RGBA', (32, 32), (60, 66, 74, 255)), 14.05, 3.13, 2.3, 0.15, sd, cl=(1, 2))
    stamp(Image.new('RGBA', (32, 32), (178, 150, 62, 255)), 14.05, 3.04, 2.3, 0.024, sd, cl=(1, 2))
    stamp(rescue_img(), 3.60, 0.605, 0.44, 0.117, sd, rough_to=0.44); stamp(seat_tri(), 4.60, 0.46, 0.24, 0.24, sd)
    decal(None, 3.60, 0.04, 0.50, 0.05, sd, FORM, 0.70); decal(None, 11.75, 0.06, 0.60, 0.05, sd, FORM, 0.70); decal(None, 13.05, 2.72, 0.55, 0.05, sd, FORM, 0.70, cl=1)   # полосы строя (f16_07)
for sg in (1, -1):
    for ac, q_, t_ in ((8.85, 2.15, 'NO STEP'), (13.35, 2.1, 'NO STEP')):
        decal(t_, ac, sg * q_, 0.44, 0.10, 'top', DK, 0.60)
stamp(RND, 9.56, -2.85, 2.20, 0.88, 'top', along=False, alpha=0.97); stamp(RND, 9.56, 2.85, 2.20, 0.88, 'bot', along=False, alpha=0.97)    # левое крыло сверху, правое снизу: крупнее
log('надписи')
# ── обтекатель носа: темнее основы, матовее, грозозащитные штрихи (f16_01, 03, 05) ──
rad = (a < 2.02) & (cls == 0)
RAD = np.array((0.350, 0.360, 0.370), np.float32) * (0.97 + 0.06 * mott)[..., None]
rc = RAD * (1 - 0.12 * flow2)[..., None]; col[rad] = rc[rad]; rough[rad] = (0.50 + 0.06 * (mott - 0.5) + 0.06 * flow2)[rad]; metal[rad] = 0
phi = np.arctan2(x, z - 0.28)
for ang in (-2.2, -1.05, 1.05, 2.2):                           # грозозащитные штрихи: мягкие, только на широкой части, у острия линии не сходятся
    rr_ = np.maximum(np.hypot(x, z - 0.28), 0.02); dd = np.abs((phi - ang + np.pi) % (2 * np.pi) - np.pi) * rr_
    st = rad * smooth(0.016, 0.005, dd) * smooth(1.15, 1.30, a) * smooth(1.92, 1.82, a)
    col = mix(col, (0.255, 0.26, 0.27), st * 0.62); rough = rough - st * 0.05
tip = smooth(0.85, 0.48, a) * (cls == 0); col = mix(col, (0.46, 0.47, 0.48), tip * smooth(0.45, 0.6, eros) * 0.55)
# ── сопло: снаружи тёмное, внутри светлее, кольцо светлого металла у основания (f16_03, 04, 10, 11) ──
tn = fbm(1.2, 4.0, 4.0, 4, 59.0); ts = fbm(0.8, 14.0, 14.0, 3, 61.0)
noz = cls == 10
rad_v = np.stack([x, z - NOZ_Y], -1); rr0 = np.maximum(np.linalg.norm(rad_v, axis=-1), 1e-3); outw = (nx * x + nz * (z - NOZ_Y)) / rr0 > 0.15
ncol = np.array((0.205, 0.20, 0.195), np.float32) * (0.85 + 0.30 * ts)[..., None]
col[noz] = ncol[noz]; metal[noz] = 0.85; rough[noz] = np.clip(0.48 + (tn[noz] - 0.5) * 0.12, 0.35, 0.58)
ring_m = noz & (a < 13.99) & (mat == 1); rc2 = np.array((0.56, 0.54, 0.50), np.float32) * (0.9 + 0.2 * ts)[..., None]; col[ring_m] = rc2[ring_m]; metal[ring_m] = 1.0; rough[ring_m] = 0.40
ins_ = noz & (~outw); iv = (0.60 + 0.12 * ts) * (1 - 0.42 * smooth(14.25, 14.65, a)) * (0.85 + 0.15 * tn); col[ins_] = (np.stack([iv * 1.0, iv * 0.95, iv * 0.86], -1))[ins_]; metal[ins_] = 0.6; rough[ins_] = 0.62
pipe = (cls == 0) & (mat == 1); col[pipe] = np.array((0.26, 0.25, 0.24), np.float32) * (0.8 + 0.4 * tn[pipe])[..., None]; metal[pipe] = 1.0; rough[pipe] = 0.5
fan_ = cls == 13; col[fan_] = np.array((0.30, 0.30, 0.31), np.float32); metal[fan_] = 0.9; rough[fan_] = 0.5
log('сопло')
# ── материалы без краски обшивки ──
def solid(m, c, r, me=0.0, nz_=0.08):
    col[m] = np.array(c, np.float32) * (1 - nz_ / 2 + nz_ * fine[m])[..., None]; rough[m] = r; metal[m] = me
solid(mat == 10, (0.20, 0.21, 0.22), 0.85)              # швы
solid(mat == 2, (0.030, 0.030, 0.032), 0.9)             # нутро
solid(mat == 4, (0.045, 0.045, 0.048), 0.86)            # резина
solid(mat == 5, (0.20, 0.205, 0.21), 0.62, 0, 0.16)     # кабина
bore_ = (mat == 5) & (cls == 0); col[bore_] = np.array((0.14, 0.135, 0.13), np.float32); rough[bore_] = 0.7
# нутро канала: светлое, в глубине темнее; ниши шасси светлые; выемка контейнера над соплом жёлтая (f16_01, 05, 10)
duct_m = mat == 11; duct_col = np.array((0.30, 0.285, 0.24), np.float32); solid(duct_m, duct_col, 0.68, 0, 0.14)
in_duct = duct_m & (a < 8.0) & (z < 0.55) & (ax < 0.70)
col[in_duct] *= (0.24 + 0.76 * smooth(6.2, 4.6, a[in_duct]))[..., None]   # у кромки тёплый серый, вглубь плавно темнеет; без затенения в цвете, иначе в тени сплошной чёрный
bay_ = duct_m & (~in_duct) & (a < 13.0); col[bay_] = np.array((0.62, 0.62, 0.60), np.float32) * (0.45 + 0.55 * ao2[bay_])[..., None]; rough[bay_] = 0.6
pod_h = duct_m & (a > 13.0); col[pod_h] = np.array((0.72, 0.60, 0.26), np.float32) * (0.25 + 0.75 * smooth(13.72, 14.0, a[pod_h]))[..., None]; rough[pod_h] = 0.55
solid((cls == 14) & (mat == 11), (0.33, 0.315, 0.265), 0.6)  # разделитель канала
col[(cls == 14) & (mat == 11)] *= (0.30 + 0.70 * smooth(7.4, 4.8, a[(cls == 14) & (mat == 11)]))[..., None]
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
gd = smooth(-0.40, -1.50, z) * gr_ * (0.45 + 0.55 * smooth(0.36, 0.66, gm1)); col = mix(col, (0.215, 0.195, 0.165), gd * 0.62 * (painted | g_s)); rough = rough + gd * 0.22 * painted
for ac_, xc_, zc_, rw_ in ((5.17, 0.0, -1.395, 0.225), (9.03, 1.30, -1.29, 0.33), (9.03, -1.30, -1.29, 0.33)):
    rd_ = np.hypot(a - ac_, z - zc_); md_ = gr_ & (rd_ < rw_ * 0.68) & (np.abs(x - xc_) < 0.18)
    dust = smooth(rw_ * 0.68, rw_ * 0.10, rd_) * (0.45 + 0.55 * smooth(0.34, 0.62, gm2)) * md_; col = mix(col, (0.115, 0.10, 0.085), dust * 0.72); rough = rough + dust * 0.15
g_e = smooth(0.985, 0.90, bev) * painted * smooth(0.50, 0.62, gm2); col = mix(col, (0.26, 0.255, 0.24), g_e * 0.8); rough = rough + g_e * 0.05
tyr = mat == 4; rt_ = smooth(0.40, 0.68, gm2) * tyr; col[tyr] = np.array((0.070, 0.070, 0.072), np.float32); col = mix(col, (0.165, 0.158, 0.145), rt_ * 0.50); col = mix(col, (0.20, 0.19, 0.17), smooth(-1.25, -1.60, z) * tyr * 0.45); rough[tyr] = 0.90
col[gr_] *= (0.50 + 0.50 * smooth(0.15, 0.95, ao2[gr_]))[..., None]
door_in = (cls == 7) & (nz > 0.2) & (z < 0.6); solid(door_in, (0.66, 0.66, 0.64), 0.55, 0, 0.14)
h_m = (cls == 14) & (mat == 1); solid(h_m, (0.27, 0.28, 0.29), 0.52, 0.25, 0.12)   # антенны, щупы, упоры: тёмные, без зеркала
c9 = cls == 9
m_can = c9 & (mat == 1); solid(m_can, (0.44, 0.45, 0.46), 0.38, 1.0)
c9_s = c9 & (mat == 0); col[c9_s] = np.array((0.235, 0.245, 0.26), np.float32) * (0.92 + 0.16 * mott[c9_s])[..., None]; rough[c9_s] = 0.46
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
occ = np.where(in_duct | ((cls == 14) & (mat == 11)), np.maximum(occ, 0.25 + 0.60 * smooth(6.4, 4.6, a)), occ)     # канал не проваливается в чёрное в ангаре
bleed([col, rough, metal, occ, nn], cov)
def lift(arr): return (np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)
Image.fromarray(lift(col)[::-1]).save(f'{OUT}/f16_color.png', compress_level=1)
Image.fromarray(lift(nn * 0.5 + 0.5)[::-1]).save(f'{OUT}/f16_normal.png', compress_level=1)
orm = np.stack([occ, rough, metal], -1); Image.fromarray(lift(orm)[::-1]).save(f'{OUT}/f16_orm.png', compress_level=1)
pm = skin_m & cov & (cls == 0) & (a > 2.2) & (a < 13)
print('средний цвет обшивки sRGB', (col[pm].mean(0) * 255).round(1), 'шероховатость', round(float(rough[pm].mean()), 3), 'доля голого металла', round(float((metal[pm] > 0.5).mean()), 4))
log('сохранено', OUT)
