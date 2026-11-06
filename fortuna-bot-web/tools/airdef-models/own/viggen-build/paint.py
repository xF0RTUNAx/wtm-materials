# paint.py - краска Saab AJS 37 Viggen из данных gbuf.py: цвет (только краска и грязь, без света), нормали, карта блеска glTF (R затенение, G шероховатость, B металл). Без Blender: /usr/bin/python3 paint.py
# VG_TEX=2048|4096, VG_OUT=<папка>, VG_SIL=r,g,b (0…1, sRGB), VG_MET=металличность
import math, os, re, site, sys, time
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__)); DAT = os.path.join(HERE, '_проба')
S = int(os.environ.get('VG_TEX', '2048')); OUT = os.environ.get('VG_OUT', DAT); os.makedirs(OUT, exist_ok=True)
def envc(n, d): return np.array([float(v) for v in os.environ.get(n, d).split(',')], np.float32)
SIL = envc('VG_SIL', '0.66,0.67,0.68'); MET = float(os.environ.get('VG_MET', '0.72'))
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f} с]', *a, flush=True)
L2 = 7.635
pos = np.load(f'{DAT}/gb_pos_{S}.npy'); nor = np.load(f'{DAT}/gb_nor_{S}.npy'); idd = np.load(f'{DAT}/gb_id_{S}.npy'); aob = np.load(f'{DAT}/gb_ao_{S}.npy')
import json
ATLAS = json.load(open(f'{DAT}/uv.json', encoding='utf-8'))['atlas_m']; PXM = 0.985 * S / ATLAS; DS = 1.0 / PXM
mat = np.round(idd[..., 0] * 16).astype(np.int8); cls = np.round(idd[..., 1] * 32).astype(np.int8); cov = idd[..., 2] > 0.5
a = (L2 - pos[..., 1]).astype(np.float32); x = pos[..., 0].astype(np.float32); z = pos[..., 2].astype(np.float32); ax = np.abs(x)
nx, ny, nz = nor[..., 0], nor[..., 1], nor[..., 2]
ao1, ao2, bev = aob[..., 0], aob[..., 1], aob[..., 2]
log('данные загружены', S, 'плотность', round(PXM), 'пикс/м')
src = open(os.path.join(HERE, 'viggen_detail.py'), encoding='utf-8').read()
ns = {}; exec(src[src.index('def rrect_line(a0'):src.index('RINGS_BODY = ')], ns); TOP, BOT, SIDE = ns['TOP_LINES'], ns['BOT_LINES'], ns['SIDE_PANELS']
RINGS_FORE = (1.52,); RINGS_NAC = ()


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
SCHEME = os.environ.get('VG_SCHEME', '')
# ── основа: серебристый металл (01, 02, 05, 06, 07): листы разного тона и блеска, без зеркальной чистоты ──
finm = (cls == 0) & (z > 0.90) & (a > 9.3) & (ax < 0.10) | (cls == 2)
BASE = np.ones((S, S, 3), np.float32) * SIL; BASE = np.where((cls == 8)[..., None], SIL * 0.80, BASE)
sh_ = (smooth(-0.15, -0.75, nz) * ((cls <= 8) & (mat == 0)))[..., None]; BASE = BASE * (1 + 0.06 * sh_)
col = np.ones((S, S, 3), np.float32) * BASE; rough = np.full((S, S), 0.40, np.float32); metal = (np.full((S, S), MET, np.float32) * (mat == 0)).astype(np.float32); height = np.zeros((S, S), np.float32)
# ── листы: каждый со своим тоном, оттенком и блеском; границы совпадают с линиями клёпки ──
tt = rng_tab(512, 7, 0.972, 1.028); rt = rng_tab(512, 8, -0.05, 0.05); hue = rng_tab(512, 9, -0.006, 0.006); mt = rng_tab(512, 10, -0.05, 0.05)
FR = np.array([1.52, 2.30, 3.50, 4.90, 6.20, 7.40, 8.60, 9.90, 11.0, 12.4, 13.42, 40.0], np.float32)
ang = np.arctan2(x, z + 0.10); ANG_N = 10; band = np.searchsorted(FR, a); ab = np.floor((ang + np.pi) / (2 * np.pi) * ANG_N).astype(np.int32); idx = (band * ANG_N + ab) % 512
WLE_ = np.interp(ax, [0.90, 1.12, 2.75, 5.30], [7.62, 7.89, 9.65, 13.55]).astype(np.float32); HG_ = 13.82 - (ax - 1.00) * 0.09639
sL = a - WLE_; wing = (cls == 0) & (ax > 1.25) & (z < -0.30)
WX = np.array([1.75, 2.35, 2.96, 3.55, 4.15, 4.75], np.float32); WA = np.array([9.0, 10.0, 11.0, 12.0, 12.85], np.float32); wc = (np.searchsorted(WX, ax) * 7 + np.searchsorted(WA, a) * 53 + (x > 0) * 101 + (nz > 0) * 211 + 17) % 512; idx = np.where(wing, wc, idx)
can = (cls == 0) & (ax > 1.15) & (z > -0.20) & (a > 4.6) & (a < 8.0) & (ax < 2.8); cc_ = (np.searchsorted(np.array([1.7, 2.2], np.float32), ax) * 11 + np.searchsorted(np.array([6.0, 6.8], np.float32), a) * 41 + (x > 0) * 97 + (nz > 0) * 151 + 29) % 512; idx = np.where(can, cc_, idx)
FZ = np.array([1.35, 1.85, 2.35, 2.85], np.float32); fc = (np.searchsorted(FZ, z) * 13 + np.searchsorted(np.array([12.0, 12.8], np.float32), a) * 37 + (x > 0) * 79 + 31) % 512; idx = np.where(finm, fc, idx)
tone = tt[idx]; rtone = rt[idx]; mtone = mt[idx]
for c_, sd in ((2, 23), (4, 27), (7, 33), (8, 35)):
    ix_ = (np.round(ax * 2).astype(np.int32) + sd) % 512; tone = np.where(cls == c_, 1.0 + (tt[ix_] - 1.0) * 0.7, tone); rtone = np.where(cls == c_, rt[ix_], rtone); mtone = np.where(cls == c_, mt[ix_] * 0.7, mtone)
col *= tone[..., None]; rough += rtone; metal = np.clip(metal + mtone * (mat == 0), 0, 1)
col[..., 0] *= 1 + hue[idx]; col[..., 2] *= 1 - hue[idx]
# подкраски и заменённые листы: прямоугольники по плану, сверху, снизу и с бортов (мягкий край распылителя)
RS = np.random.RandomState(31); fresh = np.zeros((S, S), np.float32)
tup = nz > 0.45; tdn = nz < -0.45; tsd = np.abs(nx) > 0.45
for vm, A_, Q_, n_, qa, qb in ((tup, a, x, 10, -5.0, 5.0), (tdn, a, x, 7, -5.0, 5.0), (tsd, a, z, 5, -0.8, 0.9)):
    ids = np.nonzero((vm & (cls <= 8)).ravel())[0]; AA, QQ = A_.ravel()[ids], Q_.ravel()[ids]
    for k in range(n_):
        a0 = RS.uniform(2.4, 13.0); w = RS.uniform(0.25, 1.1); q0 = RS.uniform(qa, qb); h_ = RS.uniform(0.18, 0.7); e_ = 0.012
        d = np.minimum.reduce([AA - a0, a0 + w - AA, QQ - q0, q0 + h_ - QQ]); sel = d > -e_
        if not sel.any(): continue
        t_ = np.clip((d[sel] + e_) / (2 * e_), 0, 1); kk = RS.uniform(0.975, 1.02); cc = ids[sel]
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
    m = (np.abs(a - rA) < 0.08) & (cls == 0); phi = np.arctan2(x, z - 0.15) * 0.42; seamd[m] = np.minimum(seamd[m], np.abs(a[m] - rA))
    for sgn in (1, -1):
        ph = (phi[m] / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH; dr = np.hypot(dph, a[m] - rA - sgn * OFF); riv[m] = np.maximum(riv[m], np.clip(1 - dr / RV, 0, 1))
rn = np.hypot(x, z + 0.30)
for rA in RINGS_NAC:
    m = (np.abs(a - rA) < 0.08) & (cls == 0) & (rn < 0.82); phi = np.arctan2(x, z - 0.02) * 0.7; seamd[m] = np.minimum(seamd[m], np.abs(a[m] - rA))
    for sgn in (1, -1):
        ph = (phi[m] / PITCH) % 1.0; dph = np.minimum(ph, 1 - ph) * PITCH; dr = np.hypot(dph, a[m] - rA - sgn * OFF); riv[m] = np.maximum(riv[m], np.clip(1 - dr / RV, 0, 1))
# нервюры киля и плоскостей: ряды поперёк хорды
# линии клёпки листов: тёмная волосная линия и ряды точек, видные как на снимках 01 и 03
def rows(m, A_, Q_, lines_Q, lines_A, pitch=0.085, rv=0.0125):
    global seamd
    if not m.any(): return
    AA, QQ = A_[m], Q_[m]; out = np.zeros(AA.shape, np.float32); d0 = np.full(AA.shape, 9.0, np.float32)
    for q_ in lines_Q:
        dq = np.abs(QQ - q_); d0 = np.minimum(d0, dq); ph = (AA / pitch) % 1.0; dph = np.minimum(ph, 1 - ph) * pitch; out = np.maximum(out, np.clip(1 - np.hypot(dph, dq - 0.028) / rv, 0, 1))
    for a_ in lines_A:
        da = np.abs(AA - a_); d0 = np.minimum(d0, da); ph = (QQ / pitch) % 1.0; dph = np.minimum(ph, 1 - ph) * pitch; out = np.maximum(out, np.clip(1 - np.hypot(dph, da - 0.028) / rv, 0, 1))
    seamd[m] = np.minimum(seamd[m], d0); vis[m] = np.maximum(vis[m], out)
vis = np.zeros((S, S), np.float32)
rows(wing, a, ax, WX, WA); rows(can, a, ax, (1.7, 2.2), (6.0, 6.8)); rows(finm, a, z, FZ, (12.0, 12.8))
bmask = (cls == 0) & ~wing & ~can & ~finm & (mat == 0) & (a > 1.6) & (a < 13.4) & (z > -0.97)
if bmask.any():
    AA, QQ = a[bmask], ang[bmask]; rr_ = np.maximum(np.hypot(x, z + 0.10)[bmask], 0.2); edges = (np.arange(ANG_N) / ANG_N) * 2 * np.pi - np.pi; ds = np.full(AA.shape, 9.0, np.float32); outb = np.zeros(AA.shape, np.float32); ph = (AA / 0.085) % 1.0; dph = np.minimum(ph, 1 - ph) * 0.085
    for e_ in edges:
        dd = np.abs(np.arctan2(np.sin(QQ - e_), np.cos(QQ - e_))) * rr_; ds = np.minimum(ds, dd); outb = np.maximum(outb, np.clip(1 - np.hypot(dph, dd - 0.028) / 0.0125, 0, 1))
    ph2 = ((QQ * rr_) / 0.085) % 1.0; dph2 = np.minimum(ph2, 1 - ph2) * 0.085
    for f_ in FR[:-1]:
        da = np.abs(AA - f_); ds = np.minimum(ds, da); outb = np.maximum(outb, np.clip(1 - np.hypot(dph2, da - 0.028) / 0.0125, 0, 1))
    seamd[bmask] = np.minimum(seamd[bmask], ds); vis[bmask] = np.maximum(vis[bmask], outb)
log('заклёпки', float((riv > 0).mean()))
# ── пятна: мазки краски, выгорание, потёки, копоть, грязь. Снизу пятна вполовину слабее, потёков почти нет ──
mott = fbm(0.55, 0.55, 0.55, 4, 1.0); fine = fbm(11.0, 11.0, 11.0, 2, 5.0); patch = fbm(1.4, 1.4, 1.4, 4, 9.0)
under = smooth(-0.15, -0.75, nz); amp = 1.0 - 0.5 * under
col *= (1 + (0.09 * (mott - 0.5) + 0.03 * (fine - 0.5)) * amp)[..., None]; col *= (1 - 0.22 * vis * skin_m)[..., None]
polish = smooth(0.55, 0.72, fbm(0.9, 0.9, 0.9, 3, 13.0)); rough += (mott - 0.5) * 0.04 - polish * 0.025
sun = smooth(0.25, 0.9, nz); col = mix(col, BASE * np.array([1.05, 1.05, 1.04], np.float32), sun * smooth(0.40, 0.72, patch) * 0.10)     # выгорело сверху
stre = fbm(0.75, 11.0, 11.0, 4, 3.0); stre2 = fbm(0.42, 26.0, 26.0, 3, 17.0)
flow = smooth(0.50, 0.70, stre) * (0.35 + 0.65 * smooth(0.35, 0.70, patch)); flow2 = smooth(0.58, 0.74, stre2)
rearw = 0.45 + 0.55 * smooth(6.0, 12.5, a)
dirty = flow * rearw * np.where(nz < -0.2, 0.04, 0.14)
col = mix(col, (0.24, 0.245, 0.25), dirty * 0.06); rough += dirty * 0.04
col = mix(col, (0.17, 0.17, 0.17), flow2 * 0.010 * rearw)
oil = under * smooth(0.50, 0.72, fbm(1.0, 2.0, 2.0, 4, 23.0)) * np.where(ax > 1.5, 0.15, 1.0) * smooth(5.0, 10.0, a)
col = mix(col, (0.32, 0.32, 0.315), oil * 0.07); rough += oil * 0.08
for a0_, a1_, q0_, q1_ in ((1.80, 4.07, 0.0, 0.44), (9.56, 11.05, 0.62, 2.60)):
    m_ = smooth(a0_ - 0.10, a0_ + 0.10, a) * smooth(a1_ + 0.25, a1_ - 0.25, a) * smooth(q0_ - 0.1, q0_ + 0.1, ax) * smooth(q1_ + 0.12, q1_ - 0.12, ax) * under * smooth(0.36, 0.66, fbm(1.6, 3.0, 3.0, 3, 29.0))
    col = mix(col, (0.24, 0.235, 0.23), m_ * 0.12); rough += m_ * 0.08



# копоть у сопел: мягкая, у основания
soot = smooth(12.2, 13.4, a) * (0.45 + 0.55 * smooth(0.28, 0.72, fbm(0.7, 2.6, 2.6, 4, 31.0))) * (cls == 0) * smooth(1.04, 0.86, rn) * smooth(0.72, 0.40, z) * (mat == 0)
col = mix(col, (0.12, 0.115, 0.11), soot * 0.34); rough += soot * 0.16
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
col = mix(col, BASE * 1.05, LE_w * 0.15); rough -= LE_w * 0.05
eros = smooth(0.46, 0.60, fbm(9.0, 9.0, 9.0, 3, 37.0))
chip = np.maximum(edge * smooth(0.52, 0.62, fbm(14.0, 14.0, 14.0, 3, 41.0)), LE_w * smooth(0.66, 0.78, eros) * 0.45)
scuff = smooth(0.030, 0.006, hedge) * smooth(0.52, 0.64, fbm(22.0, 22.0, 22.0, 3, 43.0))
scr = smooth(0.76, 0.78, fbm(5.0, 70.0, 70.0, 2, 47.0)) * smooth(0.60, 0.72, patch) * sun * 0.05
rough -= (edge * 0.14 + scuff * 0.16) * (cls != 14)
mov = np.isin(cls, (2, 3, 4, 5, 6, 7)); chip = chip * np.where(mov, 0.05, 0.12); edge = edge * np.where(mov, 0.2, 1.0)
bare = np.clip(chip * 0.9 + scuff * 0.55 + scr * 0.6, 0, 1) * skin_m * (cls != 14)     # тонкие гребни и лопатки целиком считаются кромкой: без голого металла
BARE = np.array((0.60, 0.61, 0.63), np.float32)
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
    tw_px = max(8, int(W_ * PXM * 1.5)); th_px = max(8, int(H_ * PXM * 1.5)); A0 = np.asarray(im_.convert('RGBa').resize((tw_px, th_px), Image.LANCZOS).convert('RGBA'), np.float32) / 255.0; hp, wp = A0.shape[:2]
    vm, Q_ = ((nz > 0.35, x) if side == 'top' else (nz < -0.35, x) if side == 'bot' else (nx > 0.35, z) if side == 'r' else (nx < -0.35, z))
    if along: ins = vm & (np.abs(a - ac) < W_ / 2) & (np.abs(Q_ - qc) < H_ / 2)
    else: ins = vm & (np.abs(Q_ - qc) < W_ / 2) & (np.abs(a - ac) < H_ / 2)
    ins &= ((mat == 0) | ((mat == 5) & (cl == (12,)))) & (np.isin(cls, cl) if cl else ((cls <= 8) & (cls != 8)))
    if not ins.any(): return
    if along:
        u_ = (a[ins] - ac) / W_ + 0.5; v_ = 0.5 - (Q_[ins] - qc) / H_
        if side == 'r': u_ = 1 - u_
        if side == 'bot': v_ = 1 - v_
    else:
        u_ = (Q_[ins] - qc) / W_ + 0.5; v_ = (a[ins] - ac) / H_ + 0.5
        if side == 'bot': u_ = 1 - u_
    fx_ = np.clip(u_ * wp - 0.5, 0, wp - 1.001); fy_ = np.clip(v_ * hp - 0.5, 0, hp - 1.001); ix_ = fx_.astype(int); iy_ = fy_.astype(int); dx_ = (fx_ - ix_)[:, None]; dy_ = (fy_ - iy_)[:, None]
    S_ = (A0[iy_, ix_] * (1 - dx_) + A0[iy_, ix_ + 1] * dx_) * (1 - dy_) + (A0[iy_ + 1, ix_] * (1 - dx_) + A0[iy_ + 1, ix_ + 1] * dx_) * dy_
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

def roundel_img(S_=720, outer=(78, 82, 88, 255), mid=(150, 154, 158, 255), inner=(66, 70, 76, 255)):
    """Знак малозаметный: свои концентрические круги в сером, без цвета и без чужих эмблем."""
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); c = S_ / 2
    for k, ink in ((0.49, outer), (0.34, mid), (0.16, inner)): d_.ellipse((c - S_ * k, c - S_ * k, c + S_ * k, c + S_ * k), fill=ink)
    return im_


def arrow_img(W=720, H=180, ink=(214, 176, 44, 255), rev=False):
    """Жёлтый знак спасения: своя стрелка с чёрной окантовкой, без текста."""
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); y0, y1, x1 = H * 0.28, H * 0.72, W * 0.74; P_ = [(4, y0), (x1, y0), (x1, 4), (W - 4, H / 2), (x1, H - 4), (x1, y1), (4, y1)]
    d_.polygon(P_, fill=ink, outline=(30, 30, 30, 255)); d_.line(P_ + [P_[0]], fill=(30, 30, 30, 255), width=6)
    return im_.transpose(Image.FLIP_LEFT_RIGHT) if rev else im_
YEL = (222, 182, 44, 255); ORG = (214, 104, 34, 255); BLK = (26, 27, 26, 255); WHT = (214, 214, 208, 255); REDD = (160, 40, 30, 255); FNTB = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
def fit(im_, ac, qc, W_, sd, **kw): stamp(im_, ac, qc, W_, W_ * im_.height / im_.width, sd, **kw)      # высота по пропорциям картинки
def ntext(t, H=200, ink=BLK):
    f_ = ImageFont.truetype(FNT, H); tw = ImageDraw.Draw(Image.new('L', (8, 8))).textlength(t, font=f_); im_ = Image.new('RGBA', (int(tw + H * 0.3), int(H * 1.15)), (0, 0, 0, 0)); ImageDraw.Draw(im_).text((im_.width / 2, im_.height / 2), t, font=f_, fill=ink, anchor='mm'); return im_
def warn_img(S_=420):
    """Предупреждение у катапульты (тип как на снимках, рисунок свой): белый треугольник остриём вниз с красной каймой, сверху оранжевая дуга с чёрточками."""
    im_ = Image.new('RGBA', (S_, int(S_ * 1.32)), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); y0 = S_ * 0.38; P_ = [(S_ * 0.05, y0), (S_ * 0.95, y0), (S_ * 0.5, y0 + S_ * 0.88)]
    d_.polygon(P_, fill=WHT); d_.line(P_ + [P_[0]], fill=REDD, width=int(S_ * 0.085)); d_.polygon([(S_ * 0.33, y0 + S_ * 0.22), (S_ * 0.67, y0 + S_ * 0.22), (S_ * 0.5, y0 + S_ * 0.56)], fill=REDD)
    d_.arc((S_ * 0.2, S_ * 0.06, S_ * 0.8, S_ * 0.62), 180, 360, fill=ORG, width=int(S_ * 0.05))
    for an in (200, 235, 270, 305, 340):
        c_, s_ = math.cos(math.radians(an)), math.sin(math.radians(an)); d_.line((S_ * 0.5 + c_ * S_ * 0.30, S_ * 0.34 + s_ * S_ * 0.28, S_ * 0.5 + c_ * S_ * 0.37, S_ * 0.34 + s_ * S_ * 0.34), fill=ORG, width=int(S_ * 0.03))
    return im_
def rescue_img(rev=False):
    """Жёлтая стрелка со своим словом."""
    W, H = 900, 190; im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); x1 = W * 0.80; P_ = [(4, H * 0.14), (x1, H * 0.14), (x1, 2), (W - 4, H / 2), (x1, H - 2), (x1, H * 0.86), (4, H * 0.86)]
    if rev: P_ = [(W - px_, py_) for px_, py_ in P_]
    d_.polygon(P_, fill=YEL); d_.line(P_ + [P_[0]], fill=BLK, width=6); d_.text(((W - x1 * 0.5) if rev else x1 * 0.5, H / 2), 'RESCUE', font=ImageFont.truetype(FNTB, 118), fill=BLK, anchor='mm')
    return im_
def placard_img(lines, fill=BLK, ink=YEL, frame=None, H=70):
    f_ = ImageFont.truetype(FNT, H); tw = max(ImageDraw.Draw(Image.new('L', (8, 8))).textlength(t_, font=f_) for t_ in lines); W = int(tw + H); Ht = int(len(lines) * H * 1.12 + H * 0.5); im_ = Image.new('RGBA', (W, Ht), fill); d_ = ImageDraw.Draw(im_)
    if frame: d_.rectangle((3, 3, W - 4, Ht - 4), outline=frame, width=8)
    for i_, t_ in enumerate(lines): d_.text((W / 2, H * 0.78 + i_ * H * 1.12), t_, font=f_, fill=ink, anchor='mm')
    return im_
def ring_img(S_=240, a_=YEL, b_=BLK):
    """Круглая отметка из секторов."""
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); d_.ellipse((3, 3, S_ - 3, S_ - 3), fill=a_, outline=b_, width=10)
    for k in range(4): d_.pieslice((S_ * 0.14, S_ * 0.14, S_ * 0.86, S_ * 0.86), k * 90, k * 90 + 45, fill=b_)
    return im_
def hoop_img(S_=240, ink=YEL):
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); ImageDraw.Draw(im_).ellipse((14, 14, S_ - 14, S_ - 14), outline=ink, width=30); return im_
def pill_img(W=620, H=150, fill=(176, 180, 178, 255), edge=(50, 52, 50, 255)):
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(im_).rounded_rectangle((4, 4, W - 5, H - 5), H // 2 - 4, fill=fill, outline=edge, width=10); return im_
def access_img(S_=300, ink=ORG):
    """Оранжевая рамка люка со своим значком."""
    im_ = Image.new('RGBA', (int(S_ * 1.3), S_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); d_.rounded_rectangle((8, 8, im_.width - 9, S_ - 9), 44, outline=ink, width=22); d_.polygon([(im_.width * 0.5, S_ * 0.24), (im_.width * 0.66, S_ * 0.52), (im_.width * 0.5, S_ * 0.78), (im_.width * 0.34, S_ * 0.52)], outline=ink, width=16); return im_
def squiggle_img(W=420, H=300, ink=ORG):
    """Своя волнистая отметка в тёмной рамке панели."""
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); d_.rounded_rectangle((4, 4, W - 5, H - 5), 22, outline=(44, 46, 42, 255), width=9); Pt = [(W * (0.18 + 0.64 * i / 40), H * 0.5 + H * 0.20 * math.sin(i / 40 * 2 * math.pi * 1.5)) for i in range(41)]; d_.line(Pt, fill=ink, width=20); return im_
def bolt_img(W=260, H=130, ink=ORG):
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(im_).line([(8, H * 0.74), (W * 0.42, H * 0.30), (W * 0.54, H * 0.70), (W - 8, H * 0.22)], fill=ink, width=20); return im_
def small_arrow(W=200, H=120, ink=ORG, rev=False):
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(im_).polygon([(6, H * 0.33), (W * 0.58, H * 0.33), (W * 0.58, 6), (W - 6, H / 2), (W * 0.58, H - 6), (W * 0.58, H * 0.67), (6, H * 0.67)], fill=ink); return im_.transpose(Image.FLIP_LEFT_RIGHT) if rev else im_
def dash_img(W=1400, H=44, ink=(190, 58, 34, 255)):
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); x_ = 0
    while x_ < W: d_.rectangle((x_, 6, x_ + 54, H - 7), fill=ink); x_ += 92
    return im_
def emblem_img(rev=False):
    """Эмблема киля, придуманная: красный щит с белой кромкой и белая пикирующая птица. Ни с одной настоящей частью не связана."""
    W, H = 520, 640; im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_)
    sh = [(W * 0.5 + (W * 0.47) * math.sin(t) * (1 if 0 else 1), 0) for t in ()]; Pts = [(12, 16), (W - 12, 16), (W - 12, H * 0.54)] + [(W / 2 + (W / 2 - 12) * math.cos(t), H * 0.54 + (H * 0.44) * math.sin(t)) for t in [i / 24 * math.pi for i in range(25)]] + [(12, H * 0.54)]
    d_.polygon(Pts, fill=(158, 34, 28, 255)); d_.line(Pts + [Pts[0]], fill=WHT, width=20)
    bird = [(W * 0.5, H * 0.14), (W * 0.58, H * 0.34), (W * 0.90, H * 0.26), (W * 0.64, H * 0.50), (W * 0.60, H * 0.72), (W * 0.5, H * 0.90), (W * 0.40, H * 0.72), (W * 0.36, H * 0.50), (W * 0.10, H * 0.26), (W * 0.42, H * 0.34)]
    d_.polygon(bird, fill=WHT); d_.line([(W * 0.5, H * 0.34), (W * 0.5, H * 0.74)], fill=(158, 34, 28, 255), width=10)
    return im_.transpose(Image.FLIP_LEFT_RIGHT) if rev else im_
def fp_img(S_=420, ink=WHT, rev=False):
    """Светлая полоска у передней кромки киля, наклонена вдоль кромки: кромка уходит вверх к хвосту."""
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); ImageDraw.Draw(im_).line((S_ * 0.24, S_ * 0.84, S_ * 0.76, S_ * 0.16), fill=ink, width=int(S_ * 0.13)); return im_.transpose(Image.FLIP_LEFT_RIGHT) if rev else im_
def crown_img(S_=240, ink=(236, 182, 40, 255)):
    """Корона: свой простой рисунок, полоса и три зубца с шариками."""
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); y1 = S_ * 0.82; y0 = S_ * 0.34
    d_.polygon([(S_ * 0.14, y1), (S_ * 0.86, y1), (S_ * 0.95, y0), (S_ * 0.70, S_ * 0.58), (S_ * 0.5, S_ * 0.22), (S_ * 0.30, S_ * 0.58), (S_ * 0.05, y0)], fill=ink); d_.rectangle((S_ * 0.14, y1 - S_ * 0.02, S_ * 0.86, y1 + S_ * 0.08), fill=ink)
    for cx_, cy_ in ((0.05, y0 / S_), (0.5, 0.20), (0.95, y0 / S_)): d_.ellipse((S_ * (cx_ - 0.05), S_ * (cy_ - 0.06), S_ * (cx_ + 0.05), S_ * (cy_ + 0.04)), fill=ink)
    return im_
def nat_img(S_=720):
    """Круг с тремя коронами: синий круг, жёлтая кайма, короны две сверху и одна снизу (01, 02, 05, 07); нарисован заново."""
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); d_.ellipse((3, 3, S_ - 3, S_ - 3), fill=(232, 176, 36, 255)); k = S_ * 0.085; d_.ellipse((k, k, S_ - k, S_ - k), fill=(22, 86, 138, 255)); cr = crown_img(int(S_ * 0.30))
    for cx_, cy_ in ((0.32, 0.36), (0.68, 0.36), (0.50, 0.66)): im_.alpha_composite(cr, (int(S_ * cx_ - cr.width / 2), int(S_ * cy_ - cr.height / 2)))
    return im_
def mesh_img(W=600, H=600, ink=(178, 58, 36, 255), bg=(112, 38, 26, 255)):
    """Широкая красная сетка под фюзеляжем, свой рисунок (07, 10)."""
    im_ = Image.new('RGBA', (W, H), bg); d_ = ImageDraw.Draw(im_); st_ = 60
    for x_ in range(0, W + 1, st_): d_.line((x_, 0, x_, H), fill=ink, width=16)
    for y_ in range(0, H + 1, st_): d_.line((0, y_, W, y_), fill=ink, width=16)
    d_.rectangle((2, 2, W - 3, H - 3), outline=(56, 54, 50, 255), width=10); return im_
NAT = nat_img(); NUMF = '38'; NUMS = '4'; BLKN = (24, 25, 25, 255)
for sd in ('r', 'l'):
    rv = sd == 'l'
    stamp(NAT, 3.28, 0.10, 0.74, 0.74, sd)                                                     # круг с коронами на борту носа
    fit(ntext(NUMS, 420, ink=BLKN), 4.72, 0.10, 0.24, sd)                                       # номер на борту у заборника
    fit(ntext(NUMF, 520, ink=BLKN), 12.98, 2.10, 0.78, sd)                                      # номер на киле, придуманный
    fit(rescue_img(rv), 5.75, 0.26, 0.70, sd)                                                   # жёлтая стрелка спасения
    fit(warn_img(), 4.68, -0.36, 0.18, sd)                                                      # предупреждение у заборника
    fit(pill_img(W=900, H=70, fill=(104, 150, 112, 255), edge=(60, 90, 66, 255)), 5.05, 0.47, 0.72, sd)   # зелёная полоса на заборнике
    fit(placard_img(['NO STEP'], fill=WHT, ink=REDD, frame=REDD), 11.30, 0.50, 0.30, sd)        # красно-белая метка за крылом
    fit(ring_img(), 8.05, 0.28, 0.13, sd); fit(placard_img(['VENT'], fill=YEL, ink=BLK), 8.35, 0.28, 0.24, sd)   # метки обслуживания
for xs_ in (-2.05, 2.05):
    stamp(NAT, 11.50, xs_, 0.92, 0.92, 'top', along=False); stamp(NAT, 11.50, xs_, 0.92, 0.92, 'bot', along=False)
for qc_ in (0.30, -0.30): stamp(mesh_img(), 11.45, qc_, 0.50, 0.50, 'bot')                     # красная сетка
fit(ntext(NUMF, 240, ink=BLKN), 9.05, 1.42, 0.28, 'bot'); fit(ntext(NUMF, 240, ink=BLKN), 9.05, -1.42, 0.28, 'bot')    # маленький номер снизу у корня крыла
hatch_i = Image.new('RGBA', (440, 400), (214, 170, 44, 255)); ImageDraw.Draw(hatch_i).rectangle((6, 6, 433, 393), outline=(40, 38, 34, 255), width=14); ImageDraw.Draw(hatch_i).rectangle((40, 170, 400, 230), fill=(40, 38, 34, 255)); stamp(hatch_i, 13.20, -1.20, 0.44, 0.40, 'bot')   # жёлтый лючок снизу (07, 10)
log('надписи')
# ── чёрный нос (01, 03, 05), тёмная верхушка киля (02, 05), чёрный торец кожуха ──
rad = (a < 1.52) & (cls == 0)
col[rad] = (np.array((0.060, 0.060, 0.066), np.float32) * (0.95 + 0.10 * mott)[..., None])[rad]; rough[rad] = (0.40 + 0.05 * (mott - 0.5))[rad]; metal[rad] = 0
cap_ = finm & (z > 3.06) & (cls == 0); col[cap_] = (np.array((0.115, 0.12, 0.125), np.float32) * (0.95 + 0.10 * mott)[..., None])[cap_]; rough[cap_] = 0.46; metal[cap_] = 0
# ── хвостовая часть перед соплом и створки: потемневший металл без радуги ──
tn = fbm(1.2, 4.0, 4.0, 4, 59.0); ts = fbm(0.8, 14.0, 14.0, 3, 61.0)
def heat(t):
    st = np.array([0.0, 0.40, 0.72, 1.0], np.float32); p = np.array([[0.62, 0.62, 0.615], [0.60, 0.595, 0.585], [0.56, 0.55, 0.54], [0.52, 0.52, 0.53]], np.float32)
    return np.stack([np.interp(t, st, p[:, i]) for i in range(3)], -1).astype(np.float32)
t_ti = np.clip((a - 13.18) / 0.26 + (tn - 0.5) * 0.45 + (ts - 0.5) * 0.25, 0, 1)
rib_ = np.sin(np.arctan2(x, z + 0.30) * 44) > 0.0; hc = heat(t_ti) * (0.95 + 0.10 * ts)[..., None] * np.where(rib_, 1.0, 0.93)[..., None]
tw_ = smooth(13.14, 13.26, a) * smooth(0.80, 0.72, rn) * smooth(0.42, 0.26, z) * (cls == 0) * (mat == 0); col = mix(col, hc, tw_); metal = np.maximum(metal, tw_ * 0.9); rough = rough * (1 - tw_) + tw_ * np.clip(0.40 + (tn - 0.5) * 0.10, 0.32, 0.50)
noz = cls == 10
ncol = np.array((0.64, 0.625, 0.60), np.float32) * (0.92 + 0.16 * fbm(1.4, 5.0, 5.0, 4, 63.0))[..., None]; ncol = ncol * (1 - 0.5 * smooth(13.68, 13.50, a))[..., None] + np.array((0.42, 0.50, 0.66), np.float32) * (0.5 * smooth(13.68, 13.50, a))[..., None]     # у щели голубоватый металл (05)
sn = smooth(14.30, 14.72, a) * (0.8 + 0.2 * tn); ncol = ncol * (1 - 0.30 * sn)[..., None] + np.array((0.16, 0.15, 0.14), np.float32) * (0.30 * sn)[..., None]
col[noz] = ncol[noz]; metal[noz] = 1.0; rough[noz] = np.clip(0.38 + (tn[noz] - 0.5) * 0.14, 0.28, 0.48)
ins_ = noz & ((nx * x + nz * (z + 0.30)) < 0);   # нутро отличает нормаль, а не радиус
iv = (0.10 + 0.05 * ts) * np.ones_like(a); col[ins_] = (np.stack([iv * 1.0, iv * 0.97, iv * 0.93], -1))[ins_]; metal[ins_] = 0.5; rough[ins_] = 0.72
pipe = (cls == 0) & (mat == 1); col[pipe] = np.array((0.26, 0.25, 0.24), np.float32) * (0.8 + 0.4 * tn[pipe])[..., None]; metal[pipe] = 1.0; rough[pipe] = 0.5
log('металл')
# ── материалы без краски обшивки ──
def solid(m, c, r, me=0.0, nz_=0.08):
    col[m] = np.array(c, np.float32) * (1 - nz_ / 2 + nz_ * fine[m])[..., None]; rough[m] = r; metal[m] = me
solid(mat == 10, (0.25, 0.26, 0.27), 0.85)              # швы
solid(mat == 2, (0.030, 0.030, 0.032), 0.9)             # нутро
solid(mat == 4, (0.045, 0.045, 0.048), 0.86)            # резина
solid(mat == 5, (0.25, 0.26, 0.27), 0.62, 0, 0.16)      # кабина, каналы
duct = (mat == 5) & (cls != 11); deep_ = smooth(4.15, 5.50, a); col[duct] = (np.array((0.30, 0.30, 0.295), np.float32) * (1 - deep_[..., None]) + np.array((0.065, 0.068, 0.072), np.float32) * deep_[..., None])[duct] * (0.82 + 0.36 * mott[duct])[..., None]; rough[duct] = 0.7     # канал: у кромки тёплый серый, в глубине тёмный
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
solid(g_p, (0.60, 0.60, 0.58), 0.58, 0, 0.10); solid(g_c, (0.47, 0.47, 0.46), 0.30, 0.85, 0.08); solid(g_s, (0.145, 0.142, 0.14), 0.58, 0.75, 0.14)
solid(g_d, (0.46, 0.47, 0.47), 0.58, 0, 0.10); solid(gr_ & (mat == 9), (0.60, 0.56, 0.40), 0.28, 0, 0.1); solid(gr_ & (mat == 2), (0.05, 0.048, 0.046), 0.72, 0, 0.14)
painted = g_p | g_d
col[painted] *= (0.84 + 0.30 * gm1[painted] + 0.06 * gm2[painted])[..., None]                                                 # неровная старая краска
# потёки масла вниз от сальников и пальцев
oil_ = smooth(0.46, 0.68, gst) * (0.5 + 0.5 * smooth(0.40, 0.70, gst2)); col = mix(col, (0.15, 0.125, 0.095), oil_ * 0.58 * (painted | g_c)); rough = rough + oil_ * 0.20 * painted - oil_ * 0.10 * g_c
# грязь снизу, из-под колёс: сильнее к земле
gd = smooth(-1.3, -2.6, z) * gr_ * (0.45 + 0.55 * smooth(0.36, 0.66, gm1)); col = mix(col, (0.215, 0.195, 0.165), gd * 0.62 * (painted | g_s)); rough = rough + gd * 0.22 * painted
# тормозная пыль на дисках и ступицах
# тормозная пыль на дисках и ступицах
for ac_, xc_, zc_, rw_ in ((3.90, 0.0, -2.28, 0.27), (9.855, 2.40, -2.19, 0.36), (10.685, 2.40, -2.19, 0.36), (9.855, -2.40, -2.19, 0.36), (10.685, -2.40, -2.19, 0.36)):
    rd_ = np.hypot(a - ac_, z - zc_); md_ = gr_ & (rd_ < rw_ * 0.68) & (np.abs(x - xc_) < 0.20)
    dust = smooth(rw_ * 0.68, rw_ * 0.10, rd_) * (0.45 + 0.55 * smooth(0.34, 0.62, gm2)) * md_; col = mix(col, (0.115, 0.10, 0.085), dust * 0.72); rough = rough + dust * 0.15
# сколы и потёртости кромок
g_e = smooth(0.985, 0.90, bev) * painted * smooth(0.50, 0.62, gm2); col = mix(col, (0.26, 0.255, 0.24), g_e * 0.8); rough = rough + g_e * 0.05
# резина: пыль на боковине, потёртая дорожка
tyr = mat == 4; rt_ = smooth(0.40, 0.68, gm2) * tyr; col[tyr] = np.array((0.070, 0.070, 0.072), np.float32); col = mix(col, (0.165, 0.158, 0.145), rt_ * 0.50); col = mix(col, (0.20, 0.19, 0.17), smooth(-2.05, -2.55, z) * tyr * 0.45); rough[tyr] = 0.90
# под самолётом стойки в тени: в игре тени самолёта на них нет
col[gr_] *= (0.50 + 0.50 * smooth(0.15, 0.95, ao2[gr_]))[..., None]
door_in = (cls == 7) & (nz > 0.2) & (z < 0.1); solid(door_in, (0.66, 0.66, 0.64), 0.55, 0, 0.14)
h_m = (cls == 14) & (mat == 1); solid(h_m, (0.36, 0.38, 0.40), 0.5, 0.5, 0.12)
lt_ = (cls == 14) & (mat == 9); solid(lt_, (0.72, 0.08, 0.06), 0.22, 0, 0.06); col[lt_] = np.array((0.72, 0.08, 0.06), np.float32)     # красные огни сверху и снизу (01, 03)
c9 = (cls == 9)                                         # рама фонаря: краска обшивки
m_can = c9 & (mat == 1); solid(m_can, (0.44, 0.45, 0.46), 0.38, 1.0)
solid(c9 & (mat == 0), (0.13, 0.135, 0.115), 0.48)      # рама фонаря тёмная (07)
duct_m = (mat == 5) & (cls != 11); rough = np.where(duct_m, 0.85, rough); metal = np.where(duct_m, 0.0, metal)
rough = np.where(cls == 10, np.maximum(rough, 0.36), rough)
under_r = smooth(-0.1, -0.55, nz) * (mat == 0) * (cls <= 8); rough = rough + (np.maximum(rough, 0.50) - rough) * under_r      # снизу матовее: блеск от земли даёт пятна
rough = np.clip(rough, 0.08, 0.97); metal = np.clip(metal, 0, 1)
for c_ in range(16):
    m_ = (cls == c_) & cov
    if m_.sum() > 500: print('деталь', c_, 'цвет', (col[m_].mean(0) * 255).round(0), 'G', round(float(rough[m_].mean()), 2), 'B', round(float(metal[m_].mean()), 2))
col = np.clip(col, 0, 1)
log('материалы')
# ── высота и нормали ──
shag = fbm(150.0, 150.0, 150.0, 2, 73.0) if S >= 4096 else fbm(70.0, 70.0, 70.0, 2, 73.0)
height += (shag - 0.5) * 0.00018 * skin_m
height += smooth(0.1, 0.8, riv) * 0.0004 * skin_m
ins_h = hedge < 8; height += smooth(0.0, 0.008, hedge) * 0.0009 * ins_h
height += scr * -0.0002
height = np.where(a < 1.52, height * 0.25, height)
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
occ = np.where(duct_m, np.minimum(np.maximum(occ, 0.45), 1.0 - 0.45 * smooth(4.15, 5.50, a)), occ)      # в глубине канала меньше отражений неба: плавно темнеет, а не сплошной чёрный
occ = np.where(cls == 7, np.maximum(occ, 0.8), occ); col = col                                      # створки запекаются закрытыми: затенение отпечатком не нужно
bleed([col, rough, metal, occ, nn], cov)
def lift(arr): return (np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)
Image.fromarray(lift(col)[::-1]).save(f'{OUT}/viggen_color.png', compress_level=1)
Image.fromarray(lift(nn * 0.5 + 0.5)[::-1]).save(f'{OUT}/viggen_normal.png', compress_level=1)
orm = np.stack([occ, rough, metal], -1); Image.fromarray(lift(orm)[::-1]).save(f'{OUT}/viggen_orm.png', compress_level=1)
pm = skin_m & cov & (cls == 0) & (a > 3) & (a < 13)
print('средний цвет обшивки sRGB', (col[pm].mean(0) * 255).round(1), 'шероховатость', round(float(rough[pm].mean()), 3), 'доля голого металла', round(float((metal[pm] > 0.5).mean()), 4))
log('сохранено', OUT)
