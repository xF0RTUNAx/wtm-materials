# paint.py - краска JAS 39 Gripen C (с образца Typhoon) из данных gbuf.py: цвет (только краска и грязь, без света), нормали (заклёпки, крышки, шагрень), карта блеска glTF (R затенение, G шероховатость, B металл). Без Blender: /usr/bin/python3 paint.py
# GR_TEX=2048|4096, GR_OUT=<папка>, GR_TOP, GR_LOW=r,g,b (0…1, sRGB), GR_FIN
import math, os, re, site, sys, time
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__)); DAT = os.path.join(HERE, '_проба')
S = int(os.environ.get('GR_TEX', '2048')); OUT = os.environ.get('GR_OUT', DAT); os.makedirs(OUT, exist_ok=True)
def envc(n, d): return np.array([float(v) for v in os.environ.get(n, d).split(',')], np.float32)
TOPC = envc('GR_TOP', '0.405,0.425,0.448'); LOWC = envc('GR_LOW', '0.565,0.580,0.595'); FINC = envc('GR_FIN', '0.400,0.420,0.443')     # два серых: тёмный верх, светлый низ (gripen_02, 14)
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f} с]', *a, flush=True)
L2 = 7.345
pos = np.load(f'{DAT}/gb_pos_{S}.npy'); nor = np.load(f'{DAT}/gb_nor_{S}.npy'); idd = np.load(f'{DAT}/gb_id_{S}.npy'); aob = np.load(f'{DAT}/gb_ao_{S}.npy')
import json
ATLAS = json.load(open(f'{DAT}/uv.json', encoding='utf-8'))['atlas_m']; PXM = 0.985 * S / ATLAS; DS = 1.0 / PXM
mat = np.round(idd[..., 0] * 16).astype(np.int8); cls = np.round(idd[..., 1] * 32).astype(np.int8); cov = idd[..., 2] > 0.5
a = (L2 - pos[..., 1]).astype(np.float32); x = pos[..., 0].astype(np.float32); z = pos[..., 2].astype(np.float32); ax = np.abs(x)
nx, ny, nz = nor[..., 0], nor[..., 1], nor[..., 2]
ao1, ao2, bev = aob[..., 0], aob[..., 1], aob[..., 2]
log('данные загружены', S, 'плотность', round(PXM), 'пикс/м')
src = open(os.path.join(HERE, 'gripen_detail.py'), encoding='utf-8').read()
import types
_WLEf = lambda x_: (6.55 + (x_ - 0.98) * 1.3959) if x_ < 2.95 else (9.16 + (x_ - 2.95) * 1.075)
ns = {'g': types.SimpleNamespace(WLE=_WLEf, HING=lambda x_: 11.28 + (x_ - 1.30) * 0.0075)}; exec(src[src.index('def rrect_line(a0'):src.index('RINGS_BODY = ')], ns); TOP, BOT, SIDE = ns['TOP_LINES'], ns['BOT_LINES'], ns['SIDE_PANELS']
RINGS_FORE = (1.87,); RINGS_NAC = (13.40,)


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
SCHEME = os.environ.get('GR_SCHEME', '')
# ── основа: светло-серый, снизу чуть светлее; киль и руль темнее (typhoon_01, 03) ──
finm = (((cls == 0) & (z > 1.30) & (a > 10.4) & (ax < 0.12)) | (cls == 2))
U = smooth(-0.30, 0.30, nz) * (0.75 + 0.25 * smooth(-0.1, 0.5, z)); U = np.where(cls == 8, 0.9, U)
BASE = LOWC * (1 - U[..., None]) + TOPC * U[..., None]
sh_ = (smooth(-0.15, -0.75, nz) * ((cls <= 8) & (mat == 0)))[..., None]; BASE = BASE * (1 - sh_) + np.array((0.80, 0.805, 0.82), np.float32) * sh_; BASE = np.where((cls == 8)[..., None] & (nz[..., None] > -0.4), BASE * 0.96, BASE)   # в игре снизу плоскость подсвечена только землёй
BASE = np.where(finm[..., None], FINC, BASE)
if SCHEME == 'harlequin':      # «Арлекин»: рисунок считается по точке самолёта, нормали и блеск свои; знаков и надписей нет; солнце в игре поднимает светлое: цвет рисунка чуть ниже
    import harlequin_pat
    im_ = cov & (mat == 0) & ((cls <= 8) | (cls == 14)); B_ = BASE.copy(); B_[im_] = harlequin_pat.pattern(x[im_], pos[..., 1][im_], z[im_]) * float(os.environ.get('GR_HQ', '0.92')); BASE = B_; log('узор Арлекин', int(im_.sum()))
col = np.ones((S, S, 3), np.float32) * BASE; rough = np.full((S, S), 0.45, np.float32); metal = np.zeros((S, S), np.float32); height = np.zeros((S, S), np.float32)
# тон листов: границы совпадают со швами геометрии
FR = np.array([1.87, 2.55, 3.40, 5.60, 7.80, 9.40, 11.0, 12.9, 40.0], np.float32)
band = np.searchsorted(FR, a); lat = (x > 0).astype(np.int32) * 2 + (z > 0.45).astype(np.int32)
tt = rng_tab(64, 7, 0.972, 1.028); rt = rng_tab(64, 8, -0.022, 0.022); hue = rng_tab(64, 9, -0.006, 0.006)
idx = (band * 4 + lat) % 64; tone = tt[idx]; rtone = rt[idx]
WLE_ = np.where(ax < 2.95, 6.55 + (ax - 0.98) * 1.3959, 9.16 + (ax - 2.95) * 1.075); HG_ = 11.28 + (ax - 1.30) * 0.0075
sL = a - WLE_; s1 = a - (WLE_ + 0.58 - (ax - 1.7) * 0.0727); s3 = a - (HG_ - 0.20); s2 = a - (WLE_ + (HG_ - WLE_) * 0.55)
wing = (cls == 0) & (ax > 1.12) & (np.abs(z - 0.33) < 0.16)
wb = (s1 > 0).astype(np.int32) + (s2 > 0) + (s3 > 0); wr = (ax > 1.9).astype(np.int32) + (ax > 2.95) + (ax > 3.6); wi = (wb * 3 + wr) * 4 + (x > 0) * 2 + (nz > 0)
tone = np.where(wing, tt[(wi + 17) % 64], tone); rtone = np.where(wing, rt[(wi + 17) % 64], rtone)
for c_, sd in ((2, 23), (3, 25), (4, 27), (5, 29), (6, 31), (7, 33), (8, 35)):      # рули, утки, закрылки, кромка, щиток, створки: своя краска у каждой детали
    ix_ = (x > 0).astype(np.int32) + sd + (ax > 3.3) * 3 * (c_ == 4); tone = np.where(cls == c_, 1.0 + (tt[ix_ % 64] - 1.0) * 0.45, tone); rtone = np.where(cls == c_, rt[ix_ % 64], rtone)
col *= tone[..., None]; rough += rtone
col[..., 0] *= 1 + hue[idx]; col[..., 2] *= 1 - hue[idx]
# подкраски и заменённые листы: прямоугольники по плану, сверху, снизу и с бортов (мягкий край распылителя)
RS = np.random.RandomState(31); fresh = np.zeros((S, S), np.float32)
tup = nz > 0.45; tdn = nz < -0.45; tsd = np.abs(nx) > 0.45
for vm, A_, Q_, n_, qa, qb in ((tup, a, x, 9, -5.4, 5.4), (tdn, a, x, 5, -5.4, 5.4), (tsd, a, z, 5, -0.9, 0.9)):
    ids = np.nonzero((vm & (cls <= 8)).ravel())[0]; AA, QQ = A_.ravel()[ids], Q_.ravel()[ids]
    for k in range(n_):
        a0 = RS.uniform(2.4, 14.0); w = RS.uniform(0.25, 1.25); q0 = RS.uniform(qa, qb); h_ = RS.uniform(0.18, 0.8); e_ = 0.012
        d = np.minimum.reduce([AA - a0, a0 + w - AA, QQ - q0, q0 + h_ - QQ]); sel = d > -e_
        if not sel.any(): continue
        t_ = np.clip((d[sel] + e_) / (2 * e_), 0, 1); kk = RS.uniform(0.98, 1.025); cc = ids[sel]
        for ch_ in range(3): col[..., ch_].ravel()[cc] *= 1 + (kk * (1 + RS.uniform(-0.012, 0.012)) - 1) * t_
        rough.ravel()[cc] += t_ * RS.uniform(-0.03, 0.02); fresh.ravel()[cc] = np.maximum(fresh.ravel()[cc], t_)
# крышки люков: тон почти как у обшивки, чуть глаже
hatch = np.zeros((S, S), np.float32); hedge = np.full((S, S), 9.0, np.float32)
def rect_mask(A, Q, r):
    a0, a1 = min(p[0] for p in r), max(p[0] for p in r); q0, q1 = min(p[1] for p in r), max(p[1] for p in r)
    ins = (A > a0) & (A < a1) & (Q > q0) & (Q < q1); d = np.minimum.reduce([A - a0, a1 - A, Q - q0, q1 - Q]); return ins, d
top_m = nz > 0.5; bot_m = nz < -0.5; sr_m = nx > 0.45; sl_m = nx < -0.45
Hk = 0
for lst, vmask, Q in ((TOP, top_m, ax), (BOT, bot_m, ax)):
    for r in lst:
        if len(r) >= 5 and r[0] == r[-1]:
            ins, d = rect_mask(a, Q, r); ins &= vmask & (cls == 0); hatch[ins] = 1.0; hedge[ins] = np.minimum(hedge[ins], d[ins]); col[ins] *= 1.0 + 0.01 * ((Hk % 3) - 1); rough[ins] -= 0.05; Hk += 1
for r in SIDE:
    if len(r) >= 5 and r[0] == r[-1]:
        ins, d = rect_mask(a, z, r); ins &= (sr_m | sl_m) & (cls == 0); hatch[ins] = 1.0; hedge[ins] = np.minimum(hedge[ins], d[ins]); col[ins] *= 1.0 + 0.01 * ((Hk % 3) - 1); rough[ins] -= 0.05; Hk += 1
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
# кольцевые швы
for rA in RINGS_FORE:
    m = (np.abs(a - rA) < 0.08) & (cls == 0); phi = np.arctan2(x, z - 0.30) * 0.42; seamd[m] = np.minimum(seamd[m], np.abs(a[m] - rA))
    for sgn in (1, -1):
        ph = (phi[m] / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH; dr = np.hypot(dph, a[m] - rA - sgn * OFF); riv[m] = np.maximum(riv[m], np.clip(1 - dr / RV, 0, 1))
rn = np.hypot(ax, z - 0.54)
for rA in RINGS_NAC:
    m = (np.abs(a - rA) < 0.08) & (cls == 0) & (rn < 0.62); phi = np.arctan2(ax, z - 0.54) * 0.5; seamd[m] = np.minimum(seamd[m], np.abs(a[m] - rA))
    for sgn in (1, -1):
        ph = (phi[m] / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH; dr = np.hypot(dph, a[m] - rA - sgn * OFF); riv[m] = np.maximum(riv[m], np.clip(1 - dr / RV, 0, 1))
# нервюры киля и плоскостей: ряды поперёк хорды
for m, Q, st, A__ in ((finm, z, 0.50, a), (cls == 3, ax, 0.42, a), (cls == 4, ax, 0.55, a), (cls == 8, a, 0.9, x)):
    rr = (Q[m] / st) % 1.0; dq = np.minimum(rr, 1 - rr) * st; ph = (A__[m] / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH
    riv[m] = np.maximum(riv[m], np.clip(1 - np.hypot(dph, dq) / RV, 0, 1))
log('заклёпки', float((riv > 0).mean()))
# ── пятна: мазки краски, выгорание, потёки, копоть, грязь. Снизу пятна вполовину слабее, потёков почти нет ──
mott = fbm(0.55, 0.55, 0.55, 4, 1.0); fine = fbm(11.0, 11.0, 11.0, 2, 5.0); patch = fbm(1.4, 1.4, 1.4, 4, 9.0)
under = smooth(-0.15, -0.75, nz); amp = 1.0 - 0.5 * under
col *= (1 + (0.07 * (mott - 0.5) + 0.022 * (fine - 0.5)) * amp)[..., None]
# фотомаски CC0 (ambientCG, Свои/_текстуры_CC0/README.txt): неровности, царапины, подтёки - проекция по плану сверху/снизу и по борту
CC0D = os.path.join(HERE, '..', '_текстуры_CC0')
def _ld(rel):
    return np.asarray(Image.open(os.path.join(CC0D, rel)).convert('L').resize((1024, 1024), Image.BILINEAR), np.float32) / 255.0
SI3 = _ld('SurfaceImperfections003/SurfaceImperfections003_2K-JPG_Opacity.jpg'); SC3 = _ld('Scratches003/Scratches003_2K-JPG_Opacity.jpg'); SC5 = _ld('Scratches005/Scratches005_2K-JPG_Opacity.jpg'); LK = _ld('Leaking012A/Leaking012A_2K-JPG_Color.jpg')
sidev = np.abs(nx) > np.abs(nz)
def cc0(M, size, flow=False):
    Qp = np.where(sidev, -z, x); Ap = a
    if flow: u_, v_ = (Qp / size) % 1.0, (Ap / size) % 1.0           # подтёки: полосы картинки идут по потоку (сверху) и вниз (на борту)
    else: u_, v_ = (Ap / size) % 1.0, (Qp / size) % 1.0
    if flow: u_ = np.where(sidev, (Ap / size) % 1.0, u_); v_ = np.where(sidev, (-z / size) % 1.0, v_)
    return M[(v_ * 1023).astype(np.int32), (u_ * 1023).astype(np.int32)]
imp = cc0(SI3, 1.30); scrm = np.maximum(cc0(SC3, 0.90), cc0(SC5, 1.40) * 0.8); leak = 1.0 - cc0(LK, 1.60, flow=True)
col *= (1 - 0.035 * (imp - 0.5) * skin_m)[..., None]; rough += (imp - 0.5) * 0.10 * skin_m
walk = (smooth(1.2, 0.6, np.abs(a - 4.2)) * smooth(0.75, 0.45, ax) + smooth(0.9, 0.3, np.abs(a - 7.6)) * smooth(1.35, 0.95, ax)) * smooth(0.3, 0.7, nz)     # где ходят: у кабины, у корня крыла
scr_cc = smooth(0.35, 0.75, scrm) * skin_m * (0.25 + 0.75 * walk) * smooth(-0.2, 0.4, nz)
col = mix(col, BASE * 1.12, scr_cc * 0.30); rough -= scr_cc * 0.10
lk_ = smooth(0.25, 0.70, leak) * skin_m * (0.30 + 0.70 * smooth(0.0, 0.35, np.abs(nx))) * (1 - 0.8 * smooth(-0.3, -0.7, nz))
col = mix(col, (0.22, 0.225, 0.23), lk_ * 0.10); rough += lk_ * 0.05
polish = smooth(0.55, 0.72, fbm(0.9, 0.9, 0.9, 3, 13.0)); rough += (mott - 0.5) * 0.04 - polish * 0.025
sun = smooth(0.25, 0.9, nz); col = mix(col, BASE * np.array([1.06, 1.055, 1.05], np.float32), sun * smooth(0.40, 0.72, patch) * 0.14)     # выгорело сверху
stre = fbm(0.75, 11.0, 11.0, 4, 3.0); stre2 = fbm(0.42, 26.0, 26.0, 3, 17.0)
flow = smooth(0.50, 0.70, stre) * (0.35 + 0.65 * smooth(0.35, 0.70, patch)); flow2 = smooth(0.58, 0.74, stre2)
rearw = 0.45 + 0.55 * smooth(6.0, 12.5, a)
dirty = flow * rearw * np.where(nz < -0.2, 0.05, 0.26)
col = mix(col, (0.24, 0.245, 0.25), dirty * 0.06); rough += dirty * 0.04
col = mix(col, (0.17, 0.17, 0.17), flow2 * 0.010 * rearw)
oil = under * smooth(0.50, 0.72, fbm(1.0, 2.0, 2.0, 4, 23.0)) * np.where(ax > 1.5, 0.15, 1.0) * smooth(5.0, 10.0, a)
col = mix(col, (0.32, 0.32, 0.315), oil * 0.07); rough += oil * 0.08
for a0_, a1_, q0_, q1_ in ((3.62, 5.05, 0.0, 0.18), (6.95, 8.55, 0.56, 0.90)):
    m_ = smooth(a0_ - 0.10, a0_ + 0.10, a) * smooth(a1_ + 0.25, a1_ - 0.25, a) * smooth(q0_ - 0.1, q0_ + 0.1, ax) * smooth(q1_ + 0.12, q1_ - 0.12, ax) * under * smooth(0.36, 0.66, fbm(1.6, 3.0, 3.0, 3, 29.0))
    col = mix(col, (0.24, 0.235, 0.23), m_ * 0.12); rough += m_ * 0.08
# брызги от колёс (правило 10): веером назад по низу от каждой стойки, полосами по потоку
for ac_, xc_, w0_ in ((8.45, 1.12, 0.22), (8.45, -1.12, 0.22), (4.03, 0.0, 0.20)):
    da_ = a - ac_; fan_ = smooth(-0.1, 0.5, da_) * smooth(3.4, 1.0, da_) * np.exp(-((x - xc_) / (w0_ + 0.24 * np.clip(da_, 0, None))) ** 2)
    spr_ = under * fan_ * (0.30 + 0.70 * smooth(0.42, 0.70, fbm(0.55, 17.0, 17.0, 3, 61.0 + ac_ + xc_))) * (mat == 0) * (cls <= 8)
    col = mix(col, (0.255, 0.232, 0.200), spr_ * 0.17); rough += spr_ * 0.07
# за жалюзи: потёки назад
mv = smooth(13.24, 13.28, a) * smooth(13.80, 13.30, a) * smooth(0.60, 0.63, z) * smooth(0.74, 0.70, z) * (np.abs(nx) > 0.3) * (0.4 + 0.6 * flow)
col = mix(col, (0.14, 0.14, 0.14), mv * 0.35); rough += mv * 0.2
# копоть у сопел: мягкая, у основания
soot = smooth(13.0, 13.80, a) * (0.45 + 0.55 * smooth(0.28, 0.72, fbm(0.7, 2.6, 2.6, 4, 31.0))) * (np.isin(cls, (0, 6))) * (rn < 0.80) * (mat == 0)
col = mix(col, (0.12, 0.115, 0.11), soot * 0.50); rough += soot * 0.26
# наслоение у швов, заклёпки
hair = smooth(0.0085, 0.002, seamd); col *= (1 - 0.10 * hair * skin_m)[..., None]; rough += hair * 0.04 * skin_m
halo = smooth(0.07, 0.0, seamd) * smooth(0.30, 0.66, stre) * skin_m; col *= (1 - 0.025 * halo)[..., None]
stain = aft * smooth(0.38, 0.72, stre) * skin_m * (1 - 0.7 * under); col = mix(col, (0.19, 0.195, 0.20), stain * 0.09); rough += stain * 0.03
crev = smooth(0.92, 0.45, ao1) * skin_m; col = mix(col, (0.11, 0.11, 0.11), crev * 0.50); rough += crev * 0.26
body = smooth(0.15, 0.95, ao2); col *= (0.95 + 0.05 * body)[..., None]
fade = smooth(-0.7, 0.8, nz); col *= (0.96 + 0.07 * fade)[..., None]
rv_d = smooth(0.0, 0.25, riv); rv_top = smooth(0.25, 0.75, riv); col *= (1 - rv_d * 0.04 * skin_m)[..., None]; col += (rv_top * 0.008 * skin_m)[..., None]
# ── кромки: передние глаже и выцветшие, сколы до металла ──
edge = smooth(0.985, 0.90, bev) * skin_m
LE_w = smooth(0.13, 0.02, sL) * (sL > -0.03) * (wing | (cls == 4))
col = mix(col, BASE * 1.10, LE_w * 0.40); rough -= LE_w * 0.12
eros = smooth(0.46, 0.60, fbm(9.0, 9.0, 9.0, 3, 37.0))
chip = np.maximum(edge * smooth(0.52, 0.62, fbm(14.0, 14.0, 14.0, 3, 41.0)), LE_w * smooth(0.66, 0.78, eros) * 0.45)
scuff = smooth(0.030, 0.006, hedge) * smooth(0.52, 0.64, fbm(22.0, 22.0, 22.0, 3, 43.0))
scr = smooth(0.76, 0.78, fbm(5.0, 70.0, 70.0, 2, 47.0)) * smooth(0.60, 0.72, patch) * sun * 0.05
rough -= (edge * 0.14 + scuff * 0.16)
mov = np.isin(cls, (2, 3, 4, 5, 6, 7)); chip = chip * np.where(mov, 0.12, 0.55) * smooth(13.6, 12.6, a); edge = edge * np.where(mov, 0.2, 1.0)
dmg = np.clip(chip * 0.9 + scuff * 0.55 + scr * 0.6, 0, 1) * skin_m
prim = smooth(0.20, 0.42, dmg); bare = smooth(0.50, 0.88, dmg)     # краска слоями (правило 9): по краю скола светлый грунт, в глубине металл
PRIM = np.array((0.67, 0.68, 0.61), np.float32); BARE = np.array((0.60, 0.61, 0.63), np.float32)
col = mix(col, PRIM, prim * 0.55); rough += prim * 0.05
col = mix(col, BARE, bare); rough = rough * (1 - bare) + bare * (0.36 + 0.05 * fine); metal = np.maximum(metal, smooth(0.45, 0.75, bare))
log('краска')
# ── служебные надписи и полосы строя: свои, нейтральные, без опознавательных знаков и номеров части ──
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

def crown(d_, cx, cy, w, h, ink):
    """Корона из трёх зубцов на ободе (рисунок свой, упрощённый)."""
    b0 = cy + h * 0.45; b1 = cy + h * 0.18; t = cy - h * 0.50
    d_.rectangle((cx - w / 2, b1, cx + w / 2, b0), fill=ink)
    P = [(cx - w / 2, b1), (cx - w / 2, cy - h * 0.20), (cx - w * 0.30, cy - h * 0.02), (cx - w * 0.18, t + h * 0.12), (cx, cy - h * 0.10), (cx + w * 0.18, t + h * 0.12), (cx + w * 0.30, cy - h * 0.02), (cx + w / 2, cy - h * 0.20), (cx + w / 2, b1)]
    d_.polygon(P, fill=ink)
    for px in (-0.5, 0.0, 0.5): r_ = w * 0.07; qx = cx + px * w * (0.92 if px else 0); qy = (cy - h * 0.20) if px else (t + h * 0.02); d_.ellipse((qx - r_, qy - r_, qx + r_, qy + r_), fill=ink)


def roundel_img(S_=720, disk=(28, 72, 128, 255), ink=(232, 188, 30, 255)):
    """Опознавательный знак по фото (gripen_02, 07): синий круг, три жёлтые короны (две сверху, одна снизу). Рисунок свой."""
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); c = S_ / 2
    d_.ellipse((c - S_ * 0.49, c - S_ * 0.49, c + S_ * 0.49, c + S_ * 0.49), fill=disk)
    for cx, cy in ((c - S_ * 0.17, c - S_ * 0.13), (c + S_ * 0.17, c - S_ * 0.13), (c, c + S_ * 0.18)): crown(d_, cx, cy, S_ * 0.25, S_ * 0.21, ink)
    return im_


def chevron_img(t, W=600, H=200, ink=(40, 44, 50, 255)):
    """Трафарет у заборника: шеврон остриём назад и слово внутри (gripen_07)."""
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); lw = max(6, H // 16)
    d_.line([(W * 0.02, H * 0.05), (W * 0.80, H * 0.05), (W * 0.98, H * 0.5), (W * 0.80, H * 0.95), (W * 0.02, H * 0.95)], fill=ink, width=lw)
    d_.text((W * 0.42, H * 0.52), t, font=ImageFont.truetype(FNT, int(H * 0.56)), fill=ink, anchor='mm'); return im_


def arrow_img(W_=600, H_=180, ink=RED):
    im_ = Image.new('RGBA', (W_, H_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); d_.rectangle((0, H_ * 0.32, W_ * 0.66, H_ * 0.68), fill=ink); d_.polygon([(W_ * 0.60, 0), (W_, H_ / 2), (W_ * 0.60, H_)], fill=ink); return im_


RND = roundel_img(); YEL = (226, 186, 40, 255); DKI = (56, 60, 66, 255)
for sd in ('r', 'l'):
    stamp(RND, 3.85, 0.30, 0.44, 0.44, sd)                                                       # знак на борту под кабиной (gripen_07)
    stamp(text_img('281', 300, ink=DKI), 12.35, 2.28, 0.86, 0.42, sd, alpha=0.92)                # придуманный бортовой номер на киле
    stamp(chevron_img('FARA'), 4.62, 0.22, 0.42, 0.14, sd, alpha=0.86)                           # опасно у заборника
    stamp(tri_img(S_=400, ink=RED, letter=''), 3.30, 0.60, 0.11, 0.11, sd)                       # катапульта
    stamp(arrow_img(), 2.85, 0.62, 0.36, 0.10, sd, alpha=0.90)                                   # стрелка спасения
    stamp(box_text(['RESCUE'], 90, ink=RED, frame=False), 2.85, 0.53, 0.36, 0.07, sd, alpha=0.85)
    stamp(box_text(['JET INTAKE', 'DANGER'], 80, ink=RED, frame=True), 5.35, -0.02, 0.36, 0.14, sd, alpha=0.82)
    decal(None, 6.20, 0.86, 0.60, 0.045, sd, (0.62, 0.64, 0.50), 0.45)                          # полосы строя (тусклые)
    decal(None, 11.6, 1.62, 0.50, 0.045, sd, (0.62, 0.64, 0.50), 0.42)
    for ac_, zc_ in ((5.10, 0.42), (9.10, 0.78), (11.0, 0.95), (12.95, 0.82)): decal(None, ac_, zc_, 0.07, 0.035, sd, (0.85, 0.70, 0.12), 0.85)     # жёлтые метки (gripen_07, 11)
    stamp(box_text(['39-281'], 80, ink=DKI, frame=False), 10.2, 0.55, 0.40, 0.07, sd, alpha=0.80)
for sg in (1, -1):
    stamp(text_img('NO STEP', 140, ink=DKI), 5.95, sg * 1.55, 0.30, 0.07, 'top', alpha=0.80, cl=(3,))     # утки
    stamp(text_img('NO STEP', 140, ink=DKI), 11.05, sg * 2.0, 0.40, 0.08, 'top', alpha=0.75)            # перед элевонами
    stamp(box_text(['WALK'], 70, ink=DKI, frame=True), 8.0, sg * 1.20, 0.22, 0.10, 'top', alpha=0.65)
stamp(RND, 10.65, -2.95, 0.78, 0.78, 'top', along=False); stamp(RND, 10.65, 2.95, 0.78, 0.78, 'bot', along=False)
# служебные трафареты (правило 13): все вымышленные, мелкие, тёмным или красным
for sd in ('r', 'l'):
    stamp(box_text(['FUEL', 'JP-8'], 70, ink=DKI), 7.30, 0.10, 0.18, 0.11, sd, alpha=0.78)
    stamp(box_text(['HYD'], 70, ink=DKI), 9.60, 0.06, 0.11, 0.055, sd, alpha=0.78)
    stamp(box_text(['OXY'], 70, ink=(32, 108, 62, 255)), 3.55, 0.05, 0.10, 0.055, sd, alpha=0.82)
    stamp(box_text(['EARTH'], 60, ink=DKI, frame=False), 3.30, -0.06, 0.13, 0.035, sd, alpha=0.75)
    stamp(box_text(['DANGER', 'AIRBRAKE'], 60, ink=RED), 11.85, 0.47, 0.20, 0.08, sd, alpha=0.80)
    stamp(box_text(['GRIPEN 39C', 'S/N 39-281', 'EMPTY 6800 KG'], 50, ink=DKI), 3.62, 0.66, 0.16, 0.09, sd, alpha=0.72)     # табличка данных у кабины
    stamp(box_text(['BATTERY'], 60, ink=DKI), 6.60, 0.20, 0.15, 0.04, sd, alpha=0.70)
for sg in (1, -1):
    stamp(box_text(['JACK'], 70, ink=DKI), 5.90, sg * 0.24, 0.12, 0.05, 'bot', alpha=0.78)
    stamp(box_text(['LIFT'], 70, ink=DKI), 10.00, sg * 0.30, 0.12, 0.05, 'bot', alpha=0.78)
    stamp(box_text(['TIE DOWN'], 60, ink=DKI), 11.20, sg * 0.40, 0.20, 0.045, 'bot', alpha=0.75)
    stamp(box_text(['TYRE', '210 PSI'], 60, ink=DKI), 7.75, sg * 0.73, 0.16, 0.09, 'bot', alpha=0.80, cl=(7,))    # левая консоль сверху, правая снизу
log('надписи')
# ── обтекатель носа: светлее и другим тоном (typhoon_01, 07, 11) ──
rad = (a < 1.87) & (cls == 0)
RAD = np.array((0.455, 0.47, 0.48), np.float32) * (0.985 + 0.03 * mott)[..., None]
if not SCHEME: col[rad] = RAD[rad]; rough[rad] = (0.50 + 0.06 * (mott - 0.5))[rad]; metal[rad] = 0
# вершина киля темнее
tip_f = finm & (z > 3.30) & (cls == 0)
if not SCHEME: col[tip_f] *= 0.62; rough[tip_f] = 0.55
# ── хвостовая часть перед соплом и створки: потемневший металл без радуги ──
tita = (a > 13.40) & (cls == 0) & (rn < 0.60) & (mat == 0)
tn = fbm(1.2, 4.0, 4.0, 4, 59.0); ts = fbm(0.8, 14.0, 14.0, 3, 61.0)
def heat(t):
    st = np.array([0.0, 0.40, 0.72, 1.0], np.float32); p = np.array([[0.46, 0.46, 0.455], [0.42, 0.415, 0.405], [0.35, 0.34, 0.335], [0.27, 0.265, 0.265]], np.float32)
    return np.stack([np.interp(t, st, p[:, i]) for i in range(3)], -1).astype(np.float32)
t_ti = np.clip((a - 13.40) / 0.40 + (tn - 0.5) * 0.45 + (ts - 0.5) * 0.25, 0, 1)
rib_ = np.sin(np.arctan2(x, z - 0.54) * 44) > 0.0; hc = heat(t_ti) * (0.95 + 0.10 * ts)[..., None] * np.where(rib_, 1.0, 0.86)[..., None]
tw_ = smooth(13.45, 13.62, a) * smooth(0.60, 0.53, rn) * (cls == 0) * (mat == 0); col = mix(col, hc, tw_); metal = np.maximum(metal, tw_ * 0.55); rough = rough * (1 - tw_) + tw_ * np.clip(0.56 + (tn - 0.5) * 0.08, 0.48, 0.64)
noz = cls == 10
ncol = np.array((0.40, 0.385, 0.36), np.float32) * (0.96 + 0.08 * ts)[..., None]
sn = smooth(14.20, 14.69, a) * (0.8 + 0.2 * tn); ncol = ncol * (1 - 0.38 * sn)[..., None] + np.array((0.12, 0.115, 0.11), np.float32) * (0.38 * sn)[..., None]
tmp_k = (smooth(13.92, 14.15, a) * smooth(14.45, 14.25, a) * (0.6 + 0.4 * tn))[..., None]; ncol = ncol * (1 - 0.20 * tmp_k) + np.array((0.47, 0.41, 0.32), np.float32) * (0.20 * tmp_k)     # побежалость намёком: соломенный
tmp_b = (smooth(14.22, 14.38, a) * smooth(14.55, 14.42, a) * smooth(0.45, 0.65, ts))[..., None]; ncol = ncol * (1 - 0.10 * tmp_b) + np.array((0.33, 0.35, 0.42), np.float32) * (0.10 * tmp_b)
col[noz] = ncol[noz]; metal[noz] = 1.0; rough[noz] = np.clip(0.45 + (tn[noz] - 0.5) * 0.10, 0.35, 0.50)
ins_ = noz & ((nx * x + nz * (z - 0.54)) < 0);   # нутро отличает нормаль, а не радиус
iv = (0.22 + 0.10 * ts) * (1 - 0.45 * smooth(14.65, 14.0, a)); col[ins_] = (np.stack([iv * 1.0, iv * 0.97, iv * 0.93], -1))[ins_]; metal[ins_] = 0.5; rough[ins_] = 0.72
pipe = (cls == 0) & (mat == 1); col[pipe] = np.array((0.26, 0.25, 0.24), np.float32) * (0.8 + 0.4 * tn[pipe])[..., None]; metal[pipe] = 1.0; rough[pipe] = 0.5
log('металл')
# ── материалы без краски обшивки ──
def solid(m, c, r, me=0.0, nz_=0.08):
    col[m] = np.array(c, np.float32) * (1 - nz_ / 2 + nz_ * fine[m])[..., None]; rough[m] = r; metal[m] = me
solid(mat == 10, (0.25, 0.26, 0.27), 0.85)              # швы
solid(mat == 2, (0.030, 0.030, 0.032), 0.9)             # нутро
solid(mat == 4, (0.045, 0.045, 0.048), 0.86)            # резина
solid(mat == 5, (0.25, 0.26, 0.27), 0.62, 0, 0.16)      # кабина, каналы
duct = (mat == 5) & (cls != 11); deep_ = smooth(4.25, 5.6, a); col[duct] = (np.array((0.30, 0.30, 0.295), np.float32) * (1 - deep_[..., None]) + np.array((0.065, 0.068, 0.072), np.float32) * deep_[..., None])[duct] * (0.82 + 0.36 * mott[duct])[..., None]; rough[duct] = 0.7     # канал: у кромки тёплый серый, в глубине тёмный
col[duct] *= (0.45 + 0.55 * ao2[duct])[..., None]
b_c = cls == 13; col[b_c] = np.array((0.05, 0.05, 0.055), np.float32); metal[b_c] = 0.3; rough[b_c] = 0.5
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
gd = smooth(-0.55, -1.60, z) * gr_ * (0.45 + 0.55 * smooth(0.36, 0.66, gm1)); col = mix(col, (0.215, 0.195, 0.165), gd * 0.62 * (painted | g_s)); rough = rough + gd * 0.22 * painted
# тормозная пыль на дисках и ступицах
# тормозная пыль на дисках и ступицах
for ac_, xc_, zc_, rw_ in ((4.03, 0.135, -1.41, 0.21), (4.03, -0.135, -1.41, 0.21), (8.45, 1.12, -1.22, 0.40), (8.45, -1.12, -1.22, 0.40)):
    rd_ = np.hypot(a - ac_, z - zc_); md_ = gr_ & (rd_ < rw_ * 0.68) & (np.abs(x - xc_) < 0.20)
    dust = smooth(rw_ * 0.68, rw_ * 0.10, rd_) * (0.45 + 0.55 * smooth(0.34, 0.62, gm2)) * md_; col = mix(col, (0.115, 0.10, 0.085), dust * 0.72); rough = rough + dust * 0.15
# сколы и потёртости кромок
g_e = smooth(0.985, 0.90, bev) * painted * smooth(0.50, 0.62, gm2); col = mix(col, (0.26, 0.255, 0.24), g_e * 0.8); rough = rough + g_e * 0.05
# резина: пыль на боковине, потёртая дорожка
tyr = mat == 4; rt_ = smooth(0.40, 0.68, gm2) * tyr; col[tyr] = np.array((0.070, 0.070, 0.072), np.float32); col = mix(col, (0.165, 0.158, 0.145), rt_ * 0.50); col = mix(col, (0.20, 0.19, 0.17), smooth(-1.25, -1.62, z) * tyr * 0.45); rough[tyr] = 0.90
# надписи на боковинах шин (правило 11): выпуклые буквы по кругу, марка вымышленная
def _tyre_strip(t, W=2400, H=120):
    im_ = Image.new('L', (W, H), 0); d_ = ImageDraw.Draw(im_); f_ = ImageFont.truetype(FNT, int(H * 0.8)); tw = d_.textlength(t, font=f_)
    for k in range(2): d_.text((W * (0.25 + 0.5 * k), H / 2), t, font=f_, fill=255, anchor='mm')
    return np.asarray(im_, np.float32) / 255.0
TSTR = _tyre_strip('NORDRUN AERO  26 PLY  TUBELESS')
for ac_, xc_, zc_, rw_, ww_ in ((4.03, 0.135, -1.41, 0.21, 0.13), (4.03, -0.135, -1.41, 0.21, 0.13), (8.45, 1.12, -1.22, 0.40, 0.18), (8.45, -1.12, -1.22, 0.40, 0.18)):
    rr_ = np.hypot(a - ac_, z - zc_); side_ = (mat == 4) & (np.abs(nx) > 0.55) & (np.abs(x - xc_) > ww_ * 0.25) & (np.abs(x - xc_) < ww_ * 0.75)
    r0_, r1_ = rw_ * 0.66, rw_ * 0.86; m_ = side_ & (rr_ > r0_) & (rr_ < r1_)
    if m_.any():
        ang_ = (np.arctan2(z[m_] - zc_, a[m_] - ac_) / (2 * np.pi)) % 1.0; vv_ = 1 - (rr_[m_] - r0_) / (r1_ - r0_)
        L_ = TSTR[np.clip((vv_ * TSTR.shape[0]).astype(int), 0, TSTR.shape[0] - 1), np.clip((ang_ * TSTR.shape[1]).astype(int), 0, TSTR.shape[1] - 1)]
        c_ = col[m_]; col[m_] = c_ + (np.array((0.13, 0.13, 0.13), np.float32) - c_) * (L_ * 0.55)[..., None]; rough[m_] = rough[m_] - L_ * 0.12
# под самолётом стойки в тени: в игре тени самолёта на них нет
col[gr_] *= (0.50 + 0.50 * smooth(0.15, 0.95, ao2[gr_]))[..., None]
door_in = (cls == 7) & (nz > 0.2) & (z < 0.1); solid(door_in, (0.66, 0.66, 0.64), 0.55, 0, 0.14)
h_m = (cls == 14) & (mat == 1); solid(h_m, (0.36, 0.38, 0.40), 0.5, 0.5, 0.12)
c9 = (cls == 9)                                         # рама фонаря: краска обшивки
m_can = c9 & (mat == 1); solid(m_can, (0.44, 0.45, 0.46), 0.38, 1.0)
if SCHEME: solid(c9 & (mat == 0), (0.035, 0.04, 0.07), 0.42)      # рама фонаря тёмная
duct_m = (mat == 5) & (cls != 11); rough = np.where(duct_m, 0.85, rough); metal = np.where(duct_m, 0.0, metal)
rough = np.where(cls == 10, np.maximum(rough, 0.62), rough)      # лепестки сопла: ровный блеск
under_r = smooth(-0.1, -0.55, nz) * (mat == 0) * (cls <= 8); rough = rough + (np.maximum(rough, 0.58) - rough) * under_r      # снизу матовее: блеск от земли даёт пятна
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
height += scr * -0.0002
height = np.where(a < 1.87, height * 0.25, height)
gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * DS); gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / (2 * DS)
nn = np.stack([-gx, -gy, np.ones_like(gx)], -1); nn /= np.linalg.norm(nn, axis=-1, keepdims=True)
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
occ = np.where(duct_m, np.minimum(np.maximum(occ, 0.45), 1.0 - 0.45 * smooth(4.25, 5.6, a)), occ)      # в глубине канала меньше отражений неба: плавно темнеет, а не сплошной чёрный
occ = np.where(cls == 7, np.maximum(occ, 0.8), occ); col = col                                      # створки запекаются закрытыми: затенение отпечатком не нужно
bleed([col, rough, metal, occ, nn], cov)
def lift(arr): return (np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)
Image.fromarray(lift(col)[::-1]).save(f'{OUT}/gripen_color.png', compress_level=1)
Image.fromarray(lift(nn * 0.5 + 0.5)[::-1]).save(f'{OUT}/gripen_normal.png', compress_level=1)
orm = np.stack([occ, rough, metal], -1); Image.fromarray(lift(orm)[::-1]).save(f'{OUT}/gripen_orm.png', compress_level=1)
pm = skin_m & cov & (cls == 0) & (a > 3) & (a < 13)
print('средний цвет обшивки sRGB', (col[pm].mean(0) * 255).round(1), 'шероховатость', round(float(rough[pm].mean()), 3), 'доля голого металла', round(float((metal[pm] > 0.5).mean()), 4))
log('сохранено', OUT)
