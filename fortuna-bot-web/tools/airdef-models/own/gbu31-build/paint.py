# paint.py - покраска GBU-31 в пространстве текстуры: всё считается по положению в метрах, поэтому на швах развёртки цвет не рвётся. Свои меши и своя краска, с картинок берутся только цвет и расположение.
#   /usr/bin/python3 paint.py     → tex/color.png, tex/normal.png
# Запечено в цвет: AO, потёртости, сколы, неровная олива, жёлтый поясок, свои надписи, заклёпки и люк. В нормалях: стыки, заклёпки, люк, окна рамок, зерно краски.
import json, math, os, site, sys
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__)); MP = os.path.join(HERE, '_maps'); TX = os.path.join(HERE, 'tex'); os.makedirs(TX, exist_ok=True)
PJ = json.load(open(os.path.join(MP, 'parts.json'))); ZN = PJ['zones']; Z = {n: i for i, n in enumerate(ZN)}; S = PJ['S']; X0 = PJ['X0']; GAIN = float(os.environ.get('G31_GAIN', '1.0'))
ld = lambda n: np.load(os.path.join(MP, n + '.npy'))
P0 = ld('pos') * 6 - 3; N0 = ld('nrm') * 2 - 1; ID0 = np.rint(ld('id0')[..., 0] * 32).astype(int) - 1; AOS0 = ld('aos')[..., 0]; AOL0 = ld('aol')[..., 0]; E0 = ld('edge')[..., 0]; NT0 = ld('nt'); W = P0.shape[0]
inside = ID0 >= 0; idx = np.nonzero(inside); p = P0[idx]; n_ = N0[idx]; zid = ID0[idx]; aos = np.clip(AOS0[idx], 0, 1); aol = np.clip(AOL0[idx], 0, 1); edge = E0[idx]; N = len(p); print('текселей', N, 'заполнение', round(float(inside.mean()), 3))
n_ = n_ / np.maximum(np.linalg.norm(n_, axis=1, keepdims=True), 1e-6); x, y, z = p[:, 0], p[:, 1], p[:, 2]; nx, ny, nz = n_[:, 0], n_[:, 1], n_[:, 2]
px = X0 - y / S; rad = np.hypot(x, z); th = np.arctan2(x, z); radp = rad / S; zs = z / S     # px - положение вдоль оси в пикселях референс_4; th - угол от верха к +X
rng = np.random.default_rng(31); VOL = rng.random((128, 128, 128), dtype=np.float32)
isz = lambda *names: np.isin(zid, [Z[k] for k in names])
srgb = lambda c: (np.array(c, np.float32) / 255.0) ** 2.2
sm = lambda a, e0, e1: (lambda t: t * t * (3 - 2 * t))(np.clip((a - e0) / (e1 - e0), 0, 1))
mix = lambda a, b, t: a + (b - a) * (t[:, None] if np.ndim(t) == 1 else t)
full = lambda c: np.broadcast_to(srgb(c), (N, 3)).astype(np.float32)


def vn(q):
    i = np.floor(q).astype(np.int32); t = q - i; t = t * t * (3 - 2 * t); i0 = i & 127; i1 = (i0 + 1) & 127
    v = lambda a, b, c: VOL[a[:, 0], b[:, 1], c[:, 2]]
    c00 = v(i0, i0, i0) * (1 - t[:, 0]) + v(i1, i0, i0) * t[:, 0]; c10 = v(i0, i1, i0) * (1 - t[:, 0]) + v(i1, i1, i0) * t[:, 0]; c01 = v(i0, i0, i1) * (1 - t[:, 0]) + v(i1, i0, i1) * t[:, 0]; c11 = v(i0, i1, i1) * (1 - t[:, 0]) + v(i1, i1, i1) * t[:, 0]
    return (c00 * (1 - t[:, 1]) + c10 * t[:, 1]) * (1 - t[:, 2]) + (c01 * (1 - t[:, 1]) + c11 * t[:, 1]) * t[:, 2]


def fbm(f, oct=4, seed=0.0, gain=0.5):
    q = p.astype(np.float32) * np.array(f, np.float32).reshape(-1, 3 if np.ndim(f) else 1) + seed * 17.13; a = 1.0; s = 0; w = 0
    for o in range(oct): s = s + vn(q + o * 31.7) * a; w += a; a *= gain; q = q * 2.03
    s = s / w; lo, hi = np.quantile(s[:: max(1, len(s) // 200000)], [0.01, 0.99]); return np.clip((s - lo) / (hi - lo), 0, 1)


thr = lambda a, cover: float(np.quantile(a[:: max(1, len(a) // 200000)], 1 - cover))
print('шумы'); bl1 = fbm(1.3, 3, 1); bl2 = fbm(5.0, 4, 2); bl3 = fbm(21, 4, 3); bl4 = fbm(62, 3, 4); fine = fbm(170, 2, 5)
crev = np.clip(1 - aos, 0, 1); occ = np.clip(1 - aol, 0, 1); convex = edge * sm(aos, 0.45, 0.8)
olive, white, saddle, lug, dark, finz, strap, frame_z = isz('olive'), isz('white'), isz('saddle'), isz('lug'), isz('dark'), isz('fin'), isz('strap'), isz('frame')
light_z = white | finz | strap | frame_z; painted = olive | light_z | saddle
# ═══ основа ═══
C_OLIVE, C_WHITE, C_FIN, C_STRAP, C_SADDLE, C_LUG, C_BAND, C_TIP = (98, 96, 76), (212, 214, 224), (200, 202, 212), (206, 208, 218), (122, 126, 138), (154, 142, 124), (234, 184, 36), (96, 86, 72)
col = full(C_OLIVE).copy(); col = np.where(white[:, None], full(C_WHITE), col); col = np.where(finz[:, None], full(C_FIN), col); col = np.where((strap | frame_z)[:, None], full(C_STRAP), col); col = np.where(saddle[:, None], full(C_SADDLE), col)
# олива неровная, как на образце: пятна темнее и зеленее, выгоревшие места, полосы вдоль корпуса
dk_p = sm(bl2 * 0.55 + bl3 * 0.45, 0.50, 0.76); lt_p = sm(fbm(2.6, 3, 6), 0.55, 0.80); strk = sm(fbm((44, 3.0, 44), 3, 7), 0.48, 0.80) * (0.3 + 0.7 * sm(bl1, 0.2, 0.7)); spk = sm(fine * 0.5 + bl4 * 0.5, 0.60, 0.74)
ol = col * (0.92 + 0.14 * bl1)[:, None]; ol = mix(ol, ol * np.array((0.62, 0.66, 0.56), np.float32), dk_p * 0.70); ol = mix(ol, ol * np.array((1.22, 1.20, 1.14), np.float32), lt_p * 0.55); ol = mix(ol, ol * np.array((0.74, 0.74, 0.68), np.float32), strk * 0.42); ol = mix(ol, ol * np.array((1.28, 1.27, 1.22), np.float32), spk * 0.30)
col = np.where(olive[:, None], ol, col)
col = np.where((painted & ~olive)[:, None], col * ((0.96 + 0.06 * bl1) * (0.975 + 0.04 * bl2))[:, None], col)
# нос: кончик, поясок
tipm = olive & (px < 31.0); col = np.where(tipm[:, None], full(C_TIP) * (0.82 + 0.28 * bl3)[:, None], col)
band = olive & (px >= 158) & (px <= 173); col = np.where(band[:, None], full(C_BAND) * (0.82 + 0.22 * bl3)[:, None], col); band_w = band * sm(bl3 * 0.6 + bl4 * 0.4, 0.62, 0.78); col = mix(col, full((124, 112, 70)), band_w * 0.6)
hole = olive & (px < 18.3) & (rad < 0.0045); col = np.where(hole[:, None], full((22, 22, 22)), col)
# ═══ свои надписи ═══
FONT = '/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf'
if not os.path.exists(FONT): FONT = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'


def stencil(lines, h_m):
    k = 2400; fs = int(h_m * k); ft = ImageFont.truetype(FONT, fs); ws = [ft.getlength(s) for s in lines]; Wp = int(max(ws) + fs); Hp = int(len(lines) * fs * 1.28 + fs * 0.4); im = Image.new('L', (Wp, Hp), 0); d = ImageDraw.Draw(im)
    for i, s in enumerate(lines): d.text((fs * 0.5, fs * 0.2 + i * fs * 1.28), s, fill=255, font=ft)
    return np.asarray(im, np.float32) / 255, Wp / k, Hp / k


def project(mask, wm, hm, uu, vv):
    ix = ((uu / wm + 0.5) * mask.shape[1]).astype(np.int32); iy = ((0.5 - vv / hm) * mask.shape[0]).astype(np.int32); ok = (ix >= 0) & (ix < mask.shape[1]) & (iy >= 0) & (iy < mask.shape[0]); out = np.zeros(N, np.float32); out[ok] = mask[iy[ok], ix[ok]]; return out


def side_text(lines, xc, zc, h_m, zone, ink, sides=(-1, 1), a=0.9):
    global col
    mk_, wm, hm = stencil(lines, h_m); yc = (X0 - xc) * S; zm = zc * S; m_all = np.zeros(N, np.float32)
    for sg in sides:
        m_ = project(mk_, wm, hm, (y - yc) * sg, z - zm) * ((x * sg) > 0.04) * zone; m_all = np.maximum(m_all, m_)
    col = mix(col, full(ink), m_all * (a - 0.3 * sm(bl3, 0.45, 0.75)))


side_text(['EXPLOSIVE', 'BOMB'], 215.0, 2.0, 0.019, olive, (232, 230, 220))
side_text(['GBU-31 JDAM', 'LOT 0722 - 3'], 415.0, 8.0, 0.022, olive, (232, 230, 220))
side_text(['BOMB GP 2000 LB', 'FUZED - HANDLE WITH CARE'], 622.0, 24.0, 0.017, olive, (232, 230, 220))
side_text(['GUIDANCE TAIL KIT', 'KEEP DRY'], 824.0, 2.0, 0.0155, white, (44, 46, 52))
_m, _wm, _hm = stencil(['NO STEP'], 0.015)
phi = np.radians(PJ['phi'])
for ph_ in phi:
    dx_, dz_ = math.cos(ph_), math.sin(ph_); ax_, az2 = -math.sin(ph_), math.cos(ph_); sg_ = np.sign(nx * ax_ + nz * az2); lm = finz & (np.abs(x * ax_ + z * az2) < 0.02) & ((x * dx_ + z * dz_) > 0); up_ = 1.0 if dz_ > 0 else -1.0
    tm_ = project(_m, _wm, _hm, (y - (X0 - 962.0) * S) * (-sg_) * up_, ((x * dx_ + z * dz_) - 52.0 * S) * up_) * lm; col = mix(col, full((44, 46, 52)), tm_ * 0.9)
# ═══ окна в рамках снизу: сквозь них видна олива ═══
TH_P = PJ['th_p']; thm = np.abs(th); thc = TH_P + 0.27; sdf = np.full(N, 99.0, np.float32)
for cx_, a_ in ((345.0, 42.0), (487.0, 42.0)):
    dxx = np.maximum(np.abs(px - cx_) - (a_ - 7.5), 0.0); sdf = np.minimum(sdf, np.hypot(dxx, (thm - thc) * 57.0) - 7.5)
ovals = frame_z & (sdf < 0); col = np.where(ovals[:, None], ol * 0.72, col)
# ═══ царапины, потёртости, сколы ═══
sc1 = np.abs(fbm((320, 36, 44), 2, 8) - 0.5); sc2 = np.abs(fbm((36, 290, 58), 2, 9) - 0.5); sc = np.maximum(1 - sm(sc1, 0.0, 0.008), 1 - sm(sc2, 0.0, 0.008)) * sm(bl2, 0.40, 0.72) * sm(bl1, 0.25, 0.6)
col = mix(col, col * np.array((1.55, 1.52, 1.42), np.float32), sc * 0.65 * (olive | saddle)); col = mix(col, col * np.array((0.78, 0.78, 0.78), np.float32), sc * 0.45 * light_z)
rub = sm(convex * 9.0, 0.12, 0.45) * sm(bl3, 0.30, 0.62) * painted; col = mix(col, col * np.array((1.34, 1.32, 1.26), np.float32), rub * 0.65 * (~light_z))
chips_n = bl3 * 0.6 + bl4 * 0.4; edge_ch = sm(convex * 9.0, 0.30, 0.58) * sm(chips_n, 0.48, 0.58); flat_gate = sm(bl1 * 0.5 + bl2 * 0.5, 0.45, 0.70); fch_n = chips_n + flat_gate * 0.16; flat_ch = sm(fch_n, thr(fch_n, 0.0040), thr(fch_n, 0.0022)); chip = np.clip(np.maximum(edge_ch, flat_ch * np.where(light_z, 0.25, 1.0)), 0, 1) * painted * (~ovals)
metal = mix(full((168, 168, 164)), full((124, 122, 118)), bl4); metal = np.where(light_z[:, None], full((178, 178, 178)), metal); col = mix(col, metal, sm(chip, 0.42, 0.72)); col = mix(col, full((92, 90, 82)), sm(chip, 0.12, 0.42) * (1 - sm(chip, 0.42, 0.72)) * olive)
# ═══ остальные зоны ═══
lgm = full(C_LUG) * (0.82 + 0.26 * bl4)[:, None] * (0.72 + 0.46 * sm(nz, -0.3, 0.9))[:, None]; lgm = mix(lgm, full((96, 80, 64)), sm(bl3 * 0.6 + crev * 0.3, 0.64, 0.86) * 0.45); col = np.where(lug[:, None], lgm, col)
dk = full((42, 42, 42)) * (0.8 + 0.34 * bl3)[:, None] * (0.8 + 0.4 * sm(nz, -0.2, 0.9))[:, None]; col = np.where(dark[:, None], dk, col)
# ═══ грязь и запечённый свет ═══
print('грязь'); grime = full((58, 54, 46))
belly = sm(np.abs(th), 2.3, 3.14) * olive; col = mix(col, col * np.array((0.70, 0.70, 0.66), np.float32), belly * 0.5 * (0.4 + 0.6 * sm(bl2, 0.3, 0.7)))
lsoil = sm(fbm((3.0, 34, 34), 3, 12), 0.52, 0.84) * light_z; col = mix(col, col * np.array((0.86, 0.85, 0.82), np.float32), lsoil * 0.28)
col = mix(col, grime, np.clip(sm(crev, 0.25, 0.80) * 0.55 + sm(occ, 0.50, 0.88) * 0.10, 0, 0.70))
shade = (0.66 + 0.34 * aol ** 1.1) * (0.46 + 0.54 * aos ** 1.05) * (0.94 + 0.09 * sm(nz, -1, 1)); COL_L = col * shade[:, None] * GAIN
# ═══ рельеф ═══
print('рельеф'); h = np.zeros(N, np.float32); h += (fine - 0.5) * 0.05e-3 + (bl4 - 0.5) * 0.06e-3; h -= sm(chip, 0.3, 0.6) * 0.40e-3; h -= sc * 0.14e-3 * painted
lines = np.zeros(N, np.float32); dots = np.zeros(N, np.float32); dome = lambda dist, r_, hh: hh * (1 - sm(dist, r_ * 0.55, r_))


def seam(xc, w=0.42, dep=0.9e-3, mask=None):
    global h, lines
    m = (np.abs(px - xc) < w) & (mask if mask is not None else (olive | white)); h -= m * dep; lines = np.maximum(lines, m)


def bolts(xc, n, zone_mask, offs=0.0, r_=0.0050, hh=0.7e-3):
    global h, dots
    tt = (th + offs) % (2 * np.pi / n); tt = np.minimum(tt, 2 * np.pi / n - tt); dist = np.hypot((px - xc) * S, tt * rad); h += dome(dist, r_, hh) * zone_mask; dots = np.maximum(dots, (dist < r_ * 1.12) * zone_mask)


seam(31.2, mask=olive); seam(681.2, mask=white); seam(859.0, mask=white); seam(867.2, mask=white)
bolts(684.8, 28, white, 0.1); bolts(676.0, 12, white, 0.2, 0.0066); bolts(791.0, 21, white, 0.05); bolts(863.0, 14, white, 0.11, 0.0066, 0.9e-3); bolts(655.0, 26, olive, 0.03, 0.0042, 0.5e-3); bolts(872.0, 8, white, 0.39, 0.0042)
# тёмные отверстия на переднем фланце, как на картинке
for zh in (21.0, -20.0):
    for sg in (-1, 1):
        dist = np.hypot((px - 678.0) * S, (z - zh * S)) ; hit = (dist < 0.0072) & ((x * sg) > 0.1) & white; dots = np.maximum(dots, hit * 1.0); h -= hit * 0.8e-3; lines = np.maximum(lines, hit)
# люк на хвостовом блоке (борт -X): скруглённый контур и винты
hx = px - 729.5; hz = zs - 0.5; rr_ = 12.0; dh = np.hypot(np.maximum(np.abs(hx) - (38.5 - rr_), 0), np.maximum(np.abs(hz) - (24.5 - rr_), 0)) - rr_; hatch = white & (np.abs(nx) > 0.2) & (np.abs(dh) < 0.55); h -= hatch * 1.0e-3; lines = np.maximum(lines, hatch)
for hx_, hz_ in ((722.0, 24.5), (765.0, -1.0), (711.0, -24.5)):
    dist = np.hypot((px - hx_) * S, (zs - hz_) * S); hit = white & (np.abs(x) > 0.02); h += dome(dist, 0.0062, 0.8e-3) * hit; dots = np.maximum(dots, (dist < 0.0066) * hit)
# накладка: контур, заклёпки по краю, крышка и отверстия
_d = np.hypot((((px - 262.0) % 21.0) - 10.5) * S, (np.abs(th) - 0.65) * rad); sad_rows = saddle & (_d < 0.0046); h += dome(_d, 0.0046, 0.6e-3) * saddle; dots = np.maximum(dots, sad_rows)
_fm = saddle & (px > 391) & (px < 438) & (np.abs(th) < 0.22); _d = np.minimum.reduce([np.abs(px - 391), np.abs(px - 438), (0.22 - np.abs(th)) * 57.0]); fl_ = _fm & (_d < 0.55); h -= fl_ * 0.9e-3; lines = np.maximum(lines, fl_)
for hx_, ht_ in ((332.0, 0.13), (400.0, 0.0), (534.0, -0.12)):
    dist = np.hypot((px - hx_) * S, (th - ht_) * rad); hit = saddle & (dist < 0.0095); h -= hit * 1.0e-3; col_hole = hit; lines = np.maximum(lines, hit)
# окна рамок: ступенька, тёмный край
ovl = frame_z & (np.abs(sdf) < 0.55); h -= ovals * 0.8e-3; lines = np.maximum(lines, ovl)
# пояса: край и заклёпки; рамка
_d = np.hypot((((np.abs(th) * 57.0) % 13.0) - 6.5) * S, np.minimum(np.abs(px - 267.0), np.abs(px - 565.0)) * S); st_r = strap & (_d < 0.0042); h += dome(_d, 0.0042, 0.5e-3) * strap; dots = np.maximum(dots, st_r)
# рули: кромка уже есть; заклёпки у корня
_rr = np.interp(px, [871.0, 905.0, 950.0, 982.0], [29.9, 22.2, 17.4, 16.4]) + 3.2; _d = np.hypot((((px - 880.0) % 16.0) - 8.0) * S, (radp - _rr) * S); fin_r = finz & (_d < 0.0042); h += dome(_d, 0.0042, 0.5e-3) * finz; dots = np.maximum(dots, fin_r)
COL_L = mix(COL_L, COL_L * 0.52, np.clip(lines, 0, 1) * 0.95); COL_L = mix(COL_L, COL_L * 0.66, np.clip(dots, 0, 1))
# в картинку
Hg = np.zeros((W, W), np.float32); Hg[idx] = h
Pd = P0[1:, :-1] - P0[:-1, :-1]; dm = np.linalg.norm(Pd, axis=2); good = inside[1:, :-1] & inside[:-1, :-1]; mpt = float(np.median(dm[good & (dm > 0)])); print('размер текселя', round(mpt * 1000, 2), 'мм')
Dx = np.zeros((W, W), np.float32); Dy = np.zeros((W, W), np.float32); Dx[:, 1:-1] = (Hg[:, 2:] - Hg[:, :-2]) * 0.5; Dy[1:-1, :] = (Hg[2:, :] - Hg[:-2, :]) * 0.5
okx = np.zeros((W, W), bool); okx[:, 1:-1] = inside[:, 2:] & inside[:, :-2]; oky = np.zeros((W, W), bool); oky[1:-1, :] = inside[2:, :] & inside[:-2, :]; Dx = np.where(okx, Dx, 0) / mpt; Dy = np.where(oky, Dy, 0) / mpt
STR = 1.5; Nt = NT0 * 2 - 1; Nt[..., 0] += -Dx * STR; Nt[..., 1] += Dy * STR
Nt /= np.maximum(np.linalg.norm(Nt, axis=2, keepdims=True), 1e-6); Nt = np.where(inside[..., None], Nt, np.array((0, 0, 1), np.float32))
out_c = np.zeros((W, W, 3), np.float32); out_c[idx] = COL_L; fill = COL_L[olive].mean(axis=0); out_c = np.where(inside[..., None], out_c, fill)
# поля вокруг островов: цвет ближайшего текселя своего острова, иначе на шве читается сосед
ins2 = inside.copy()
for _ in range(16):
    grow = np.zeros((W, W), np.float32); acc_c = np.zeros((W, W, 3), np.float32); acc_n = np.zeros((W, W, 3), np.float32)
    for ax_, sh_ in ((0, 1), (0, -1), (1, 1), (1, -1)):
        m_ = np.roll(ins2, sh_, ax_).astype(np.float32); grow += m_; acc_c += np.roll(out_c, sh_, ax_) * m_[..., None]; acc_n += np.roll(Nt, sh_, ax_) * m_[..., None]
    new = (~ins2) & (grow > 0); out_c[new] = acc_c[new] / grow[new][:, None]; Nt[new] = acc_n[new] / grow[new][:, None]; ins2 |= new
Nt /= np.maximum(np.linalg.norm(Nt, axis=2, keepdims=True), 1e-6)
enc = lambda c: np.clip(c, 0, 1) ** (1 / 2.2)
Image.fromarray((enc(out_c) * 255 + 0.5).astype(np.uint8)).save(os.path.join(TX, 'color.png')); Image.fromarray(((Nt * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8)).save(os.path.join(TX, 'normal.png'))
to_hex = lambda v: '#%02x%02x%02x' % tuple(int(round(min(1, max(0, c)) ** (1 / 2.2) * 255)) for c in v)
print('средний цвет: всё', to_hex(COL_L.mean(axis=0)), 'олива', to_hex(COL_L[olive & ~band].mean(axis=0)), 'поясок', to_hex(COL_L[band].mean(axis=0)), 'хвост', to_hex(COL_L[white].mean(axis=0)), 'накладка', to_hex(COL_L[saddle].mean(axis=0)), 'рули', to_hex(COL_L[finz].mean(axis=0)))
print('paint.py: готово')
