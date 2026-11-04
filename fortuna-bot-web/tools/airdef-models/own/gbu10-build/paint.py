# paint.py - покраска GBU-10 в пространстве текстуры: всё считается по положению в метрах, поэтому на швах развёртки цвет не рвётся. Свои меши и своя краска, с картинок берутся только цвет и расположение.
#   /usr/bin/python3 paint.py A|B      → tex/color_A.png (серая, синий поясок) или tex/color_B.png (тёмная, жёлтый поясок) и tex/normal.png
# Запечено в цвет: AO, грязь, потёртости, сколы, поясок, таблички, свои надписи. В нормалях: стыки, винты, лючки, зерно краски.
import json, math, os, site, sys
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__)); MP = os.path.join(HERE, '_maps'); TX = os.path.join(HERE, 'tex'); os.makedirs(TX, exist_ok=True)
VAR = sys.argv[1] if len(sys.argv) > 1 else 'A'; PJ = json.load(open(os.path.join(MP, 'parts.json'))); ZN = PJ['zones']; Z = {n: i for i, n in enumerate(ZN)}; S = PJ['S']; X0 = PJ['X0']
ld = lambda n: np.load(os.path.join(MP, n + '.npy'))
P0 = ld('pos') * 6 - 3; N0 = ld('nrm') * 2 - 1; ID0 = np.rint(ld('id0')[..., 0] * 32).astype(int) - 1; IDX = np.rint(ld('idx')[..., 0] * 32).astype(int) - 1; AOS0 = ld('aos')[..., 0]; AOL0 = ld('aol')[..., 0]; E0 = ld('edge')[..., 0]; NT0 = ld('nt'); W = P0.shape[0]
valid = IDX >= 0; idx = np.nonzero(valid); p = P0[idx]; n_ = N0[idx]; zid = IDX[idx]; aos = np.clip(AOS0[idx], 0, 1); aol = np.clip(AOL0[idx], 0, 1); edge = E0[idx]; N = len(p); print('текселей', N, 'заполнение', round(float((ID0 >= 0).mean()), 3))
n_ = n_ / np.maximum(np.linalg.norm(n_, axis=1, keepdims=True), 1e-6); x, y, z = p[:, 0], p[:, 1], p[:, 2]; nx, ny, nz = n_[:, 0], n_[:, 1], n_[:, 2]
px = X0 - y / S; rad = np.hypot(x, z); th = np.arctan2(x, z)                  # px - положение вдоль оси в пикселях референс_1; th - угол от верха к +X
rng = np.random.default_rng(10); VOL = rng.random((128, 128, 128), dtype=np.float32)
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
for ph_ in np.radians(PJ['phi']):
    dx_, dz_ = math.cos(ph_), math.sin(ph_); ax_, az2 = -math.sin(ph_), math.cos(ph_); rr_ = x * dx_ + z * dz_ - PJ['hinge_r'] * S; ry_ = y - (X0 - PJ['hinge_x']) * S; hit = isz('stub') & (np.abs(ry_) < 0.058) & (rr_ > -0.05) & (rr_ < 0.14) & (np.abs(x * ax_ + z * az2) < 0.007) & ((x * dx_ + z * dz_) > 0)
    aos = np.where(hit, np.maximum(aos, 0.92), aos); aol = np.where(hit, np.maximum(aol, 0.80), aol)
crev = np.clip(1 - aos, 0, 1); occ = np.clip(1 - aol, 0, 1); convex = edge * sm(aos, 0.45, 0.8)
paintz = isz('paint', 'canard', 'stub', 'blade')
# ═══ основа по частям: цвета сняты с картинки, блок и нос светлее, пластины хвоста темнее ═══
K = float(os.environ.get('G10_GAIN', '1.0'))
if VAR == 'A':
    C_BODY, C_FORE, C_CCG, C_TAIL, C_STUB, C_CAN, BAND, BAND_E = (178, 168, 165), (196, 188, 188), (198, 190, 193), (216, 206, 210), (188, 178, 174), (190, 182, 180), (82, 130, 206), (186, 170, 128)
else:
    C_BODY, C_FORE, C_CCG, C_TAIL, C_STUB, C_CAN, BAND, BAND_E = (116, 116, 102), (120, 120, 106), (112, 112, 102), (108, 108, 98), (100, 100, 90), (114, 114, 104), (214, 172, 40), (116, 116, 102)
col = full(C_BODY).copy()
col = np.where((px < 290)[:, None], full(C_FORE), col)
ccg = (px < 212.5) & isz('paint'); col = np.where(ccg[:, None], full(C_CCG), col)
tailz = (px > 575) & isz('paint'); col = np.where(tailz[:, None], full(C_TAIL), col)
col = np.where(isz('stub', 'blade')[:, None], full(C_STUB), col); col = np.where(isz('canard')[:, None], full(C_CAN), col)
if VAR == 'A':                                                                 # блок и хвост чуть другого тона: крашены отдельно от корпуса
    col = col * np.where(isz('blade'), 1.08, 1.0)[:, None]
col = col * (0.93 + 0.10 * bl1)[:, None] * (0.96 + 0.06 * bl2)[:, None] * (0.975 + 0.04 * fbm((70, 18, 70), 3, 6))[:, None]
# поясок на корпусе: x 290…299, по краям тонкая светлая кайма
body = isz('paint') & (px >= 213) & (px <= 576)
band = body & (px >= 290) & (px <= 299); bande = body & (((px >= 288.9) & (px < 290)) | ((px > 299) & (px <= 300.1)))
bc = full(BAND) * (0.86 + 0.20 * bl3)[:, None]; col = np.where(band[:, None], bc, col); col = np.where(bande[:, None], full(BAND_E), col)
# ═══ свои надписи и таблички: белый трафарет по бортам корпуса (как на картинке слева направо, нос слева) ═══
FONT = '/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf'
if not os.path.exists(FONT): FONT = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'


def stencil(lines, h_m, pad=0.2):
    """Маска строк: масштаб 2400 пикс/м; возвращает массив и ширину с высотой в метрах."""
    k = 2400; fs = int(h_m * k); ft = ImageFont.truetype(FONT, fs); ws = [ft.getlength(s) for s in lines]; Wp = int(max(ws) + fs); Hp = int(len(lines) * fs * 1.28 + fs * 0.4); im = Image.new('L', (Wp, Hp), 0); d = ImageDraw.Draw(im)
    for i, s in enumerate(lines): d.text((fs * 0.5, fs * 0.2 + i * fs * 1.28), s, fill=255, font=ft)
    return np.asarray(im, np.float32) / 255, Wp / k, Hp / k


def project(mask, wm, hm, uu, vv):
    """uu, vv - метры от центра таблички (вправо, вверх)."""
    ix = ((uu / wm + 0.5) * mask.shape[1]).astype(np.int32); iy = ((0.5 - vv / hm) * mask.shape[0]).astype(np.int32); ok = (ix >= 0) & (ix < mask.shape[1]) & (iy >= 0) & (iy < mask.shape[0]); out = np.zeros(N, np.float32); out[ok] = mask[iy[ok], ix[ok]]; return out


TXT = [(['BOMB GP 2000 LB', 'MK 84 MOD 1'], 408.0, 16.5), (['GBU-10 PAVEWAY', 'LOT 0417 - 7'], 452.0, 7.0)]
st_all = np.zeros(N, np.float32)
for lines, xc, zc in TXT:
    mk_, wm, hm = stencil(lines, 0.021); yc = (X0 - xc) * S; zm = zc * S
    for sg in (-1, 1):                                                         # на борту −X нос слева, на +X справа
        m_ = project(mk_, wm, hm, (y - yc) * sg, z - zm) * ((x * sg) > 0.05) * body; st_all = np.maximum(st_all, m_)
col = mix(col, full((236, 234, 226)), st_all * (0.93 - 0.35 * sm(bl3, 0.45, 0.75)))
PLQ = srgb((226, 192, 44)); PLD = srgb((46, 60, 100))


def plaque(mask_y, mask_dark=None):
    global col
    col = np.where(mask_y[:, None], PLQ * (0.86 + 0.18 * bl3)[:, None], col)
    if mask_dark is not None: col = np.where(mask_dark[:, None], PLD, col)


zs = z / S; xs = x / S; radp = rad / S; side = np.abs(nx) > 0.55
plaque(ccg & side & (px > 194) & (px < 207) & (zs > 3.5) & (zs < 8.0), ccg & side & (px > 194) & (px < 207) & (((zs > 8.0) & (zs < 8.8)) | ((zs > 2.6) & (zs < 3.2))))
can = isz('canard'); plaque(can & (px > 156) & (px < 176) & (radp > 38) & (radp < 45), can & (px > 156) & (px < 176) & (((radp > 45) & (radp < 45.8)) | ((radp > 37.2) & (radp < 38))))
stb = isz('stub'); plaque(stb & (px > 660) & (px < 680) & (radp > 27.5) & (radp < 33.5), stb & (px > 660) & (px < 680) & (((radp > 33.5) & (radp < 34.3)) | ((radp > 26.7) & (radp < 27.5))))
# короткая своя надпись под табличкой на рулях и пластинах хвоста, с обеих сторон читается правильно
_m, _wm, _hm = stencil(['NO HANDLING'], 0.0135)
for zone_, xc_, rc_ in ((can, 166.0, 33.5), (stb, 670.0, 24.0)):
    for ph_ in np.radians(PJ['phi']):
        dx_, dz_ = math.cos(ph_), math.sin(ph_); ax_, az2 = -math.sin(ph_), math.cos(ph_); sg_ = np.sign(nx * ax_ + nz * az2); lm = zone_ & (np.abs(x * ax_ + z * az2) < 0.02) & ((x * dx_ + z * dz_) > 0)
        up_ = 1.0 if dz_ > 0 else -1.0; tm_ = project(_m, _wm, _hm, (y - (X0 - xc_) * S) * (-sg_) * up_, ((x * dx_ + z * dz_) - rc_ * S) * up_) * lm; col = mix(col, full((40, 40, 40)), tm_ * 0.9)
# ═══ царапины, потёртости, сколы ═══
sc1 = np.abs(fbm((320, 36, 44), 2, 8) - 0.5); sc2 = np.abs(fbm((36, 290, 58), 2, 9) - 0.5); sc = np.maximum(1 - sm(sc1, 0.0, 0.008), 1 - sm(sc2, 0.0, 0.008)) * sm(bl2, 0.40, 0.72) * sm(bl1, 0.25, 0.6); light = np.array((1.26, 1.25, 1.22), np.float32) if VAR == 'A' else np.array((1.55, 1.55, 1.50), np.float32)
col = mix(col, col * light, sc * 0.75 * paintz)
rub = sm(convex * 9.0, 0.12, 0.45) * sm(bl3, 0.30, 0.62) * paintz; col = mix(col, col * light, rub * 0.8)
chips_n = bl3 * 0.6 + bl4 * 0.4
edge_ch = sm(convex * 9.0, 0.30, 0.58) * sm(chips_n, 0.46, 0.56); flat_gate = sm(bl1 * 0.5 + bl2 * 0.5, 0.45, 0.70); fch_n = chips_n + flat_gate * 0.16; flat_ch = sm(fch_n, thr(fch_n, 0.0040), thr(fch_n, 0.0022)); chip = np.clip(np.maximum(edge_ch, flat_ch), 0, 1) * paintz * (~band) * (~((np.hypot(x, y - (X0 - 420.0) * S) < 0.042) & (z > PJ['rb'] - 0.003)))
metal = mix(full((166, 166, 162)), full((122, 120, 116)), bl4); col = mix(col, full((128, 124, 118)) if VAR == 'A' else full((88, 86, 78)), sm(chip, 0.12, 0.42)); col = mix(col, metal, sm(chip, 0.42, 0.72))
# ═══ остальные зоны ═══
az = np.arctan2(ny, nx); env = (0.62 + 0.62 * sm(nz, -0.45, 0.9)) * (0.82 + 0.36 * (0.5 + 0.5 * np.sin(3.0 * az + 0.7)))                 # отражение нарисовано: игра его не посчитает
ste = full((244, 240, 250) if VAR == 'A' else (196, 194, 198)) * (0.97 + 0.05 * bl3)[:, None] * (0.72 + 0.46 * sm(nz, -0.6, 0.9))[:, None]; ste = np.where((px > 560)[:, None], ste * 0.72, ste); 
col = np.where(isz('steel')[:, None], ste, col)
if VAR == 'B': rg0 = full((116, 116, 104))
else: rg0 = full((180, 176, 184))
rg = rg0 * (0.88 + 0.2 * bl3)[:, None] * (0.80 + 0.32 * sm(nz, -0.5, 0.8))[:, None]; rg = mix(rg, rg * light, sm(convex * 9, 0.1, 0.4) * 0.7); col = np.where(isz('ring')[:, None], rg, col)
dk = full((36, 36, 36)) * (0.8 + 0.34 * bl3)[:, None] * (0.8 + 0.4 * sm(nz, -0.2, 0.9))[:, None]; col = np.where(isz('dark')[:, None], dk, col)
blt = full((122, 122, 118)) * (0.75 + 0.35 * bl4)[:, None] * (0.75 + 0.42 * sm(nz, -0.2, 0.9))[:, None]; col = np.where(isz('bolt')[:, None], blt, col)
lg = full((132, 130, 124)) * (0.75 + 0.32 * bl4)[:, None] * (0.72 + 0.46 * sm(nz, -0.2, 0.9))[:, None]; lg = mix(lg, full((96, 78, 62)), sm(bl3 * 0.6 + crev * 0.3, 0.66, 0.88) * 0.4); col = np.where(isz('lug')[:, None], lg, col)
cu = full((172, 108, 66)) * (0.70 + 0.42 * bl3)[:, None] * (0.72 + 0.46 * sm(nz, -0.3, 0.9))[:, None]; cu = mix(cu, full((132, 92, 58)), sm(bl4, 0.45, 0.75) * 0.5); col = np.where(isz('copper')[:, None], cu, col)
gl_h = sm(nz * 0.5 + (ny * 0.5), 0.15, 0.8); gl = mix(full((196, 138, 34)), full((255, 240, 176)), gl_h); col = np.where(isz('glass')[:, None], gl, col)
# донный срез хвоста темнее: полость
rear = isz('paint') & (px > 687.5) & ((px > 691.3) | (rad / S < 13.0)); col = np.where(rear[:, None], full((26, 26, 26)), col)
# ═══ контур сложенной створки на пластине: тонкая линия и более чистая краска под ней ═══
phi = np.radians(PJ['phi']); HX = PJ['hinge_x']; HR = PJ['hinge_r'] * S; FOLD = PJ['fold']; WL = PJ['wing_l']
prints = np.zeros(N, np.float32); under = np.zeros(N, np.float32)
for ph in phi:
    dx, dz = math.cos(ph), math.sin(ph); ax, az_ = -math.sin(ph), math.cos(ph); r_ = x * dx + z * dz; on = (x * ax + z * az_) > 0.0015; ry = y - (X0 - HX) * S; rr = r_ - HR; s_ = -ry * math.cos(FOLD) + rr * math.sin(FOLD); c_ = rr * math.cos(FOLD) + ry * math.sin(FOLD); f = stb & on & (np.abs(x * ax + z * az_) < 0.007)
    hw = 0.0425 - (0.0075 * np.clip(s_ / WL, 0, 1)); dd = np.maximum(np.maximum(-0.034 - s_, s_ - WL), np.abs(c_) - hw); prints = np.where(f, np.maximum(prints, 1 - sm(np.abs(dd), 0.0012, 0.0045)), prints); under = np.where(f & (dd < 0), 1.0, under)
col = mix(col, col * 1.06, under); col = mix(col, full((60, 56, 50)), prints * 0.75)
# ═══ грязь и потёки: неровно, темнее сверху и снизу у бочки, как на картинке ═══
print('грязь'); grime = full((52, 46, 38)); dust = full((150, 144, 130))
strk = sm(fbm((3.2, 44, 44), 3, 12), 0.50, 0.82) * (0.3 + 0.7 * sm(bl1, 0.2, 0.7)); col = mix(col, col * np.array((0.76, 0.73, 0.67), np.float32), strk * 0.30 * paintz * (~band))
belly = sm(np.abs(th), 2.3, 3.14) * body; top_ = (1 - sm(np.abs(th), 0.2, 0.75)) * body; mott = sm(bl2 * 0.6 + bl3 * 0.4, 0.28, 0.72); col = mix(col, col * np.array((0.60, 0.58, 0.54), np.float32), (belly * 0.50 + top_ * 0.18) * mott)
col = mix(col, dust, sm(nz, 0.5, 0.95) * (0.2 + 0.8 * sm(bl3, 0.3, 0.7)) * 0.10 * paintz)
col = mix(col, grime, np.clip(sm(crev, 0.25, 0.80) * 0.55 + sm(occ, 0.50, 0.88) * 0.10, 0, 0.70))
# ═══ запечённый свет: неярко, в игре свет ещё будет ═══
shade = (0.66 + 0.34 * aol ** 1.1) * (0.46 + 0.54 * aos ** 1.05) * (0.94 + 0.09 * sm(nz, -1, 1)); COL_L = col * shade[:, None] * K
# ═══ рельеф ═══
print('рельеф'); h = np.zeros(N, np.float32); h += (fine - 0.5) * 0.05e-3 + (bl4 - 0.5) * 0.06e-3
h -= sm(chip, 0.3, 0.6) * 0.40e-3; h -= sc * 0.16e-3 * paintz; h += bande * 0.10e-3
groove = lambda d, w, dep: -dep * (1 - sm(np.abs(d), w * 0.5, w))
for xc in (105.6, 212.0):
    h += groove(px - xc, 0.5, 0.9e-3) * isz('paint')
h += groove(px - 575.8, 0.5, 0.9e-3) * isz('paint') + groove(px - 614.3, 0.5, 0.9e-3) * isz('paint', 'stub')
dome = lambda dist, r_, hh: hh * (1 - sm(dist, r_ * 0.55, r_))
def bolts(xc, n, zone_mask, offs=0.0, r_=0.0062, hh=0.7e-3):
    global h, col_dots
    tt = (th + offs) % (2 * np.pi / n); tt = np.minimum(tt, 2 * np.pi / n - tt); dist = np.hypot((px - xc) * S, tt * rad); m_ = dome(dist, r_, hh) * zone_mask; h += m_; col_dots = np.maximum(col_dots, (dist < r_ * 1.15) * zone_mask)
col_dots = np.zeros(N, np.float32)
pa = isz('paint'); bolts(107.8, 8, pa, 0.39); bolts(208.8, 8, pa, 0.39); bolts(577.6, 8, pa, 0.39); bolts(611.8, 8, pa, 0.39); bolts(684.0, 8, pa, 0.39, 0.005)
bolts(218.5, 12, pa, 0.13, 0.005)
dside = (np.abs(x) > 0.0) & pa
# щели и лючки на блоке и хвосте: рамка на боковой стороне
def frame(xa, xb, za, zb, w=0.40, dep=1.0e-3, mask=None):
    global h, lines
    m = (mask if mask is not None else pa) & (np.abs(nx) > 0.35); zz = z / S; inside = (px > xa - w) & (px < xb + w) & (zz > za - w) & (zz < zb + w); dd = np.minimum.reduce([np.abs(px - xa), np.abs(px - xb), np.abs(zz - za), np.abs(zz - zb)]); line = inside & (dd < w) & m; h -= line * dep; lines = np.maximum(lines, line)
lines = np.zeros(N, np.float32)
frame(617, 652, -11.5, 11.5); frame(107.2, 109.0, 1.0, 6.0); frame(107.2, 109.0, -12.0, -3.0); frame(134.0, 135.8, 1.2, 6.2); frame(196, 208, -9.5, -4.5)
top_panel = pa & (px > 395) & (px < 446); th0 = -0.50; tw = 0.26; tu = (th - th0) * rad / S; dd = np.minimum.reduce([np.abs(px - 395.5), np.abs(px - 445.5), np.abs(tu - tw * 30), np.abs(tu + tw * 30)]); pl = top_panel & (np.abs(tu) < tw * 30 + 0.4) & (dd < 0.34); h -= pl * 0.9e-3; lines = np.maximum(lines, pl * 0.7)
for ax_, au in ((397.6, -1), (443.4, -1), (397.6, 1), (443.4, 1)):
    dist = np.hypot((px - ax_) * S, (tu - au * (tw * 30 - 2.1)) * S); h += dome(dist, 0.006, 0.7e-3) * pa; col_dots = np.maximum(col_dots, (dist < 0.0068) * pa)
# пластины хвоста: рамка спереди, ребро сзади, заклёпки по кромке
fr = stb & (px > 579) & (px < 611) & (radp > 31) & (radp < 51); dd = np.minimum.reduce([np.abs(px - 579), np.abs(px - 611), np.abs(radp - 31), np.abs(radp - 51)]); fl_ = fr & (dd < 0.42); h -= fl_ * 0.9e-3; lines = np.maximum(lines, fl_)
ribd = np.hypot((px - 654) / 34.0, (radp - 46.0) / 2.2); h += stb * (1 - sm(ribd, 0.72, 1.0)) * 1.3e-3; col = mix(col, col * 0.86, (stb & (ribd > 0.85) & (ribd < 1.08)).astype(np.float32) * 0.0)
for xs_ in np.arange(582, 690, 12.0):
    dist = np.hypot((px - xs_) * S, (radp - 53.2) * S); h += stb * dome(dist, 0.0048, 0.6e-3); col_dots = np.maximum(col_dots, (dist < 0.0054) * stb)
h -= stb * (1 - sm(np.abs(px - 614.3), 0.35, 0.7)) * 0.9e-3; lines = np.maximum(lines, stb & (np.abs(px - 614.3) < 0.42))
# створка: ребро вдоль и заострённые кромки уже есть; рули: заклёпки у корня
blade = isz('blade'); can_rows = can & (radp > 18.5) & (radp < 20.0) & (np.abs(((px - 125) % 10) - 5) < 0.75); h += can_rows * 0.5e-3; col_dots = np.maximum(col_dots, can_rows)
# тёмные линии в цвет: без них стыки не видно при игровом масштабе
COL_L = mix(COL_L, COL_L * 0.58, np.clip(lines, 0, 1) * 0.95); COL_L = mix(COL_L, COL_L * 0.70, np.clip(col_dots, 0, 1)); seam_vis = isz('paint', 'stub') & ((np.abs(px - 105.6) < 0.45) | (np.abs(px - 575.8) < 0.45) | (np.abs(px - 614.3) < 0.5)); COL_L = mix(COL_L, COL_L * 0.42, seam_vis.astype(np.float32))
# в картинку
Hg = np.zeros((W, W), np.float32); Hg[idx] = h; inside = ID0 >= 0
Pd = P0[1:, :-1] - P0[:-1, :-1]; dm = np.linalg.norm(Pd, axis=2); good = inside[1:, :-1] & inside[:-1, :-1] & (ID0[1:, :-1] == ID0[:-1, :-1]); mpt = float(np.median(dm[good & (dm > 0)])); print('размер текселя', round(mpt * 1000, 2), 'мм')
Dx = np.zeros((W, W), np.float32); Dy = np.zeros((W, W), np.float32); Dx[:, 1:-1] = (Hg[:, 2:] - Hg[:, :-2]) * 0.5; Dy[1:-1, :] = (Hg[2:, :] - Hg[:-2, :]) * 0.5
okx = np.zeros((W, W), bool); okx[:, 1:-1] = inside[:, 2:] & inside[:, :-2]; oky = np.zeros((W, W), bool); oky[1:-1, :] = inside[2:, :] & inside[:-2, :]; Dx = np.where(okx, Dx, 0) / mpt; Dy = np.where(oky, Dy, 0) / mpt
STR = 1.5; Nt = NT0 * 2 - 1; Nt[..., 0] += -Dx * STR; Nt[..., 1] += Dy * STR                  # строка картинки идёт сверху вниз, V - снизу вверх, поэтому знак по Y другой
Nt /= np.maximum(np.linalg.norm(Nt, axis=2, keepdims=True), 1e-6); Nt = np.where(valid[..., None], Nt, np.array((0, 0, 1), np.float32)); Nt[idx[0][rear], idx[1][rear]] = (0, 0, 1)   # донная полость: без бликов на шве
out_c = np.zeros((W, W, 3), np.float32); out_c[idx] = COL_L; fill = COL_L[isz('paint')].mean(axis=0); out_c = np.where(valid[..., None], out_c, fill)
# поля вокруг островов: цвет ближайшего текселя своего острова, иначе на шве читается сосед
inside2 = inside.copy()
for _ in range(16):
    grow = np.zeros((W, W), np.float32); acc_c = np.zeros((W, W, 3), np.float32); acc_n = np.zeros((W, W, 3), np.float32)
    for ax_, sh_ in ((0, 1), (0, -1), (1, 1), (1, -1)):
        m_ = np.roll(inside2, sh_, ax_).astype(np.float32); grow += m_; acc_c += np.roll(out_c, sh_, ax_) * m_[..., None]; acc_n += np.roll(Nt, sh_, ax_) * m_[..., None]
    new = (~inside2) & (grow > 0); out_c[new] = acc_c[new] / grow[new][:, None]; Nt[new] = acc_n[new] / grow[new][:, None]; inside2 |= new
Nt /= np.maximum(np.linalg.norm(Nt, axis=2, keepdims=True), 1e-6)
enc = lambda c: np.clip(c, 0, 1) ** (1 / 2.2)
Image.fromarray((enc(out_c) * 255 + 0.5).astype(np.uint8)).save(os.path.join(TX, f'color_{VAR}.png'))
Image.fromarray(((Nt * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8)).save(os.path.join(TX, 'normal.png'))
to_hex = lambda v: '#%02x%02x%02x' % tuple(int(round(min(1, max(0, c)) ** (1 / 2.2) * 255)) for c in v)
print('средний цвет: всё', to_hex(COL_L.mean(axis=0)), 'корпус', to_hex(COL_L[body & (~band)].mean(axis=0)), 'поясок', to_hex(COL_L[band].mean(axis=0)), 'блок', to_hex(COL_L[ccg].mean(axis=0)), 'пластины', to_hex(COL_L[stb].mean(axis=0)))
print('paint.py: готово', VAR)
