# paint.py - покраска AARGM-ER в пространстве текстуры: всё считается по положению в метрах, поэтому на швах развёртки цвет не рвётся. Свои меши и своя краска, с картинок берутся только цвет и расположение.
#   [ARG_SCHEME=grey|white] [ARG_NAME=0|1] [ARG_TEX=tex] /usr/bin/python3 paint.py     → <ARG_TEX>/color.png, normal.png
# Против пластика: тона по секциям, распыление, пыль сверху, грязь снизу, потёки от стыков, царапины, сколы по кромкам, грязь в стыках; в нормалях шагрень, волна листа, заклёпки.
import json, math, os, site, sys
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__)); MP = os.path.join(HERE, '_maps'); TX = os.path.join(HERE, os.environ.get('ARG_TEX', 'tex')); os.makedirs(TX, exist_ok=True)
SCHEME = os.environ.get('ARG_SCHEME', 'grey'); NAME = os.environ.get('ARG_NAME', '1') == '1'; TONE = float(os.environ.get('ARG_BASE', '1.0'))
PJ = json.load(open(os.path.join(MP, 'parts.json'))); ZN = PJ['zones']; Z = {n: i for i, n in enumerate(ZN)}; S = PJ['S']; X0 = PJ['X0']; RB = PJ['rb']
ld = lambda n: np.load(os.path.join(MP, n + '.npy'))
P0 = ld('pos') * 6 - 3; N0 = ld('nrm') * 2 - 1; ID0 = np.rint(ld('id0')[..., 0] * 32).astype(int) - 1; AOS0 = ld('aos')[..., 0]; AOL0 = ld('aol')[..., 0]; E0 = ld('edge')[..., 0]; NT0 = ld('nt'); W = P0.shape[0]
inside = ID0 >= 0; idx = np.nonzero(inside); p = P0[idx]; n_ = N0[idx]; zid = ID0[idx]; aos = np.clip(AOS0[idx], 0, 1); aol = np.clip(AOL0[idx], 0, 1); edge = E0[idx]; N = len(p); print('текселей', N, 'заполнение', round(float(inside.mean()), 3))
n_ = n_ / np.maximum(np.linalg.norm(n_, axis=1, keepdims=True), 1e-6); x, y, z = p[:, 0], p[:, 1], p[:, 2]; nx, ny, nz = n_[:, 0], n_[:, 1], n_[:, 2]
px = X0 - y / S; rad = np.hypot(x, z); th = np.arctan2(x, z)
rng = np.random.default_rng(88); VOL = rng.random((128, 128, 128), dtype=np.float32)
isz = lambda *names: np.isin(zid, [Z[k] for k in names])
srgb = lambda c: (np.array(c, np.float32) / 255.0) ** 2.2
sm = lambda a, e0, e1: (lambda t: t * t * (3 - 2 * t))(np.clip((a - e0) / (e1 - e0), 0, 1))
mix = lambda a, b, t: a + (b - a) * (t[:, None] if np.ndim(t) == 1 else t)
full = lambda c: np.broadcast_to(srgb(c), (N, 3)).astype(np.float32)
tone = lambda c: tuple(min(255, v * TONE) for v in c)


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
print('шумы'); bl1 = fbm(1.3, 3, 1); bl2 = fbm(5.0, 4, 2); bl3 = fbm(24, 4, 3); bl4 = fbm(70, 3, 4); fine = fbm(200, 2, 5)
crev = np.clip(1 - aos, 0, 1); occ = np.clip(1 - aol, 0, 1); convex = edge * sm(aos, 0.45, 0.8)
paintz, finz, patchz, padz, metal, ring = isz('paint'), isz('fin'), isz('patch'), isz('pad'), isz('metal'), isz('ring')
PR = np.array(PJ['prof'], np.float64); Rl = np.interp(px, PR[:, 0], PR[:, 1]) * RB; painted = paintz | finz | padz | patchz; strake = paintz & (rad > Rl + 0.004)
# ═══ основа по секциям ═══
GREY = SCHEME == 'grey'
if GREY:
    C = dict(nose=tone((154, 159, 164)), fwd=tone((148, 154, 160)), mid=tone((150, 155, 160)), motor=tone((144, 150, 156)), tail=tone((136, 141, 146)), fin=tone((146, 151, 158)), rad=(176, 156, 110), patch=(150, 136, 94))
    BANDS = ((285.0, 320.0, (44, 47, 58)), (320.0, 326.0, (160, 164, 168)), (326.0, 361.0, (186, 166, 116)), (361.0, 364.0, (160, 164, 168)), (364.0, 399.0, (48, 51, 62)), (399.0, 411.0, (160, 164, 168)), (411.0, 441.0, (30, 30, 32)), (711.0, 732.0, (172, 174, 176)))
else:
    C = dict(nose=tone((232, 234, 236)), fwd=tone((230, 232, 234)), mid=tone((232, 234, 235)), motor=tone((226, 228, 230)), tail=tone((216, 218, 220)), fin=tone((220, 222, 224)), rad=(190, 164, 112), patch=(168, 152, 108))
    BANDS = ((395.0, 410.0, (226, 184, 44)), (715.0, 728.0, (204, 104, 60)))
col = full(C['fwd']).copy()
for a_, b_, k_ in ((133.0, 324.0, 'nose'), (324.0, 745.0, 'mid'), (745.0, 892.0, 'motor'), (892.0, 1001.0, 'tail')):
    col = np.where((paintz & (px >= a_) & (px < b_))[:, None], full(C[k_]), col)
col = np.where((paintz & (px < 133.0))[:, None], full(C['rad']), col); col = np.where(finz[:, None], full(C['fin']), col); col = np.where(patchz[:, None], full(C['patch']), col); col = np.where(padz[:, None], full(C['mid']) * 0.82, col)
# распыление: мелкое зерно и большие пятна тона; панели чуть отличаются
col = np.where(painted[:, None], col * ((0.955 + 0.07 * bl1) * (0.975 + 0.04 * bl2) * (0.985 + 0.03 * fine))[:, None], col)
for x0_, x1_, c_ in BANDS:
    m_ = paintz * sm(px, x0_ - 0.12, x0_ + 0.12) * (1 - sm(px, x1_ - 0.12, x1_ + 0.12)); col = mix(col, full(c_) * (0.92 + 0.14 * bl3)[:, None], m_)
# тёмная середина площадок узлов
for xc in PJ['lug_x']:
    dpad = np.maximum(np.abs(px - xc) * S - (PJ['pad_l'] * S - 0.011), np.abs(th) * RB - (PJ['pad_th'] * RB - 0.011)); inn = padz & (dpad < 0); col = np.where(inn[:, None], full((70, 72, 76)) * (0.85 + 0.25 * bl3)[:, None], col)
# ═══ свои надписи ═══
FONT = '/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf'
if not os.path.exists(FONT): FONT = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'


def stencil(lines, h_m):
    k = 2600; fs = int(h_m * k); ft = ImageFont.truetype(FONT, fs); ws = [ft.getlength(s) for s in lines]; Wp = int(max(ws) + fs); Hp = int(len(lines) * fs * 1.28 + fs * 0.4); im = Image.new('L', (Wp, Hp), 0); d = ImageDraw.Draw(im)
    for i, s in enumerate(lines): d.text((fs * 0.5, fs * 0.2 + i * fs * 1.28), s, fill=255, font=ft)
    return np.asarray(im, np.float32) / 255, Wp / k, Hp / k


def project(mask, wm, hm, uu, vv):
    ix = ((uu / wm + 0.5) * mask.shape[1]).astype(np.int32); iy = ((0.5 - vv / hm) * mask.shape[0]).astype(np.int32); ok = (ix >= 0) & (ix < mask.shape[1]) & (iy >= 0) & (iy < mask.shape[0]); out = np.zeros(N, np.float32); out[ok] = mask[iy[ok], ix[ok]]; return out


INK = (28, 28, 30) if GREY else (34, 36, 40)


def side_text(lines, xc, zm, h_m, ink=INK, sides=(-1, 1), a=0.9, frame=False):
    global col
    mk_, wm, hm = stencil(lines, h_m); yc = (X0 - xc) * S; all_ = np.zeros(N, np.float32)
    for sg in sides:
        uu = (y - yc) * sg; vv = z - zm; on = ((x * sg) > 0.02) & paintz & ~strake; m_ = project(mk_, wm, hm, uu, vv) * on; all_ = np.maximum(all_, m_)
        if frame:
            fw, fh = wm / 2 + 0.008, hm / 2 + 0.006; ee = np.maximum(np.abs(uu) - fw, np.abs(vv) - fh); all_ = np.maximum(all_, (np.abs(ee) < 0.0016) * on * 1.0)
    col = mix(col, full(ink), all_ * (a - 0.15 * sm(bl3, 0.5, 0.8)))


side_text(['SEEKER SECT', 'LOT 88-14'], 235.0, 0.05, 0.0135)
side_text(['CTRL SECT', 'LOT 88-22'], 835.0, 0.05, 0.0135)
if NAME: side_text(['AARGM-ER'], 640.0, 0.045, 0.052, a=0.95)
# сверху у носа: своя рамка «не вставать»
_m, _wm, _hm = stencil(['KEEP OFF'], 0.016); uu = y - (X0 - 172.0) * S; on = paintz & (z > 0.05); tm_ = project(_m, _wm, _hm, x, uu + 0.018) * on; col = mix(col, full(INK), tm_ * 0.85)
ee = np.maximum(np.abs(x) - 0.030, np.abs(uu - 0.016) - 0.018); col = mix(col, full((168, 40, 34)), ((np.abs(ee) < 0.0014) & on).astype(np.float32) * 0.9)
# на рулях - свой номер
for i_, ph_ in enumerate(np.radians(PJ['phi'])):
    _m, _wm, _hm = stencil([f'FIN {i_ + 1}'], 0.020); dx_, dz_ = math.cos(ph_), math.sin(ph_); ax_, az2 = -math.sin(ph_), math.cos(ph_); sg_ = np.sign(nx * ax_ + nz * az2); lm = finz & (np.abs(x * ax_ + z * az2) < 0.04) & ((x * dx_ + z * dz_) > 0); up_ = 1.0 if dz_ > 0 else -1.0
    tm_ = project(_m, _wm, _hm, (y - (X0 - 930.0) * S) * (-sg_) * up_, ((x * dx_ + z * dz_) - 0.262) * up_) * lm; col = mix(col, full(INK), tm_ * 0.88)
# ═══ царапины, потёртости, сколы, потёки ═══
sc1 = np.abs(fbm((340, 40, 50), 2, 8) - 0.5); sc2 = np.abs(fbm((40, 300, 60), 2, 9) - 0.5); sc = np.maximum(1 - sm(sc1, 0.0, 0.007), 1 - sm(sc2, 0.0, 0.007)) * sm(bl2, 0.42, 0.72) * sm(bl1, 0.25, 0.6)
col = mix(col, col * np.array((1.16, 1.16, 1.15), np.float32), sc * 0.40 * painted)
chips_n = bl3 * 0.6 + bl4 * 0.4; edge_ch = sm(convex * 9.0, 0.40, 0.68) * sm(chips_n, 0.58, 0.68); flat_gate = sm(bl1 * 0.5 + bl2 * 0.5, 0.50, 0.75); fch = chips_n + flat_gate * 0.16; flat_ch = sm(fch, thr(fch, 0.00035), thr(fch, 0.00014)); chip = np.clip(np.maximum(edge_ch, flat_ch), 0, 1) * painted
metalc = full((196, 198, 198)) if GREY else full((150, 152, 152)); col = mix(col, metalc, sm(chip, 0.25, 0.65) * 0.8)
# потёки от стыков назад: вытянуты вдоль оси
stretch = fbm((46, 2.2, 46), 3, 11); dirt = full((88, 82, 66))
for xc, dl, a_ in ((133.0, 40.0, 0.22), (324.0, 46.0, 0.30), (540.0, 36.0, 0.22), (745.0, 42.0, 0.34), (892.0, 40.0, 0.36)):
    d_ = (px - xc) / dl; st_ = np.exp(-np.maximum(d_, 0) ** 2 * 1.6) * (d_ > -0.03) * sm(stretch, 0.52, 0.86) * sm(bl2, 0.3, 0.6) * paintz; col = mix(col, dirt, st_ * a_)
# пыль сверху, грязь снизу
dust = sm(nz, 0.25, 0.95) * sm(bl2 * 0.5 + bl3 * 0.5, 0.42, 0.78) * painted; col = mix(col, col * np.array((1.10, 1.08, 1.03), np.float32), dust * 0.55)
belly = sm(-nz, 0.15, 0.9) * painted; col = mix(col, col * np.array((0.80, 0.78, 0.74), np.float32), belly * (0.25 + 0.5 * sm(bl2, 0.3, 0.7)) * 0.7)
# разводы на рулях
mott = fbm(10, 4, 13); col = mix(col, col * np.array((0.90, 0.89, 0.87), np.float32), finz * sm(mott, 0.45, 0.8) * 0.5)
# копоть у сопла
soot = paintz * sm(px, 962.0, 1000.0) * (0.55 + 0.45 * bl3); col = mix(col, full((60, 58, 54)), soot * 0.55)
mt = full((96, 98, 102)) * (0.80 + 0.28 * bl4)[:, None] * (0.72 + 0.46 * sm(nz, -0.3, 0.9))[:, None]; col = np.where(metal[:, None], mt, col)
# кольцо среза внутри корпуса - серая фаска, труба - чёрная, в глубине сажа
ringc = mix(full((50, 48, 46)), full((10, 10, 11)), sm(px, 999.5, 985.0)); ringc = ringc * (0.8 + 0.3 * bl3)[:, None]; col = np.where(ring[:, None], ringc, col)
col = mix(col, full((64, 62, 56)), np.clip(sm(crev, 0.26, 0.80) * 0.55 + sm(occ, 0.55, 0.9) * 0.06, 0, 0.66))
shade = (0.78 + 0.22 * aol ** 1.1) * (0.50 + 0.50 * aos ** 1.05) * (0.96 + 0.06 * sm(nz, -1, 1)); COL_L = col * shade[:, None]
# ═══ рельеф ═══
print('рельеф'); h = np.zeros(N, np.float32); h += (fine - 0.5) * 0.045e-3 + (bl4 - 0.5) * 0.06e-3 + (fbm((7, 3.5, 7), 2, 21) - 0.5) * 0.35e-3 * paintz; h -= sm(chip, 0.3, 0.6) * 0.28e-3; h += sc * -0.10e-3 * painted
lines = np.zeros(N, np.float32); dots = np.zeros(N, np.float32); holes = np.zeros(N, np.float32); dome = lambda dist, r_, hh: hh * (1 - sm(dist, r_ * 0.55, r_))
notchain = paintz & ~strake


def seam(xc, w=0.34, dep=0.6e-3):
    global h, lines
    m = (np.abs(px - xc) < w) & paintz; h -= m * dep; lines = np.maximum(lines, m)


def bolts(xc, n, r_=0.0030, hh=0.45e-3, offs=0.0):
    global h, dots
    tt = (th + offs) % (2 * np.pi / n); tt = np.minimum(tt, 2 * np.pi / n - tt); dist = np.hypot((px - xc) * S, tt * rad); h += dome(dist, r_, hh) * notchain; dots = np.maximum(dots, (dist < r_ * 1.1) * notchain)


def hole(xc, tc, r_, a=1.0):
    global h, holes
    dist = np.hypot((px - xc) * S, (th - tc) * rad); m = dist < r_; h -= (1 - sm(dist, r_ * 0.6, r_ * 1.15)) * 0.8e-3 * (paintz | padz); holes = np.maximum(holes, m * paintz * a)


for xc in (540.0, 840.0): seam(xc)
for xc, n_b, off in ((137.0, 22, 0.0), (320.0, 26, 0.0), (328.0, 26, 0.12), (741.0, 30, 0.0), (749.0, 30, 0.1), (888.0, 28, 0.0), (896.0, 28, 0.11), (536.0, 30, 0.0), (844.0, 30, 0.0)): bolts(xc, n_b, offs=off)
for xc, n_b in ((951.0, 18), (958.0, 18)): bolts(xc, n_b, 0.0026, 0.38e-3, 0.08)
# поперечная линия стыка на полке наплыва, как на образце
sn = strake & (np.abs(px - 324.0) < 0.5); lines = np.maximum(lines, sn)
# отверстия: кольца дренажа перед узлом, большое сверху, у хвоста, у обтекателя
for tc_, xc in zip((0.17, 0.52, 0.86, 1.2), (549.0, 553.0, 549.0, 553.0)):
    for sg in (-1, 1): hole(xc, sg * tc_, 0.0062, 0.92); hole(xc + 15.0, sg * (tc_ + 0.17), 0.0062, 0.92)
hole(709.0, 0.0, 0.0165); hole(922.0, 0.0, 0.0052)
for sg in (-1, 1): hole(128.0, sg * 0.62, 0.0058); hole(128.0, sg * 1.75, 0.0058)
# рамки и винты площадок узлов
for xc in PJ['lug_x']:
    fl_ = padz & (np.abs(np.maximum(np.abs(px - xc) * S - (PJ['pad_l'] * S - 0.011), np.abs(th) * RB - (PJ['pad_th'] * RB - 0.011))) < 0.0013); h -= fl_ * 0.5e-3; lines = np.maximum(lines, fl_)
    for sx_ in (-1, 1):
        for sy_ in (-1, 1):
            dist = np.hypot(x - sx_ * (PJ['pad_th'] * RB - 0.006), (px - xc - sy_ * (PJ['pad_l'] - 1.5)) * S); h += dome(dist, 0.0034, 0.45e-3) * padz; dots = np.maximum(dots, (dist < 0.0032) * padz)
fl_ = (padz | metal | patchz) & (convex * 9 > 0.5); lines = np.maximum(lines, fl_ * 0.3)
COL_L = mix(COL_L, COL_L * 0.55, np.clip(lines, 0, 1) * 0.95); COL_L = mix(COL_L, COL_L * 0.72, np.clip(dots, 0, 1)); COL_L = mix(COL_L, full((16, 16, 18)), np.clip(holes, 0, 1))
# в картинку
Hg = np.zeros((W, W), np.float32); Hg[idx] = h
Pd = P0[1:, :-1] - P0[:-1, :-1]; dm = np.linalg.norm(Pd, axis=2); good = inside[1:, :-1] & inside[:-1, :-1]; mpt = float(np.median(dm[good & (dm > 0)])); print('размер текселя', round(mpt * 1000, 2), 'мм')
Dx = np.zeros((W, W), np.float32); Dy = np.zeros((W, W), np.float32); Dx[:, 1:-1] = (Hg[:, 2:] - Hg[:, :-2]) * 0.5; Dy[1:-1, :] = (Hg[2:, :] - Hg[:-2, :]) * 0.5
okx = np.zeros((W, W), bool); okx[:, 1:-1] = inside[:, 2:] & inside[:, :-2]; oky = np.zeros((W, W), bool); oky[1:-1, :] = inside[2:, :] & inside[:-2, :]; Dx = np.where(okx, Dx, 0) / mpt; Dy = np.where(oky, Dy, 0) / mpt
STR = 1.5; Nt = NT0 * 2 - 1; Nt[..., 0] += -Dx * STR; Nt[..., 1] += Dy * STR
Nt /= np.maximum(np.linalg.norm(Nt, axis=2, keepdims=True), 1e-6); Nt = np.where(inside[..., None], Nt, np.array((0, 0, 1), np.float32))
out_c = np.zeros((W, W, 3), np.float32); out_c[idx] = COL_L; fill = COL_L[paintz].mean(axis=0); out_c = np.where(inside[..., None], out_c, fill)
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
print('средний цвет: всё', to_hex(COL_L.mean(axis=0)), 'корпус', to_hex(COL_L[paintz].mean(axis=0)), 'рули', to_hex(COL_L[finz].mean(axis=0)))
print('paint.py: готово')
