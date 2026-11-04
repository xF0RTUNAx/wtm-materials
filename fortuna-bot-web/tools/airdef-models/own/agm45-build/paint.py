# paint.py - покраска AGM-45 в пространстве текстуры: всё считается по положению в метрах, поэтому на швах развёртки цвет не рвётся. Свои меши и своя краска, с картинок берутся только цвет и расположение.
#   /usr/bin/python3 paint.py     → tex/color.png, tex/normal.png
# Запечено в цвет: AO, потёртости, пояски, окно, свои надписи и табличка, стыки и винты. В нормалях: стыки, винты, рамка окна, зерно краски.
import json, math, os, site, sys
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__)); MP = os.path.join(HERE, '_maps'); TX = os.path.join(HERE, 'tex'); os.makedirs(TX, exist_ok=True)
PJ = json.load(open(os.path.join(MP, 'parts.json'))); ZN = PJ['zones']; Z = {n: i for i, n in enumerate(ZN)}; S = PJ['S']; X0 = PJ['X0']; RB = PJ['rb']
ld = lambda n: np.load(os.path.join(MP, n + '.npy'))
P0 = ld('pos') * 6 - 3; N0 = ld('nrm') * 2 - 1; ID0 = np.rint(ld('id0')[..., 0] * 32).astype(int) - 1; AOS0 = ld('aos')[..., 0]; AOL0 = ld('aol')[..., 0]; E0 = ld('edge')[..., 0]; NT0 = ld('nt'); W = P0.shape[0]
inside = ID0 >= 0; idx = np.nonzero(inside); p = P0[idx]; n_ = N0[idx]; zid = ID0[idx]; aos = np.clip(AOS0[idx], 0, 1); aol = np.clip(AOL0[idx], 0, 1); edge = E0[idx]; N = len(p); print('текселей', N, 'заполнение', round(float(inside.mean()), 3))
n_ = n_ / np.maximum(np.linalg.norm(n_, axis=1, keepdims=True), 1e-6); x, y, z = p[:, 0], p[:, 1], p[:, 2]; nx, ny, nz = n_[:, 0], n_[:, 1], n_[:, 2]
px = X0 - y / S; rad = np.hypot(x, z); th = np.arctan2(x, z)
rng = np.random.default_rng(45); VOL = rng.random((128, 128, 128), dtype=np.float32)
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
print('шумы'); bl1 = fbm(1.6, 3, 1); bl2 = fbm(6.0, 4, 2); bl3 = fbm(26, 4, 3); bl4 = fbm(76, 3, 4); fine = fbm(210, 2, 5)
crev = np.clip(1 - aos, 0, 1); occ = np.clip(1 - aol, 0, 1); convex = edge * sm(aos, 0.45, 0.8)
white, dark, window, ring, wingz, finz, metal, railz = isz('white'), isz('dark'), isz('window'), isz('ring'), isz('wing'), isz('fin'), isz('metal'), isz('rail')
painted = white | wingz | finz | railz; body = white & (rad > 0.0) & (np.abs(rad - np.interp(px, [0, 5, 15, 30, 50, 75, 100, 130, 160, 190, 960, 985, 1000], [0, .012, .025, .042, .06, .076, .087, .095, .099, .1, .1, .097, .0935])) < 0.0035)
# ═══ основа: белый корпус, цвета сняты с фото; крылья и оперение чуть серее ═══
C_WHITE, C_WING, C_FIN, C_RAIL, C_GREEN, C_YEL, C_BROWN = (244, 244, 240), (236, 236, 232), (232, 232, 228), (234, 234, 230), (112, 176, 154), (234, 194, 56), (98, 76, 62)
col = full(C_WHITE).copy(); col = np.where(wingz[:, None], full(C_WING), col); col = np.where(finz[:, None], full(C_FIN), col); col = np.where(railz[:, None], full(C_RAIL), col)
col = np.where(painted[:, None], col * ((0.965 + 0.05 * bl1) * (0.98 + 0.03 * bl2))[:, None], col)
for x0_, x1_, c_ in ((435.0, 460.0, C_GREEN), (465.0, 490.0, C_YEL), (558.0, 590.0, C_BROWN), (636.0, 672.0, C_BROWN)):
    m_ = body & (px >= x0_) & (px <= x1_); col = np.where(m_[:, None], full(c_) * (0.88 + 0.18 * bl3)[:, None], col)
# ═══ окно на борту +X: металл с рамкой ═══
TH = PJ['th_w']; wa = (th - TH) * RB / S; wx = px - 220.0; rr_ = 5.0; dw = np.hypot(np.maximum(np.abs(wx) - (30.0 - rr_), 0), np.maximum(np.abs(wa) - (0.60 * RB / S - rr_), 0)) - rr_
win_in = window & (dw < -3.2); strk_w = fbm((60, 8, 60), 3, 7); wnv = 0.42 + 0.72 * sm(nz, -0.55, 0.75) + 0.22 * (strk_w - 0.5)
wc = full((134, 118, 104)) * wnv[:, None]; col = np.where(window[:, None], full((196, 196, 192)) * (0.82 + 0.3 * sm(nz, -0.3, 0.8))[:, None], col); col = np.where(win_in[:, None], wc, col)
# ═══ свои надписи ═══
FONT = '/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf'
if not os.path.exists(FONT): FONT = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'


def stencil(lines, h_m):
    k = 2600; fs = int(h_m * k); ft = ImageFont.truetype(FONT, fs); ws = [ft.getlength(s) for s in lines]; Wp = int(max(ws) + fs); Hp = int(len(lines) * fs * 1.28 + fs * 0.4); im = Image.new('L', (Wp, Hp), 0); d = ImageDraw.Draw(im)
    for i, s in enumerate(lines): d.text((fs * 0.5, fs * 0.2 + i * fs * 1.28), s, fill=255, font=ft)
    return np.asarray(im, np.float32) / 255, Wp / k, Hp / k


def project(mask, wm, hm, uu, vv):
    ix = ((uu / wm + 0.5) * mask.shape[1]).astype(np.int32); iy = ((0.5 - vv / hm) * mask.shape[0]).astype(np.int32); ok = (ix >= 0) & (ix < mask.shape[1]) & (iy >= 0) & (iy < mask.shape[0]); out = np.zeros(N, np.float32); out[ok] = mask[iy[ok], ix[ok]]; return out


INK = (34, 34, 36)


def side_text(lines, xc, zm, h_m, ink=INK, sides=(-1, 1), a=0.92, frame=False):
    """Надпись на борту: xc - доля длины, zm - высота над осью (м). На борту -X нос слева, на +X справа."""
    global col
    mk_, wm, hm = stencil(lines, h_m); yc = (X0 - xc) * S; all_ = np.zeros(N, np.float32)
    for sg in sides:
        uu = (y - yc) * sg; vv = z - zm; on = ((x * sg) > 0.02) & body; m_ = project(mk_, wm, hm, uu, vv) * on; all_ = np.maximum(all_, m_)
        if frame:
            fw, fh = wm / 2 + 0.008, hm / 2 + 0.006; ee = np.maximum(np.abs(uu) - fw, np.abs(vv) - fh); all_ = np.maximum(all_, (np.abs(ee) < 0.0016) * on * 1.0)
    col = mix(col, full(ink), all_ * (a - 0.15 * sm(bl3, 0.5, 0.8)))


side_text(['NO PAINT ON RADOME'], 112.0, 0.012, 0.0125)
side_text(['AGM-45 GUIDED MISSILE', 'LOT 1138 - 4'], 350.0, 0.006, 0.0165)
side_text(['HANDLE WITH CARE', 'LIVE ROCKET MOTOR', 'KEEP FROM HEAT'], 755.0, 0.020, 0.0125, frame=True)
side_text(['MOTOR GROUP 7'], 895.0, -0.016, 0.0115)
_m, _wm, _hm = stencil(['AM 4517'], 0.030)
for ph_ in np.radians(PJ['phi']):
    dx_, dz_ = math.cos(ph_), math.sin(ph_); ax_, az2 = -math.sin(ph_), math.cos(ph_); sg_ = np.sign(nx * ax_ + nz * az2); lm = finz & (np.abs(x * ax_ + z * az2) < 0.02) & ((x * dx_ + z * dz_) > 0); up_ = 1.0 if dz_ > 0 else -1.0
    tm_ = project(_m, _wm, _hm, (y - (X0 - 930.0) * S) * (-sg_) * up_, ((x * dx_ + z * dz_) - 0.205) * up_) * lm; col = mix(col, full(INK), tm_ * 0.9)
# ═══ царапины, потёртости, сколы, грязь ═══
sc1 = np.abs(fbm((360, 40, 50), 2, 8) - 0.5); sc2 = np.abs(fbm((40, 320, 60), 2, 9) - 0.5); sc = np.maximum(1 - sm(sc1, 0.0, 0.007), 1 - sm(sc2, 0.0, 0.007)) * sm(bl2, 0.45, 0.75) * sm(bl1, 0.3, 0.65)
col = mix(col, col * np.array((0.80, 0.80, 0.79), np.float32), sc * 0.45 * painted)
chips_n = bl3 * 0.6 + bl4 * 0.4; edge_ch = sm(convex * 9.0, 0.42, 0.70) * sm(chips_n, 0.60, 0.70); flat_gate = sm(bl1 * 0.5 + bl2 * 0.5, 0.50, 0.75); fch = chips_n + flat_gate * 0.16; flat_ch = sm(fch, thr(fch, 0.0007), thr(fch, 0.0003)); chip = np.clip(np.maximum(edge_ch, flat_ch), 0, 1) * painted
col = mix(col, full((214, 214, 210)), sm(chip, 0.2, 0.55)); col = mix(col, full((168, 168, 164)), sm(chip, 0.55, 0.8))
rl_ = full((164, 166, 164))
mt = full((164, 166, 164)) * (0.80 + 0.28 * bl4)[:, None] * (0.70 + 0.48 * sm(nz, -0.3, 0.9))[:, None]; col = np.where(metal[:, None], mt, col)
# сопло: кольцо среза металлическое с латунной кромкой, камера тёмная, в глубине сажа
ringc = full((158, 158, 154)) * (0.72 + 0.4 * sm(nz, -0.4, 0.8))[:, None]; lip = ring & (rad > 0.0825); ringc = np.where(lip[:, None], full((176, 154, 88)) * (0.82 + 0.25 * bl3)[:, None], ringc); deep = ring & ~lip; depth = sm(px, 998.0, 962.0); dc = mix(full((132, 130, 124)), full((16, 15, 14)), depth ** 0.7) * (0.88 + 0.2 * bl3)[:, None]; ringc = np.where(deep[:, None], dc, ringc); col = np.where(ring[:, None], ringc, col)
grime = full((76, 72, 64)); lsoil = sm(fbm((3.0, 38, 38), 3, 12), 0.56, 0.88) * painted; col = mix(col, col * np.array((0.90, 0.89, 0.87), np.float32), lsoil * 0.28)
belly = sm(np.abs(th), 2.4, 3.14) * painted; col = mix(col, col * np.array((0.86, 0.85, 0.83), np.float32), belly * 0.35 * (0.4 + 0.6 * sm(bl2, 0.3, 0.7)))
col = mix(col, grime, np.clip(sm(crev, 0.28, 0.82) * 0.48 + sm(occ, 0.55, 0.9) * 0.06, 0, 0.62))
shade = (0.74 + 0.26 * aol ** 1.1) * (0.50 + 0.50 * aos ** 1.05) * (0.95 + 0.07 * sm(nz, -1, 1)); COL_L = col * shade[:, None]
# ═══ рельеф ═══
print('рельеф'); h = np.zeros(N, np.float32); h += (fine - 0.5) * 0.04e-3 + (bl4 - 0.5) * 0.05e-3; h -= sm(chip, 0.3, 0.6) * 0.30e-3; h -= sc * 0.10e-3 * painted
lines = np.zeros(N, np.float32); dots = np.zeros(N, np.float32); holes = np.zeros(N, np.float32); dome = lambda dist, r_, hh: hh * (1 - sm(dist, r_ * 0.55, r_))


def seam(xc, w=0.45, dep=0.7e-3):
    global h, lines
    m = (np.abs(px - xc) < w) & body; h -= m * dep; lines = np.maximum(lines, m)


def bolts(xc, n, r_=0.0032, hh=0.5e-3, offs=0.0, dark_hole=False):
    global h, dots, holes
    tt = (th + offs) % (2 * np.pi / n); tt = np.minimum(tt, 2 * np.pi / n - tt); dist = np.hypot((px - xc) * S, tt * rad); h += dome(dist, r_, hh) * body * (-1.0 if dark_hole else 1.0); (holes if dark_hole else dots)[:] = np.maximum(holes if dark_hole else dots, (dist < r_ * 1.12) * body)


for xc in (67.0, 145.0, 264.0, 492.0, 612.0, 862.0): seam(xc)
bolts(72.0, 6); bolts(140.0, 8, offs=0.2); bolts(150.0, 8, offs=0.2); bolts(258.0, 8); bolts(270.0, 8); bolts(496.5, 10, 0.0042, 0.6e-3, 0.15, True); bolts(520.0, 12, 0.0030); bolts(552.0, 12, 0.0030, offs=0.1); bolts(606.0, 10, 0.0034); bolts(856.0, 8, 0.0040, offs=0.39); bolts(867.0, 8, 0.0040, offs=0.39)
# контур лючка на борту -X, как на рендере; круглые крышки у крыльев
dh2 = np.hypot(np.maximum(np.abs(px - 220.0) - 25.0, 0), np.maximum(np.abs((th + TH) * RB / S) - 14.7, 0)) - 5.0; ln_ = body & (x < 0) & (np.abs(dh2) < 0.5); h -= ln_ * 0.6e-3; lines = np.maximum(lines, ln_)
for sg in (-1, 1):
    dist = np.hypot((px - 512.0) * S, (th - sg * 1.57) * rad); ln2 = body & (np.abs(dist - 0.022) < 0.0016) & ((x * sg) > 0); h -= ln2 * 0.5e-3; lines = np.maximum(lines, ln2)
# рамка окна: ступенька
h += window * (1 - sm(dw, -3.2, -2.6)) * 0.0; h -= win_in * 0.6e-3; fw_ = window & (np.abs(dw + 3.2) < 0.5); lines = np.maximum(lines, fw_); fs_ = window & (dw > -3.0) & (np.abs(((np.abs(wx) * (np.abs(wa) > 12)) % 12.0) - 6.0) < 0.9) & (np.abs(dw + 1.5) < 0.9); h += fs_ * 0.4e-3; dots = np.maximum(dots, fs_)
# обтекатель и рельс: линия контура
fl_ = railz & (convex * 9 > 0.5); lines = np.maximum(lines, fl_ * 0.4)
COL_L = mix(COL_L, COL_L * 0.62, np.clip(lines, 0, 1) * 0.95); COL_L = mix(COL_L, COL_L * 0.72, np.clip(dots, 0, 1)); COL_L = mix(COL_L, full((24, 24, 26)), np.clip(holes, 0, 1))
# в картинку
Hg = np.zeros((W, W), np.float32); Hg[idx] = h
Pd = P0[1:, :-1] - P0[:-1, :-1]; dm = np.linalg.norm(Pd, axis=2); good = inside[1:, :-1] & inside[:-1, :-1]; mpt = float(np.median(dm[good & (dm > 0)])); print('размер текселя', round(mpt * 1000, 2), 'мм')
Dx = np.zeros((W, W), np.float32); Dy = np.zeros((W, W), np.float32); Dx[:, 1:-1] = (Hg[:, 2:] - Hg[:, :-2]) * 0.5; Dy[1:-1, :] = (Hg[2:, :] - Hg[:-2, :]) * 0.5
okx = np.zeros((W, W), bool); okx[:, 1:-1] = inside[:, 2:] & inside[:, :-2]; oky = np.zeros((W, W), bool); oky[1:-1, :] = inside[2:, :] & inside[:-2, :]; Dx = np.where(okx, Dx, 0) / mpt; Dy = np.where(oky, Dy, 0) / mpt
STR = 1.5; Nt = NT0 * 2 - 1; Nt[..., 0] += -Dx * STR; Nt[..., 1] += Dy * STR
Nt /= np.maximum(np.linalg.norm(Nt, axis=2, keepdims=True), 1e-6); Nt = np.where(inside[..., None], Nt, np.array((0, 0, 1), np.float32))
out_c = np.zeros((W, W, 3), np.float32); out_c[idx] = COL_L; fill = COL_L[white].mean(axis=0); out_c = np.where(inside[..., None], out_c, fill)
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
print('средний цвет: всё', to_hex(COL_L.mean(axis=0)), 'корпус', to_hex(COL_L[body].mean(axis=0)), 'крылья', to_hex(COL_L[wingz].mean(axis=0)), 'окно', to_hex(COL_L[win_in].mean(axis=0)))
print('paint.py: готово')
