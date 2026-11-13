# paint.py - краска МиГ-23БН из данных gbuf.py: цвет (краска и грязь, без света), нормали, карта блеска glTF (R затенение, G шероховатость, B металл). Без Blender: /usr/bin/python3 -I paint.py
# MG_TEX=2048|4096, MG_OUT=<папка>, MG_SCHEME=su|gdr|worn, MG_WEAR=1.0. Схемы по фото Mark: su - 06/07 (песок, два зелёных, коричневый, низ голубой), gdr - гамма 01/02 (без эмблем ГДР, только красные звёзды),
# worn - сильно выцветший и облезлый как 05. Пиксели фото не используются: рисунок, знаки и надписи нарисованы здесь, номера придуманы. Основа - paint.py МиГ-21бис.
import json, math, os, site, sys, time
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image, ImageDraw, ImageFont
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__)); DAT = os.path.join(HERE, '_проба')
S = int(os.environ.get('MG_TEX', '2048')); SCHEME = os.environ.get('MG_SCHEME', 'su'); OUT = os.environ.get('MG_OUT', os.path.join(DAT, SCHEME)); os.makedirs(OUT, exist_ok=True)
KW = float(os.environ.get('MG_WEAR', '1.8' if SCHEME == 'worn' else '1.0'))
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f} с]', *a, flush=True)
L2 = 8.40; GROUND = -1.92; PIV = (9.55, 1.70); DFILE = math.radians(float(os.environ.get('MG_SWEEP', '0')));   # поворот консолей в файле от 16° (Mark 2026-11-13: в игре крылья разложены, файл при 16°)
A_INT = 5.56; A_TAIL = 15.97
pos = np.load(f'{DAT}/gb_pos_{S}.npy'); nor = np.load(f'{DAT}/gb_nor_{S}.npy'); idd = np.load(f'{DAT}/gb_id_{S}.npy'); aob = np.load(f'{DAT}/gb_ao_{S}.npy')
ATLAS = json.load(open(f'{DAT}/uv.json', encoding='utf-8'))['atlas_m']; PXM = 0.985 * S / ATLAS; DS = 1.0 / PXM
mat = np.round(idd[..., 0] * 16).astype(np.int8); cls = np.round(idd[..., 1] * 32).astype(np.int8); cov = idd[..., 2] > 0.5
px_, py_, pz_ = pos[..., 0].copy(), pos[..., 1].copy(), pos[..., 2].copy(); nx, ny, nz = nor[..., 0].copy(), nor[..., 1].copy(), nor[..., 2].copy()
# консоли и их механизация в файле сложены (72°): переводим в положение 16°, рисунок и знаки ложатся как на раскрытом крыле
wg = np.isin(cls, (4, 5)); sxw = np.where(px_ >= 0, 1.0, -1.0); th = sxw * DFILE; c_, s_ = np.cos(th), np.sin(th)
dx = px_ - sxw * PIV[1]; dy = py_ - (L2 - PIV[0])
px_ = np.where(wg, sxw * PIV[1] + dx * c_ - dy * s_, px_); py_ = np.where(wg, (L2 - PIV[0]) + dx * s_ + dy * c_, py_)
nx0 = nx.copy(); nx = np.where(wg, nx0 * c_ - ny * s_, nx); ny = np.where(wg, nx0 * s_ + ny * c_, ny)
a = (L2 - py_).astype(np.float32); x = px_.astype(np.float32); z = pz_.astype(np.float32); ax = np.abs(x)
ao1, ao2, bev = aob[..., 0], aob[..., 1], aob[..., 2]
ao1 = np.where(cls == 7, 1.0, ao1); ao2 = np.where(cls == 7, np.maximum(ao2, 0.8), ao2)     # створки запекались закрытыми, сквозь них проходят стойки
log('данные загружены', S, 'плотность', round(PXM), 'пикс/м', 'схема', SCHEME, 'износ', KW)
sys.path.insert(0, HERE); import mg_lines as FL


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


def fbm(fa, fx_, fz_, octv=3, seed=0.0, X=None):
    r = 0.0; w = 0.5; tot = 0.0
    xx = x if X is None else X
    pa, px, pz = a * fa, xx * fx_, z * fz_
    wa = vnoise(pa * 0.7 + seed + 11.3, px * 0.7 - seed, pz * 0.7 + 5.1) - 0.5; wb = vnoise(pa * 0.7 - 7.7, px * 0.7 + seed + 3.3, pz * 0.7 - seed) - 0.5
    pa, px, pz = pa + wa * 0.9, px + wb * 0.9, pz + (wa - wb) * 0.6
    for i in range(octv):
        qa = R3[0, 0] * pa + R3[0, 1] * px + R3[0, 2] * pz; qx = R3[1, 0] * pa + R3[1, 1] * px + R3[1, 2] * pz; qz = R3[2, 0] * pa + R3[2, 1] * px + R3[2, 2] * pz
        pa, px, pz = qa * 2.03, qx * 2.03, qz * 2.03
        r = r + w * vnoise(qa + seed + i * 3.1, qx - seed * 0.7, qz + seed * 1.3 + i); tot += w; w *= 0.5
    return r / tot


def rng_tab(n, seed, lo, hi): return np.random.RandomState(seed).uniform(lo, hi, n).astype(np.float32)
def mix(c, col_, t): t = np.clip(t, 0, 1)[..., None]; return c * (1 - t) + np.asarray(col_, np.float32) * t
def C(r, g, b): return np.array((r, g, b), np.float32) / 255.0


PAINTED = (0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 13, 16)
skin_m = (mat == 0) & np.isin(cls, PAINTED)
# ── палитры (sRGB): по средним цветам фото 06/07 и 02 (k-средних), на 3-5 % светлее, чтобы не темнее фото ──
if SCHEME == 'gdr':
    PAL = [C(136, 142, 112), C(102, 103, 78), C(88, 82, 60), C(138, 95, 70)]; WGT = [0.0, 0.035, -0.005, 0.03]; UND = C(184, 200, 210)
    RADC = C(118, 106, 94); NUMT, NUMI, NUME = '571', (196, 38, 32, 255), None; SEED = 23.0
elif SCHEME == 'worn':
    PAL = [C(150, 140, 92), C(140, 86, 62), C(176, 160, 116), C(92, 88, 64)]; WGT = [0.01, 0.01, 0.02, 0.0]; UND = C(176, 178, 168)
    RADC = C(132, 128, 112); NUMT, NUMI, NUME = '52', (150, 46, 36, 255), (220, 214, 196, 255); SEED = 41.0
else:
    PAL = [C(198, 172, 132), C(124, 138, 96), C(80, 92, 66), C(138, 106, 76)]; WGT = [-0.02, 0.01, 0.045, -0.005]; UND = C(170, 188, 196)
    RADC = C(96, 122, 92); NUMT, NUMI, NUME = '38', (200, 36, 30, 255), (236, 236, 228, 255); SEED = 7.0
KB, KS = {'su': (1.04, 0.90), 'gdr': (1.13, 1.0), 'worn': (1.06, 0.92)}[SCHEME]                 # яркость и насыщенность: среднее верха не темнее фото (07: яркость 120, 02: 108)
PAL = [np.clip((p_ * KS + p_.mean() * (1 - KS)) * KB, 0, 1) for p_ in PAL]
# ── камуфляж: крупные пятна четырёх цветов с мягкой границей распылителя (5-8 см), рисунок по точке самолёта, левый и правый борт разные; низ голубой с волнистой границей ──
F = [fbm(0.50, 0.50, 0.58, 3, SEED + 13.7 * i) + WGT[i] for i in range(4)]
Fs = np.stack(F, 0); o_ = np.argsort(-Fs, 0); k1, k2 = o_[0], o_[1]; f1 = np.take_along_axis(Fs, k1[None], 0)[0]; f2 = np.take_along_axis(Fs, k2[None], 0)[0]
PALA = np.stack(PAL); e_ = (0.5 * (1 - smooth(0.0, 0.010, f1 - f2)))[..., None]
BASE = PALA[k1] * (1 - e_) + PALA[k2] * e_
log('доли цветов камуфляжа', [round(float(((k1 == i) & cov & np.isin(cls, (0, 1, 4)) & (nz > -0.2)).mean() / max(1e-6, (cov & np.isin(cls, (0, 1, 4)) & (nz > -0.2)).mean())), 2) for i in range(4)])
dem = -0.30 + (fbm(0.9, 0.9, 0.9, 3, 77.0) - 0.5) * 0.30                     # граница низа волной
LOW = smooth(dem + 0.04, dem - 0.04, nz) * np.isin(cls, PAINTED)
LOW = np.where(np.isin(cls, (8, 13)), 1.0, LOW)                                  # пилоны и гребень - цветом низа
UND = np.clip(UND * 1.16, 0, 1)                                                  # низ: износ его притемняет, к фото (02: 178/195/205) - светлее
BASE = BASE * (1 - LOW[..., None]) + UND * LOW[..., None]
rad = (cls == 0) & (a < 2.30); RAD_EDGE = smooth(2.26, 2.30, a)                  # радиопрозрачный конус носа
diel = (cls == 1) & (z > 2.40)                                                   # законцовка киля
DIEL = C(70, 78, 66) if SCHEME != 'worn' else C(96, 96, 84)
col = BASE.astype(np.float32).copy(); rough = np.full((S, S), 0.50, np.float32); metal = np.zeros((S, S), np.float32); height = np.zeros((S, S), np.float32)
METAL0 = 0.02
# ── тон панелей: границы по швам ──
FR = np.array(FL.RINGS + (40.0,), np.float32); band = np.searchsorted(FR, a); lat = (x > 0).astype(np.int32) * 2 + (z > 0.3).astype(np.int32)
tt = rng_tab(64, 7, 0.968, 1.032); rt = rng_tab(64, 8, -0.05, 0.05); hue = rng_tab(64, 9, -0.010, 0.010)
idx = (band * 4 + lat) % 64; tone = tt[idx]; rtone = rt[idx]
wb_ = np.clip(((ax - 1.70) / 0.60).astype(np.int32), 0, 12); wi = (wb_ * 2 + (x > 0)) * 2 + (nz > 0)
tone = np.where(cls == 4, tt[(wi + 17) % 64], tone); rtone = np.where(cls == 4, rt[(wi + 17) % 64], rtone)
for c_, sd in ((1, 21), (2, 23), (3, 25), (5, 27), (6, 31), (7, 33), (8, 35), (13, 37), (9, 39)):
    ix_ = (x > 0).astype(np.int32) + sd; tone = np.where(cls == c_, 1.0 + (tt[ix_ % 64] - 1.0) * 0.6, tone); rtone = np.where(cls == c_, rt[ix_ % 64], rtone)
col *= tone[..., None]; rough += rtone; col[..., 0] *= 1 + hue[idx]; col[..., 2] *= 1 - hue[idx]
# подкраски и заменённые листы: другой оттенок той же краски
RS = np.random.RandomState(31); fresh = np.zeros((S, S), np.float32)
tup = nz > 0.45; tsd = np.abs(nx) > 0.45
for vm, A_, Q_, n_, qa, qb in ((tup, a, x, 22, -6.5, 6.5), (tsd, a, z, 12, -0.5, 1.4)):
    ids = np.nonzero((vm & skin_m).ravel())[0]; AA, QQ = A_.ravel()[ids], Q_.ravel()[ids]
    for k in range(n_):
        a0 = RS.uniform(2.0, 15.0); w = RS.uniform(0.25, 1.10); q0 = RS.uniform(qa, qb); h_ = RS.uniform(0.18, 0.70); e2 = 0.05
        d = np.minimum.reduce([AA - a0, a0 + w - AA, QQ - q0, q0 + h_ - QQ]); sel = d > -e2
        if not sel.any(): continue
        t_ = np.clip((d[sel] + e2) / (2 * e2), 0, 1); kk = RS.uniform(0.955, 1.045) if SCHEME == 'worn' else RS.uniform(0.975, 1.025); cc = ids[sel]
        for ch_ in range(3): col[..., ch_].ravel()[cc] *= 1 + (kk * (1 + RS.uniform(-0.015, 0.015)) - 1) * t_
        rough.ravel()[cc] += t_ * RS.uniform(-0.09, 0.05); fresh.ravel()[cc] = np.maximum(fresh.ravel()[cc], t_)
# крышки люков
hatch = np.zeros((S, S), np.float32); hedge = np.full((S, S), 9.0, np.float32)
def rect_mask(A, Q, r):
    a0, a1 = min(p[0] for p in r), max(p[0] for p in r); q0, q1 = min(p[1] for p in r), max(p[1] for p in r)
    ins = (A > a0) & (A < a1) & (Q > q0) & (Q < q1); d = np.minimum.reduce([A - a0, a1 - A, Q - q0, q1 - Q]); return ins, d
top_m = nz > 0.5; bot_m = nz < -0.5; sr_m = nx > 0.45; sl_m = nx < -0.45; hull = cls == 0
Hk = 0
for lst, vmask, Q in ((FL.TOP_LINES, top_m, ax), (FL.BOT_LINES, bot_m, ax), (FL.SIDE_PANELS, sr_m | sl_m, z)):
    for r in lst:
        if len(r) >= 5 and r[0] == r[-1]:
            ins, d = rect_mask(a, Q, r); ins &= vmask & hull; hatch[ins] = 1.0; hedge[ins] = np.minimum(hedge[ins], d[ins]); col[ins] *= 1.010 + 0.010 * ((Hk % 3) - 1); rough[ins] -= 0.03; Hk += 1
log('панели и крышки')
# ── заклёпки и близость швов ──
seamd = np.full((S, S), 9.0, np.float32); riv = np.zeros((S, S), np.float32); aft = np.zeros((S, S), np.float32)
PITCH = 0.050; RV = 0.0072; OFF = 0.024
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
for L_ in FL.TOP_LINES: lines(L_, a, ax, top_m & hull)
for L_ in FL.BOT_LINES: lines(L_, a, ax, bot_m & hull)
for L_ in FL.SIDE_PANELS: lines(L_, a, z, (sr_m | sl_m) & hull)
for L_ in FL.WING_LINES: lines(L_, a, ax, (cls == 4) & (np.abs(nz) > 0.5))
for rA in FL.RINGS:
    m = (np.abs(a - rA) < 0.08) & hull & (ax < 1.0); phi = np.arctan2(x, z - 0.1) * 0.62; seamd[m] = np.minimum(seamd[m], np.abs(a[m] - rA))
    for sgn in (1, -1):
        ph = (phi[m] / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH; dr = np.hypot(dph, a[m] - rA - sgn * OFF); riv[m] = np.maximum(riv[m], np.clip(1 - dr / RV, 0, 1))
for c_, Q, st in ((1, z, 0.42), (3, ax, 0.45), (5, ax, 0.50), (13, z, 0.30)):
    m = (cls == c_); rr = (Q[m] / st) % 1.0; dq = np.minimum(rr, 1 - rr) * st; ph = (a[m] / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH
    riv[m] = np.maximum(riv[m], np.clip(1 - np.hypot(dph, dq) / RV, 0, 1))
log('заклёпки', round(float((riv > 0).mean()), 4))
# ── пятна, выгорание, потёки, копоть, грязь ──
mott = fbm(0.55, 0.55, 0.55, 4, 1.0); fine = fbm(11.0, 11.0, 11.0, 2, 5.0); patch = fbm(1.4, 1.4, 1.4, 4, 9.0)
low_ = smooth(-0.05, -0.5, nz); col *= (1 + (mott - 0.5) * (0.14 - 0.08 * low_) + (fine - 0.5) * 0.025)[..., None]
polish = smooth(0.55, 0.72, fbm(0.9, 0.9, 0.9, 3, 13.0)); rough += (mott - 0.5) * 0.10 - polish * 0.07
sun = smooth(0.25, 0.9, nz); col = mix(col, BASE * np.array([1.08, 1.07, 1.05], np.float32), sun * smooth(0.40, 0.72, patch) * 0.30)
stre = fbm(0.75, 11.0, 11.0, 4, 3.0); stre2 = fbm(0.42, 26.0, 26.0, 3, 17.0)
flow = smooth(0.50, 0.70, stre) * (0.35 + 0.65 * smooth(0.35, 0.70, patch)); flow2 = smooth(0.58, 0.74, stre2)
rearw = 0.45 + 0.55 * smooth(5.0, 14.0, a)
dirty = flow * rearw * 0.62 * (1 - 0.75 * smooth(-0.05, -0.5, nz))
col = mix(col, (0.20, 0.195, 0.18), dirty * 0.11); rough += dirty * 0.12; rough += flow2 * 0.04
under = smooth(-0.15, -0.75, nz); oil = under * smooth(0.46, 0.68, fbm(1.0, 5.0, 5.0, 4, 23.0))
col = mix(col, (0.30, 0.27, 0.22), oil * 0.10); rough -= oil * 0.08
for a0_, a1_, q0_, q1_ in ((9.6, 11.4, 0.0, 0.62), (3.9, 5.2, 0.0, 0.22), (12.5, 15.0, 0.0, 0.40)):          # вокруг ниш шасси и лючков снизу: гидравлика
    m_ = smooth(a0_ - 0.10, a0_ + 0.10, a) * smooth(a1_ + 0.45, a1_ - 0.10, a) * smooth(q0_ - 0.1, q0_ + 0.1, ax) * smooth(q1_ + 0.12, q1_ - 0.12, ax) * under * smooth(0.36, 0.66, fbm(1.6, 7.0, 7.0, 3, 29.0))
    col = mix(col, (0.20, 0.19, 0.17), m_ * 0.16); rough += m_ * 0.10
soot = smooth(14.2, 15.9, a) * np.isin(cls, (0, 3, 13)) * (0.45 + 0.55 * smooth(0.28, 0.72, fbm(0.7, 2.6, 2.6, 4, 31.0))) * 0.45          # копоть у сопла
col = mix(col, (0.11, 0.105, 0.10), soot * 0.55); rough += soot * 0.26
hair = smooth(0.0125, 0.0035, seamd); col *= (1 - 0.08 * hair * skin_m)[..., None]; rough += hair * 0.05 * skin_m
halo = smooth(0.05, 0.0, seamd) * smooth(0.30, 0.66, stre) * skin_m; col *= (1 - 0.035 * halo)[..., None]
stain = aft * smooth(0.45, 0.78, stre) * skin_m * smooth(-0.3, 0.1, nz); col = mix(col, (0.15, 0.14, 0.12), stain * 0.45); rough += stain * 0.16
crev = smooth(0.70, 0.30, ao1) * skin_m; col = mix(col, (0.11, 0.105, 0.10), crev * 0.55); rough += crev * 0.18
body_ = smooth(0.15, 0.95, ao2); col *= (0.88 + 0.12 * body_)[..., None]; col *= (0.96 + 0.04 * smooth(0.45, 0.95, ao1))[..., None]
fade = smooth(-0.7, 0.8, nz); col *= (0.96 + 0.07 * fade)[..., None]
rv_d = smooth(0.0, 0.5, riv); rv_top = smooth(0.4, 0.9, riv); col *= (1 - rv_d * 0.10 * skin_m)[..., None]; col += (rv_top * 0.010 * skin_m)[..., None]
# ── кромки и сколы ──
edge = smooth(0.985, 0.90, bev) * skin_m
LEW = (PIV[0] - 0.59 + (ax - PIV[1]) * math.tan(math.radians(16.0))).astype(np.float32); da_le = a - LEW
LE_w = smooth(0.13, 0.02, da_le) * smooth(-0.02, 0.02, da_le) * np.isin(cls, (4, 5))
col = mix(col, BASE * 1.10, LE_w * 0.40); rough -= LE_w * 0.12
eros = smooth(0.46, 0.60, fbm(9.0, 9.0, 9.0, 3, 37.0))
chip = np.maximum(edge * smooth(0.52, 0.62, fbm(14.0, 14.0, 14.0, 3, 41.0)), LE_w * smooth(0.66, 0.78, eros) * 0.40)
scuff = smooth(0.020, 0.006, hedge) * smooth(0.60, 0.70, fbm(22.0, 22.0, 22.0, 3, 43.0)) * 0.5
scr = smooth(0.74, 0.77, fbm(5.0, 70.0, 70.0, 2, 47.0)) * smooth(0.52, 0.70, patch) * (0.4 + 0.6 * sun) * 0.34
rough -= (edge * 0.12 + scuff * 0.14)
mov = np.isin(cls, (2, 5, 6, 7)); chip = chip * np.where(mov, 0.18, 0.80); edge = edge * np.where(mov, 0.2, 1.0)
bare = np.clip(chip * 0.9 + scuff * 0.55 + scr * 0.6, 0, 1) * skin_m * (1.0 if SCHEME != 'worn' else 1.6)
bare = bare * np.where(np.isin(cls, (1, 3, 5)), 0.30, 1.0)
BARE = np.array((0.60, 0.61, 0.63), np.float32)
col = mix(col, BARE, bare); rough = rough * (1 - bare) + bare * (0.36 + 0.05 * fine); metal = np.maximum(metal, smooth(0.45, 0.75, bare))
# ── износ (как на МиГ-21: дождевые потёки, выцветание, пятна грунта с металлом, масло от лючков и по низу, пыль, натоптанный наплыв, копоть пушки и сопла, вмятины); worn - сильнее (05) ──
pnt = skin_m & (cls != 7)
side_ = smooth(0.35, 0.75, np.abs(nx)) * pnt
rain = smooth(0.50, 0.70, fbm(9.0, 9.0, 0.50, 4, 101.0)) * side_ * (0.35 + 0.65 * smooth(0.42, 0.66, fbm(0.9, 0.9, 0.9, 3, 102.0)))
col = mix(col, (0.15, 0.14, 0.12), rain * 0.11 * KW); rough += rain * 0.10 * KW
lum_ = col.mean(-1, keepdims=True); faded = sun * smooth(0.42, 0.70, fbm(0.8, 0.8, 0.8, 4, 103.0)) * pnt
col = mix(col, (col * 0.55 + lum_ * 0.45) * 1.12 + 0.015, np.clip(faded * 0.48 * KW, 0, 0.95)); rough += faded * 0.08 * KW
pn_ = fbm(2.6, 2.6, 2.6, 4, 107.0); th_p = 0.735 if SCHEME != 'worn' else 0.700
prim = smooth(th_p, th_p + 0.025, pn_) * pnt * (1 - smooth(-0.2, -0.6, nz) * 0.5); core = smooth(th_p + 0.055, th_p + 0.070, pn_) * pnt
PRIM = (0.60, 0.63, 0.36) if SCHEME != 'worn' else (0.62, 0.56, 0.40); col = mix(col, PRIM, np.clip(prim * 0.55 * KW, 0, 0.85) * (0.6 + 0.4 * fine)); rough += prim * 0.10 * KW; col = mix(col, (0.55, 0.55, 0.53), np.clip(core * 0.80 * KW, 0, 1)); metal = np.maximum(metal, np.clip(core * 0.85 * KW, 0, 1)); rough = rough * (1 - core * 0.5) + core * 0.5 * 0.38
drip = aft * smooth(0.30, 0.70, fbm(0.6, 16.0, 16.0, 3, 111.0)) * pnt; col = mix(col, (0.10, 0.09, 0.075), drip * 0.40 * KW); rough -= drip * 0.10 * KW
und_ = smooth(-0.25, -0.75, nz) * pnt; ostr = smooth(0.55, 0.74, fbm(0.45, 20.0, 20.0, 4, 113.0)) * und_ * smooth(4.0, 10.0, a); col = mix(col, (0.11, 0.10, 0.085), ostr * 0.26 * KW); rough -= ostr * 0.14 * KW
dust = smooth(0.55, 0.95, nz) * pnt * smooth(0.40, 0.70, fbm(1.7, 1.7, 1.7, 4, 115.0)); col = mix(col, (0.47, 0.44, 0.38), dust * 0.16 * KW); rough += dust * 0.14 * KW
wroot = pnt * sun * (cls == 0) * smooth(0.80, 0.95, ax) * smooth(1.70, 1.40, ax) * smooth(7.6, 8.0, a) * smooth(10.6, 10.2, a) * smooth(0.36, 0.62, fbm(3.2, 3.2, 3.2, 3, 117.0)); col = mix(col, (0.30, 0.30, 0.30), wroot * 0.32 * KW); rough += wroot * 0.10
gsoot = smooth(6.6, 7.0, a) * smooth(9.4, 7.4, a) * smooth(-0.40, -0.62, z) * (ax < 0.36) * pnt * (0.5 + 0.5 * smooth(0.3, 0.7, fbm(0.6, 9.0, 9.0, 3, 119.0))); col = mix(col, (0.06, 0.058, 0.055), gsoot * 0.62 * KW); rough += gsoot * 0.2
tsoot = smooth(13.8, 15.9, a) * np.isin(cls, (0, 3, 13)) * skin_m * (0.4 + 0.6 * smooth(0.30, 0.70, fbm(0.5, 7.0, 7.0, 4, 121.0))); col = mix(col, (0.075, 0.07, 0.065), tsoot * 0.40 * KW); rough += tsoot * 0.16 * KW
if SCHEME == 'worn':                                                             # 05: краска облезает пятнами до грунта и старого слоя, верх выгорел почти до белёсого
    peel = smooth(0.62, 0.66, fbm(1.9, 1.9, 1.9, 4, 131.0)) * pnt * (0.4 + 0.6 * sun) * (0.5 + 0.5 * fine); col = mix(col, (0.66, 0.60, 0.46), peel * 0.45); rough += peel * 0.10
    old = smooth(0.66, 0.70, fbm(1.2, 1.2, 1.2, 4, 133.0)) * pnt * (1 - LOW); col = mix(col, (0.58, 0.30, 0.22), old * 0.45)
DENT = -smooth(0.66, 0.74, fbm(3.4, 3.4, 3.4, 3, 123.0)) * 0.0022 * pnt
log('краска')
# ── знаки и надписи: свои, номера придуманы, эмблем ГДР нет ──
FNT = '/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf'; FNB = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
MARKS = []
def _mark(name, ins, A_, side):
    ys, xs = np.nonzero(ins); on = A_ > 0.25
    if not on.any(): return
    ys, xs = ys[on], xs[on]; Q_ = x[ys, xs] if side in ('top', 'bot') else z[ys, xs]; MARKS.append((name, side, float(a[ys, xs].min()), float(a[ys, xs].max()), float(Q_.min()), float(Q_.max())))
def sidemask(side): return (nz > 0.35, x) if side == 'top' else (nz < -0.35, x) if side == 'bot' else (nx > 0.35, z) if side == 'r' else (nx < -0.35, z)
def decal(text, ac, qc, W_, H_, side, col_, alpha=0.82, cl=(0,)):
    wp, hp = 512, max(32, int(512 * H_ / W_)); im_ = Image.new('L', (wp, hp), 0); dr = ImageDraw.Draw(im_)
    f_ = ImageFont.truetype(FNT, int(hp * 0.92)); tw = dr.textlength(text, font=f_); f_ = ImageFont.truetype(FNT, max(8, int(hp * 0.92 * min(1.0, wp / max(tw, 1)))))
    dr.text((wp / 2, hp / 2), text, font=f_, fill=255, anchor='mm'); D_ = np.asarray(im_, np.float32) / 255.0
    vm, Q_ = sidemask(side); ins = vm & (np.abs(a - ac) < W_ / 2) & (np.abs(Q_ - qc) < H_ / 2) & np.isin(cls, cl) & (mat == 0)
    if not ins.any(): return
    u_ = (a[ins] - ac) / W_ + 0.5; v_ = 0.5 - (Q_[ins] - qc) / H_
    if side == 'r': u_ = 1 - u_
    A_ = D_[np.clip((v_ * hp).astype(int), 0, hp - 1), np.clip((u_ * wp).astype(int), 0, wp - 1)] * alpha * (0.72 + 0.28 * smooth(0.35, 0.6, fine[ins]))
    _mark(f'{text} {ac:.2f},{qc:.2f}', ins, A_, side); c_ = np.asarray(col_, np.float32); col[ins] = col[ins] * (1 - A_[..., None]) + c_ * A_[..., None]; rough[ins] += A_ * -0.05
def stamp(im_, ac, qc, W_, H_, side, along=True, alpha=0.92, rough_to=None, cl=(0,)):
    """Картинка на обшивку. along: ширина вдоль корпуса; иначе ширина вдоль размаха, верх картинки к носу."""
    A0 = np.asarray(im_, np.float32) / 255.0; hp, wp = A0.shape[:2]; vm, Q_ = sidemask(side)
    ins = vm & ((np.abs(a - ac) < W_ / 2) & (np.abs(Q_ - qc) < H_ / 2) if along else (np.abs(Q_ - qc) < W_ / 2) & (np.abs(a - ac) < H_ / 2)) & (mat == 0) & np.isin(cls, cl)
    if not ins.any(): log('НЕ ЛЁГ знак', ac, qc, side); return
    if along:
        u_ = (a[ins] - ac) / W_ + 0.5; v_ = 0.5 - (Q_[ins] - qc) / H_
        if side == 'r': u_ = 1 - u_
    else:
        u_ = (Q_[ins] - qc) / W_ + 0.5; v_ = (a[ins] - ac) / H_ + 0.5
        if side == 'bot': u_ = 1 - u_
    du, dv = 0.25 * DS / W_, 0.25 * DS / H_; S_ = 0.0
    for su, sv in ((-1, -1), (1, -1), (-1, 1), (1, 1), (0, 0)):
        S_ = S_ + A0[np.clip(((v_ + sv * dv) * hp).astype(int), 0, hp - 1), np.clip(((u_ + su * du) * wp).astype(int), 0, wp - 1)]
    S_ = S_ / 5.0; al = S_[:, 3] * alpha * (0.94 + 0.06 * smooth(0.30, 0.62, fine[ins])) * (1 - 0.35 * bare[ins]) * (1 - 0.30 * faded[ins] * min(KW, 2.0) / 2)
    S_[:, :3] = np.where(S_[:, 3:4] > 1e-3, S_[:, :3] / np.maximum(S_[:, 3:4], 1e-3), 0.0)
    if SCHEME == 'worn': S_[:, :3] = S_[:, :3] * 0.80 + S_[:, :3].mean(-1, keepdims=True) * 0.20 + 0.04
    _mark(f'картинка {ac:.2f},{qc:.2f}', ins, al, side); col[ins] = col[ins] * (1 - al[..., None]) + S_[:, :3] * al[..., None]; rough[ins] = rough[ins] * (1 - al) + (0.44 if rough_to is None else rough_to) * al
def _star_pts(cx, cy, R): return [(cx + (R if i % 2 == 0 else R * 0.382) * math.cos(-math.pi / 2 + i * math.pi / 5), cy + (R if i % 2 == 0 else R * 0.382) * math.sin(-math.pi / 2 + i * math.pi / 5)) for i in range(10)]
WHT = (234, 234, 228, 255); REDC = (194, 34, 30, 255); ORG = (214, 92, 40, 255)
def star_img(S_=900, red=REDC, edge=WHT):
    """Красная звезда с белой и красной окантовкой (06, 07); worn - оранжевая с белой (05). Нарисована здесь."""
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); c = S_ / 2
    for R_, c_ in ((S_ * 0.495, red), (S_ * 0.455, edge), (S_ * 0.405, red)): d_.polygon(_star_pts(c, c * 1.04, R_), fill=c_)
    return im_
def num_img(t, ink, edge, H=320):
    f_ = ImageFont.truetype(FNB, int(H * 0.86)); tmp = ImageDraw.Draw(Image.new('L', (8, 8))); bb = tmp.textbbox((0, 0), t, font=f_); W = bb[2] - bb[0] + 60
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(im_).text((W / 2, H / 2), t, font=f_, fill=ink, anchor='mm', **({'stroke_width': 9, 'stroke_fill': edge} if edge else {})); return im_
def arrow_img(W=720, H=180, ink=(214, 176, 44, 255), rev=False):
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); y0, y1, x1 = H * 0.28, H * 0.72, W * 0.74; P_ = [(4, y0), (x1, y0), (x1, 4), (W - 4, H / 2), (x1, H - 4), (x1, y1), (4, y1)]
    d_.polygon(P_, fill=ink, outline=(30, 30, 30, 255)); d_.line(P_ + [P_[0]], fill=(30, 30, 30, 255), width=6); return im_.transpose(Image.FLIP_LEFT_RIGHT) if rev else im_
def bar_img(W=600, H=60, ink=REDC): return Image.new('RGBA', (W, H), ink)
SIGN = star_img(red=ORG) if SCHEME == 'worn' else star_img()
NUM = num_img(NUMT, NUMI, NUME)
for sd in ('r', 'l'):
    stamp(SIGN, 14.25, 1.38, 0.82, 0.82, sd, cl=(1, 2), alpha=0.97)                                       # звезда на киле в центре площади (Mark: ближе к центру)
    if SCHEME == 'gdr': stamp(NUM, 3.30, -0.06, 0.95, 0.34, sd, alpha=0.95, cl=(0,))                     # номер на носу (02)
    else: stamp(NUM, 6.45, 0.12, 0.62, 0.44, sd, alpha=0.95, cl=(0,))                                   # номер на боку заборника (06, 07)
    stamp(arrow_img(rev=(sd == 'l')), 5.05, 0.47, 0.42, 0.10, sd, alpha=0.95, rough_to=0.46, cl=(0,))   # знак спасения под фонарём
    stamp(bar_img(), 4.05, 0.20, 0.30, 0.035, sd, alpha=0.9, cl=(0,)); stamp(bar_img(), 12.40, 0.20, 0.40, 0.035, sd, alpha=0.9, cl=(0,))
    decal(u'ЗАПРАВКА', 9.30, 0.52, 0.34, 0.05, sd, (0.85, 0.85, 0.80) if SCHEME != 'gdr' else (0.80, 0.78, 0.70), 0.70)
    decal(u'ЗАЗЕМЛЕНИЕ', 11.20, -0.08, 0.30, 0.045, sd, (0.88, 0.86, 0.80), 0.66)
# Mark: знаки на крыльях ближе к центру - звезда в центре площади открытой части консоли (при 16°: размах 3,9 м от оси, середина хорды)
for sg in (1, -1):
    stamp(SIGN, 10.53, sg * 3.90, 0.95, 0.95, 'top', along=False, alpha=0.97, cl=(4, 5)); stamp(SIGN, 10.53, sg * 3.90, 0.95, 0.95, 'bot', along=False, alpha=0.97, cl=(4, 5))
    decal(u'НЕ СТАНОВИТЬСЯ', 10.75, sg * 2.20, 0.70, 0.08, 'top', (0.62, 0.10, 0.08), 0.75, cl=(4,))
    decal(u'НЕ СТАНОВИТЬСЯ', 9.95, sg * 1.45, 0.62, 0.075, 'top', (0.62, 0.10, 0.08), 0.75, cl=(0,))
_bad = 0
for i_, m1 in enumerate(MARKS):
    for m2 in MARKS[i_ + 1:]:
        if m1[1] == m2[1] and m1[2] - 0.04 < m2[3] and m2[2] - 0.04 < m1[3] and m1[4] - 0.04 < m2[5] and m2[4] - 0.04 < m1[5]: _bad += 1; log(f'НАЛОЖЕНИЕ {m1[1]}: {m1[0]} и {m2[0]}')
log(f'знаков {len(MARKS)}, наложений с запасом 4 см: {_bad}')
# ── радиопрозрачные: конус носа и законцовка киля ──
radm = rad & (mat == 0); rc = RADC * (0.94 + 0.12 * mott)[..., None]
col[radm] = col[radm] * RAD_EDGE[radm][..., None] + rc[radm] * (1 - RAD_EDGE[radm])[..., None]; rough[radm] = (0.48 + 0.08 * (mott - 0.5))[radm]; metal[radm] = 0
col[diel & (mat == 0)] = (DIEL * (0.92 + 0.16 * mott[diel & (mat == 0)])[..., None]); rough[diel] = 0.52
# ── сопло: снаружи жаропрочный металл с цветами побежалости, внутри тёмное ──
tn = fbm(1.2, 4.0, 4.0, 4, 59.0); ts = fbm(0.8, 14.0, 14.0, 3, 61.0)
noz = cls == 10; rr0 = np.maximum(np.hypot(x, z), 1e-3); outw = (nx * x + nz * z) / rr0 > 0.15
ncol = np.array((0.52, 0.50, 0.47), np.float32) * (0.85 + 0.30 * ts)[..., None]; heat = smooth(15.9, 16.25, a) * (0.6 + 0.4 * tn)
ncol = mix(ncol, (0.36, 0.30, 0.34), heat * 0.35); ncol = mix(ncol, (0.18, 0.17, 0.16), smooth(0.45, 0.75, tn) * 0.35)
col[noz] = ncol[noz]; metal[noz] = 0.85; rough[noz] = np.clip(0.50 + (tn[noz] - 0.5) * 0.12, 0.40, 0.66)
ins_ = noz & (~outw); iv = (0.13 + 0.06 * ts); col[ins_] = (np.stack([iv, iv * 0.96, iv * 0.92], -1))[ins_]; metal[ins_] = 0.5; rough[ins_] = 0.74
log('сопло')
# ── материалы без краски обшивки ──
def solid(m, c, r, me=0.0, nz_=0.08):
    col[m] = np.array(c, np.float32) * (1 - nz_ / 2 + nz_ * fine[m])[..., None]; rough[m] = r; metal[m] = me
solid(mat == 10, (0.20, 0.21, 0.22), 0.85)
solid(mat == 2, (0.030, 0.030, 0.032), 0.9)
solid(mat == 4, (0.045, 0.045, 0.048), 0.86)
solid(mat == 5, (0.24, 0.47, 0.45), 0.62, 0, 0.14)                               # кабина бирюзовая, как у советских МиГов
solid((mat == 5) & (cls == 9), (0.20, 0.38, 0.37), 0.66, 0, 0.12)               # изнанка колпака
solid(mat == 6, (0.42, 0.36, 0.26), 0.92, 0, 0.2); solid(mat == 8, (0.30, 0.28, 0.21), 0.9, 0, 0.14); solid(mat == 7, (0.018, 0.038, 0.032), 0.12, 0, 0.0)
hs = ((pos[..., 0] + pos[..., 1] + pos[..., 2]) / 0.035) % 1.0 > 0.5
solid(mat == 9, (0.74, 0.60, 0.06), 0.42); col[(mat == 9) & hs] = np.array((0.035, 0.035, 0.035), np.float32)
solid(mat == 12, (0.70, 0.08, 0.06), 0.15); solid(mat == 13, (0.10, 0.62, 0.24), 0.15); solid(mat == 14, (0.85, 0.85, 0.80), 0.15)
duct_m = mat == 11; lip_d = a - A_INT; solid(duct_m, (0.62, 0.62, 0.60), 0.66, 0, 0.12)
in_duct = duct_m & (a > A_INT - 0.6) & (a < 8.8) & (ax > 0.45); col[in_duct] *= (0.22 + 0.78 * smooth(1.8, 0.0, lip_d[in_duct]))[..., None]
bay_ = duct_m & (~in_duct); col[bay_] = C(150, 156, 132) * (0.45 + 0.55 * ao2[bay_])[..., None]; rough[bay_] = 0.62                # ниши: зелёно-серый грунт
door_in = (cls == 7) & (mat == 0) & (nz > 0.2); col[door_in] = C(150, 156, 132) * (0.85 + 0.2 * mott[door_in])[..., None]
mm = (mat == 1) & (cls == 11); solid(mm, (0.46, 0.47, 0.48), 0.38, 1.0)
gr_ = cls == 12                                                                  # шасси: светло-серая краска, хромированный шток, тёмная сталь, резина, грязь; диски зелёные (советские)
g_p = gr_ & (mat == 0); g_c = gr_ & (mat == 1); g_s = gr_ & (mat == 8); g_d = gr_ & (mat == 5)
gm1 = fbm(2.4, 2.4, 2.4, 4, 91.0); gm2 = fbm(18.0, 18.0, 18.0, 3, 93.0); gst = fbm(1.0, 16.0, 2.2, 4, 87.0); gst2 = fbm(0.7, 34.0, 1.3, 3, 89.0)
solid(g_p, (0.62, 0.63, 0.62), 0.58, 0, 0.10); solid(g_c, (0.50, 0.50, 0.49), 0.28, 0.9, 0.08); solid(g_s, (0.145, 0.142, 0.14), 0.58, 0.75, 0.14)
solid(g_d, (0.22, 0.42, 0.24), 0.55, 0, 0.12); solid(gr_ & (mat == 9), (0.60, 0.56, 0.40), 0.28, 0, 0.1); solid(gr_ & (mat == 2), (0.05, 0.048, 0.046), 0.72, 0, 0.14)
painted = g_p | g_d; col[painted] *= (0.84 + 0.30 * gm1[painted] + 0.06 * gm2[painted])[..., None]
oil_ = smooth(0.46, 0.68, gst) * (0.5 + 0.5 * smooth(0.40, 0.70, gst2)); col = mix(col, (0.15, 0.125, 0.095), oil_ * 0.55 * (painted | g_c)); rough = rough + oil_ * 0.20 * painted - oil_ * 0.10 * g_c
gd = smooth(-0.70, -1.80, z) * gr_ * (0.45 + 0.55 * smooth(0.36, 0.66, gm1)); col = mix(col, (0.215, 0.195, 0.165), gd * 0.60 * (painted | g_s)); rough = rough + gd * 0.22 * painted
g_e = smooth(0.985, 0.90, bev) * painted * smooth(0.50, 0.62, gm2); col = mix(col, (0.30, 0.30, 0.28), g_e * 0.8)
tyr = mat == 4; rt_ = smooth(0.40, 0.68, gm2) * tyr; col[tyr] = np.array((0.070, 0.070, 0.072), np.float32); col = mix(col, (0.165, 0.158, 0.145), rt_ * 0.50); col = mix(col, (0.20, 0.19, 0.17), smooth(-1.50, -1.88, z) * tyr * 0.45); rough[tyr] = 0.90
col[gr_] *= (0.50 + 0.50 * smooth(0.15, 0.95, ao2[gr_]))[..., None]
h_m = (cls == 14) & (mat == 1); solid(h_m, (0.27, 0.28, 0.29), 0.52, 0.25, 0.12)
m_can = (cls == 9) & (mat == 1); solid(m_can, (0.44, 0.45, 0.46), 0.38, 1.0)
gun = (cls == 14) & (mat == 2); col[gun] = np.array((0.06, 0.06, 0.065), np.float32); metal[gun] = 0.6; rough[gun] = 0.5
rough = np.clip(rough, 0.08, 0.97); metal = np.clip(metal, 0, 1)
for c_ in range(17):
    m_ = (cls == c_) & cov
    if m_.sum() > 500: print('деталь', c_, 'цвет', (col[m_].mean(0) * 255).round(0), 'G', round(float(rough[m_].mean()), 2), 'B', round(float(metal[m_].mean()), 2))
col = np.clip(col, 0, 1)
log('материалы')
# ── высота и нормали ──
shag = fbm(150.0, 150.0, 150.0, 2, 73.0) if S >= 4096 else fbm(70.0, 70.0, 70.0, 2, 73.0)
height += (shag - 0.5) * 0.00018 * skin_m
wav = fbm(1.6, 1.6, 1.6, 2, 79.0); height += (wav - 0.5) * 0.007 * skin_m
height += smooth(0.1, 0.8, riv) * 0.0019 * skin_m; height += smooth(0.0, 0.075, seamd) * 0.0044 * (seamd < 8) * skin_m; height -= smooth(0.010, 0.0, seamd) * 0.0016 * skin_m
height += (fbm(1.1, 1.1, 1.1, 3, 109.0) - 0.5) * 0.010 * skin_m + DENT
ins_h = hedge < 8; height += smooth(0.0, 0.010, hedge) * 0.0005 * ins_h; height += scr * -0.0002
if SCHEME == 'worn': height += peel * 0.00025
gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * DS); gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / (2 * DS)
nn = np.stack([-gx, -gy, np.ones_like(gx)], -1); nn /= np.linalg.norm(nn, axis=-1, keepdims=True)
solidm = np.isin(mat, (2, 10, 7, 9, 11, 12, 13, 14)) | np.isin(cls, (10, 11, 12, 14))
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
occ = np.where(in_duct, 0.20 + 0.30 * smooth(1.8, 0.0, lip_d), occ)
bleed([col, rough, metal, occ, nn], cov)
def lift(arr): return (np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)
Image.fromarray(lift(col)[::-1]).save(f'{OUT}/mig23_color.png', compress_level=1)
Image.fromarray(lift(nn * 0.5 + 0.5)[::-1]).save(f'{OUT}/mig23_normal.png', compress_level=1)
orm = np.stack([occ, rough, metal], -1); Image.fromarray(lift(orm)[::-1]).save(f'{OUT}/mig23_orm.png', compress_level=1)
pm = skin_m & cov & (cls == 0) & (a > 2.5) & (a < 14.5)
up_ = pm & (LOW < 0.1)
cu_ = col[up_].mean(0) * 255; print('средний цвет обшивки sRGB', (col[pm].mean(0) * 255).round(1), 'верх и борта', cu_.round(1), 'яркость верха', round(float(0.3 * cu_[0] + 0.59 * cu_[1] + 0.11 * cu_[2]), 1), 'шероховатость', round(float(rough[pm].mean()), 3), 'доля голого металла', round(float((metal[pm] > 0.5).mean()), 4))
log('сохранено', OUT)
