# paint.py - краска F-35A из данных gbuf.py: цвет без света, нормали, карта блеска glTF (R затенение, G шероховатость, B металл). Без Blender: /usr/bin/python3 paint.py
# Всё рисуется заново своим кодом: пиксели фото не используются, имён людей и логотипов нет. F35_TEX=2048|4096, F35_OUT=папка, F35_BASE=r,g,b (0…1, sRGB), F35_RAM=r,g,b
import math, os, site, sys, time, json
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__)); DAT = os.path.join(HERE, '_проба')
S = int(os.environ.get('F35_TEX', '2048')); OUT = os.environ.get('F35_OUT', DAT); os.makedirs(OUT, exist_ok=True)
ev = lambda n, d: np.array([float(v) for v in os.environ.get(n, d).split(',')], np.float32)
BASE = ev('F35_BASE', '0.265,0.272,0.280'); RAM = ev('F35_RAM', '0.460,0.468,0.465'); T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f} с]', *a, flush=True)
L2 = 7.835
pos = np.load(f'{DAT}/gb_pos_{S}.npy'); nor = np.load(f'{DAT}/gb_nor_{S}.npy'); idd = np.load(f'{DAT}/gb_id_{S}.npy'); aob = np.load(f'{DAT}/gb_ao_{S}.npy')
ATLAS = json.load(open(f'{DAT}/uv.json', encoding='utf-8'))['atlas_m']; PXM = 0.985 * S / ATLAS; DS = 1.0 / PXM
mat = np.round(idd[..., 0] * 16).astype(np.int8); cls = np.round(idd[..., 1] * 32).astype(np.int8); cov = idd[..., 2] > 0.5
a = (L2 - pos[..., 1]).astype(np.float32); x = pos[..., 0].astype(np.float32); z = pos[..., 2].astype(np.float32); ax = np.abs(x)
nx, ny, nz = nor[..., 0], nor[..., 1], nor[..., 2]; ao1, ao2, bev = aob[..., 0], aob[..., 1], aob[..., 2]
log('данные', S, 'плотность', round(PXM), 'пикс/м')
src = open(os.path.join(HERE, 'f35_detail.py'), encoding='utf-8').read(); ns = {}; exec(src[src.index('TOP_LINES = ['):src.index('RINGS = ')], ns); TOP, BOT, SIDE = ns['TOP_LINES'], ns['BOT_LINES'], ns['SIDE_PANELS']


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
col = np.ones((S, S, 3), np.float32) * BASE; rough = np.full((S, S), ev('F35_ROUGH', '0.34')[0], np.float32); metal = np.full((S, S), ev('F35_METAL', '0.30')[0], np.float32); height = np.zeros((S, S), np.float32)   # сатин с металлическим отливом, как на фото 06, 07
mott = fbm(0.55, 0.55, 0.55, 4, 1.0); fine = fbm(11.0, 11.0, 11.0, 2, 5.0); patch = fbm(1.4, 1.4, 1.4, 4, 9.0); stre = fbm(0.75, 11.0, 11.0, 4, 3.0); stre2 = fbm(0.42, 26.0, 26.0, 3, 17.0)
top_m = nz > 0.30; bot_m = nz < -0.30; sr_m = nx > 0.45; sl_m = nx < -0.45
# ── листы: очень слабые различия тона, F-35 почти монолитный ──
tt = np.random.RandomState(7).uniform(0.975, 1.025, 64).astype(np.float32); FR = np.array([1.32, 2.9, 5.6, 7.2, 9.4, 11.9, 40.0], np.float32)
band = np.searchsorted(FR, a); idx = (band * 4 + (x > 0) * 2 + (z > 0.2)) % 64; col *= tt[idx][..., None]
col *= (0.93 + 0.14 * mott + 0.02 * fine)[..., None]; rough += (mott - 0.5) * 0.14
# сверка с фото по среднему: солнце игры сильнее сверху и слабее сбоку, поэтому верх чуть темнее, борта и низ светлее (вверху 122 при фото 105, на борту 68 при фото 95-108)
topk = smooth(0.15, 0.85, nz); col *= (1.22 - 0.32 * topk)[..., None]

# ── покрытие швов: светлые ленты с пилообразным краем. План в метрах (a, x), половина отражается ──
KP = 200.0; AW, XW = int(16.2 * KP), int(6.0 * KP); ZW = int(4.0 * KP)
def canvas(w, h): im_ = Image.new('L', (w, h), 0); return im_, ImageDraw.Draw(im_)
TRI, TRD = canvas(AW, XW); TLI, TLD = canvas(AW, XW); BIM, BD = canvas(AW, XW); SIM, SD = canvas(AW, ZW); SDI, SDK = canvas(AW, ZW)
WIM, WD = canvas(AW, XW); KIM, KD = canvas(AW, XW); DRI, DRD = canvas(AW, XW); DLI, DLD = canvas(AW, XW)
PT = lambda a_, q: (a_ * KP, q * KP); PS = lambda a_, q: (a_ * KP, (q + 1.6) * KP)
def saw_edge(p0, p1, side, amp, per):
    d = (p1[0] - p0[0], p1[1] - p0[1]); L_ = math.hypot(*d)
    if L_ < 1e-6: return []
    t = (d[0] / L_, d[1] / L_); n = (-t[1] * side, t[0] * side)
    if amp <= 0: return [p0, p1]
    N = max(2, int(L_ / per) * 2); out = []
    for i in range(N + 1):
        s = L_ * i / N; k = amp * (i % 2); out.append((p0[0] + t[0] * s + n[0] * k, p0[1] + t[1] * s + n[1] * k))
    return out
def band_(dr, P, pts, w=0.13, amp=0.0, per=0.32, teeth=(True, True)):
    """Лента вдоль ломаной с ровными краями; зубцы только там, где заданы amp и teeth."""
    for p0, p1 in zip(pts, pts[1:]):
        d = (p1[0] - p0[0], p1[1] - p0[1]); L_ = math.hypot(*d)
        if L_ < 1e-6: continue
        t = (d[0] / L_, d[1] / L_); n = (-t[1], t[0]); h = w / 2
        a0 = (p0[0] - t[0] * h, p0[1] - t[1] * h); a1 = (p1[0] + t[0] * h, p1[1] + t[1] * h)
        up0 = (a0[0] + n[0] * h, a0[1] + n[1] * h); up1 = (a1[0] + n[0] * h, a1[1] + n[1] * h); lo0 = (a0[0] - n[0] * h, a0[1] - n[1] * h); lo1 = (a1[0] - n[0] * h, a1[1] - n[1] * h)
        U_ = saw_edge(up0, up1, 1, amp if teeth[0] else 0, per); B_ = saw_edge(lo1, lo0, 1, amp if teeth[1] else 0, per)
        dr.polygon([P(*q) for q in U_ + B_], fill=255)
def frame_(dr, P, a0, a1, q0, q1, **k): band_(dr, P, [(a0, q0), (a1, q0), (a1, q1), (a0, q1), (a0, q0)], **k)
def fill_(dr, P, pts): dr.polygon([P(*q) for q in pts], fill=255)
# Рисунок по логике f35_09, f35_10: прямые ленты, поперечные перекладины идут поперёк оси, уступы на внешних кромках. Положения поправлены на высоту поверхности и перспективу; самолёт несимметричен, как на фото.
for dr in (TRD, TLD):
    # за фонарём: стрелка, в неё вписан малый ярлык
    band_(dr, PT, [(5.05, 0.34), (6.05, 0.34), (6.55, 0.24), (7.10, 0.0)], w=0.10); band_(dr, PT, [(5.05, 0.34), (5.55, 0.16), (5.72, 0.0)], w=0.10)
    fill_(dr, PT, [(6.38, 0.0), (6.38, 0.14), (6.62, 0.14), (6.62, 0.0)])
    frame_(dr, PT, 7.18, 7.62, 0.0, 0.24, w=0.08)
    # кольцо за люком заправки: два окна с общей перемычкой
    band_(dr, PT, [(8.64, 0.0), (8.64, 0.24), (8.78, 0.31), (9.50, 0.31), (9.62, 0.24), (9.62, 0.0)], w=0.10); band_(dr, PT, [(8.64, 0.0), (9.62, 0.0)], w=0.13)
    # задняя арка: перекладины, ярлык посередине
    band_(dr, PT, [(10.20, 0.63), (10.75, 0.40), (11.05, 0.20), (11.12, 0.0)], w=0.11); band_(dr, PT, [(10.20, 0.63), (12.55, 0.63)], w=0.11); band_(dr, PT, [(12.55, 0.63), (12.85, 0.30), (12.95, 0.0)], w=0.09)
    for a_, q_ in ((11.05, 0.36), (11.70, 0.40), (12.20, 0.42)): band_(dr, PT, [(a_, 0.63), (a_, q_)], w=0.075)
    fill_(dr, PT, [(11.55, 0.0), (11.55, 0.24), (11.62, 0.27), (12.0, 0.27), (12.05, 0.24), (12.05, 0.0)]); fill_(dr, PT, [(11.20, 0.0), (11.20, 0.12), (11.34, 0.12), (11.34, 0.0)])
    # большие блоки по бокам от спины: перекладины прямые, передняя и задняя кромки с уступами
    band_(dr, PT, [(9.58, 1.38), (12.35, 1.38)], w=0.15)
    band_(dr, PT, [(9.58, 0.63), (9.58, 1.38)], w=0.13, amp=0.065, per=0.30, teeth=(False, True)); band_(dr, PT, [(12.35, 0.63), (12.35, 1.38)], w=0.11, amp=0.055, per=0.30, teeth=(True, False))
    for a_ in (10.24, 10.97, 11.70): band_(dr, PT, [(a_, 0.68), (a_, 1.34)], w=0.085)
    # законцовка крыла: скоба
    band_(dr, PT, [(10.70, 5.30), (10.70, 4.85), (11.45, 4.85), (11.45, 5.30)], w=0.08)
# плечо справа (x > 0): простой блок с окнами вспомогательных створок
band_(TRD, PT, [(7.90, 0.90), (7.90, 1.62)], w=0.11, amp=0.055, per=0.30, teeth=(True, False)); band_(TRD, PT, [(7.90, 1.62), (5.95, 1.66)], w=0.11); band_(TRD, PT, [(7.90, 0.90), (7.25, 0.90), (7.25, 1.30), (6.70, 1.30), (6.70, 1.62)], w=0.09); band_(TRD, PT, [(7.58, 1.00), (7.58, 1.55)], w=0.07)
fill_(DRD, PT, [(6.10, 1.30), (6.85, 1.30), (6.85, 1.52), (6.10, 1.52)]); fill_(DRD, PT, [(5.58, 1.32), (5.95, 1.32), (5.95, 1.52), (5.58, 1.52)])
# плечо слева (x < 0): большая рамка вокруг створки и лабиринт
band_(TLD, PT, [(8.20, 1.20), (8.20, 1.64), (4.80, 1.64), (4.95, 1.25), (8.20, 1.20)], w=0.10, amp=0.05, per=0.34, teeth=(True, False))
band_(TLD, PT, [(9.40, 0.60), (7.60, 0.60)], w=0.10); band_(TLD, PT, [(9.40, 0.60), (9.00, 0.90), (8.60, 0.90), (8.30, 1.20)], w=0.10); band_(TLD, PT, [(7.60, 0.60), (7.90, 0.85), (7.55, 1.18)], w=0.09)
for a_ in (8.20, 7.75): band_(TLD, PT, [(a_, 0.74), (a_, 1.18)], w=0.08)
frame_(TLD, PT, 6.70, 7.40, 0.82, 1.16, w=0.085, amp=0.04, per=0.28, teeth=(True, False)); band_(TLD, PT, [(7.05, 0.82), (7.05, 1.16)], w=0.07)
fill_(DLD, PT, [(7.25, 1.34), (8.10, 1.34), (8.10, 1.50), (7.25, 1.50)]); fill_(TLD, PT, [(5.05, 1.32), (5.75, 1.36), (5.75, 1.50), (5.05, 1.54)])
# метка люка заправки: белое крыло, чёрный клин, белая створка с тремя чёрными поперечинами; и белые шестигранник и шеврон
fill_(WD, PT, [(7.22, 0.0), (7.20, 0.46), (7.62, 0.31), (8.10, 0.22), (8.62, 0.17), (8.62, 0.0)])
fill_(KD, PT, [(7.46, 0.33), (7.98, 0.205), (8.56, 0.135), (8.56, 0.095), (7.70, 0.175)])
for a_ in (7.78, 8.12, 8.46): fill_(KD, PT, [(a_ - 0.018, 0.0), (a_ - 0.018, 0.075), (a_ + 0.018, 0.075), (a_ + 0.018, 0.0)])
fill_(WD, PT, [(9.65, 0.0), (9.93, 0.33), (10.04, 0.33), (10.04, 0.0)]); fill_(WD, PT, [(12.25, 0.0), (12.25, 0.08), (12.34, 0.145), (12.52, 0.145), (12.60, 0.08), (12.60, 0.0)])
# низ: кромка створок и малые окна, ромбы рисуются тёмными отдельно
frame_(BD, PT, 5.98, 11.07, 0.30, 1.48, w=0.05); band_(BD, PT, [(5.98, 0.92), (11.07, 0.92)], w=0.035)
frame_(BD, PT, 8.25, 10.30, 1.66, 2.40, w=0.045, amp=0.03, per=0.24, teeth=(True, False)); frame_(BD, PT, 2.0, 4.32, 0.17, 0.42, w=0.04)
band_(BD, PT, [(10.70, 5.30), (10.70, 4.85), (11.45, 4.85), (11.45, 5.30)], w=0.07)
# борт (a, z): шестигранная рама с ромбами (f35_08), тёмная вставка у носа
band_(SD, PS, [(2.30, -0.42), (2.46, -0.20), (3.50, -0.20), (3.66, -0.42), (3.50, -0.64), (2.46, -0.64), (2.30, -0.42)], w=0.05)
for a_ in (2.70, 2.98, 3.26): band_(SD, PS, [(a_ - 0.12, -0.42), (a_, -0.26), (a_ + 0.12, -0.42), (a_, -0.58), (a_ - 0.12, -0.42)], w=0.04)
fill_(SDK, PS, [(1.30, -0.30), (1.50, -0.02), (1.95, 0.02), (2.08, -0.20), (1.95, -0.44), (1.45, -0.44)])
def blur(im_, r=2.0): return np.asarray(im_.filter(ImageFilter.GaussianBlur(r)), np.float32) / 255.0
TMR, TML, BM, SM, WM, KM, DMR, DML, SKM = blur(TRI), blur(TLI), blur(BIM), blur(SIM), blur(WIM), blur(KIM), blur(DRI), blur(DLI), blur(SDI)
def look(M, Au, Qv):
    h_, w_ = M.shape; iu = np.clip((Au * KP).astype(np.int32), 0, w_ - 1); iv = np.clip((Qv * KP).astype(np.int32), 0, h_ - 1); return M[iv, iu]
body = np.isin(cls, (0, 7, 8))           # лента идёт по обшивке и створкам
wt = smooth(0.10, 0.34, nz); wb = smooth(-0.10, -0.34, nz); ws = 1 - np.maximum(wt, wb); xr = x > 0
ram = np.maximum.reduce([np.where(xr, look(TMR, a, ax), look(TML, a, ax)) * wt, look(BM, a, ax) * wb * 0.8, look(SM, a, z + 1.6) * ws * 0.55]) * body * skin_m
# кромки: передние и задние полосы крыла, стабилизатора и киля светлее (f35_07, f35_10)
slat = cls == 5; flp = cls == 4; wingz = np.isin(cls, (0, 4, 5)) & (ax > 1.95)
A_LE_ = np.interp(ax, [1.2, 2.4, 5.435], [7.3, 8.05, 10.02]); A_TE_ = np.interp(ax, [1.2, 1.78, 5.435], [12.44, 12.33, 11.59]); CH_ = np.interp(ax, [1.86, 4.76], [0.84, 0.70])
d_le = a - A_LE_; d_te = A_TE_ - a; d_hg = (A_TE_ - CH_) - a
le = wingz * np.maximum.reduce([smooth(0.27, 0.25, d_le), smooth(0.22, 0.20, d_te) * 0.95, smooth(0.015, 0.03, d_hg) * smooth(0.11, 0.09, d_hg) * 0.8])
stc = (cls == 3); s_c = (a - 12.4 - (ax - 1.82) * 0.81)
fin_c = (cls == 1) | (cls == 2)
f_le = a - (11.35 + (z - 0.5) * 1.105); f_te = (13.55 + (z - 0.5) * 0.407) - a
fin_edge = fin_c * np.maximum(smooth(0.13, 0.11, f_le), smooth(0.13, 0.11, f_te))
s_te = (15.67 - (ax - 1.70) * 0.331) - a; stab_edge = stc * smooth(0.24, 0.22, s_te)
tipw = (cls == 0) & (ax > 5.28)
ramk = np.clip(np.maximum.reduce([ram, le * 0.85 * skin_m, fin_edge * 0.75 * skin_m, stab_edge * 0.75 * skin_m, tipw * 0.8 * skin_m]), 0, 1)
# покрытие швов живое: пятнами темнее и светлее, чуть затёрто, край немного темнее середины (лента лежит слоем)
rvar = (0.88 + 0.18 * mott + 0.10 * (patch - 0.5) + 0.04 * (fine - 0.5))[..., None]; redge = smooth(0.0, 0.55, ramk)[..., None]; wear = smooth(0.62, 0.78, fbm(5.0, 5.0, 5.0, 3, 47.0))
col = mix(col, RAM * rvar * (0.90 + 0.10 * redge), ramk * (1 - 0.30 * wear)); rough = rough * (1 - ramk) + (0.50 + 0.10 * (mott - 0.5)) * ramk; metal = metal * (1 - ramk)
# белая и чёрная краска метки, тёмные окна створок и вставка у носа
wm_ = look(WM, a, ax) * wt * skin_m * body; km_ = look(KM, a, ax) * wt * skin_m * body; dk_ = np.where(xr, look(DMR, a, ax), look(DML, a, ax)) * wt * skin_m * body
col = mix(col, np.array((0.70, 0.71, 0.70), np.float32) * (0.92 + 0.14 * mott)[..., None], wm_); rough = rough * (1 - wm_) + 0.48 * wm_; metal = metal * (1 - wm_); col = mix(col, (0.045, 0.045, 0.05), km_); rough = rough * (1 - km_) + 0.5 * km_
col = mix(col, BASE * 0.52, dk_); rough = rough * (1 - dk_) + 0.30 * dk_; ramk = np.maximum(ramk, wm_)
snz = look(SKM, a, z + 1.6) * ws * skin_m * (cls == 0); col = mix(col, BASE * 0.74, snz * 0.8)
log('покрытие швов', round(float((ramk > 0.5).mean()), 3))
# тёмные ромбы снизу крыла и кружки (f35_05, f35_06)
for ac, qc, rA, rQ in ((10.60, 3.25, 0.30, 0.16), (9.45, 3.55, 0.30, 0.14), (10.15, 4.65, 0.26, 0.11), (8.85, 2.85, 0.24, 0.12), (11.15, 2.65, 0.16, 0.10)):
    dm = np.abs(a - ac) / rA + np.abs(ax - qc) / rQ; m_ = smooth(1.04, 0.96, dm) * (nz < -0.3) * (cls <= 1); col = mix(col, BASE * 0.70, m_ * 0.85); rough += m_ * 0.12
# шестигранные пластины сверху на крыле и спине: чуть темнее, еле заметно (f35_07)
for ac, qc, r_ in ((9.45, 3.65, 0.62), (10.3, 2.75, 0.50)):
    hx = np.maximum(np.abs(ax - qc) * 1.155, (np.abs(ax - qc) * 0.577 + np.abs(a - ac))); m_ = smooth(r_ + 0.015, r_ - 0.015, hx) * (nz > 0.3) * ((cls == 0) | (cls == 5)); col = mix(col, BASE * 1.10, m_ * 0.7); rough += m_ * 0.05
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
flow = smooth(0.52, 0.72, stre) * (0.35 + 0.65 * smooth(0.35, 0.70, patch)); flow2 = smooth(0.58, 0.74, stre2); rearw = 0.4 + 0.6 * smooth(7.0, 12.5, a)
dirty = flow * rearw * 0.20; col = mix(col, BASE * 0.80, dirty * 0.30); rough += dirty * 0.16
col = mix(col, BASE * 0.78, flow2 * 0.03 * rearw); rough += flow2 * 0.02
under = smooth(-0.15, -0.75, nz); oil = under * smooth(0.50, 0.74, fbm(1.0, 3.0, 3.0, 4, 23.0)); col = mix(col, BASE * 0.78, oil * 0.22); rough += oil * 0.10
soot = smooth(11.8, 13.2, a) * (ax < 1.25) * ((cls == 0)) * (0.4 + 0.6 * smooth(0.28, 0.72, fbm(0.7, 2.6, 2.6, 4, 31.0))); col = mix(col, BASE * 0.55, soot * 0.45); rough += soot * 0.22
canz = (cls == 0) & (a > 1.6) & (a < 5.7) & (ax < 1.0) & (z > 0.25)   # у рамы фонаря затенение из запекания рваное и чёрное: там его нет
crev = smooth(0.92, 0.45, ao1) * skin_m * ~canz; col = mix(col, BASE * 0.42, crev * 0.55); rough += crev * 0.25
body_ao = smooth(0.15, 0.95, ao2); col *= np.where(canz, 1.0, 0.78 + 0.22 * body_ao)[..., None]; col = mix(col, BASE * 0.5, smooth(0.80, 0.30, ao1) * skin_m * ~canz * 0.35)
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
stamp(RND, 10.75, -4.05, 1.85, 0.74, 'top', along=False); stamp(RND, 10.65, 3.85, 1.85, 0.74, 'bot', along=False)
for sg in (1, -1):
    sd = 'r' if sg > 0 else 'l'
    stamp(RND, 7.85, -0.36, 1.00, 0.40, sd)                                             # на борту у отсека
    stamp(text_('QF', 300), 13.30, 1.35, 0.72, 0.46, sd, cl=(1, 2))                     # буквы на киле: придуманные
    stamp(text_('AF 14-5072', 120, font=FN), 13.05, 0.72, 0.78, 0.09, sd, cl=(1, 2))    # номер: придуманный
    stamp(tri_(['DANGER', 'EJECTION', 'SEAT']), 3.42, 0.34, 0.30, 0.28, sd)
    stamp(tri_(['DANGER', 'JET', 'INTAKE']), 3.84, -0.36, 0.28, 0.26, sd)
    stamp(box_('RESCUE', 'CANOPY RELEASE OTHER SIDE'), 3.05, 0.02, 0.46, 0.18, sd)
    stamp(text_('WARNING - KEEP CLEAR', 90, font=FN), 2.72, 0.56, 0.70, 0.048, sd)
    # прямоугольник строевых огней из точек за воздухозаборником (f35_01, f35_12, f35_15)
    dots = Image.new('RGBA', (360, 240), (0, 0, 0, 0)); dd = ImageDraw.Draw(dots)
    for ix_ in range(6):
        for yy in (12, 228): dd.ellipse((12 + ix_ * 66 - 10, yy - 10, 12 + ix_ * 66 + 10, yy + 10), fill=LW)
    for iy_ in range(1, 3):
        for xx in (12, 342): dd.ellipse((xx - 10, 12 + iy_ * 72 - 10, xx + 10, 12 + iy_ * 72 + 10), fill=LW)
    stamp(dots, 6.65, -0.36, 0.50, 0.34, sd)
stamp(text_('NO STEP', 200, ink=(50, 52, 54, 255)), 11.80, 0.0, 0.34, 0.42, 'top', along=False)
log('знаки')
# ── светлый носовой конус ──
rad = (a < 1.32) & (cls == 0); RAD = RAM * 0.90 * (0.97 + 0.06 * mott)[..., None]; col[rad] = RAD[rad]; rough[rad] = (0.52 + 0.05 * (mott - 0.5))[rad]; metal[rad] = 0
# ── сопло: тёмные лепестки снаружи, светлая керамика внутри, копоть к срезу ──
tn = fbm(1.2, 4.0, 4.0, 4, 59.0); ts = fbm(0.8, 14.0, 14.0, 3, 61.0); noz = cls == 10; rn = np.hypot(ax, z + 0.12)
col[noz] = (np.array((0.115, 0.112, 0.110), np.float32) * (0.85 + 0.30 * ts)[..., None])[noz]; rough[noz] = np.clip(0.55 + (tn[noz] - 0.5) * 0.1, 0.4, 0.7); metal[noz] = 0.25
ins_ = noz & (rn < (0.60 - (a - 13.2) * 0.26)); iv = 0.58 * (0.75 + 0.40 * ts) * (1 - 0.65 * smooth(13.75, 14.02, a)) * (1 - 0.45 * smooth(13.3, 13.2, a)); col[ins_] = (np.stack([iv * 1.02, iv * 0.93, iv * 0.80], -1))[ins_]; rough[ins_] = 0.78; metal[ins_] = 0
pipe = (cls == 0) & (mat == 1); col[pipe] = (np.array((0.30, 0.28, 0.25), np.float32) * (0.8 + 0.4 * tn)[..., None])[pipe]; metal[pipe] = 0.8; rough[pipe] = 0.55
fan_ = cls == 13; col[fan_] = np.array((0.16, 0.16, 0.17), np.float32); metal[fan_] = 0.6; rough[fan_] = 0.5
log('сопло')
def solid(m, c, r, me=0.0, nz_=0.08):
    col[m] = (np.array(c, np.float32) * (1 - nz_ / 2 + nz_ * fine)[..., None])[m]; rough[m] = r; metal[m] = me
solid(mat == 10, BASE * 0.55, 0.85)
solid(mat == 2, (0.030, 0.030, 0.032), 0.9); solid(mat == 4, (0.045, 0.045, 0.048), 0.86); solid(mat == 5, (0.25, 0.26, 0.27), 0.62, 0, 0.16)
duct = (mat == 5) & (cls != 11) & (cls != 12); col[duct] = (np.array((0.26, 0.27, 0.28), np.float32) * (0.75 + 0.5 * mott)[..., None])[duct]; rough[duct] = 0.7; col[duct] *= (0.40 + 0.60 * ao2[duct])[..., None]
lipd = a - (4.29 + 0.80 * (1.5 - ax) + 0.45 * (0.28 - z)); intk = duct & (cls == 0) & (ax > 0.45) & (a < 8.3) & (z < 0.95)
ik = np.clip(1 - np.exp(-np.clip(lipd, 0, None) / 0.32), 0, 1);   # быстро темнеет сразу за кромкой и дальше почти ровно: граница горла не читается
ikc = BASE[None, None, :] * 1.18 * (1 - ik[..., None]) + np.array((0.060, 0.062, 0.066), np.float32) * ik[..., None]; col[intk] = (ikc * (0.94 + 0.12 * mott)[..., None])[intk]; rough[intk] = (0.60 + 0.30 * ik)[intk]; metal[intk] = 0
# светлая часть внутри устья - боковина корпуса из обшивки: она темнеет так же, иначе на границе с нутром резкий скачок
hs = (mat == 0) & (cls == 0) & (lipd > 0.0) & (a < 7.0) & (z > -0.95) & (z < 0.5) & (ax < 1.25) & (nx * np.sign(x) > 0.15); col[hs] = (ikc * (0.94 + 0.12 * mott)[..., None])[hs]; rough[hs] = (0.60 + 0.30 * ik)[hs]; metal[hs] = 0; intk = intk | hs
# светлая полоса по кромке снаружи, вверху сходит на нет (f35_10)
lipo = (mat == 0) & (cls == 0) & (ax > 0.55) & (a < 6.2) & (z < 0.45) & (lipd < 0.02) & (lipd > -0.11); lipa = (smooth(0.40, 0.05, z) * lipo)[..., None]; col = col * (1 - lipa) + (RAM * (0.88 + 0.18 * mott)[..., None]) * lipa; rough[lipo] = 0.5; metal[lipo] = 0
tub = (mat == 5) & (cls == 0) & (a > 2.0) & (a < 5.4) & (ax < 0.62) & (z > 0.0); col[tub] = (np.array((0.30, 0.31, 0.32), np.float32) * (0.85 + 0.3 * ao2[tub, None]))
solid(mat == 6, (0.20, 0.205, 0.20), 0.92, 0, 0.2); solid(mat == 8, (0.30, 0.28, 0.21), 0.9, 0, 0.14); solid(mat == 7, (0.02, 0.05, 0.045), 0.12, 0, 0.0)
hs = ((pos[..., 0] + pos[..., 1] + pos[..., 2]) / 0.035) % 1.0 > 0.5; solid(mat == 9, (0.74, 0.60, 0.06), 0.42); col[(mat == 9) & hs & (cls == 11)] = np.array((0.035, 0.035, 0.035), np.float32)
solid((mat == 1) & (cls == 11), (0.46, 0.47, 0.48), 0.38, 1.0)
# грунт отсеков: песочный, пятнами; блоки и трубки чуть разные (f35_05, f35_06)
pr = mat == 11; pm = fbm(2.0, 2.0, 2.0, 3, 67.0); col[pr] = (np.array((0.72, 0.62, 0.44), np.float32) * (0.82 + 0.34 * pm)[..., None])[pr]; rough[pr] = 0.68; col[pr] *= (0.55 + 0.45 * ao2[pr])[..., None]
pe_ = pr & ((z < -0.70) | (cls == 8) & (np.abs(nz) < 0.6)); col[pe_] = BASE * 0.42; rough[pe_] = 0.6   # кромки у разъёма створок не песочные: в щель виден тёмный борт
mm_ = (mat == 1) & (cls == 15); solid(mm_, (0.40, 0.40, 0.40), 0.4, 0.8)
# шасси: потёртая серо-белая краска, шток, сталь, резина
gr_ = cls == 12; g_p = gr_ & (mat == 0); g_c = gr_ & (mat == 1); g_s = gr_ & (mat == 8); g_d = gr_ & (mat == 5)
gm1 = fbm(2.4, 2.4, 2.4, 4, 91.0); gm2 = fbm(18.0, 18.0, 18.0, 3, 93.0); gst = fbm(1.0, 16.0, 2.2, 4, 87.0); gst2 = fbm(0.7, 34.0, 1.3, 3, 89.0)
solid(g_p, (0.545, 0.545, 0.515), 0.62, 0, 0.10); solid(g_c, (0.47, 0.47, 0.46), 0.30, 0.85, 0.08); solid(g_s, (0.145, 0.142, 0.14), 0.58, 0.75, 0.14); solid(g_d, (0.335, 0.35, 0.365), 0.60, 0, 0.10); solid(gr_ & (mat == 9), (0.60, 0.56, 0.40), 0.28, 0, 0.1); solid(gr_ & (mat == 2), (0.05, 0.048, 0.046), 0.72, 0, 0.14)
painted = g_p | g_d; col[painted] *= (0.84 + 0.30 * gm1[painted] + 0.06 * gm2[painted])[..., None]
oil_ = smooth(0.46, 0.68, gst) * (0.5 + 0.5 * smooth(0.40, 0.70, gst2)); col = mix(col, (0.15, 0.125, 0.095), oil_ * 0.58 * (painted | g_c)); rough = rough + oil_ * 0.20 * painted - oil_ * 0.10 * g_c
gd = smooth(-0.95, -2.10, z) * gr_ * (0.45 + 0.55 * smooth(0.36, 0.66, gm1)); col = mix(col, (0.215, 0.195, 0.165), gd * 0.62 * (painted | g_s)); rough = rough + gd * 0.22 * painted
for ac_, xc_, zc_, rw_ in ((4.05, 0.0, -1.915, 0.285), (9.30, 2.10, -1.815, 0.385), (9.30, -2.10, -1.815, 0.385)):
    rd_ = np.hypot(a - ac_, z - zc_); md_ = gr_ & (rd_ < rw_ * 0.68) & (np.abs(x - xc_) < 0.20); dust = smooth(rw_ * 0.68, rw_ * 0.10, rd_) * (0.45 + 0.55 * smooth(0.34, 0.62, gm2)) * md_; col = mix(col, (0.115, 0.10, 0.085), dust * 0.72); rough = rough + dust * 0.15
g_e = smooth(0.985, 0.90, bev) * painted * smooth(0.50, 0.62, gm2); col = mix(col, (0.26, 0.255, 0.24), g_e * 0.8)
tyr = mat == 4; rt_ = smooth(0.40, 0.68, gm2) * tyr; col[tyr] = np.array((0.070, 0.070, 0.072), np.float32); col = mix(col, (0.165, 0.158, 0.145), rt_ * 0.50); col = mix(col, (0.20, 0.19, 0.17), smooth(-1.75, -2.20, z) * tyr * 0.45); rough[tyr] = 0.90
col[gr_] *= (0.50 + 0.50 * smooth(0.15, 0.95, ao2[gr_]))[..., None]
door_in = np.isin(cls, (7,)) & (nz > 0.2) & (z < 0.2); solid(door_in, (0.66, 0.66, 0.64), 0.55, 0, 0.14)
h_m = (cls == 14) & (mat == 1); solid(h_m, (0.36, 0.38, 0.40), 0.5, 0.5, 0.12)
solid((cls == 9) & (mat == 1), (0.44, 0.45, 0.46), 0.38, 1.0)
solid((cls == 9) & (mat == 0), BASE * 1.05, 0.46, 0.0, 0.05)   # рама фонаря ровная, без сколов и грязи
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
occ = np.clip(0.35 + 0.65 * smooth(0.10, 0.92, ao2) * smooth(0.25, 0.90, ao1), 0, 1); occ[canz & (mat == 0)] = 1.0; occ[intk] = 1.0 - 0.25 * ik[intk]; occ[(cls == 9) & (mat == 0)] = 1.0   # рама лежит вплотную к обшивке, запекание считает её щелью и чернит
bleed([col, rough, metal, occ, nn], cov)
def lift(arr): return (np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)
Image.fromarray(lift(col)[::-1]).save(f'{OUT}/f35_color.png', compress_level=1); Image.fromarray(lift(nn * 0.5 + 0.5)[::-1]).save(f'{OUT}/f35_normal.png', compress_level=1); Image.fromarray(lift(np.stack([occ, rough, metal], -1))[::-1]).save(f'{OUT}/f35_orm.png', compress_level=1)
pm_ = skin_m & cov & (cls == 0) & (a > 2) & (a < 13)
print('средний цвет обшивки sRGB', (col[pm_].mean(0) * 255).round(1), 'шероховатость', round(float(rough[pm_].mean()), 3))
log('сохранено', OUT)
