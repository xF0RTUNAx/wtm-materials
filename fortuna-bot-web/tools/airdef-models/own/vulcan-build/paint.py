# paint.py - краска Avro Vulcan B.2 из данных gbuf.py: цвет (только краска и грязь, без света), нормали, карта блеска glTF (R затенение, G шероховатость, B металл). Без Blender: /usr/bin/python3 -I paint.py
# VUL_TEX=2048|4096, VUL_OUT=<папка>, VUL_G / VUL_GR / VUL_LG = r,g,b (sRGB 0…1): тёмно-зелёный, средний серый, светло-серый низ. VUL_PREV=1 - ещё и план сверху/снизу/сбоку прямо из данных.
# Схема RAF по vulcan_01, 04, 05: сверху тёмно-зелёный и серый волнистыми полосами вдоль передней кромки (свой рисунок, шум), низ светло-серый. Пиксели фото не используются, знаки нарисованы здесь.
# Знаки тусклые (тип B: синее кольцо, красный центр), на киле красно-синие полосы, номер XQ706 придуман (буквы Q в номерах RAF не было). Гербов, эмблем частей и настоящих номеров нет.
import json, math, os, site, sys, time
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image, ImageDraw, ImageFont
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__)); DAT = os.path.join(HERE, '_проба')
S = int(os.environ.get('VUL_TEX', '2048')); OUT = os.environ.get('VUL_OUT', DAT); os.makedirs(OUT, exist_ok=True)
env3 = lambda k, d: np.array([float(v) for v in os.environ.get(k, d).split(',')], np.float32)
C_GRN = env3('VUL_G', '0.370,0.410,0.305'); C_GRY = env3('VUL_GR', '0.615,0.645,0.655'); C_LGT = env3('VUL_LG', '0.700,0.718,0.718')
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f} с]', *a, flush=True)
L_ = 30.72; ZA = 3.0
pos = np.load(f'{DAT}/gb_pos_{S}.npy'); nor = np.load(f'{DAT}/gb_nor_{S}.npy'); idd = np.load(f'{DAT}/gb_id_{S}.npy'); aob = np.load(f'{DAT}/gb_ao_{S}.npy')
ATLAS = json.load(open(f'{DAT}/uv.json', encoding='utf-8'))['atlas_m']; PXM = 0.985 * S / ATLAS; DS = 1.0 / PXM
mat = np.round(idd[..., 0] * 16).astype(np.int8); cls = np.round(idd[..., 1] * 32).astype(np.int8); cov = idd[..., 2] > 0.5
a = (L_ / 2 - pos[..., 1]).astype(np.float32); x = pos[..., 0].astype(np.float32); z = pos[..., 2].astype(np.float32); ax = np.abs(x); zg = z + ZA
nx, ny, nz = nor[..., 0], nor[..., 1], nor[..., 2]
ao1, ao2, bev = aob[..., 0].copy(), aob[..., 1].copy(), aob[..., 2]
doors = np.isin(cls, (3, 7)); ao1[doors] = 1.0; ao2[doors] = 1.0     # створки запекались закрытыми: изнутри иначе чёрные, а в игре их видно открытыми
log('данные загружены', S, 'плотность', round(PXM), 'пикс/м')
# ── таблицы формы из vul_geo.py (без Blender) ──
src = open(os.path.join(HERE, 'vul_geo.py'), encoding='utf-8').read(); ns = {'Z': lambda q: q - ZA, 'math': math}
exec(src[src.index('class Track:'):src.index('def sup(')], ns)
exec(src[src.index('XTIP = '):src.index('def wing_up(')], ns)
exec(src[src.index('FUS = ['):src.index('FT = tracks(')], ns)
exec(src[src.index('FIN_T0, FIN_T1'):src.index('def FTC(')], ns)
exec(src[src.index('PIPES = ('):src.index('def pipe_fair(')], ns)
XS = np.linspace(0, ns['XTIP'], 900); LEt = np.array([ns['LE'](v) for v in XS], np.float32)
def LEf(q): return np.interp(q, XS, LEt).astype(np.float32)
def TEf(q): return (27.0 + 0.035 * q).astype(np.float32)
def HINGEf(q): return TEf(q) - (1.30 - 0.024 * (q - 4.0))
FA = np.array([r[0] for r in ns['FUS']]); F_TOP = np.array([r[1] for r in ns['FUS']]); F_BOT = np.array([r[2] for r in ns['FUS']]); F_HW = np.array([r[3] for r in ns['FUS']])
hw = np.interp(a, FA, F_HW).astype(np.float32)
FZ0, FZ1 = ns['FZ0'], ns['FZ1']
def FLE(zz): return 19.10 + (25.95 - 19.10) * (zz - FZ0) / (FZ1 - FZ0)
def FTE(zz): return 27.95 + (28.45 - 27.95) * (zz - FZ0) / (FZ1 - FZ0)
PIPES = ns['PIPES']; PIPE_Z = ns['PIPE_Z']; PIPE_A1 = ns['PIPE_A1']


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


def fbm(fa, fx_, fz_, octv=3, seed=0.0, A=None, X=None, Zz=None):
    A = a if A is None else A; X = x if X is None else X; Zz = z if Zz is None else Zz
    r = 0.0; w = 0.5; tot = 0.0
    pa, px, pz = A * fa, X * fx_, Zz * fz_
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
# ── где верх (камуфляж), где низ (светло-серый) ──
fus = (cls == 0) & (ax < hw + 0.04)                                  # фюзеляж; всё, что дальше от оси, - крыло, заборники, обтекатели труб
DEM = np.interp(a, [2.3, 4.0, 6.0, 8.0, 9.2, 40.0], [3.45, 3.30, 3.15, 3.05, 3.00, 3.00]).astype(np.float32)   # линия раздела на борту: у носа выше, от корня крыла по плоскости хорд (vulcan_04)
up_f = smooth(DEM - 0.012, DEM + 0.012, zg)
wpl = ZA - 0.006 * np.maximum(0.0, ax - 4.0)
up_w = smooth(-0.03, 0.03, nz) * smooth(-0.07, -0.02, zg - wpl)      # крыло, рули, щитки: по нормали и только выше плоскости хорд (бока обтекателей труб - низ)
upm = np.where(fus, up_f, up_w)
upm = np.where(np.isin(cls, (1, 2, 9)), 1.0, upm)                   # киль, руль, переплёт фонаря - целиком в камуфляже
upm = np.where(np.isin(cls, (3, 7, 8)), 0.0, upm)                   # створки отсека и шасси, пилоны - низ
# ── камуфляж: волнистые полосы примерно вдоль передней кромки (vulcan_01), левое и правое крыло разные ──
LAM = 5.8                                                           # шаг полосы зелёный+серый, м
xs_ = np.sqrt(x * x + 0.8) - math.sqrt(0.8)                         # |x| без излома на хребте
dang = 0.40 * (fbm(0.045, 0.045, 0.045, 2, 201.0, X=ax) - 0.5)            # направление полос гуляет
tw = (a - (0.96 + dang) * xs_) * 0.72                               # расстояние поперёк стреловидности
vert = np.isin(cls, (1, 2, 5))
tw = np.where(vert, (a - 1.25 * (zg - 4.0)) * 0.62, tw)             # на киле полосы наискось
w1 = fbm(0.07, 0.07, 0.07, 3, 211.0, X=ax); w2 = fbm(0.21, 0.21, 0.21, 3, 223.0, X=ax); w3 = fbm(0.75, 0.75, 0.75, 2, 227.0, X=ax); w4 = fbm(0.10, 0.10, 0.10, 2, 229.0, X=ax)     # шум по |x|: левая и правая сторона зеркальны (Mark 2026-11-10)
gph = 2 * np.pi * tw / LAM + 6.5 * (w1 - 0.5) + 2.6 * (w2 - 0.5)
gfield = np.sin(gph) + 0.55 * (w2 - 0.5) + 0.22 * (w3 - 0.5) + 1.25 * (w4 - 0.5)                    # w4: где-то зелёные полосы сливаются, где-то рвутся
gmask = smooth(-0.03, 0.03, gfield - 0.02)                          # 1 - зелёный, 0 - серый; кромка в пару сантиметров
TOPC = C_GRY[None, None, :] * (1 - gmask[..., None]) + C_GRN[None, None, :] * gmask[..., None]
BASE = TOPC * upm[..., None] + C_LGT[None, None, :] * (1 - upm)[..., None]
col = BASE.astype(np.float32).copy(); rough = np.where(upm > 0.5, 0.44, 0.40).astype(np.float32); metal = np.where(mat == 0, 0.06, 0.0).astype(np.float32); height = np.zeros((S, S), np.float32)
log('камуфляж: доля зелёного сверху', round(float((gmask[(upm > 0.5) & cov & skin_m] > 0.5).mean()), 3))
# ── тон панелей: границы совпадают с нарисованными швами ──
RING_A = np.array([4.40, 9.20, 11.60, 13.70, 22.40, 25.50, 27.85, 29.40], np.float32)
RIB = np.arange(2.55, 16.6, 1.15).astype(np.float32)
LEw = LEf(ax); CHw = TEf(ax) - LEw; HGw = HINGEf(ax)
wing = (cls == 0) & ~fus
tt = rng_tab(128, 7, 0.975, 1.025); rt = rng_tab(128, 8, -0.035, 0.035); hue = rng_tab(128, 9, -0.008, 0.008)
band = np.searchsorted(RING_A, a); idx = (band * 4 + (x > 0) * 2 + (zg > 3.4)) % 128
sp_i = (a > LEw + 0.9).astype(np.int32) + (a > LEw + 0.55 * CHw); rb_i = np.searchsorted(RIB, ax)
wi = ((sp_i * 16 + rb_i) * 4 + (x > 0) * 2 + (nz > 0) + 37) % 128
idx = np.where(wing, wi, idx)
for c_, sd in ((1, 21), (2, 23), (4, 27), (6, 31), (3, 33), (7, 35), (8, 39)):
    idx = np.where(cls == c_, (sd + (x > 0) + (np.floor(ax / 3.2)).astype(np.int32) * 2) % 128, idx)
col *= tt[idx][..., None]; rough += rt[idx]
col[..., 0] *= 1 + hue[idx]; col[..., 2] *= 1 - hue[idx]
log('панели')
# ── швы: кольца фюзеляжа, лонжероны и нервюры крыла, разъём консоли, киль; крышки люков ──
seamd = np.full((S, S), 9.0, np.float32); hedge = np.full((S, S), 9.0, np.float32); hatch = np.zeros((S, S), np.float32)
def seam(m, d):
    seamd[m] = np.minimum(seamd[m], d[m])
fz_sk = fus & skin_m
for rA in RING_A: seam(fz_sk, np.abs(a - rA))
wsk = wing & skin_m & (a > LEw - 0.02) & (a < HGw - 0.03) & (ax > hw + 0.25)
seam(wsk, np.abs(a - (LEw + 0.90)) * 0.72); seam(wsk & (ax > 4.95), np.abs(a - (LEw + 0.55 * CHw)) * 0.72)
for xr in RIB: seam(wsk & (a > LEw + 0.9), np.abs(ax - xr))
seam(wsk, np.abs(ax - 8.90))                                         # разъём внешней консоли
fm = np.isin(cls, (1,))
seam(fm & skin_m, np.abs(a - (FLE(zg) + 0.55)) * 0.8); seam(fm & skin_m, np.abs(zg - 6.05) + 9.0 * (a < FLE(zg) + 0.55))
def rect(A, Q, a0, a1, q0, q1, vm, tone):
    global hatch
    ins = vm & (A > a0) & (A < a1) & (Q > q0) & (Q < q1) & skin_m
    d = np.minimum.reduce([A - a0, a1 - A, Q - q0, q1 - Q]); hedge[ins] = np.minimum(hedge[ins], d[ins]); hatch[ins] = 1.0; col[ins] *= tone; rough[ins] -= 0.025
bot_m = nz < -0.45; top_m = nz > 0.45; sr_m = np.abs(nx) > 0.5
rect(a, x, 7.05, 8.70, -0.42, 0.42, bot_m, 1.010)                  # входная дверь экипажа под носом
# створки шасси в файле самолёта не лежат (они в файле стоек): контур нарисован швом на целой обшивке (vul_gear NOSE_BAY, MAIN_BAY)
rect(a, x, 8.90, 11.20, -0.40, 0.0, bot_m, 1.0); rect(a, x, 8.90, 11.20, 0.0, 0.40, bot_m, 1.0)
for x0_, x1_ in ((4.05, 4.75), (4.75, 5.45)): rect(a, ax, 17.80, 20.30, x0_, x1_, bot_m, 1.0)
RS = np.random.RandomState(31)
for k in range(46):                                                 # лючки обслуживания: снизу больше, сверху меньше, по сетке нервюр
    side_ = 'bot' if k < 32 else 'top'; sg = 1 if k % 2 else -1; xr = RIB[RS.randint(0, len(RIB) - 1)] + RS.uniform(0.15, 0.55); w_ = RS.uniform(0.28, 0.75); h_ = RS.uniform(0.25, 0.85)
    le_ = float(ns['LE'](xr)); te_ = 27.0 + 0.035 * xr - (1.30 - 0.024 * (xr - 4.0)); a0 = RS.uniform(le_ + 1.0, max(le_ + 1.1, te_ - h_ - 0.25))
    rect(a, sg * x, a0, a0 + h_, xr, xr + w_, (bot_m if side_ == 'bot' else top_m) & wing, 1.0 + RS.uniform(-0.02, 0.02))
for k in range(14):                                                 # люки на бортах фюзеляжа
    sg = 1 if k % 2 else -1; a0 = RS.uniform(9.5, 27.0); h_ = RS.uniform(0.30, 0.70); zz = RS.uniform(2.55, 3.9); w_ = RS.uniform(0.22, 0.45)
    rect(a, zg, a0, a0 + h_, zz, zz + w_, sr_m & fus & (sg * x > 0), 1.0 + RS.uniform(-0.02, 0.02))
log('швы и люки')
# ── пятна, выгорание, потёки, копоть, грязь ──
mott = fbm(0.30, 0.30, 0.30, 4, 1.0); fine = fbm(9.0, 9.0, 9.0, 2, 5.0); patch = fbm(0.8, 0.8, 0.8, 4, 9.0)
low_ = smooth(-0.05, -0.5, nz); col *= (1 + (mott - 0.5) * (0.11 - 0.05 * low_) + (fine - 0.5) * 0.02)[..., None]
polish = smooth(0.55, 0.72, fbm(0.5, 0.5, 0.5, 3, 13.0)); rough += (mott - 0.5) * 0.08 - polish * 0.07
sun = smooth(0.25, 0.9, nz); col = mix(col, BASE * np.array([1.06, 1.06, 1.05], np.float32), sun * smooth(0.40, 0.72, patch) * 0.20)
stre = fbm(0.45, 7.0, 7.0, 4, 3.0); stre2 = fbm(0.25, 16.0, 16.0, 3, 17.0)
flow = smooth(0.50, 0.70, stre) * (0.35 + 0.65 * smooth(0.35, 0.70, patch)); flow2 = smooth(0.58, 0.74, stre2)
rearw = 0.45 + 0.55 * smooth(14.0, 27.0, a)
dirty = flow * rearw * 0.22 * (1 - 0.6 * smooth(-0.05, -0.5, nz))
col = mix(col, (0.24, 0.245, 0.25), dirty * 0.13); rough += dirty * 0.12 + flow2 * 0.035
under = smooth(-0.15, -0.75, nz); oil = under * smooth(0.48, 0.70, fbm(0.6, 3.0, 3.0, 4, 23.0))
col = mix(col, (0.30, 0.295, 0.285), oil * 0.05); rough += oil * 0.10     # снизу слабее: пятна читались как второй камуфляж
# потёки за люками и швами снизу (поток назад)
aft_ = smooth(0.0, 0.03, hedge) * 0.0
# копоть: хвостовой конус и низ между трубами за срезами сопел (vulcan_02, 06), мягко
soot = smooth(27.2, 28.6, a) * (ax < 3.9) * (1 - 0.6 * upm) * (0.4 + 0.6 * smooth(0.30, 0.72, fbm(0.5, 1.8, 1.8, 4, 31.0))) * skin_m * 0.40
col = mix(col, (0.12, 0.115, 0.11), soot * 0.55); rough += soot * 0.22
# грязь у швов, щели, затенение тела
hair = smooth(max(0.010, 1.1 * DS), 0.002, seamd) * skin_m; col *= (1 - 0.06 * hair)[..., None]; rough += hair * 0.05
halo = smooth(0.06, 0.0, seamd) * smooth(0.30, 0.66, stre) * skin_m; col *= (1 - 0.03 * halo)[..., None]
crev = smooth(0.70, 0.30, ao1) * skin_m; col = mix(col, (0.14, 0.14, 0.14), crev * 0.38); rough += crev * 0.15
body_ = smooth(0.15, 0.95, ao2); col *= (0.88 + 0.12 * body_)[..., None]; col *= (0.96 + 0.04 * smooth(0.45, 0.95, ao1))[..., None]
fade = smooth(-0.7, 0.8, nz); col *= (0.96 + 0.06 * fade)[..., None]
# кромки: передняя кромка чуть светлее (стёрта), сколы мало (самолёт ухоженный)
edge = smooth(0.985, 0.90, bev) * skin_m
da_le = a - LEw
LE_w = smooth(0.18, 0.02, da_le) * smooth(-0.03, 0.02, da_le) * wing
col = mix(col, BASE * 1.07, LE_w * 0.30); rough -= LE_w * 0.08
chip = np.maximum(edge * smooth(0.55, 0.64, fbm(10.0, 10.0, 10.0, 3, 41.0)), LE_w * smooth(0.66, 0.78, fbm(6.0, 6.0, 6.0, 3, 37.0)) * 0.35)
scuff = smooth(0.020, 0.006, hedge) * smooth(0.60, 0.70, fbm(16.0, 16.0, 16.0, 3, 43.0)) * 0.5
mov = np.isin(cls, (2, 3, 4, 6, 7)); chip = chip * np.where(mov, 0.12, 0.45)
bare = np.clip(chip * 0.8 + scuff * 0.5, 0, 1) * skin_m * np.where(np.isin(cls, (1, 4)), 0.3, 1.0)
BARE = np.array((0.58, 0.59, 0.61), np.float32)
col = mix(col, BARE, bare); rough = rough * (1 - bare) + bare * (0.36 + 0.05 * fine); metal = np.maximum(metal, smooth(0.45, 0.75, bare))
rough -= edge * 0.10 + scuff * 0.12
log('краска')
# ── нос и хвост: обтекатель локатора тем же серым, но глаже, у стыка тонкая тёмная линия (vulcan_01, 05); колпак киля чёрный (vulcan_01, 04) ──
rad = (cls == 0) & (a < 4.40) & skin_m
col[rad] = mix(col, C_GRY * 1.02, np.ones((S, S), np.float32))[rad]; rough[rad] = 0.34
cap = cls == 5; col[cap] = (np.array((0.075, 0.078, 0.08), np.float32) * (0.92 + 0.16 * fine[cap, None])); rough[cap] = 0.50; metal[cap] = 0
# ── знаки ──
FNB = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
MARKS = []
def _mark(name, ins, A_, side):
    ys, xs = np.nonzero(ins); on = A_ > 0.25
    if not on.any(): return
    ys, xs = ys[on], xs[on]; Q_ = x[ys, xs] if side in ('top', 'bot') else zg[ys, xs]; MARKS.append((name, side, float(a[ys, xs].min()), float(a[ys, xs].max()), float(Q_.min()), float(Q_.max())))


def stamp(im_, ac, qc, W_, H_, side, along=True, alpha=0.94, rough_to=None, cl=(0,)):
    """Картинка на обшивку. along: ширина вдоль корпуса; иначе ширина вдоль размаха, верх картинки к носу. qc для бортов - высота над землёй."""
    A0 = np.asarray(im_, np.float32) / 255.0; hp, wp = A0.shape[:2]
    vm, Q_ = ((nz > 0.35, x) if side == 'top' else (nz < -0.35, x) if side == 'bot' else (nx > 0.35, zg) if side == 'r' else (nx < -0.35, zg))
    if along: ins = vm & (np.abs(a - ac) < W_ / 2) & (np.abs(Q_ - qc) < H_ / 2)
    else: ins = vm & (np.abs(Q_ - qc) < W_ / 2) & (np.abs(a - ac) < H_ / 2)
    ins &= (mat == 0) & np.isin(cls, cl) & cov
    if not ins.any(): log('знак не лёг', ac, qc, side); return
    if along:
        u_ = (a[ins] - ac) / W_ + 0.5; v_ = 0.5 - (Q_[ins] - qc) / H_
        if side == 'r': u_ = 1 - u_
    else:
        u_ = (Q_[ins] - qc) / W_ + 0.5; v_ = (a[ins] - ac) / H_ + 0.5
        if side == 'bot': u_ = 1 - u_
    du, dv = 0.25 * DS / W_, 0.25 * DS / H_
    S_ = 0.0
    for su, sv in ((-1, -1), (1, -1), (-1, 1), (1, 1), (0, 0)):
        S_ = S_ + A0[np.clip(((v_ + sv * dv) * hp).astype(int), 0, hp - 1), np.clip(((u_ + su * du) * wp).astype(int), 0, wp - 1)]
    S_ = S_ / 5.0
    al = S_[:, 3] * alpha * (0.95 + 0.05 * smooth(0.30, 0.62, fine[ins])) * (1 - 0.2 * bare[ins])
    S_[:, :3] = np.where(S_[:, 3:4] > 1e-3, S_[:, :3] / np.maximum(S_[:, 3:4], 1e-3), 0.0)
    _mark(f'картинка {ac:.2f},{qc:.2f}', ins, al, side); col[ins] = col[ins] * (1 - al[..., None]) + S_[:, :3] * al[..., None]
    rough[ins] = rough[ins] * (1 - al) + (0.42 if rough_to is None else rough_to) * al


RED_B = (168, 40, 44, 255); BLUE_B = (36, 54, 116, 255); WHITE = (232, 234, 232, 255); INK = (30, 32, 34, 255)
def roundel_b(W=1000):
    """Круг тип B: синее кольцо, красный центр (обычный тусклый знак RAF на камуфляже, нарисован здесь)."""
    im_ = Image.new('RGBA', (W, W), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); c = W / 2; R_ = W / 2 - 4
    for r_, c_ in ((R_, BLUE_B), (R_ * 0.48, RED_B)): d_.ellipse((c - r_, c - r_, c + r_, c + r_), fill=c_)
    return im_
def flash_b(W=600, H=380):
    """Полосы на киле: красная к носу, синяя к хвосту (левый край картинки - к носу)."""
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_)
    for i, c_ in enumerate((RED_B, BLUE_B)): d_.rectangle((W * i / 2, 0, W * (i + 1) / 2, H), fill=c_)
    return im_
def text_img(t, H=260, ink=INK, font=FNB):
    f_ = ImageFont.truetype(font, int(H * 0.86)); tmp = ImageDraw.Draw(Image.new('L', (8, 8))); bb = tmp.textbbox((0, 0), t, font=f_); W = bb[2] - bb[0] + 30
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(im_).text((W / 2, H / 2), t, font=f_, fill=ink, anchor='mm'); return im_
def tri_warn(S_=400):
    """Красный треугольник предупреждения у кабины, вершиной вверх, белое поле внутри."""
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); d_.polygon([(S_ / 2, S_ * 0.06), (S_ * 0.96, S_ * 0.92), (S_ * 0.04, S_ * 0.92)], fill=RED_B)
    d_.polygon([(S_ / 2, S_ * 0.32), (S_ * 0.76, S_ * 0.80), (S_ * 0.24, S_ * 0.80)], fill=WHITE); return im_
RND = roundel_b(); SER = 'XQ706'
for sd in ('r', 'l'):
    stamp(RND, 7.00, 3.62, 1.15, 1.15, sd, alpha=0.97)                                        # круг на борту под кабиной (vulcan_01, 04, 05)
    stamp(flash_b() if sd == 'l' else flash_b().transpose(Image.FLIP_LEFT_RIGHT), 24.10, 5.25, 1.05, 0.66, sd, cl=(1,), alpha=0.97)   # полосы на киле, красная к носу с обеих сторон
    stamp(text_img(SER), 23.75, 4.66, 1.70, 0.40, sd, cl=(1,), alpha=0.90)                     # номер придуманный, под полосами (как XH558 на vulcan_01)
    stamp(tri_warn(), 5.98, 4.05, 0.20, 0.20, sd, alpha=0.95)                                   # треугольник у фонаря
for sg in (1, -1):
    stamp(RND, 22.40, sg * 10.4, 2.00, 2.00, 'top', along=False, alpha=0.97)                   # круги на обеих консолях сверху (vulcan_01); снизу знаков нет (vulcan_04)
_bad = 0
for i_, m1 in enumerate(MARKS):
    for m2 in MARKS[i_ + 1:]:
        if m1[1] == m2[1] and m1[2] - 0.04 < m2[3] and m2[2] - 0.04 < m1[3] and m1[4] - 0.04 < m2[5] and m2[4] - 0.04 < m1[5]: _bad += 1; log(f'НАЛОЖЕНИЕ {m1[1]}: {m1[0]} и {m2[0]}')
log(f'знаков {len(MARKS)}, наложений: {_bad}')
# ── сопла: металл с цветами побежалости, кромка светлее, внутри тёмные ──
tn = fbm(1.2, 4.0, 4.0, 4, 59.0); ts = fbm(0.8, 14.0, 14.0, 3, 61.0)
noz = cls == 10
pcx = np.where(ax < (PIPES[0] + PIPES[1]) / 2, PIPES[0], PIPES[1]) * np.sign(x); pcz = PIPE_Z - ZA
rr0 = np.maximum(np.hypot(x - pcx, z - pcz), 1e-3); outw = (nx * (x - pcx) + nz * (z - pcz)) / rr0 > 0.15
ncol = np.array((0.47, 0.46, 0.44), np.float32) * (0.86 + 0.26 * ts)[..., None]; heat = smooth(PIPE_A1 - 0.7, PIPE_A1 + 0.05, a) * (0.5 + 0.5 * tn)
ncol = ncol * (1 - 0.30 * heat)[..., None] + np.array((0.20, 0.17, 0.15), np.float32) * (0.30 * heat)[..., None]
col[noz] = ncol[noz]; metal[noz] = 1.0; rough[noz] = np.clip(0.48 + (tn[noz] - 0.5) * 0.12, 0.38, 0.62)
ins_ = noz & (~outw); iv = (0.15 + 0.06 * ts); col[ins_] = np.stack([iv, iv * 0.96, iv * 0.92], -1)[ins_]; metal[ins_] = 0.5; rough[ins_] = 0.72
log('сопла')
# ── материалы без краски обшивки ──
def solid(m, c, r, me=0.0, nz_=0.08):
    col[m] = np.array(c, np.float32) * (1 - nz_ / 2 + nz_ * fine[m])[..., None]; rough[m] = r; metal[m] = me
solid(mat == 10, (0.20, 0.21, 0.22), 0.85)                          # швы
solid(mat == 2, (0.030, 0.030, 0.032), 0.9)                         # нутро
solid(mat == 4, (0.050, 0.050, 0.052), 0.88)                        # резина
cockm = (mat == 5) & ((cls == 11) | ((cls == 0) & (a < 10.0))); solid(cockm, (0.075, 0.078, 0.082), 0.66, 0, 0.16)    # кабина: чёрная
# отсек: стенки выреза, нутро, рёбра створок и изнанка створок - серо-зелёная грунтовка; без затенения 0,45 м (отсек запекался закрытым)
baym = (cls == 13) | ((cls == 0) & (mat == 5) & (a > 13.0) & (a < 23.0) & (ax < 1.2)) | (np.isin(cls, (3, 7)) & (nz > 0.25))
solid(baym & (mat != 1) & (mat != 2), (0.50, 0.52, 0.48), 0.62, 0, 0.12)
col[baym] *= (0.55 + 0.45 * smooth(0.25, 0.95, ao1[baym]))[..., None]
solid(baym & (mat == 1), (0.40, 0.41, 0.42), 0.40, 0.85)                                    # балки, замки, цилиндры
borem = (cls == 0) & (np.isin(mat, (1, 5))) & (a > 24.5); solid(borem, (0.16, 0.15, 0.14), 0.62, 0.7, 0.18)   # трубы изнутри
# заборник: у кромки серый, вглубь в чёрное
duct_m = mat == 11; dd = np.clip(a - LEw, 0, 9); solid(duct_m, (0.36, 0.37, 0.37), 0.70, 0, 0.10)
col[duct_m] *= (0.14 + 0.86 * smooth(3.2, 0.3, dd[duct_m]))[..., None]
solid(mat == 6, (0.30, 0.31, 0.22), 0.92, 0, 0.2)                   # подушки
solid(mat == 8, (0.30, 0.28, 0.21), 0.9, 0, 0.14)                   # ремни
solid(mat == 7, (0.018, 0.038, 0.032), 0.12, 0, 0.0)                # экраны
hs = ((pos[..., 0] + pos[..., 1] + pos[..., 2]) / 0.035) % 1.0 > 0.5
solid(mat == 9, (0.74, 0.60, 0.06), 0.42); col[(mat == 9) & hs] = np.array((0.035, 0.035, 0.035), np.float32)   # рукоятки: жёлто-чёрные
solid((cls == 8) & (mat == 1), (0.42, 0.43, 0.44), 0.42, 0.8)                                 # балки Shrike
d14 = (cls == 14)
solid(d14, (0.20, 0.21, 0.22), 0.52, 0.2, 0.12)                                              # антенны, приёмники, рамки окон: тёмно-серые
probe_m = d14 & (a < 2.45); solid(probe_m, (0.50, 0.51, 0.52), 0.34, 0.9, 0.10)             # штанга дозаправки: металл
solid(d14 & (a < 0.25), (0.12, 0.12, 0.12), 0.5, 0.6)                                        # наконечник штанги
solid((cls == 9) & (mat == 1), (0.44, 0.45, 0.46), 0.38, 1.0)
# шасси: светло-серые стойки, блестящие штоки, тёмная сталь, серые диски, резина, пыль (vulcan_04, 05)
gr_ = cls == 12; g_p = gr_ & (mat == 0); g_c = gr_ & (mat == 1); g_s = gr_ & (mat == 8); g_d = gr_ & (mat == 5)
gm1 = fbm(2.4, 2.4, 2.4, 4, 91.0); gm2 = fbm(18.0, 18.0, 18.0, 3, 93.0); gst = fbm(1.0, 16.0, 2.2, 4, 87.0); gst2 = fbm(0.7, 34.0, 1.3, 3, 89.0)
solid(g_p, (0.58, 0.59, 0.59), 0.48, 0.25, 0.10); solid(g_c, (0.50, 0.50, 0.49), 0.28, 0.9, 0.08); solid(g_s, (0.16, 0.155, 0.15), 0.56, 0.75, 0.14)
solid(g_d, (0.42, 0.43, 0.44), 0.55, 0.2, 0.10); solid(gr_ & (mat == 2), (0.05, 0.048, 0.046), 0.72, 0, 0.14); solid(gr_ & (mat == 9), (0.60, 0.56, 0.40), 0.28, 0, 0.1)
painted = g_p | g_d
col[painted] *= (0.86 + 0.26 * gm1[painted] + 0.05 * gm2[painted])[..., None]
oil_ = smooth(0.46, 0.68, gst) * (0.5 + 0.5 * smooth(0.40, 0.70, gst2)); col = mix(col, (0.16, 0.135, 0.10), oil_ * 0.50 * (painted | g_c)); rough = rough + oil_ * 0.18 * painted - oil_ * 0.10 * g_c
gd = smooth(1.2, 0.2, zg) * gr_ * (0.45 + 0.55 * smooth(0.36, 0.66, gm1)); col = mix(col, (0.24, 0.215, 0.18), gd * 0.50 * (painted | g_s)); rough = rough + gd * 0.2 * painted
g_e = smooth(0.985, 0.90, bev) * painted * smooth(0.50, 0.62, gm2); col = mix(col, (0.28, 0.275, 0.26), g_e * 0.7)
tyr = mat == 4; rt_ = smooth(0.40, 0.68, gm2) * tyr; col = mix(col, (0.17, 0.16, 0.15), rt_ * 0.45); col = mix(col, (0.21, 0.20, 0.18), smooth(0.25, 0.0, zg) * tyr * 0.5); rough[tyr] = 0.90
col[gr_] *= (0.55 + 0.45 * smooth(0.15, 0.95, ao2[gr_]))[..., None]
rough = np.clip(rough, 0.08, 0.97); metal = np.clip(metal, 0, 1)
for c_ in range(16):
    m_ = (cls == c_) & cov
    if m_.sum() > 300: print('деталь', c_, 'цвет', (col[m_].mean(0) * 255).round(0), 'G', round(float(rough[m_].mean()), 2), 'B', round(float(metal[m_].mean()), 2))
col = np.clip(col, 0, 1)
log('материалы')
# ── высота и нормали: швы - узкая канавка, крышки люков на волос выше, лёгкая волна листов ──
gw = max(0.006, 0.9 * DS)
height -= smooth(gw, 0.0, seamd) * 0.0010 * skin_m
height += smooth(0.0, 2.5 * gw, hedge) * 0.0004 * (hedge < 8); height -= smooth(gw, 0.0, hedge) * 0.0009 * (hedge < 8)
wav = fbm(1.0, 1.0, 1.0, 2, 79.0); height += (wav - 0.5) * 0.004 * skin_m
shag = fbm(60.0, 60.0, 60.0, 2, 73.0); height += (shag - 0.5) * 0.00012 * skin_m
gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * DS); gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / (2 * DS)
nn = np.stack([-gx, -gy, np.ones_like(gx)], -1); nn /= np.linalg.norm(nn, axis=-1, keepdims=True)
solidm = np.isin(mat, (2, 10, 7, 9, 11, 12)) | np.isin(cls, (10, 11, 12, 13, 14))
nn[solidm] = (0, 0, 1)
def bleed(arrs, mask, n=16):
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
occ = np.where(baym, 0.45 + 0.55 * smooth(0.25, 0.95, ao1), occ)
occ = np.where(duct_m, 0.25 + 0.55 * smooth(3.0, 0.3, dd), occ)
bleed([col, rough, metal, occ, nn], cov)
def lift(arr): return (np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)
Image.fromarray(lift(col)[::-1]).save(f'{OUT}/vul_color.png', compress_level=1)
Image.fromarray(lift(nn * 0.5 + 0.5)[::-1]).save(f'{OUT}/vul_normal.png', compress_level=1)
Image.fromarray(lift(np.stack([occ, rough, metal], -1))[::-1]).save(f'{OUT}/vul_orm.png', compress_level=1)
for nm_, pm in (('верх', skin_m & cov & (cls == 0) & (upm > 0.5) & (nz > 0.3)), ('низ', skin_m & cov & (cls == 0) & (upm < 0.5) & (nz < -0.3))):
    print('средний цвет обшивки,', nm_, 'sRGB', (col[pm].mean(0) * 255).round(1), 'шероховатость', round(float(rough[pm].mean()), 3))
log('сохранено', OUT)
# ── план прямо из данных: сверху, снизу и слева, для сравнения с фото без Blender ──
if os.environ.get('VUL_PREV'):
    K = 30.0
    def plan(name, keep, U, V, D, w, h):
        ii = np.nonzero(keep & cov); u_ = ((U[ii] + w / 2) * K).astype(int); v_ = ((V[ii]) * K).astype(int); d_ = D[ii]
        W_, H_ = int(w * K) + 2, int(h * K) + 2; ok = (u_ >= 0) & (u_ < W_) & (v_ >= 0) & (v_ < H_); u_, v_, d_ = u_[ok], v_[ok], d_[ok]; c_ = col[ii][ok] * (0.55 + 0.45 * np.clip(nor[ii][ok] @ np.array([0.3, 0.2, 0.93] if "сверху" in name else [0.3, 0.2, -0.93] if "снизу" in name else [0.93, 0.2, 0.3] if "справа" in name else [-0.93, 0.2, 0.3]), 0, 1))[:, None]
        o_ = np.argsort(d_); im = np.full((H_, W_, 3), 0.8, np.float32); im[v_[o_], u_[o_]] = c_[o_]
        Image.fromarray(lift(im)).save(os.path.join(OUT, name))
    plan('план_сверху.png', nz > -0.05, x, a, zg, 34.5, 31.5)
    plan('план_снизу.png', nz < 0.05, -x, a, -zg, 34.5, 31.5)
    plan('план_слева.png', nx < 0.05, a - 15.5, 6.5 - zg, -x, 31.5, 7.0)
    plan('план_справа.png', nx > -0.05, -a + 15.5, 6.5 - zg, x, 31.5, 7.0)
    log('планы')
