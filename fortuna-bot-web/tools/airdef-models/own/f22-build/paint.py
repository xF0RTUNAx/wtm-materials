# paint.py - краска F-22A из данных gbuf.py: цвет без света, нормали, карта блеска glTF (R затенение, G шероховатость, B металл). Без Blender: /usr/bin/python3 paint.py
# Всё рисуется заново своим кодом: пиксели фото не используются, имён людей и логотипов нет. F22_TEX=2048|4096, F22_OUT=папка, F22_BASE=r,g,b (0…1, sRGB), F22_RAM=r,g,b
import math, os, site, sys, time, json
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__)); DAT = os.path.join(HERE, '_проба')
S = int(os.environ.get('F22_TEX', '2048')); OUT = os.environ.get('F22_OUT', DAT); os.makedirs(OUT, exist_ok=True)
ev = lambda n, d: np.array([float(v) for v in os.environ.get(n, d).split(',')], np.float32)
BASE = ev('F22_BASE', '0.350,0.358,0.370'); RAM = ev('F22_RAM', '0.520,0.528,0.532'); DARK = ev('F22_DARK', '0.200,0.208,0.220'); T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f} с]', *a, flush=True)
L2 = 9.456
pos = np.load(f'{DAT}/gb_pos_{S}.npy'); nor = np.load(f'{DAT}/gb_nor_{S}.npy'); idd = np.load(f'{DAT}/gb_id_{S}.npy'); aob = np.load(f'{DAT}/gb_ao_{S}.npy')
ATLAS = json.load(open(f'{DAT}/uv.json', encoding='utf-8'))['atlas_m']; PXM = 0.985 * S / ATLAS; DS = 1.0 / PXM
mat = np.round(idd[..., 0] * 16).astype(np.int8); cls = np.round(idd[..., 1] * 32).astype(np.int8); cov = idd[..., 2] > 0.5
a = (L2 - pos[..., 1]).astype(np.float32); x = pos[..., 0].astype(np.float32); z = pos[..., 2].astype(np.float32); ax = np.abs(x)
nx, ny, nz = nor[..., 0], nor[..., 1], nor[..., 2]; ao1, ao2, bev = aob[..., 0], aob[..., 1], aob[..., 2]
log('данные', S, 'плотность', round(PXM), 'пикс/м')
src = open(os.path.join(HERE, 'f22_detail.py'), encoding='utf-8').read(); ns = {}; exec(src[src.index('TOP_LINES = ['):src.index('RINGS = ')], ns); TOP, BOT, SIDE = ns['TOP_LINES'], ns['BOT_LINES'], ns['SIDE_PANELS']


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
def fbm(fa, fx_, fz_, octv=3, seed=0.0):
    r = 0.0; w = 0.5; tot = 0.0; pa, px, pz = a * fa, x * fx_, z * fz_
    wa = vnoise(pa * 0.7 + seed + 11.3, px * 0.7 - seed, pz * 0.7 + 5.1) - 0.5; wb = vnoise(pa * 0.7 - 7.7, px * 0.7 + seed + 3.3, pz * 0.7 - seed) - 0.5
    pa, px, pz = pa + wa * 0.9, px + wb * 0.9, pz + (wa - wb) * 0.6
    for i in range(octv):
        qa = R3[0, 0] * pa + R3[0, 1] * px + R3[0, 2] * pz; qx = R3[1, 0] * pa + R3[1, 1] * px + R3[1, 2] * pz; qz = R3[2, 0] * pa + R3[2, 1] * px + R3[2, 2] * pz
        pa, px, pz = qa * 2.03, qx * 2.03, qz * 2.03; r = r + w * vnoise(qa + seed + i * 3.1, qx - seed * 0.7, qz + seed * 1.3 + i); tot += w; w *= 0.5
    return r / tot


def mix(c, col_, t):
    t = np.clip(t, 0, 1)[..., None]; return c * (1 - t) + np.asarray(col_, np.float32) * t


skin_m = mat == 0
col = np.ones((S, S, 3), np.float32) * BASE; rough = np.full((S, S), ev('F22_ROUGH', '0.30')[0], np.float32); metal = np.full((S, S), ev('F22_METAL', '0.30')[0], np.float32); height = np.zeros((S, S), np.float32)   # сатин с металлическим отливом, как на фото 06, 07
mott = fbm(0.55, 0.55, 0.55, 4, 1.0); fine = fbm(11.0, 11.0, 11.0, 2, 5.0); patch = fbm(1.4, 1.4, 1.4, 4, 9.0); stre = fbm(0.75, 11.0, 11.0, 4, 3.0); stre2 = fbm(0.42, 26.0, 26.0, 3, 17.0)
top_m = nz > 0.30; bot_m = nz < -0.30; sr_m = nx > 0.45; sl_m = nx < -0.45
# ── схема F-22: светлые канты по кромкам, большие тёмные поля на плоскостях, бледный верх с тёмными размывами, тёмный борт под скулой, блеск на спине (f22_01, f22_05, f22_16) ──
tt = np.random.RandomState(7).uniform(0.975, 1.025, 64).astype(np.float32); FR = np.array([1.75, 3.2, 6.0, 8.5, 11.0, 13.5, 40.0], np.float32)
band = np.searchsorted(FR, a); idx = (band * 4 + (x > 0) * 2 + (z > 0.2)) % 64; col *= tt[idx][..., None]
col *= (0.93 + 0.14 * mott + 0.02 * fine)[..., None]; rough += (mott - 0.5) * 0.14
KP = 100.0; AW, XW = int(19.5 * KP), int(7.2 * KP); ZW = int(6.5 * KP)
def canvas(w, h): im_ = Image.new('L', (w, h), 0); return im_, ImageDraw.Draw(im_)
PT = lambda a_, q: (a_ * KP, q * KP); PS = lambda a_, q: (a_ * KP, (q + 2.0) * KP)
def fill_(dr, P, pts): dr.polygon([P(*q) for q in pts], fill=255)
def blur(im_, r=1.0): return np.asarray(im_.filter(ImageFilter.GaussianBlur(r)), np.float32) / 255.0
def look(M, Au, Qv):
    h_, w_ = M.shape; iu = np.clip((Au * KP).astype(np.int32), 0, w_ - 1); iv = np.clip((Qv * KP).astype(np.int32), 0, h_ - 1); return M[iv, iu]
wob = (fbm(0.8, 0.8, 0.8, 3, 21.0) - 0.5) * 0.55; wob2 = (fbm(0.8, 0.8, 0.8, 3, 27.0) - 0.5) * 0.55     # кромки пятен волнистые
xr = x > 0; wt = smooth(0.10, 0.34, nz); wb = smooth(-0.10, -0.34, nz); ws = 1 - np.maximum(wt, wb)
wingz = np.isin(cls, (0, 4, 5)) & (ax > 2.05); hull = (cls == 0) & (ax <= 2.3) | np.isin(cls, (7, 8))
# тёмные поля сверху на крыле: от корня к концу, не доходят до кромок (f22_01, f22_04)
I_, D_ = canvas(AW, XW)
fill_(D_, PT, [(10.40, 2.55), (12.50, 5.20), (13.05, 5.85), (13.30, 5.30), (13.45, 4.40), (13.50, 3.60), (13.95, 2.70), (13.40, 2.30), (12.20, 2.25), (11.20, 2.30)])
WDK = blur(I_, 14.0)
# размывы на корпусе сверху, справа и слева по-разному (f22_01, f22_04, f22_05)
HR, HRD = canvas(AW, XW); HL, HLD = canvas(AW, XW)
fill_(HRD, PT, [(6.2, 0.0), (6.3, 0.7), (7.6, 1.0), (8.4, 0.6), (7.9, 0.0)]); fill_(HRD, PT, [(9.6, 1.0), (11.6, 0.8), (13.2, 1.3), (12.4, 1.95), (10.2, 1.9)]); fill_(HRD, PT, [(13.4, 0.0), (14.9, 0.1), (15.2, 0.6), (14.0, 0.8)])
fill_(HLD, PT, [(6.6, 0.1), (7.0, 1.3), (8.8, 1.9), (9.4, 1.0), (8.2, 0.2)]); fill_(HLD, PT, [(11.0, 0.3), (12.9, 0.1), (13.6, 0.9), (12.4, 1.5), (11.2, 1.2)]); fill_(HLD, PT, [(3.5, 0.58), (4.9, 0.72), (5.0, 0.86), (3.6, 0.72)])
HDKR, HDKL = blur(HR, 26.0), blur(HL, 26.0)
# тёмное поле киля: треугольник со светлой каймой (f22_16); стабилизатора: шестигранник внутри каймы (f22_01)
FI_, FD_ = canvas(AW, ZW); fill_(FD_, PS, [(14.17, 0.46), (15.74, 2.74), (16.46, 2.74), (17.00, 0.46)]); FDK = blur(FI_, 1.2)
SI_, SD_ = canvas(AW, XW); fill_(SD_, PT, [(15.55, 2.25), (16.95, 3.95), (17.35, 3.95), (17.85, 3.10), (17.55, 2.30)]); SDK = blur(SI_, 4.0)
# светлое покрытие на спине с пилообразным краем и шевроны (f22_01, f22_04)
LI_, LD_ = canvas(AW, XW)
def saw_rect(dr, a0, a1, q0, q1, n, amp):
    top = [(a0 + (amp if i % 2 else 0.0), q0 + (q1 - q0) * i / (2 * n)) for i in range(2 * n + 1)]; bot = [(a1 - (amp if i % 2 else 0.0), q1 - (q1 - q0) * i / (2 * n)) for i in range(2 * n + 1)]; fill_(dr, PT, top + bot)
LCT = blur(LI_, 0.7)
# кант: кромки светлые, внутренняя граница ступенями на стыках (пилообразно): f22_01, f22_05
A_LE_ = np.interp(ax, [1.2, 2.15, 6.72, 6.864], [7.99, 8.82, 12.82, 13.25]); A_TE_ = np.interp(ax, [1.2, 2.0, 6.05, 6.864], [15.2, 15.0, 14.05, 13.72])
step = 0.05 * ((np.floor(ax * 1.6).astype(np.int32) % 2) * 2 - 1)
d_le = a - A_LE_; d_te = A_TE_ - a
rim_w = wingz * np.maximum.reduce([smooth(0.40 + step, 0.37 + step, d_le), smooth(0.44 - step, 0.41 - step, d_te), smooth(6.25, 6.30, ax)])
S_LE_ = np.interp(ax, [1.95, 4.45], [15.03, 17.05]); S_TE_ = np.interp(ax, [1.95, 3.05, 4.45], [18.3, 18.912, 17.85]); stc = cls == 3
rim_s = stc * np.maximum.reduce([smooth(0.36, 0.33, a - S_LE_), smooth(0.34, 0.31, S_TE_ - a), smooth(4.05, 4.10, ax)])
fin_c = np.isin(cls, (1, 2)); F_L = 13.75 + (z - 0.30) * 0.685; F_T = 17.35 + (z - 0.30) * -0.241
slotf = fin_c & (np.abs(nz) > 0.6) & (((z > 0.58) & (z < 0.68)) | ((z > 2.30) & (z < 2.40)))
# поля: сначала корпус и плоскости
wdk = look(WDK, a + wob, ax + wob2) * wt * (cls == 0) * (ax > 2.0)
hdk = np.where(xr, look(HDKR, a + wob, ax + wob2), look(HDKL, a + wob, ax + wob2)) * wt * hull
fdk = look(FDK, a, z + 2.0) * fin_c; sdk = look(SDK, a, ax) * stc * wt
sht = np.interp(a, [4.7, 7.0, 11.0, 14.4], [0.20, 0.18, 0.10, 0.0]) + (ax - 0.92) * (-0.235)   # верх короба заборника: что выше него - не борт
lowk = smooth(0.16, -0.02, z - np.interp(a, [0, 5.0, 6.2, 11, 15], [0.0, 0.19, -0.03, 0.01, -0.02])) * ws * (cls == 0) * (ax < 2.2) * ((a < 4.9) | (z < sht - 0.03))   # борт под скулой тёмный (f22_12, f22_16)
col = mix(col, RAM * (0.93 + 0.14 * mott)[..., None], wt * smooth(0.0, 0.6, 1.0 - hdk) * ((cls == 0) | np.isin(cls, (4, 5))) * 0.30)     # верх бледнее низа
col = mix(col, DARK * (0.92 + 0.16 * mott)[..., None], np.maximum.reduce([wdk * 0.95, hdk * 0.55, fdk * 0.98, sdk * 0.88, lowk * 0.85]))
ramk = np.maximum.reduce([rim_w, rim_s]) * skin_m
col = mix(col, RAM * (0.95 + 0.10 * mott + 0.08 * (patch - 0.5))[..., None], ramk); rough = rough * (1 - ramk) + 0.46 * ramk; metal = metal * (1 - ramk)
fl_ = fin_c * (1 - fdk); col = mix(col, RAM * (0.95 + 0.1 * mott)[..., None], fl_ * 0.92); rough = rough * (1 - fl_) + 0.44 * fl_; col[slotf] = DARK * 0.30; rough[slotf] = 0.9; metal[slotf] = 0
lct = look(LCT, a, ax) * wt * hull * skin_m; col = mix(col, RAM * 1.02 * (0.94 + 0.12 * mott)[..., None], lct * 0.42); rough = rough * (1 - lct) + 0.42 * lct; metal = metal * (1 - lct * 0.8)
# блеск: спина и плечи почти зеркальные, на бортах меньше (f22_17, f22_04)
glint = wt * hull * smooth(2.0, 1.4, ax) * smooth(5.6, 6.2, a) * (1 - lct); rough -= glint * 0.14; metal = metal + glint * 0.30
# нос: тёмный конус с пилообразной границей и светлым пояском (f22_01, f22_13)
nb = 1.62 + 0.09 * np.abs(((np.arctan2(ax, z) * 3.2) % 1.0) * 2 - 1); nose = (cls == 0) & (a < nb)
col[nose] = (DARK * 1.25 * (0.96 + 0.08 * mott)[..., None])[nose]; rough[nose] = 0.46; metal[nose] = 0.12
belt = (cls == 0) & (a >= nb) & (a < nb + 0.16); col[belt] = (RAM * (0.96 + 0.08 * mott)[..., None])[belt]; rough[belt] = 0.46; metal[belt] = 0; ramk = ramk + belt
# ромбы и лючки: тёмные с еле заметной рамкой (f22_01, f22_04, f22_10)
for ac, qc, rA, rQ, sd_ in ((6.40, 1.65, 0.38, 0.09, 1), (6.25, 1.72, 0.36, 0.09, -1), (11.20, 1.75, 0.22, 0.16, 1), (11.05, 1.72, 0.26, 0.17, -1), (12.55, 0.0, 0.20, 0.11, 0)):
    q_ = ax if sd_ == 0 else np.where(np.sign(x) == sd_, ax, 99.0); dm = np.abs(a - ac) / rA + np.abs(q_ - qc) / rQ; m_ = smooth(1.04, 0.96, dm) * wt * hull; col = mix(col, DARK * 0.55, m_ * 0.92); rough += m_ * 0.15; metal = metal * (1 - m_)
log('схема', round(float((ramk > 0.5).mean()), 3))
# ── швы геометрии и мало заклёпок ──
seamd = np.full((S, S), 9.0, np.float32); riv = np.zeros((S, S), np.float32)
def lines(pts, A, Q, mask, rv=False):
    ids = np.nonzero(mask.ravel())[0]; AA, QQ = A.ravel()[ids], Q.ravel()[ids]
    for p0, p1 in zip(pts, pts[1:]):
        da, dq = p1[0] - p0[0], p1[1] - p0[1]; Ln = (da * da + dq * dq) ** 0.5
        if Ln < 1e-6: continue
        ta, tq = da / Ln, dq / Ln; w = (AA - p0[0]) * ta + (QQ - p0[1]) * tq; hh = (AA - p0[0]) * -tq + (QQ - p0[1]) * ta
        sel = (w > -0.02) & (w < Ln + 0.02) & (np.abs(hh) < 0.06)
        if not sel.any(): continue
        id2 = ids[sel]; seamd.ravel()[id2] = np.minimum(seamd.ravel()[id2], np.abs(hh[sel]))
        if rv:
            ph = (w[sel] / 0.045) % 1.0; dph = np.minimum(ph, 1 - ph) * 0.045; dr = np.hypot(dph, np.abs(hh[sel]) - 0.022); riv.ravel()[id2] = np.maximum(riv.ravel()[id2], np.clip(1 - dr / 0.005, 0, 1))
hullm = cls == 0
for L_ in TOP: lines(L_, a, ax, (nz > 0.45) & hullm)
for L_ in BOT: lines(L_, a, ax, (nz < -0.45) & hullm)
for L_ in SIDE: lines(L_, a, z, (np.abs(nx) > 0.45) & hullm, rv=True)
hair = smooth(0.0085, 0.002, seamd); col *= (1 - 0.30 * hair * skin_m)[..., None]; col *= (1 - 0.08 * smooth(0.0, 0.3, riv) * skin_m)[..., None]
# ── пятна и грязь: мягко, новая дорогая краска ──
polish = smooth(0.42, 0.72, fbm(0.9, 0.9, 0.9, 3, 13.0)); rough -= polish * 0.10; rough += smooth(0.45, 0.75, patch) * 0.10
sun = smooth(0.25, 0.9, nz); col = mix(col, BASE * 1.07, sun * smooth(0.45, 0.72, patch) * 0.22)
flow = smooth(0.52, 0.72, stre) * (0.35 + 0.65 * smooth(0.35, 0.70, patch)); flow2 = smooth(0.58, 0.74, stre2); rearw = 0.4 + 0.6 * smooth(9.0, 15.5, a)
dirty = flow * rearw * 0.20; col = mix(col, BASE * 0.80, dirty * 0.30); rough += dirty * 0.16
col = mix(col, BASE * 0.78, flow2 * 0.03 * rearw); rough += flow2 * 0.02
under = smooth(-0.15, -0.75, nz); oil = under * smooth(0.50, 0.74, fbm(1.0, 3.0, 3.0, 4, 23.0)); col = mix(col, BASE * 0.78, oil * 0.22); rough += oil * 0.10
soot = smooth(15.6, 16.4, a) * (ax < 1.4) * ((cls == 0)) * 0.5 * (0.4 + 0.6 * smooth(0.28, 0.72, fbm(0.7, 2.6, 2.6, 4, 31.0))); col = mix(col, BASE * 0.55, soot * 0.45); rough += soot * 0.22
canz = (cls == 0) & (a > 2.5) & (a < 6.5) & (ax < 1.0) & (z > 0.25)   # у рамы фонаря затенение из запекания рваное и чёрное: там его нет
noao = canz | (np.isin(cls, (7, 8)) & (nz < -0.2)); crev = smooth(0.92, 0.45, ao1) * skin_m * ~noao; col = mix(col, BASE * 0.42, crev * 0.55); rough += crev * 0.25
body_ao = smooth(0.15, 0.95, ao2); col *= np.where(noao, 1.0, 0.78 + 0.22 * body_ao)[..., None]; col = mix(col, BASE * 0.5, smooth(0.80, 0.30, ao1) * skin_m * ~noao * 0.35)
# кромки: сколы редкие и бледные, у подвижных почти нет
edge = smooth(0.985, 0.90, bev) * skin_m; eros = smooth(0.46, 0.60, fbm(9.0, 9.0, 9.0, 3, 37.0)); chip = edge * smooth(0.54, 0.64, fbm(14.0, 14.0, 14.0, 3, 41.0)) * np.where(np.isin(cls, (2, 3, 4, 5, 7, 8)), 0.10, 0.40)
BARE = RAM * 1.25; col = mix(col, BARE, chip * 0.8); rough = rough * (1 - chip) + chip * 0.36
log('краска')
# ── знаки: свои, малозаметные, серо-белые; буквы и номер придуманы ──
FB = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'; FN = '/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf'
LG = (178, 182, 184, 255); LW = (205, 208, 208, 255)
def star(dr, cx, cy, R, fill):
    pts = []
    for i in range(10):
        an = -math.pi / 2 + i * math.pi / 5; r_ = R if i % 2 == 0 else R * 0.382; pts.append((cx + r_ * math.cos(an), cy + r_ * math.sin(an)))
    dr.polygon(pts, fill=fill)
def roundel(W=1400, H=560, c=LG):
    """Знак малой заметности: светлые диск и полосы, звезда и средняя линия - цвет обшивки (своя прорисовка)."""
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dr = ImageDraw.Draw(im_); cx, cy, R = W / 2, H / 2, H / 2 - 4; bh = R * 0.70; dk = (0, 0, 0, 0)
    dr.rectangle((cx - R * 2.05, cy - bh / 2, cx + R * 2.05, cy + bh / 2), fill=c); dr.rectangle((cx - R * 1.95, cy - bh * 0.09, cx + R * 1.95, cy + bh * 0.09), fill=dk)
    dr.ellipse((cx - R, cy - R, cx + R, cy + R), fill=c); star(dr, cx, cy + R * 0.03, R * 0.92, dk)
    return im_
def text_(t, H=220, ink=LG, font=FB):
    f_ = ImageFont.truetype(font, int(H * 0.86)); tmp = ImageDraw.Draw(Image.new('L', (8, 8))); bb = tmp.textbbox((0, 0), t, font=f_); W = bb[2] - bb[0] + 30
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(im_).text((W / 2, H / 2), t, font=f_, fill=ink, anchor='mm'); return im_
def tri_(lines_, W=420, c=LG):
    """Предупреждающий треугольник остриём вниз: своя прорисовка."""
    H = int(W * 0.92); im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dr = ImageDraw.Draw(im_); dr.polygon([(8, 8), (W - 8, 8), (W / 2, H - 8)], outline=c, width=7); dr.polygon([(36, 26), (W - 36, 26), (W / 2, H - 56)], fill=c)
    f_ = ImageFont.truetype(FN, 52); y = 70
    for t in lines_: ImageDraw.Draw(im_).text((W / 2, y), t, font=f_, fill=(46, 48, 50, 255), anchor='mm'); y += 54
    return im_
def box_(t, t2, W=720, H=170, c=LG):
    im_ = Image.new('RGBA', (W, H + 110), (0, 0, 0, 0)); dr = ImageDraw.Draw(im_); dr.rectangle((4, 4, W - 4, H - 4), outline=c, width=7); dr.text((W / 2, H / 2), t, font=ImageFont.truetype(FB, 110), fill=c, anchor='mm')
    if t2: dr.text((W / 2, H + 52), t2, font=ImageFont.truetype(FN, 62), fill=c, anchor='mm')
    return im_
def stamp(im_, ac, qc, W_, H_, side, along=True, alpha=0.92, cl=None):
    tw_, th_ = max(8, int(W_ * PXM * 1.5)), max(8, int(H_ * PXM * 1.5)); im_ = im_.resize((tw_, th_) if along or side in ('r', 'l') else (tw_, th_), Image.LANCZOS)
    A0 = np.asarray(im_, np.float32) / 255.0; hp, wp = A0.shape[:2]
    vm, Q_ = ((nz > 0.30, x) if side == 'top' else (nz < -0.30, x) if side == 'bot' else (nx > 0.35, z) if side == 'r' else (nx < -0.35, z))
    ins = vm & (np.abs(a - ac) < W_ / 2) & (np.abs(Q_ - qc) < H_ / 2) if along else vm & (np.abs(Q_ - qc) < W_ / 2) & (np.abs(a - ac) < H_ / 2)
    ins &= (mat == 0) & (np.isin(cls, cl) if cl else (cls <= 8))
    if not ins.any(): return
    if along:
        u_ = (a[ins] - ac) / W_ + 0.5; v_ = 0.5 - (Q_[ins] - qc) / H_
        if side == 'r': u_ = 1 - u_
    else:
        u_ = (Q_[ins] - qc) / W_ + 0.5; v_ = (a[ins] - ac) / H_ + 0.5
        if side == 'bot': u_ = 1 - u_
    fx_ = np.clip(u_ * (wp - 1), 0, wp - 1.001); fy_ = np.clip(v_ * (hp - 1), 0, hp - 1.001); ix_, iy_ = fx_.astype(int), fy_.astype(int); tx_, ty_ = (fx_ - ix_)[..., None], (fy_ - iy_)[..., None]
    S_ = (A0[iy_, ix_] * (1 - tx_) + A0[iy_, ix_ + 1] * tx_) * (1 - ty_) + (A0[iy_ + 1, ix_] * (1 - tx_) + A0[iy_ + 1, ix_ + 1] * tx_) * ty_; al = S_[:, 3] * alpha * (0.92 + 0.08 * smooth(0.30, 0.62, fine[ins]))
    col[ins] = col[ins] * (1 - al[..., None]) + S_[:, :3] * al[..., None]; rough[ins] = rough[ins] * (1 - al) + 0.46 * al
RND = roundel()
stamp(RND, 12.45, -5.05, 1.60, 0.64, 'top', along=False); stamp(RND, 12.45, 5.05, 1.60, 0.64, 'bot', along=False)
LFIN = (190, 194, 196, 255)
for sg in (1, -1):
    sd = 'r' if sg > 0 else 'l'
    stamp(text_('XR', 300, ink=LFIN), 15.78, 1.32, 0.88, 0.56, sd, cl=(1, 2))              # буквы на киле: придуманные
    stamp(text_('09-4172', 120, ink=LFIN, font=FN), 15.62, 0.82, 0.86, 0.13, sd, cl=(1, 2))   # номер: придуманный
    stamp(tri_(['DANGER', 'EJECTION', 'SEAT']), 4.15, 0.42, 0.30, 0.28, sd)
    stamp(tri_(['DANGER', 'JET', 'INTAKE']), 4.55, -0.34, 0.28, 0.26, sd)
    stamp(box_('RESCUE', 'CANOPY RELEASE OTHER SIDE'), 3.65, -0.02, 0.46, 0.18, sd)
    stamp(text_('WARNING - KEEP CLEAR', 90, font=FN), 3.35, 0.46, 0.66, 0.045, sd)
stamp(text_('NO STEP', 200, ink=(50, 52, 54, 255)), 7.45, 0.0, 0.30, 0.20, 'top', along=False)
log('знаки')
# ── плоские сопла: бледный металл снаружи, тёмное нутро, копоть к срезу (f22_01, f22_17) ──
tn = fbm(1.2, 4.0, 4.0, 4, 59.0); ts = fbm(0.8, 14.0, 14.0, 3, 61.0); noz = cls == 10
# снаружи: впереди цвет обшивки до пилообразной границы W, дальше обгоревший металл с полосами к срезу (f22_24, f22_25)
# снаружи без узора: под зубцами лист отбрасывает тень, дальше нагар мягко переходит в бледный металл, полосы по потоку (f22_24, f22_25)
tw_ = np.clip((ax - 0.22) / 1.0, 0, 1); ntop = noz & (np.abs(nz) > 0.45) & (nz * z > 0) & (np.abs(x) > 0.20)
hb_ = np.array((0.235, 0.205, 0.180), np.float32) * (0.75 + 0.40 * tn)[..., None]; hm_ = np.array((0.42, 0.41, 0.39), np.float32) * (0.74 + 0.36 * ts)[..., None] * (1 - 0.22 * smooth(17.0, 17.36, a))[..., None]
acr = 16.90 + 0.03 * np.sin(tw_ * 19.0) + 0.012 * np.sin(tw_ * 47.0); kb = smooth(acr + 0.05, acr - 0.05, a)[..., None]
col[noz] = (np.array((0.26, 0.25, 0.235), np.float32) * (0.82 + 0.34 * tn)[..., None])[noz]; rough[noz] = np.clip(0.46 + (tn[noz] - 0.5) * 0.14, 0.3, 0.7); metal[noz] = 0.55
col[ntop] = (hm_ * (1 - kb) + hb_ * kb)[ntop]; rough[ntop] = (0.46 + 0.16 * kb[..., 0])[ntop]; metal[ntop] = (0.55 - 0.25 * kb[..., 0])[ntop]
ins_ = noz & (np.abs(z) < 0.27) & (np.abs(nz) > 0.5) & (nz * z < 0); ig_ = smooth(16.75, 17.25, a)[..., None]; col[ins_] = ((np.array((0.05, 0.045, 0.04), np.float32) * (1 - ig_) + np.array((0.20, 0.145, 0.115), np.float32) * ig_) * (0.8 + 0.4 * ts)[..., None])[ins_]; rough[ins_] = 0.8; metal[ins_] = 0.05
pipe = (cls == 0) & (mat == 1); col[pipe] = (np.array((0.14, 0.13, 0.12), np.float32) * (0.8 + 0.4 * tn)[..., None])[pipe]; metal[pipe] = 0.4; rough[pipe] = 0.7
fan_ = cls == 13; col[fan_] = np.array((0.16, 0.16, 0.17), np.float32); metal[fan_] = 0.6; rough[fan_] = 0.5
log('сопло')
def solid(m, c, r, me=0.0, nz_=0.08):
    col[m] = (np.array(c, np.float32) * (1 - nz_ / 2 + nz_ * fine)[..., None])[m]; rough[m] = r; metal[m] = me
solid(mat == 10, BASE * 0.55, 0.85)
solid(mat == 2, (0.030, 0.030, 0.032), 0.9); solid(mat == 4, (0.045, 0.045, 0.048), 0.86); solid(mat == 5, (0.25, 0.26, 0.27), 0.62, 0, 0.16)
duct = (mat == 5) & (cls != 11) & (cls != 12); col[duct] = (np.array((0.26, 0.27, 0.28), np.float32) * (0.75 + 0.5 * mott)[..., None])[duct]; rough[duct] = 0.7; col[duct] *= (0.40 + 0.60 * ao2[duct])[..., None]
lipd = a - (4.95 + 0.90 * (ax - 0.92) + 0.80 * (0.20 - z)); intk = duct & (cls == 0) & (ax > 0.45) & (a < 9.0) & (z < 0.95)
ik = np.clip(1 - np.exp(-np.clip(lipd, 0, None) / 0.32), 0, 1);   # быстро темнеет сразу за кромкой и дальше почти ровно: граница горла не читается
ikc = DARK[None, None, :] * 1.15 * (1 - ik[..., None]) + np.array((0.060, 0.062, 0.066), np.float32) * ik[..., None]; col[intk] = (ikc * (0.94 + 0.12 * mott)[..., None])[intk]; rough[intk] = (0.60 + 0.30 * ik)[intk]; metal[intk] = 0
_T = [4.70, 5.50, 6.30, 7.00, 9.00, 11.00, 13.00, 14.40]; _R = [(0.92, 0.92, 0.92, 0.90, 0.90, 0.90, 0.90, 0.90), (0.20, 0.20, 0.20, 0.18, 0.14, 0.10, 0.06, 0.00), (1.93, 1.93, 1.94, 1.97, 2.02, 2.06, 2.00, 1.72), (-0.04, -0.04, -0.04, -0.03, -0.02, -0.01, 0.01, -0.02), (1.25, 1.25, 1.25, 1.30, 1.38, 1.42, 1.40, 1.10), (-1.02, -1.02, -1.03, -1.03, -1.03, -1.03, -0.95, -0.62), (0.52, 0.52, 0.50, 0.25, 0.25, 0.25, 0.30, 0.40), (-0.92, -0.92, -0.94, -1.03, -1.03, -1.03, -0.96, -0.66)]
xi_, yi_, xo_, yo_, xb_, yb_, xn_, yn_ = [np.interp(a, _T, r_).astype(np.float32) for r_ in _R]
def side_(x0, y0, x1, y1): return (x1 - x0) * (z - y0) - (y1 - y0) * (ax - x0)     # знак стороны от ребра
inm = (lipd > 0.015) & (a < 9.0) & (ax > 0.35) & (cls == 0) & (side_(xo_, yo_ - 0.012, xi_, yi_ - 0.012) > 0) & (side_(xb_ - 0.012, yb_, xo_ - 0.012, yo_) > 0) & (side_(xn_, yn_ + 0.012, xb_, yb_ + 0.012) > 0)
ik2 = np.clip(1 - np.exp(-np.clip(lipd, 0, None) / 0.22), 0, 1); ikd = DARK[None, None, :] * 0.85 * (1 - ik2[..., None]) + np.array((0.030, 0.031, 0.034), np.float32) * ik2[..., None]
col[inm] = ikd[inm]; rough[inm] = 0.92; metal[inm] = 0; intk = intk | inm; ik = np.where(inm, ik2, ik)
col[cls == 13] = np.array((0.03, 0.03, 0.032), np.float32); rough[cls == 13] = 0.9; metal[cls == 13] = 0
# светлая полоса по кромке снаружи, вверху сходит на нет (f22_10)
lipo = (mat == 0) & (cls == 0) & (ax > 0.45) & (a < 7.0) & (z < 0.45) & (lipd < 0.01) & (lipd > -0.13) & ~inm; lipa = lipo[..., None].astype(np.float32) * 0.8; col = col * (1 - lipa) + (RAM * (0.88 + 0.18 * mott)[..., None]) * lipa; rough[lipo] = 0.5; metal[lipo] = 0
tub = (mat == 5) & (cls == 0) & (a > 3.0) & (a < 5.8) & (ax < 0.56) & (z > 0.0); col[tub] = (np.array((0.30, 0.31, 0.32), np.float32) * (0.85 + 0.3 * ao2[tub, None]))
solid(mat == 6, (0.20, 0.205, 0.20), 0.92, 0, 0.2); solid(mat == 8, (0.30, 0.28, 0.21), 0.9, 0, 0.14); solid(mat == 7, (0.02, 0.05, 0.045), 0.12, 0, 0.0)
hs = ((pos[..., 0] + pos[..., 1] + pos[..., 2]) / 0.035) % 1.0 > 0.5; solid(mat == 9, (0.74, 0.60, 0.06), 0.42); col[(mat == 9) & hs & (cls == 11)] = np.array((0.035, 0.035, 0.035), np.float32)
solid((mat == 1) & (cls == 11), (0.46, 0.47, 0.48), 0.38, 1.0)
# грунт отсеков: песочный, пятнами; блоки и трубки чуть разные (f22_05, f22_06)
pr = mat == 11; pm = fbm(2.0, 2.0, 2.0, 3, 67.0); col[pr] = (np.array((0.72, 0.62, 0.44), np.float32) * (0.82 + 0.34 * pm)[..., None])[pr]; rough[pr] = 0.68; col[pr] *= (0.55 + 0.45 * ao2[pr])[..., None]
xfl_ = xb_ + (z - yb_) * (xo_ - xb_) / (yo_ - yb_); pe_ = pr & ((z < -0.92) | (cls == 8) & (np.abs(nz) < 0.6) | (cls == 0) & (ax > xfl_ - 0.14)); col[pe_] = BASE * 0.42; rough[pe_] = 0.6   # кромки у разъёма створок не песочные: в щель виден тёмный борт
mm_ = (mat == 1) & (cls == 15); solid(mm_, (0.40, 0.40, 0.40), 0.4, 0.8)
# шасси: потёртая серо-белая краска, шток, сталь, резина
gr_ = cls == 12; g_p = gr_ & (mat == 0); g_c = gr_ & (mat == 1); g_s = gr_ & (mat == 8); g_d = gr_ & (mat == 5)
gm1 = fbm(2.4, 2.4, 2.4, 4, 91.0); gm2 = fbm(18.0, 18.0, 18.0, 3, 93.0); gst = fbm(1.0, 16.0, 2.2, 4, 87.0); gst2 = fbm(0.7, 34.0, 1.3, 3, 89.0)
solid(g_p, (0.545, 0.545, 0.515), 0.62, 0, 0.10); solid(g_c, (0.47, 0.47, 0.46), 0.30, 0.85, 0.08); solid(g_s, (0.145, 0.142, 0.14), 0.58, 0.75, 0.14); solid(g_d, (0.335, 0.35, 0.365), 0.60, 0, 0.10); solid(gr_ & (mat == 9), (0.60, 0.56, 0.40), 0.28, 0, 0.1); solid(gr_ & (mat == 2), (0.05, 0.048, 0.046), 0.72, 0, 0.14)
painted = g_p | g_d; col[painted] *= (0.84 + 0.30 * gm1[painted] + 0.06 * gm2[painted])[..., None]
oil_ = smooth(0.46, 0.68, gst) * (0.5 + 0.5 * smooth(0.40, 0.70, gst2)); col = mix(col, (0.15, 0.125, 0.095), oil_ * 0.58 * (painted | g_c)); rough = rough + oil_ * 0.20 * painted - oil_ * 0.10 * g_c
gd = smooth(-0.95, -2.10, z) * gr_ * (0.45 + 0.55 * smooth(0.36, 0.66, gm1)); col = mix(col, (0.215, 0.195, 0.165), gd * 0.62 * (painted | g_s)); rough = rough + gd * 0.22 * painted
for ac_, xc_, zc_, rw_ in ((5.35, 0.0, -1.75, 0.30), (11.80, 1.78, -1.62, 0.43), (11.80, -1.78, -1.62, 0.43)):
    rd_ = np.hypot(a - ac_, z - zc_); md_ = gr_ & (rd_ < rw_ * 0.68) & (np.abs(x - xc_) < 0.20); dust = smooth(rw_ * 0.68, rw_ * 0.10, rd_) * (0.45 + 0.55 * smooth(0.34, 0.62, gm2)) * md_; col = mix(col, (0.115, 0.10, 0.085), dust * 0.72); rough = rough + dust * 0.15
g_e = smooth(0.985, 0.90, bev) * painted * smooth(0.50, 0.62, gm2); col = mix(col, (0.26, 0.255, 0.24), g_e * 0.8)
tyr = mat == 4; rt_ = smooth(0.40, 0.68, gm2) * tyr; col[tyr] = np.array((0.070, 0.070, 0.072), np.float32); col = mix(col, (0.165, 0.158, 0.145), rt_ * 0.50); col = mix(col, (0.20, 0.19, 0.17), smooth(-1.75, -2.20, z) * tyr * 0.45); rough[tyr] = 0.90
col[gr_] *= (0.50 + 0.50 * smooth(0.15, 0.95, ao2[gr_]))[..., None]
door_in = np.isin(cls, (7,)) & (nz > 0.2) & (z < 0.2); solid(door_in, (0.66, 0.66, 0.64), 0.55, 0, 0.14)
h_m = (cls == 14) & (mat == 1); solid(h_m, (0.36, 0.38, 0.40), 0.5, 0.5, 0.12)
solid((cls == 9) & (mat == 1), (0.44, 0.45, 0.46), 0.38, 1.0)
solid((cls == 9) & (mat == 0), BASE * 1.12, 0.42, 0.0, 0.05)   # рама фонаря ровная, без сколов и грязи
rough = np.clip(rough, 0.08, 0.97); metal = np.clip(metal, 0, 1); col = np.clip(col, 0, 1)
for c_ in range(16):
    m_ = (cls == c_) & cov
    if m_.sum() > 500: print('деталь', c_, 'цвет', (col[m_].mean(0) * 255).round(0), 'G', round(float(rough[m_].mean()), 2), 'B', round(float(metal[m_].mean()), 2))
log('материалы')
shag = fbm(150.0, 150.0, 150.0, 2, 73.0) if S >= 4096 else fbm(70.0, 70.0, 70.0, 2, 73.0); height += (shag - 0.5) * 0.00012 * skin_m
wav = fbm(1.6, 1.6, 1.6, 2, 79.0); height += (wav - 0.5) * 0.003 * skin_m; height += smooth(0.1, 0.8, riv) * 0.0006 * skin_m; height += ramk * 0.00025
gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * DS); gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / (2 * DS)
nn = np.stack([-gx, -gy, np.ones_like(gx)], -1); nn /= np.linalg.norm(nn, axis=-1, keepdims=True)
nn[np.isin(mat, (2, 10, 7, 9)) | np.isin(cls, (10, 11, 12, 13, 14))] = (0, 0, 1)
def bleed(arrs, mask, n=14):
    m = mask.copy()
    for _ in range(n):
        w_ = m.astype(np.float32); W_ = np.roll(w_, 1, 0) + np.roll(w_, -1, 0) + np.roll(w_, 1, 1) + np.roll(w_, -1, 1); new = (~m) & (W_ > 0)
        if not new.any(): break
        for A_ in arrs:
            ex = A_ if A_.ndim == 3 else A_[..., None]
            s_ = (np.roll(ex * w_[..., None], 1, 0) + np.roll(ex * w_[..., None], -1, 0) + np.roll(ex * w_[..., None], 1, 1) + np.roll(ex * w_[..., None], -1, 1)) / np.maximum(W_, 1)[..., None]; ex[new] = s_[new]
        m |= new
occ = np.clip(0.35 + 0.65 * smooth(0.10, 0.92, ao2) * smooth(0.25, 0.90, ao1), 0, 1); occ[noao & (mat == 0)] = 1.0; occ[intk] = 1.0; occ[(cls == 9) & (mat == 0)] = 1.0   # рама лежит вплотную к обшивке, запекание считает её щелью и чернит
bleed([col, rough, metal, occ, nn], cov)
def lift(arr): return (np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)
Image.fromarray(lift(col)[::-1]).save(f'{OUT}/f22_color.png', compress_level=1); Image.fromarray(lift(nn * 0.5 + 0.5)[::-1]).save(f'{OUT}/f22_normal.png', compress_level=1); Image.fromarray(lift(np.stack([occ, rough, metal], -1))[::-1]).save(f'{OUT}/f22_orm.png', compress_level=1)
pm_ = skin_m & cov & (cls == 0) & (a > 2) & (a < 15)
print('средний цвет обшивки sRGB', (col[pm_].mean(0) * 255).round(1), 'шероховатость', round(float(rough[pm_].mean()), 3))
log('сохранено', OUT)
