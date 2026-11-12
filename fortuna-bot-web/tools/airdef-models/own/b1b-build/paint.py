# paint.py - краска B-1B Lancer из данных gbuf.py: цвет (только краска и грязь, без света), нормали, ORM glTF (R затенение, G шероховатость, B металл). Без Blender: /usr/bin/python3 -I paint.py
# B1_TEX=2048|4096, B1_OUT=<папка>, B1_BASE=r,g,b (sRGB 0…1) - основной серый. B1_PREV=1 - ещё план сверху/снизу/сбоку прямо из данных.
# Схема: тёмно-серая «gunship grey» (фото 01, 06, 08, 11), конус локатора темнее и глаже. Реализм по Свои/CLAUDE.md 4, 7, 9-13 и _окраска_задание.md:
# листы разного тона и подкраски пятнами, матовая краска с затёртым блеском у люков, светлые гладкие передние кромки (эрозия), потёки по потоку от лючков, дренажей
# и стыков рулей, масло снизу у гондол и ниш, копоть за соплами, брызги от колёс, сколы и царапины по фотомаскам CC0 (грунт в глубоких), швы и заклёпки рядами в нормалях,
# вымышленные трафареты (NO STEP, RESCUE, заправка, треугольники у заборников и сопел, давление шин), вымышленные код и номер на киле. Пиксели фото не используются.
import json, math, os, site, sys, time
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image, ImageDraw, ImageFont
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__)); DAT = os.path.join(HERE, '_проба'); CC0D = os.path.join(HERE, '..', '_текстуры_CC0')
S = int(os.environ.get('B1_TEX', '2048')); OUT = os.environ.get('B1_OUT', DAT); os.makedirs(OUT, exist_ok=True)
env3 = lambda k, d: np.array([float(v) for v in os.environ.get(k, d).split(',')], np.float32)
C_BASE = env3('B1_BASE', '0.470,0.492,0.515')                       # gunship grey без света; в игре солнце поднимает (сверка - по рендеру против фото 01)
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f} с]', *a, flush=True)
L_ = 44.50
pos = np.load(f'{DAT}/gb_pos_{S}.npy'); nor = np.load(f'{DAT}/gb_nor_{S}.npy'); idd = np.load(f'{DAT}/gb_id_{S}.npy'); aob = np.load(f'{DAT}/gb_ao_{S}.npy')
ATLAS = json.load(open(f'{DAT}/uv.json', encoding='utf-8'))['atlas_m']; PXM = 0.985 * S / ATLAS; DS = 1.0 / PXM
mat = np.round(idd[..., 0] * 16).astype(np.int8); cls = np.round(idd[..., 1] * 32).astype(np.int8); cov = idd[..., 2] > 0.5
a = (L_ / 2 - pos[..., 1]).astype(np.float32); x = pos[..., 0].astype(np.float32); z = pos[..., 2].astype(np.float32); ax = np.abs(x)
nx, ny, nz = nor[..., 0], nor[..., 1], nor[..., 2]
ao1, ao2, bev = aob[..., 0].copy(), aob[..., 1].copy(), aob[..., 2]
doors = np.isin(cls, (3, 7)); ao1[doors] = 1.0; ao2[doors] = 1.0      # створки запекались закрытыми
log('данные загружены', S, 'плотность', round(PXM), 'пикс/м')
# ── таблицы формы из b1b_geo.py ──
src = open(os.path.join(HERE, 'b1b_geo.py'), encoding='utf-8').read(); ns = {'math': math}
exec(src[src.index('class Track:'):src.index('def tracks(')], ns)
exec(src[src.index('FUS = ['):src.index('FT = tracks(')], ns)
FA = np.array([r[0] for r in ns['FUS']]); F_HW = np.array([r[3] for r in ns['FUS']]); F_TOP = np.array([r[1] for r in ns['FUS']]); F_BOT = np.array([r[2] for r in ns['FUS']])
hw = np.interp(a, FA, F_HW).astype(np.float32); ztop = np.interp(a, FA, F_TOP).astype(np.float32); zbot = np.interp(a, FA, F_BOT).astype(np.float32)
NAC_XC, NAC_A0, NAC_A1, ENG_DX, ENG_Z = 3.75, 20.80, 32.20, 0.62, -3.66


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


def fbm(fa, fx_, fz_, octv=3, seed=0.0, A=None, X=None, Zz=None):
    A = a if A is None else A; X = x if X is None else X; Zz = z if Zz is None else Zz
    r = 0.0; w = 0.5; tot = 0.0; pa, px, pz = A * fa, X * fx_, Zz * fz_
    wa = vnoise(pa * 0.7 + seed + 11.3, px * 0.7 - seed, pz * 0.7 + 5.1) - 0.5; wb = vnoise(pa * 0.7 - 7.7, px * 0.7 + seed + 3.3, pz * 0.7 - seed) - 0.5
    pa, px, pz = pa + wa * 0.9, px + wb * 0.9, pz + (wa - wb) * 0.6
    for i in range(octv):
        qa = R3[0, 0] * pa + R3[0, 1] * px + R3[0, 2] * pz; qx = R3[1, 0] * pa + R3[1, 1] * px + R3[1, 2] * pz; qz = R3[2, 0] * pa + R3[2, 1] * px + R3[2, 2] * pz
        pa, px, pz = qa * 2.03, qx * 2.03, qz * 2.03
        r = r + w * vnoise(qa + seed + i * 3.1, qx - seed * 0.7, qz + seed * 1.3 + i); tot += w; w *= 0.5
    return r / tot


def mix(c, col_, t):
    t = np.clip(t, 0, 1)[..., None]; return c * (1 - t) + np.asarray(col_, np.float32) * t


# ── фотомаски CC0 (ambientCG, Свои/_текстуры_CC0): кубическая проекция по координатам самолёта; потёки - полосами по потоку (назад по a) ──
_MASKS = {}
def mask_img(rel):
    if rel not in _MASKS:
        im = np.asarray(Image.open(os.path.join(CC0D, rel)).convert('L').resize((1024, 1024), Image.BILINEAR), np.float32) / 255.0; _MASKS[rel] = im
    return _MASKS[rel]
def samp(im, u, v):
    h_, w_ = im.shape; return im[(np.mod(v, 1.0) * h_).astype(np.int32) % h_, (np.mod(u, 1.0) * w_).astype(np.int32) % w_]
def tri(rel, tile, off=0.0, flow=False):
    """Кубическая проекция маски: tile - метры на повтор. flow=True - полосы потёков вдоль a (вид сверху/снизу и сбоку)."""
    im = mask_img(rel); wx, wy, wz = np.abs(nx) ** 4, np.abs(ny) ** 4, np.abs(nz) ** 4; sw = wx + wy + wz + 1e-6
    if flow:
        sx_ = samp(im, (z + off) / tile, a / (tile * 2.5)); sz_ = samp(im, (x + off) / tile, a / (tile * 2.5)); sy_ = samp(im, (x + off) / tile, z / tile)
    else:
        sx_ = samp(im, (a + off) / tile, z / tile); sy_ = samp(im, (x + off) / tile, z / tile); sz_ = samp(im, (a + off) / tile, x / tile)
    return (sx_ * wx + sy_ * wy + sz_ * wz) / sw
SI3 = 'SurfaceImperfections003/SurfaceImperfections003_2K-JPG_Opacity.jpg'; SI13 = 'SurfaceImperfections013/SurfaceImperfections013_2K-JPG_Opacity.jpg'
SC3 = 'Scratches003/Scratches003_2K-JPG_Opacity.jpg'; SC5 = 'Scratches005/Scratches005_2K-JPG_Opacity.jpg'
LK12 = 'Leaking012A/Leaking012A_2K-JPG_Color.jpg'; LK17 = 'Leaking017B/Leaking017B_2K-JPG_Color.jpg'

skin_m = (mat == 0) | (mat == 6)
paintc = np.isin(cls, (0, 1, 2, 3, 4, 5, 6, 7, 8, 14))               # всё, что окрашено краской обшивки
col = np.tile(C_BASE, (S, S, 1)).astype(np.float32); rough = np.full((S, S), 0.58, np.float32); metal = np.full((S, S), 0.04, np.float32); height = np.zeros((S, S), np.float32)
fine = fbm(9.0, 9.0, 9.0, 2, 5.0); mott = fbm(0.30, 0.30, 0.30, 4, 1.0)
# ── листы обшивки: границы по кольцам фюзеляжа, продольным швам, нервюрам консолей; у каждого листа свой тон (±4 %) и блеск ──
RING_A = np.array([2.35, 4.20, 5.40, 8.15, 10.90, 13.50, 15.80, 18.40, 20.70, 23.20, 25.90, 28.40, 30.80, 33.40, 35.90, 38.30, 40.60, 42.50], np.float32)
LONG_Z = np.array([-2.55, -1.55, -0.85], np.float32)
fus = (cls == 0) & (ax < hw + 0.05)
glove = (cls == 0) & ~fus
tt = np.random.RandomState(7).uniform(0.985, 1.015, 512).astype(np.float32); rt = np.random.RandomState(8).uniform(-0.04, 0.04, 512).astype(np.float32); hue = np.random.RandomState(9).uniform(-0.006, 0.006, 512).astype(np.float32)
band = np.searchsorted(RING_A, a); zb_ = np.searchsorted(LONG_Z, z)
idx = (band * 16 + zb_ * 4 + (x > 0) * 2) % 512
gi = (band * 8 + np.searchsorted(np.array([2.4, 3.3, 4.2], np.float32), ax) * 2 + (x > 0)) * 3 + 101; idx = np.where(glove, gi % 512, idx)   # листы наплыва - по тем же швам
# консоли и рули: в своей системе нет a/x по размаху - берём расстояние от корпуса и вдоль потока
wpan = np.isin(cls, (4, 8, 6, 1, 2))
wi = (np.floor(np.hypot(ax - 3.9, a - 20.5) / 2.4).astype(np.int32) * 6 + (x > 0) * 3 + (nz > 0) + cls.astype(np.int32) * 37 + 211) % 512
idx = np.where(wpan, wi, idx)
col *= tt[idx][..., None]; rough += rt[idx]; col[..., 0] *= 1 + hue[idx]; col[..., 2] *= 1 - hue[idx]
# подкраски пятнами: прямоугольники чуть другого серого (фото 06, 11) - свежая краска глаже
RS = np.random.RandomState(51)
for k in range(18):
    a0 = RS.uniform(3.0, 42.0); hl = RS.uniform(0.4, 1.8); w0 = RS.uniform(-2.2, 2.2); wl = RS.uniform(0.3, 1.1); tone = RS.uniform(0.955, 1.035)
    side = RS.randint(0, 3); Q = (x if side < 2 else z); m_ = paintc & (np.abs(a - a0) < hl / 2) & (np.abs(Q - w0) < wl / 2) & ((nz > 0.3) if side == 0 else (nz < -0.3) if side == 1 else (np.abs(nx) > 0.5))
    edge_ = smooth(0.0, 0.10, np.minimum(hl / 2 - np.abs(a - a0), wl / 2 - np.abs(Q - w0)))
    t_ = m_ * edge_ * (0.6 + 0.4 * smooth(0.3, 0.6, fine)); col *= (1 + (tone - 1) * t_)[..., None]; rough -= t_ * 0.06
log('листы')
# ── швы, ряды заклёпок, лючки ──
seamd = np.full((S, S), 9.0, np.float32); hedge = np.full((S, S), 9.0, np.float32); hatch = np.zeros((S, S), np.float32)
def seam(m, d): seamd[m] = np.minimum(seamd[m], d[m])
fz_sk = fus & skin_m
for rA in RING_A: seam(fz_sk, np.abs(a - rA))
for lz in LONG_Z: seam(fz_sk & (a > 5.5) & (a < 42.0), np.abs(z - lz) * 1.1)
gsk = glove & skin_m
for rA in RING_A[(RING_A > 10.5) & (RING_A < 36)]: seam(gsk, np.abs(a - rA))
for xr in (2.4, 3.3, 4.2): seam(gsk & (np.abs(nz) > 0.5), np.abs(ax - xr))
nac = (cls == 0) & (ax > 2.1) & (ax < 5.4) & (z < -2.9) & (a > NAC_A0 - 0.2) & (a < NAC_A1 + 0.1)
for rA in (NAC_A0 + 0.45, 23.4, 25.6, 27.9, 29.6, 31.1): seam(nac, np.abs(a - rA))
wsurf = np.isin(cls, (8,)); r_piv = np.hypot(ax - 3.9, a - 20.5)
for rr_ in (3.0, 5.4, 7.8, 10.2, 12.6, 15.0): seam(wsurf, np.abs(r_piv - rr_))
fm = cls == 1
for zz_ in (0.62, 1.88, 3.14): seam(fm & skin_m, np.abs(z - zz_) * 1.2)
rv_line = (seamd < 0.035) & (seamd > 0.010)
def rect(A, Q, a0, a1, q0, q1, vm, tone, cl=(0,)):
    global hatch
    ins = vm & (A > a0) & (A < a1) & (Q > q0) & (Q < q1) & skin_m & np.isin(cls, cl)
    d = np.minimum.reduce([A - a0, a1 - A, Q - q0, q1 - Q]); hedge[ins] = np.minimum(hedge[ins], d[ins]); hatch[ins] = 1.0; col[ins] *= tone; rough[ins] -= 0.02
bot_m = nz < -0.45; top_m = nz > 0.45; sr_m = np.abs(nx) > 0.5
# створки ниш шасси - в файле стоек; здесь их контур швом (b1b_gear NOSE_BAY, MAIN_BAY)
rect(a, x, 8.15, 10.80, -0.46, 0.0, bot_m, 1.0); rect(a, x, 8.15, 10.80, 0.0, 0.46, bot_m, 1.0)
for sg in (1, -1): rect(a, sg * x, 21.10, 25.60, 1.30, 2.18, bot_m, 1.0)
rect(a, x, 4.30, 5.15, -0.35, 0.35, bot_m, 1.01)                   # люк под носом
RS = np.random.RandomState(31); HATCHES = []
for k in range(70):                                                # лючки обслуживания: борта фюзеляжа, гондолы, низ
    kind = k % 4; sg = 1 if (k // 4) % 2 else -1
    if kind == 0: a0 = RS.uniform(5.5, 40.0); zz = RS.uniform(-2.5, -0.9); h_ = RS.uniform(0.25, 0.75); w_ = RS.uniform(0.20, 0.50); rect(a, z, a0, a0 + h_, zz, zz + w_, sr_m & fus & (sg * x > 0), 1.0 + RS.uniform(-0.025, 0.025)); HATCHES.append((a0 + h_, sg, zz + w_ / 2, 's'))
    elif kind == 1: a0 = RS.uniform(NAC_A0 + 0.8, NAC_A1 - 1.2); zz = RS.uniform(-4.1, -3.2); h_ = RS.uniform(0.3, 0.8); w_ = RS.uniform(0.2, 0.45); rect(a, z, a0, a0 + h_, zz, zz + w_, sr_m & nac & (sg * x > 0), 1.0 + RS.uniform(-0.025, 0.025)); HATCHES.append((a0 + h_, sg, zz + w_ / 2, 'n'))
    elif kind == 2: a0 = RS.uniform(4.0, 40.0); xx = RS.uniform(-1.2, 1.2); h_ = RS.uniform(0.3, 0.9); w_ = RS.uniform(0.25, 0.6); rect(a, x, a0, a0 + h_, xx, xx + w_, bot_m & fus & ~((a > 11.0) & (a < 20.62) | (a > 26.0) & (a < 30.7)), 1.0 + RS.uniform(-0.02, 0.02)); HATCHES.append((a0 + h_, 0, xx, 'b'))
    else: a0 = RS.uniform(12.0, 32.0); xx = RS.uniform(1.8, 4.4); h_ = RS.uniform(0.3, 0.7); w_ = RS.uniform(0.25, 0.55); rect(a, sg * x, a0, a0 + h_, xx, xx + w_, top_m & glove, 1.0 + RS.uniform(-0.02, 0.02)); HATCHES.append((a0 + h_, sg, xx, 't'))
rect(a, x, 3.10, 3.55, -0.12, 0.12, top_m, 0.97)                    # приёмник дозаправки на носу (фото 01)
log('швы и лючки')
# ── глянец: в целом матовая; затёрта до блеска у люков сверху (ходят техники) и по кромкам лючков ──
walk = top_m & fus & (a > 6.5) & (a < 12.0) & (ax < 0.9)
rough -= walk * 0.10 * (0.4 + 0.6 * smooth(0.4, 0.7, fbm(1.5, 1.5, 1.5, 3, 61.0)))
rough -= smooth(0.06, 0.0, hedge) * 0.08
rough += (mott - 0.5) * 0.10 + (fbm(3.0, 3.0, 3.0, 3, 63.0) - 0.5) * 0.06
# ── фотомаски CC0: разводы и пятна по всей краске ──
si = tri(SI3, 2.2, 0.0); si2 = tri(SI13, 3.1, 7.0)
col *= (1 + (si - 0.5) * 0.05 * paintc)[..., None]; col = mix(col, C_BASE * 1.10, smooth(0.55, 0.85, si2) * 0.16 * paintc)
rough += (si - 0.5) * 0.10 * paintc
# ── передние кромки светлее и глаже (эрозия): консоли, предкрылки, стабилизатор, киль ──
LEm = np.isin(cls, (4, 8, 6, 1, 5)) & (bev < 0.995) & (np.abs(ny) > 0.35) & (ny > 0)     # смотрит вперёд
LEm = LEm | (np.isin(cls, (4,)) & (ny > 0.55))
col = mix(col, C_BASE * 1.16, LEm * 0.45 * (0.6 + 0.4 * smooth(0.3, 0.7, fine))); rough -= LEm * 0.14
# ── подтёки по потоку: от лючков, дренажей и стыков рулей назад; фотомаска потёков вытянута вдоль a ──
lk = tri(LK12, 1.6, 3.0, flow=True); lk2 = tri(LK17, 2.3, 11.0, flow=True)
stre = np.zeros((S, S), np.float32)
for a1_, sg, q_, kind in HATCHES:                                  # след за каждым лючком: узкий, мягкий по краям, сходит на нет за 0,8…2 м
    L_s = 0.8 + (abs(hash((round(a1_, 2), sg))) % 100) / 80.0
    if kind in ('s', 'n'): m_ = sr_m & (sg * x > 0); dq = np.abs(z - q_)
    elif kind == 'b': m_ = bot_m; dq = np.abs(x - q_)
    else: m_ = top_m; dq = np.abs(sg * x - q_)
    d_ = a - a1_; wd = 0.10 + 0.05 * d_ / L_s
    stre = np.maximum(stre, m_ * smooth(wd, wd * 0.25, dq) * smooth(-0.01, 0.06, d_) * (1 - d_ / L_s).clip(0, 1) ** 1.5)
hinge_st = np.isin(cls, (8, 1)) & (bev < 0.99)                       # у стыков рулей и закрылков
flowm = np.clip(stre * (0.35 + 0.65 * smooth(0.40, 0.75, lk)) + hinge_st * smooth(0.60, 0.85, lk2) * 0.5 + smooth(0.70, 0.90, lk2) * 0.18 * (nz < 0.2), 0, 1) * paintc
col = mix(col, (0.235, 0.225, 0.21), flowm * 0.22); rough += flowm * 0.08
# масло снизу: гондолы, ниши шасси, отсеки (глянцевое)
under = smooth(-0.15, -0.75, nz); oilsrc = smooth(3.0, 0.0, np.minimum(np.abs(a - 23.3), np.abs(a - 9.5))) * (ax < 2.6) + nac * smooth(25.0, 31.5, a)
oil = under * oilsrc * smooth(0.45, 0.72, tri(LK12, 2.0, 5.0, flow=True)) * paintc
col = mix(col, (0.16, 0.15, 0.135), oil * 0.40); rough -= oil * 0.18
# копоть: за соплами на кормах гондол, хвостовой конус снизу; мягкий край
soot = (smooth(NAC_A1 - 2.2, NAC_A1, a) * nac + smooth(33.0, 44.0, a) * (cls == 0) * (ax < 1.2) * smooth(-0.2, -0.8, nz) * 0.6) * (0.5 + 0.5 * smooth(0.30, 0.72, fbm(0.5, 1.8, 1.8, 4, 31.0))) * paintc
col = mix(col, (0.10, 0.095, 0.09), soot * 0.50); rough += soot * 0.15
# брызги от колёс: веером назад и вверх на низе за стойками, на створках ниш (в файле стоек)
spray = (smooth(4.0, 0.0, a - 23.3) * smooth(-0.3, 0.3, a - 23.3) * (np.abs(ax - 2.05) < 1.5) + smooth(3.5, 0.0, a - 9.6) * smooth(-0.3, 0.3, a - 9.6) * (ax < 1.0)) * under
spray = spray * smooth(0.50, 0.75, tri(SC5, 1.3, 2.0)) + (cls == 7) * smooth(0.45, 0.72, tri(SI13, 0.9, 4.0)) * 0.6
col = mix(col, (0.30, 0.27, 0.22), spray * 0.45 * paintc); rough += spray * 0.15
# пыль в затенении у стенок
dust = smooth(0.55, 0.25, ao1) * paintc * (nz > 0.2); col = mix(col, (0.36, 0.35, 0.33), dust * 0.25)
log('потёки, масло, копоть, грязь')
# ── сколы и царапины по маскам CC0: только кромки и вокруг лючков; в глубоких - грунт (жёлто-зелёный), в самых глубоких - металл ──
edge = smooth(0.985, 0.90, bev) * paintc
sc_ = tri(SC3, 1.1, 1.0); sc2 = tri(SC5, 0.8, 9.0)
chip = np.clip(edge * smooth(0.55, 0.80, sc_) * 0.9 + smooth(0.04, 0.0, hedge) * smooth(0.60, 0.85, sc2) * 0.8 + walk * smooth(0.72, 0.90, sc2) * 0.5, 0, 1)
mov = np.isin(cls, (2, 3, 4, 7)); chip = chip * np.where(mov, 0.35, 1.0)
deep = smooth(0.55, 0.85, chip * (0.6 + 0.8 * fine))
PRIMER = np.array((0.52, 0.55, 0.40), np.float32); BARE = np.array((0.60, 0.61, 0.63), np.float32)
col = mix(col, C_BASE * 1.18, chip * 0.55)                           # стёртая краска светлее
col = mix(col, PRIMER, deep * 0.55); col = mix(col, BARE, smooth(0.80, 0.95, chip * (0.6 + 0.8 * fine)) * 0.8)
rough = rough - chip * 0.10; metal = np.maximum(metal, smooth(0.80, 0.95, chip * (0.6 + 0.8 * fine)) * 0.9)
# затенение и швы в цвете - слабо (в игре затенение идёт через канал R)
hair = smooth(max(0.010, 1.1 * DS), 0.002, seamd) * skin_m; col *= (1 - 0.07 * hair)[..., None]; rough += hair * 0.05
crev = smooth(0.70, 0.30, ao1) * paintc; col = mix(col, (0.14, 0.14, 0.14), crev * 0.25); rough += crev * 0.10
col *= (0.93 + 0.07 * smooth(0.15, 0.95, ao2))[..., None]
log('сколы')
# ── конус локатора и законцовки: тот же серый темнее, глаже ──
rad = (cls == 0) & (a < 2.40); col[rad] = (C_BASE * 0.78 * (0.97 + 0.06 * fine[rad, None])); rough[rad] = 0.40; metal[rad] = 0.0
ring_r = (cls == 0) & (np.abs(a - 2.40) < 0.02); col[ring_r] *= 0.75
fintip = (cls == 1) & (z > 4.15); col[fintip] *= 0.82; rough[fintip] = 0.44
# ── трафареты и знаки (все вымышленные, нарисованы здесь) ──
FNB = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'; FN = '/System/Library/Fonts/Supplemental/Arial.ttf'
MARKS = []
def _mark(name, ins, A_, side):
    ys, xs = np.nonzero(ins); on = A_ > 0.25
    if not on.any(): return
    ys, xs = ys[on], xs[on]; Q_ = x[ys, xs] if side in ('top', 'bot') else z[ys, xs]; MARKS.append((name, side, float(a[ys, xs].min()), float(a[ys, xs].max()), float(Q_.min()), float(Q_.max())))
def stamp(im_, ac, qc, W_, H_, side, along=True, alpha=0.94, rough_to=None, cl=(0,), name=''):
    A0 = np.asarray(im_, np.float32) / 255.0; hp, wp = A0.shape[:2]
    vm, Q_ = ((nz > 0.35, x) if side == 'top' else (nz < -0.35, x) if side == 'bot' else (nx > 0.35, z) if side == 'r' else (nx < -0.35, z))
    if along: ins = vm & (np.abs(a - ac) < W_ / 2) & (np.abs(Q_ - qc) < H_ / 2)
    else: ins = vm & (np.abs(Q_ - qc) < W_ / 2) & (np.abs(a - ac) < H_ / 2)
    ins &= skin_m & np.isin(cls, cl) & cov
    if not ins.any(): log('знак не лёг', name, ac, qc, side); return
    if along:
        u_ = (a[ins] - ac) / W_ + 0.5; v_ = 0.5 - (Q_[ins] - qc) / H_
        if side == 'r': u_ = 1 - u_
    else:
        u_ = (Q_[ins] - qc) / W_ + 0.5; v_ = (a[ins] - ac) / H_ + 0.5
        if side == 'bot': u_ = 1 - u_
    du, dv = 0.25 * DS / W_, 0.25 * DS / H_; S_ = 0.0
    for su, sv in ((-1, -1), (1, -1), (-1, 1), (1, 1), (0, 0)):
        S_ = S_ + A0[np.clip(((v_ + sv * dv) * hp).astype(int), 0, hp - 1), np.clip(((u_ + su * du) * wp).astype(int), 0, wp - 1)]
    S_ = S_ / 5.0
    al = S_[:, 3] * alpha * (0.93 + 0.07 * smooth(0.30, 0.62, fine[ins])) * (1 - 0.6 * chip[ins])
    S_[:, :3] = np.where(S_[:, 3:4] > 1e-3, S_[:, :3] / np.maximum(S_[:, 3:4], 1e-3), 0.0)
    _mark(name or f'{ac:.2f},{qc:.2f}', ins, al, side); col[ins] = col[ins] * (1 - al[..., None]) + S_[:, :3] * al[..., None]
    rough[ins] = rough[ins] * (1 - al) + (0.50 if rough_to is None else rough_to) * al
INK = (34, 36, 38, 255); DGRY = (62, 66, 70, 255); WHITE = (226, 228, 226, 255); RED = (150, 44, 40, 255); YEL = (196, 170, 70, 255)
def text_img(t, H=200, ink=INK, font=FNB, pad=20):
    f_ = ImageFont.truetype(font, int(H * 0.82)); tmp = ImageDraw.Draw(Image.new('L', (8, 8))); bb = tmp.textbbox((0, 0), t, font=f_); W = bb[2] - bb[0] + pad
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(im_).text((W / 2, H / 2), t, font=f_, fill=ink, anchor='mm'); return im_
def lines_img(rows, W=900, ink=INK, font=FN):
    H = 120 * len(rows); im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); f_ = ImageFont.truetype(font, 92)
    for i, t in enumerate(rows): d_.text((10, i * 120 + 10), t, font=f_, fill=ink)
    return im_
def star_lowvis(W=900, H=440):
    """Знак ВВС США малозаметный: только контур звезды и полос тёмно-серым (национальный знак, без эмблем частей)."""
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); c = (W / 2, H / 2); R = H * 0.46
    pts = []
    for i in range(10):
        r_ = R if i % 2 == 0 else R * 0.382; t_ = -math.pi / 2 + i * math.pi / 5; pts.append((c[0] + r_ * math.cos(t_), c[1] + r_ * math.sin(t_)))
    d_.ellipse((c[0] - R, c[1] - R, c[0] + R, c[1] + R), outline=DGRY, width=14); d_.polygon(pts, outline=DGRY, width=12)
    d_.rectangle((c[0] + R * 0.9, c[1] - R * 0.30, W - 8, c[1] + R * 0.30), outline=DGRY, width=12); d_.rectangle((8, c[1] - R * 0.30, c[0] - R * 0.9, c[1] + R * 0.30), outline=DGRY, width=12)
    return im_
def tri_warn(S_=400, ink=RED):
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); d_.polygon([(S_ / 2, S_ * 0.06), (S_ * 0.96, S_ * 0.92), (S_ * 0.04, S_ * 0.92)], outline=ink, width=int(S_ * 0.07))
    f_ = ImageFont.truetype(FNB, int(S_ * 0.42)); d_.text((S_ / 2, S_ * 0.63), '!', font=f_, fill=ink, anchor='mm'); return im_
def arrow_rescue(W=900, H=300, ink=YEL):
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_)
    d_.polygon([(20, H * 0.40), (W * 0.70, H * 0.40), (W * 0.70, H * 0.18), (W - 20, H * 0.5), (W * 0.70, H * 0.82), (W * 0.70, H * 0.60), (20, H * 0.60)], fill=ink)
    f_ = ImageFont.truetype(FNB, int(H * 0.17)); d_.text((W * 0.35, H * 0.5), 'RESCUE', font=f_, fill=(30, 30, 30, 255), anchor='mm'); return im_
def walkway(W=1200, H=120):
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_)
    for k in range(0, W, 60): d_.rectangle((k, 0, k + 34, H), fill=DGRY)
    return im_
def receptacle(W=500, H=900):
    """Линии подвода дозаправки перед приёмником (фото 01): белые полосы-ёлочка к стыку."""
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_)
    d_.line((W / 2, 0, W / 2, H), fill=WHITE, width=24)
    for k in range(4): yk = H * (0.15 + 0.2 * k); d_.line((W / 2, yk, 30, yk + 120), fill=WHITE, width=18); d_.line((W / 2, yk, W - 30, yk + 120), fill=WHITE, width=18)
    return im_
CODE, SER, SER2 = 'FW', 'AF 89', '417'                              # вымышленные: код части FW, номер 89-0417 (B-1B с таким номером не было)
for sd in ('r', 'l'):
    sg = 1 if sd == 'r' else -1
    stamp(text_img(CODE, 300, INK), 40.9, 2.55, 1.30, 0.95, sd, cl=(1,), alpha=0.92, name='код')
    stamp(text_img(SER, 160, INK), 41.0, 1.78, 0.55, 0.26, sd, cl=(1,), alpha=0.90, name='номер1'); stamp(text_img(SER2, 220, INK), 41.75, 1.80, 0.55, 0.32, sd, cl=(1,), alpha=0.90, name='номер2')
    stamp(star_lowvis(), 34.6, -1.25, 1.55, 0.76, sd, alpha=0.85, name='звезда')
    stamp(arrow_rescue(), 8.6, -0.95, 0.85, 0.28, sd, alpha=0.95, name='rescue')
    stamp(lines_img(['EMERGENCY', 'HATCH RELEASE', 'PULL HANDLE']), 9.3, -0.55, 0.55, 0.22, sd, alpha=0.85, name='люк')
    stamp(tri_warn(), 21.75, -3.30, 0.24, 0.24, sd, alpha=0.95, name='тр_заборник')
    stamp(text_img('DANGER  INTAKE', 160, RED), 22.55, -3.30, 0.95, 0.12, sd, cl=(0,), alpha=0.9, name='забор_текст')
    stamp(lines_img(['FUEL  JP-8', 'PRESSURE REFUEL', 'GROUND POINT']), 26.5, -2.25, 0.55, 0.20, sd, alpha=0.85, name='заправка')
    stamp(tri_warn(), 31.1, -3.25, 0.22, 0.22, sd, alpha=0.95, name='тр_сопло')
    stamp(text_img('JET BLAST', 160, RED), 31.6, -3.25, 0.62, 0.11, sd, alpha=0.85, name='сопло_текст')
    stamp(text_img('NO STEP', 140, INK), 18.5, sg * 3.7, 0.80, 0.16, 'top', along=False, alpha=0.8, name='nostep_н')
    stamp(text_img('NO STEP', 140, INK), 27.0, sg * 3.9, 0.80, 0.16, 'top', along=False, alpha=0.8, name='nostep_г')
    stamp(walkway(), 9.6, sg * 0.75, 3.6, 0.07, 'top', alpha=0.8, name='дорожка')
    stamp(star_lowvis(), 15.0 if sd == 'l' else 17.6, sg * (3.1 if sd == 'l' else 2.9), 1.9, 0.92, 'top' if sd == 'l' else 'bot', alpha=0.80, name='звезда_наплыв')
stamp(receptacle(), 3.95, 0.0, 0.42, 1.30, 'top', along=False, alpha=0.95, name='дозаправка')
_bad = 0
for i_, m1 in enumerate(MARKS):
    for m2 in MARKS[i_ + 1:]:
        if m1[1] == m2[1] and m1[2] - 0.03 < m2[3] and m2[2] - 0.03 < m1[3] and m1[4] - 0.03 < m2[5] and m2[4] - 0.03 < m1[5]: _bad += 1; log(f'НАЛОЖЕНИЕ {m1[1]}: {m1[0]} и {m2[0]}')
log(f'знаков {len(MARKS)}, наложений: {_bad}')
# ── сопла: выгоревший металл, лепестки с побежалостью, внутри тёмная камера ──
noz = cls == 10; tn = fbm(1.2, 4.0, 4.0, 4, 59.0); ts = fbm(0.8, 14.0, 14.0, 3, 61.0)
heat = smooth(NAC_A1 + 0.05, NAC_A1 + 0.9, a) * (0.6 + 0.4 * tn)
ncol = np.array((0.36, 0.35, 0.33), np.float32) * (0.85 + 0.28 * ts)[..., None]
tint = np.stack([0.42 + 0.10 * tn, 0.33 + 0.06 * tn, 0.30 + 0.14 * (1 - tn)], -1)            # соломенный → сизый
ncol = ncol * (1 - 0.45 * heat)[..., None] + tint * (0.45 * heat)[..., None]
col[noz] = ncol[noz]; metal[noz] = 0.95; rough[noz] = np.clip(0.50 + (tn[noz] - 0.5) * 0.15, 0.35, 0.65)
rr0 = np.hypot(ax - np.where(ax < NAC_XC, NAC_XC - ENG_DX, NAC_XC + ENG_DX), z - ENG_Z); inner_n = noz & (rr0 < 0.47)
col[inner_n] = (np.array((0.10, 0.095, 0.09), np.float32) * (0.8 + 0.4 * ts[inner_n, None])); metal[inner_n] = 0.6; rough[inner_n] = 0.75
log('сопла')
# ── материалы без краски обшивки ──
def solid(m, c, r, me=0.0, nz_=0.08):
    col[m] = np.array(c, np.float32) * (1 - nz_ / 2 + nz_ * fine[m])[..., None]; rough[m] = r; metal[m] = me
solid(mat == 2, (0.030, 0.030, 0.032), 0.9)
solid(mat == 4, (0.050, 0.050, 0.052), 0.88)
cockm = (mat == 5) & ((cls == 11) | ((cls == 0) & (a < 10.6))); solid(cockm, (0.075, 0.078, 0.082), 0.66, 0, 0.16)
baym = (cls == 13) | ((cls == 0) & (mat == 5) & (a > 10.6)) | (np.isin(cls, (3,)) & (nz > 0.25))
solid(baym & (mat != 1) & (mat != 2), (0.56, 0.58, 0.55), 0.62, 0, 0.12)                  # отсеки: светлая грунтовка
col[baym] *= (0.55 + 0.45 * smooth(0.25, 0.95, ao1[baym]))[..., None]
solid(baym & (mat == 1), (0.40, 0.41, 0.42), 0.40, 0.85)
duct_m = mat == 7; dd = np.clip(a - NAC_A0, 0, 6); solid(duct_m, (0.36, 0.37, 0.37), 0.70, 0, 0.10); col[duct_m] *= (0.14 + 0.86 * smooth(3.0, 0.2, dd[duct_m]))[..., None]
solid((cls == 0) & (mat == 1), (0.16, 0.15, 0.14), 0.62, 0.7, 0.18)                       # трубы изнутри
solid((cls == 9), (0.30, 0.31, 0.33), 0.45, 0.1, 0.08)                                     # рамы окон
# шасси: светло-серые (почти белые) стойки, хром штоков, тёмная сталь, диски, резина, масло, грязь, пыль
gr_ = cls == 12; g_p = gr_ & (mat == 0); g_c = gr_ & (mat == 1); g_s = gr_ & (mat == 8); g_d = gr_ & (mat == 5)
gm1 = fbm(2.4, 2.4, 2.4, 4, 91.0); gm2 = fbm(18.0, 18.0, 18.0, 3, 93.0); gst = fbm(1.0, 16.0, 2.2, 4, 87.0); gst2 = fbm(0.7, 34.0, 1.3, 3, 89.0)
solid(g_p, (0.66, 0.67, 0.67), 0.46, 0.15, 0.10); solid(g_c, (0.52, 0.52, 0.51), 0.26, 0.9, 0.08); solid(g_s, (0.16, 0.155, 0.15), 0.56, 0.75, 0.14)
solid(g_d, (0.46, 0.47, 0.48), 0.55, 0.2, 0.10); solid(gr_ & (mat == 2), (0.05, 0.048, 0.046), 0.72, 0, 0.14)
painted = g_p | g_d; col[painted] *= (0.86 + 0.24 * gm1[painted] + 0.05 * gm2[painted])[..., None]
zg_ = z + 5.95
oil_ = smooth(0.46, 0.68, gst) * (0.5 + 0.5 * smooth(0.40, 0.70, gst2)); col = mix(col, (0.16, 0.135, 0.10), oil_ * 0.50 * (painted | g_c)); rough = rough + oil_ * 0.18 * painted - oil_ * 0.10 * g_c
gd = smooth(1.4, 0.2, zg_) * gr_ * (0.45 + 0.55 * smooth(0.36, 0.66, gm1)); col = mix(col, (0.26, 0.23, 0.19), gd * 0.50 * (painted | g_s)); rough = rough + gd * 0.2 * painted
tyr = mat == 4; rt_ = smooth(0.40, 0.68, gm2) * tyr; col = mix(col, (0.17, 0.16, 0.15), rt_ * 0.45); col = mix(col, (0.21, 0.20, 0.18), smooth(0.25, 0.0, zg_) * tyr * 0.5); rough[tyr] = 0.90
col[gr_] *= (0.55 + 0.45 * smooth(0.15, 0.95, ao2[gr_]))[..., None]
for sg in (1, -1):                                                 # таблички давления шин на основных стойках
    stamp(lines_img(['TIRE PRESS', '215 PSI N2']), 23.2 - 0.25, -4.4, 0.20, 0.12, 'r' if sg > 0 else 'l', cl=(12,), alpha=0.9, name='шины')
rough = np.clip(rough, 0.08, 0.97); metal = np.clip(metal, 0, 1); col = np.clip(col, 0, 1)
log('материалы')
# ── рельеф в нормалях: швы-канавки, ряды заклёпок, крышки лючков, жалюзи дренажей, лёгкая волна листов ──
gw = max(0.006, 0.9 * DS)
height -= smooth(gw, 0.0, seamd) * 0.0010 * skin_m
step_r = 0.045; along_ = np.where(np.abs(nz) > 0.5, a, a + z)
rv = rv_line * (np.mod(along_ / step_r + 0.5 * (seamd > 0.02), 1.0) < 0.38)
height += rv * 0.00035
height += smooth(0.0, 2.5 * gw, hedge) * 0.0004 * (hedge < 8); height -= smooth(gw, 0.0, hedge) * 0.0009 * (hedge < 8)
for a0_, z0_ in ((15.2, -1.2), (24.0, -1.0), (36.2, -0.8)):          # решётки дренажей на бортах: косые жалюзи
    gm_ = sr_m & fus & (np.abs(a - a0_) < 0.22) & (np.abs(z - z0_) < 0.10)
    height += gm_ * (np.mod((a - a0_) / 0.035, 1.0) < 0.5) * 0.0008; col[gm_] *= 0.82
wav = fbm(1.0, 1.0, 1.0, 2, 79.0); height += (wav - 0.5) * 0.004 * paintc
gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * DS); gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / (2 * DS)
nn = np.stack([-gx, -gy, np.ones_like(gx)], -1); nn /= np.linalg.norm(nn, axis=-1, keepdims=True)
solidm = np.isin(mat, (2, 7)) | np.isin(cls, (10, 11, 12, 13))
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
occ = np.where(baym, 0.45 + 0.55 * smooth(0.25, 0.95, ao1), occ); occ = np.where(duct_m, 0.25 + 0.55 * smooth(3.0, 0.3, dd), occ)
bleed([col, rough, metal, occ, nn], cov)
def lift(arr): return (np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)
Image.fromarray(lift(col)[::-1]).save(f'{OUT}/b1b_color.png', compress_level=1)
Image.fromarray(lift(nn * 0.5 + 0.5)[::-1]).save(f'{OUT}/b1b_normal.png', compress_level=1)
Image.fromarray(lift(np.stack([occ, rough, metal], -1))[::-1]).save(f'{OUT}/b1b_orm.png', compress_level=1)
for nm_, pm in (('верх', skin_m & cov & (cls == 0) & (nz > 0.3)), ('низ', skin_m & cov & (cls == 0) & (nz < -0.3)), ('консоли', cov & (cls == 8))):
    print('средний цвет,', nm_, 'sRGB', (col[pm].mean(0) * 255).round(1), 'шероховатость', round(float(rough[pm].mean()), 3))
log('сохранено', OUT)
if os.environ.get('B1_PREV'):
    K = 24.0
    def plan(name, keep, U, V, D, w, h, ld):
        ii = np.nonzero(keep & cov); u_ = ((U[ii] + w / 2) * K).astype(int); v_ = ((V[ii]) * K).astype(int); d_ = D[ii]
        W_, H_ = int(w * K) + 2, int(h * K) + 2; ok = (u_ >= 0) & (u_ < W_) & (v_ >= 0) & (v_ < H_); u_, v_, d_ = u_[ok], v_[ok], d_[ok]; c_ = col[ii][ok] * (0.55 + 0.45 * np.clip(nor[ii][ok] @ np.array(ld), 0, 1))[:, None]
        o_ = np.argsort(d_); im = np.full((H_, W_, 3), 0.8, np.float32); im[v_[o_], u_[o_]] = c_[o_]
        Image.fromarray(lift(im)).save(os.path.join(OUT, name))
    plan('план_сверху.png', nz > -0.05, x, a, z, 26.0, 45.0, [0.3, 0.2, 0.93])
    plan('план_снизу.png', nz < 0.05, -x, a, -z, 26.0, 45.0, [0.3, 0.2, -0.93])
    plan('план_справа.png', nx > -0.05, -a + 22.5, 5.0 - z, x, 45.0, 11.0, [0.93, 0.2, 0.3])
    log('планы')
