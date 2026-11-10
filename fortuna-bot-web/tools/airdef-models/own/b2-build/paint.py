# paint.py - краска B-2A из данных gbuf.py: цвет без света, нормали, карта R затенение, G шероховатость, B металл. Без Blender.
# B2_TEX=2048|4096, B2_OUT=<папка>, B2_BASE=r,g,b (0…1, sRGB)
import json, math, os, site, sys, time
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image, ImageDraw, ImageFont
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__)); DAT = os.path.join(HERE, '_проба')
S = int(os.environ.get('B2_TEX', '2048')); OUT = os.environ.get('B2_OUT', DAT); os.makedirs(OUT, exist_ok=True)
BASEC = np.array([float(v) for v in os.environ.get('B2_BASE', '0.378,0.398,0.425').split(',')], np.float32)
ROUGH0 = float(os.environ.get('B2_ROUGH', '0.50'))
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f} с]', *a, flush=True)
L2 = 10.5
pos = np.load(f'{DAT}/gb_pos_{S}.npy'); nor = np.load(f'{DAT}/gb_nor_{S}.npy'); idd = np.load(f'{DAT}/gb_id_{S}.npy'); aob = np.load(f'{DAT}/gb_ao_{S}.npy')
ATLAS = json.load(open(f'{DAT}/uv.json', encoding='utf-8'))['atlas_m']; PXM = 0.985 * S / ATLAS; DS = 1.0 / PXM
mat = np.round(idd[..., 0] * 16).astype(np.int8); cls = np.round(idd[..., 1] * 32).astype(np.int8); cov = idd[..., 2] > 0.5
a = (L2 - pos[..., 1]).astype(np.float32); x = pos[..., 0].astype(np.float32); z = pos[..., 2].astype(np.float32); ax = np.abs(x)
nx, ny, nz = nor[..., 0], nor[..., 1], nor[..., 2]
ao1, ao2, bev = aob[..., 0], aob[..., 1], aob[..., 2]
log('данные загружены', S, 'плотность', round(PXM), 'пикс/м')


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
    r = 0.0; w = 0.5; tot = 0.0
    pa, px, pz = a * fa, x * fx_, z * fz_
    wa = vnoise(pa * 0.7 + seed + 11.3, px * 0.7 - seed, pz * 0.7 + 5.1) - 0.5; wb = vnoise(pa * 0.7 - 7.7, px * 0.7 + seed + 3.3, pz * 0.7 - seed) - 0.5
    pa, px, pz = pa + wa * 0.9, px + wb * 0.9, pz + (wa - wb) * 0.6
    for i in range(octv):
        qa = R3[0, 0] * pa + R3[0, 1] * px + R3[0, 2] * pz; qx = R3[1, 0] * pa + R3[1, 1] * px + R3[1, 2] * pz; qz = R3[2, 0] * pa + R3[2, 1] * px + R3[2, 2] * pz
        pa, px, pz = qa * 2.03, qx * 2.03, qz * 2.03
        r = r + w * vnoise(qa + seed + i * 3.1, qx - seed * 0.7, qz + seed * 1.3 + i); tot += w; w *= 0.5
    return r / tot


def mix(c, col_, t):
    t = np.clip(t, 0, 1)[..., None]; return c * (1 - t) + np.asarray(col_, np.float32) * t


# ── основа: тёмный серо-синий матовый (фото 03-05: на солнце (127, 134, 143), снизу в тени темнее); пятна покрытия, листы, разводы ──
skin_m = (mat == 0) & (cls <= 9)
fine = fbm(32.0, 32.0, 32.0, 2, 5.0); mott = fbm(5.0, 5.0, 5.0, 3, 9.0)
p1 = fbm(0.35, 0.35, 0.35, 4, 1.0); p2 = fbm(1.6, 1.6, 1.6, 3, 2.0); p3 = fbm(0.12, 2.2, 2.2, 3, 4.0)      # крупные пятна, мелкие, разводы по потоку
col = np.ones((S, S, 3), np.float32) * BASEC; rough = np.full((S, S), ROUGH0, np.float32); metal = np.full((S, S), 0.06, np.float32); height = np.zeros((S, S), np.float32)
col *= (0.88 + 0.22 * p1 + 0.06 * p2)[..., None]
rough += (p1 - 0.5) * 0.10 + (p2 - 0.5) * 0.06
# листы покрытия: прямоугольники по плану, мягкий край, тон ±4 %
RS = np.random.RandomState(31)
ids = np.nonzero((skin_m & cov).ravel())[0]; AA, XX = a.ravel()[ids], x.ravel()[ids]
for k in range(140):
    a0 = RS.uniform(0.5, 20.0); w = RS.uniform(0.6, 2.6); q0 = RS.uniform(-25.0, 25.0); h_ = RS.uniform(0.6, 3.2); e_ = 0.02
    d = np.minimum.reduce([AA - a0, a0 + w - AA, XX - q0, q0 + h_ - XX]); sel = d > -e_
    if not sel.any(): continue
    t_ = np.clip((d[sel] + e_) / (2 * e_), 0, 1); kk = RS.uniform(0.95, 1.05); cc = ids[sel]
    for ch_ in range(3): col[..., ch_].ravel()[cc] *= 1 + (kk - 1) * t_
    rough.ravel()[cc] += t_ * RS.uniform(-0.04, 0.05)
# органы управления чуть светлее (на фото 12 кромочные панели светлее)
ctrl = (mat == 0) & np.isin(cls, (1, 2, 4)); col[ctrl] *= 1.05
# разводы покрытия: светлые матовые пятна сверху, вытерто у дорожек
wear = smooth(0.55, 0.80, p1 * 0.6 + p3 * 0.4) * smooth(-0.1, 0.5, nz) * skin_m
col = mix(col, (0.47, 0.49, 0.52), wear * 0.30); rough += wear * 0.08
streak = smooth(0.52, 0.74, p3) * skin_m; col = mix(col, (0.26, 0.275, 0.30), streak * 0.22)
scr = smooth(0.70, 0.86, fbm(9.0, 9.0, 9.0, 3, 7.0)) * smooth(0.45, 0.65, p1) * skin_m; col = mix(col, (0.48, 0.50, 0.53), scr * 0.18); rough += scr * 0.06
# низ: темнее, пыльные бежевые разводы по потоку (фото 14)
under = smooth(-0.3, -0.8, nz) * skin_m; col = mix(col, (0.26, 0.275, 0.30), under * 0.30); rough += under * 0.10
dust = smooth(0.50, 0.78, fbm(0.10, 1.6, 1.6, 4, 21.0)) * under * (1 - smooth(13.0, 17.0, ax)); col = mix(col, (0.44, 0.42, 0.38), dust * 0.20); rough += dust * 0.12
# светлые канты по кромкам, мягко
edge = smooth(0.995, 0.93, bev) * skin_m * (0.55 + 0.45 * smooth(0.4, 0.7, mott)); col = mix(col, (0.46, 0.48, 0.51), edge * 0.14); rough += edge * 0.04
log('основа')


# ── швы и контуры: ломаные по плану, светлая тонкая линия и канавка в нормалях ──
def teeth(p0, p1_, n, amp):
    out = []; dx, dy = p1_[0] - p0[0], p1_[1] - p0[1]; Ln = math.hypot(dx, dy); ux, uy = dx / Ln, dy / Ln; nx_, ny_ = -uy, ux
    for i in range(n):
        out.append((p0[0] + dx * i / n, p0[1] + dy * i / n)); m = (i + 0.5) / n; out.append((p0[0] + dx * m + nx_ * amp, p0[1] + dy * m + ny_ * amp))
    out.append(p1_); return out


def hexl(ac, xc, ra, rx, tn=2, amp=0.03):
    P = [(ac - ra, xc - rx * 0.55), (ac - ra, xc + rx * 0.55), (ac, xc + rx), (ac + ra, xc + rx * 0.55), (ac + ra, xc - rx * 0.55), (ac, xc - rx), (ac - ra, xc - rx * 0.55)]; out = []
    for i in range(6): out += teeth(P[i], P[i + 1], tn, amp)
    return out


def diam(ac, xc, ra, rx): return [(ac - ra, xc), (ac, xc + rx), (ac + ra, xc), (ac, xc - rx), (ac - ra, xc)]


def stroke(pl, mask, w, c_, al, dep=0.0009, side_z=False):
    """Линия в плане (a, |x|): на обе стороны. side_z - по бортам (a, z)."""
    Q_ = z if side_z else ax
    idx = np.nonzero((mask & cov).ravel())[0]; AA_, QQ_ = a.ravel()[idx], Q_.ravel()[idx]; dm = np.full(idx.shape, 9.0, np.float32)
    for (p0, q0), (p1_, q1) in zip(pl, pl[1:]):
        lo_a, hi_a = min(p0, p1_) - 0.08, max(p0, p1_) + 0.08; lo_q, hi_q = min(q0, q1) - 0.08, max(q0, q1) + 0.08; sel = np.nonzero((AA_ > lo_a) & (AA_ < hi_a) & (QQ_ > lo_q) & (QQ_ < hi_q))[0]
        if not len(sel): continue
        da, dq = p1_ - p0, q1 - q0; Ln2 = da * da + dq * dq or 1e-6; t = np.clip(((AA_[sel] - p0) * da + (QQ_[sel] - q0) * dq) / Ln2, 0, 1); d = np.hypot(AA_[sel] - (p0 + t * da), QQ_[sel] - (q0 + t * dq)); dm[sel] = np.minimum(dm[sel], d)
    hit = dm < w * 1.8
    if not hit.any(): return
    t_ = np.clip(1 - (dm[hit] - w * 0.5) / (w * 0.8), 0, 1) * al; cc = idx[hit]
    for ch_ in range(3): v = col[..., ch_].ravel(); v[cc] = v[cc] * (1 - t_) + c_[ch_] * t_
    height.ravel()[cc] -= dep * t_ / max(al, 1e-3)


up = skin_m & (nz > 0.20); dn = skin_m & (nz < -0.20); LN = (0.27, 0.285, 0.31); LW = (0.66, 0.68, 0.70); LZ = (0.44, 0.46, 0.49); w_px = max(0.016, 1.6 * DS); w_ln = max(0.035, 2.2 * DS)
K_ = 0.70009; AT_ = 18.28; C1_, C2_, C3_, C4_ = 5.42, 24.35, 14.35, 20.40
def le_off(xx, d): return K_ * xx + d * 1.2206       # линия вдоль передней кромки на d м внутрь (по нормали)
# дорожки (светлые линии сверху, фото 12): вдоль передней кромки, вдоль органов управления, ломаные у центроплана
for sg in (1,):
    stroke([(le_off(7.5, 1.7), 7.5), (le_off(23.4, 1.7), 23.4), (C1_ + K_ * 21.2 - 1.9 * 1.2206, 21.2)], up, w_ln, LW, 0.75)                        # передняя линия до конца крыла
    stroke([(C1_ + K_ * 21.0 - 1.9 * 1.2206, 21.0), (C1_ + K_ * 14.6 - 1.9 * 1.2206, 14.6), (C2_ - K_ * 12.5 - 1.9 * 1.2206, 12.5), (C2_ - K_ * 8.6 - 1.9 * 1.2206, 8.6), (11.7, 8.6), (11.7, 6.3)], up, w_ln, LW, 0.75)
    stroke([(le_off(7.5, 1.7), 7.5), (le_off(7.5, 1.7), 6.6)], up, w_ln, LW, 0.75)
    stroke([(7.0, 2.95), (11.3, 2.95)], up, w_ln, LW, 0.6); stroke([(7.0, 2.62), (11.3, 2.62)], up, w_ln, LW, 0.6)     # полосы у горба
    for a0_, q0_, w0_, h0_ in ((9.0, 6.6, 1.1, 0.42), (12.2, 6.7, 0.9, 0.36), (8.2, 1.0, 0.9, 0.30), (13.3, 1.6, 0.7, 0.28)):
        stroke([(a0_, q0_), (a0_ + w0_, q0_), (a0_ + w0_, q0_ + h0_), (a0_, q0_ + h0_), (a0_, q0_)], up, w_px, LW, 0.65)      # рамки NO STEP и люков
# пилообразные стыки покрытия за кабиной (фото 03) и у губ
def teeth2(p0, p1_, n, amp):
    out = []; dx, dy = p1_[0] - p0[0], p1_[1] - p0[1]; Ln = math.hypot(dx, dy); ux, uy = dx / Ln, dy / Ln; nx_, ny_ = -uy, ux
    for i in range(n):
        out.append((p0[0] + dx * i / n, p0[1] + dy * i / n)); out.append((p0[0] + dx * (i + 0.5) / n + nx_ * amp, p0[1] + dy * (i + 0.5) / n + ny_ * amp))
    out.append(p1_); return out
stroke(teeth2((4.55, 0.0), (4.55, 1.85), 4, 0.16), up, w_px, LZ, 0.70); stroke(teeth2((5.15, 0.0), (5.25, 2.25), 5, 0.14), up, w_px, LZ, 0.60)
stroke(teeth2((2.45, 0.0), (2.62, 1.45), 4, 0.10), up, w_px, LZ, 0.55)
# швы по крылу: длинные линии по размаху, тёмные и тонкие
for d_, xe_ in ((0.55, 24.5), (3.2, 22.0), (4.4, 21.0)):
    stroke([(le_off(7.2, d_), 7.2), (le_off(xe_, d_), xe_)], up | dn, w_px, LN, 0.45)
for xx_ in (9.5, 12.0, 16.0, 19.5):
    stroke([(le_off(xx_, 0.2), xx_), (min(C1_ + K_ * xx_, C2_ - K_ * xx_ if xx_ < 13.52 else 99) - 0.25, xx_)], up | dn, w_px, LN, 0.40)
# низ: контуры створок отсеков и шасси пилой, люки
BA0, BA1, BXi, BXo = 4.90, 11.75, 0.18, 2.42
stroke(teeth2((BA0 - 0.08, BXi - 0.08), (BA0 - 0.08, BXo + 0.08), 3, 0.16) + [(BA1 + 0.08, BXo + 0.08)] + teeth2((BA1 + 0.08, BXo + 0.08), (BA1 + 0.08, BXi - 0.08), 3, 0.16), dn, w_px, LZ, 0.5)
for ac, xc, ra, rx in ((3.2, 1.6, 0.22, 0.2), (13.4, 1.2, 0.25, 0.22), (14.6, 5.3, 0.2, 0.18), (6.2, 4.0, 0.24, 0.2)):
    stroke([(ac - ra, xc - rx), (ac - ra, xc + rx), (ac + ra, xc + rx), (ac + ra, xc - rx), (ac - ra, xc - rx)], dn, w_px, LZ, 0.45)
log('швы и дорожки')


# ── знаки: малозаметные серые, белые буквы и номер придуманные ──
GR = (62, 66, 74, 255); WH = (196, 200, 204, 255)


def _star(dr, cx, cy, R, fill):
    p = []
    for i in range(10):
        an = -math.pi / 2 + i * math.pi / 5; r_ = R if i % 2 == 0 else R * 0.382; p.append((cx + r_ * math.cos(an), cy + r_ * math.sin(an)))
    dr.polygon(p, fill=fill)


def roundel_img(W=1400, H=560, ink=GR):
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dr = ImageDraw.Draw(im_); cx, cy, R = W / 2, H / 2, H * 0.47; t = max(5, int(H * 0.028))
    bh = H * 0.15; bx = W * 0.49
    for sg in (1, -1):
        x0, x1 = sorted((cx + sg * R * 0.95, cx + sg * bx)); dr.rectangle((x0, cy - bh, x1, cy + bh), outline=ink, width=t); dr.rectangle((x0 + t * 2, cy - bh * 0.45, x1 - t * 2, cy + bh * 0.45), fill=ink)
    dr.ellipse((cx - R, cy - R, cx + R, cy + R), fill=(0, 0, 0, 0), outline=ink, width=t); _star(dr, cx, cy, R * 0.92, ink); return im_


def text_img(t, H=220, ink=WH):
    f_ = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', int(H * 0.86)); tmp = ImageDraw.Draw(Image.new('L', (8, 8))); bb = tmp.textbbox((0, 0), t, font=f_); W = bb[2] - bb[0] + int(H * 0.2)
    im_ = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(im_).text((W / 2, H / 2), t, font=f_, fill=ink, anchor='mm'); return im_


def stamp(im_, ac, qc, W_, H_, side, along=True, alpha=0.96, cl=None):
    A0 = np.asarray(im_, np.float32) / 255.0; hp, wp = A0.shape[:2]
    vm, Q_ = ((nz > 0.35, x) if side == 'top' else (nz < -0.35, x) if side == 'bot' else (nx > 0.35, z) if side == 'r' else (nx < -0.35, z))
    if along: ins = vm & (np.abs(a - ac) < W_ / 2) & (np.abs(Q_ - qc) < H_ / 2)
    else: ins = vm & (np.abs(Q_ - qc) < W_ / 2) & (np.abs(a - ac) < H_ / 2)
    ins &= (mat == 0) & (np.isin(cls, cl) if cl else (cls <= 7))
    if not ins.any(): return
    if along:
        u_ = (a[ins] - ac) / W_ + 0.5; v_ = 0.5 - (Q_[ins] - qc) / H_
        if side == 'r': u_ = 1 - u_
    else:
        u_ = (Q_[ins] - qc) / W_ + 0.5; v_ = (a[ins] - ac) / H_ + 0.5
        if side == 'bot': u_ = 1 - u_
    S_ = A0[np.clip((v_ * hp).astype(int), 0, hp - 1), np.clip((u_ * wp).astype(int), 0, wp - 1)]
    al = S_[:, 3] * alpha * (0.88 + 0.12 * smooth(0.30, 0.62, fine[ins]))
    col[ins] = col[ins] * (1 - al[..., None]) + S_[:, :3] * al[..., None]; rough[ins] = rough[ins] * (1 - al) + 0.42 * al


RND = roundel_img(ink=(52, 56, 64, 255))
stamp(RND, 13.0, -16.5, 2.4, 0.96, 'top', along=False); stamp(RND, 13.0, 16.5, 2.4, 0.96, 'bot', along=False)      # крыло: сверху левое, снизу правое, тёмно-серые (фото 14)
stamp(text_img('AF 95 0417', 200), 9.6, 0.0, 1.9, 0.26, 'top', along=False, alpha=0.85)                                  # придуманный номер на спине (фото 08, 12)
RED = (168, 40, 34, 255)
def arrow_img(W_=600, H_=200):
    im_ = Image.new('RGBA', (W_, H_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); d_.rectangle((0, H_ * 0.3, W_ * 0.68, H_ * 0.7), fill=RED); d_.polygon([(W_ * 0.62, 0), (W_, H_ / 2), (W_ * 0.62, H_)], fill=RED); return im_
stamp(arrow_img(), 4.9, -1.75, 0.55, 0.18, 'top')                                                                           # стрелка спасения у кабины (фото 03), без надписи
def tri_img(S_=200):
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); P_ = [(S_ / 2, S_ * 0.05), (S_ * 0.96, S_ * 0.92), (S_ * 0.04, S_ * 0.92)]; d_.polygon(P_, fill=RED); return im_
stamp(tri_img(), 4.25, 1.75, 0.22, 0.2, 'top')
log('знаки')


# ── материалы деталей ──
def solid(m, c, r, me=0.0, nz_=0.08):
    col[m] = np.array(c, np.float32) * (1 - nz_ / 2 + nz_ * fine[m])[..., None]; rough[m] = r; metal[m] = me


solid(mat == 2, (0.028, 0.028, 0.03), 0.9)                                 # нутро, ниши
solid(mat == 4, (0.045, 0.045, 0.048), 0.86)                               # резина
solid((mat == 5) & (cls == 11), (0.20, 0.205, 0.215), 0.62, 0, 0.16)       # кабина
bay_m = (mat == 5) & (cls == 0); solid(bay_m, (0.44, 0.45, 0.46), 0.62, 0, 0.14); col[bay_m] *= (0.55 + 0.45 * ao2[bay_m])[..., None]      # отсеки и полость
solid(cls == 13, (0.44, 0.45, 0.46), 0.6, 0, 0.14); solid((cls == 13) & (mat == 1), (0.40, 0.41, 0.42), 0.42, 0.8); solid((cls == 13) & (mat == 2), (0.10, 0.10, 0.105), 0.7); col[cls == 13] *= (0.55 + 0.45 * ao2[cls == 13])[..., None]
door_in = np.isin(cls, (7, 8)) & (nz > 0.2); solid(door_in, (0.42, 0.43, 0.44), 0.6, 0, 0.14); solid(np.isin(cls, (7, 8)) & (mat == 5), (0.40, 0.41, 0.42), 0.6)
# жёлоб выхлопа: тёмный жаростойкий металл, копоть, лёгкий тёплый оттенок только у сопел (Mark: менее золотистый)
hot = mat == 6; hn = fbm(3.0, 3.0, 3.0, 3, 61.0); solid(hot, (0.20, 0.195, 0.19), 0.48, 0.55, 0.12)
near = hot & (a < 15.2); col = mix(col, (0.30, 0.25, 0.20), near * smooth(15.2, 14.2, a) * 0.35)
col = mix(col, (0.06, 0.06, 0.06), hot * smooth(0.35, 0.75, hn) * 0.45); rough = rough + hot * 0.1
# копоть на обшивке за жёлобом и у краёв жёлоба
soot = skin_m & (a > 14.0) & (np.abs(ax - 4.3) < 1.6) & (nz > 0.2)
sv = smooth(1.6, 0.9, np.abs(ax - 4.3)) * smooth(14.0, 15.5, a) * (0.6 + 0.4 * hn) * soot; col = mix(col, (0.12, 0.12, 0.12), sv * 0.45); rough = rough + sv * 0.08
hb = (cls == 14) & (mat == 0); solid(hb, BASEC * 1.0, 0.5, 0.06, 0.1)
solid((cls == 9), BASEC * 1.12, 0.48, 0.05, 0.08)                          # рама окон чуть светлее (фото 03)
# шасси: светлое серое, грязь, масло, тормозная пыль (рецепт, раздел 8)
gr_ = cls == 12; g_p = gr_ & (mat == 0); g_c = gr_ & (mat == 1); g_s = gr_ & (mat == 2) | (gr_ & (mat == 8))
gm1 = fbm(2.4, 2.4, 2.4, 4, 91.0); gm2 = fbm(18.0, 18.0, 18.0, 3, 93.0); gst = fbm(1.0, 16.0, 2.2, 4, 87.0); gst2 = fbm(0.7, 34.0, 1.3, 3, 89.0)
solid(g_p, (0.545, 0.545, 0.535), 0.62, 0, 0.10); solid(g_c, (0.47, 0.47, 0.46), 0.30, 0.85, 0.08); solid(gr_ & (mat == 2), (0.05, 0.048, 0.046), 0.72, 0, 0.14)
solid(gr_ & (mat == 3), (0.60, 0.56, 0.40), 0.28, 0, 0.1)
painted = g_p; col[painted] *= (0.84 + 0.30 * gm1[painted] + 0.06 * gm2[painted])[..., None]
oil_ = smooth(0.46, 0.68, gst) * (0.5 + 0.5 * smooth(0.40, 0.70, gst2)); col = mix(col, (0.15, 0.125, 0.095), oil_ * 0.52 * (painted | g_c)); rough = rough + oil_ * 0.20 * painted - oil_ * 0.10 * g_c
gd = smooth(-1.6, -2.7, z) * gr_ * (0.45 + 0.55 * smooth(0.36, 0.66, gm1)); col = mix(col, (0.215, 0.195, 0.165), gd * 0.55 * painted); rough = rough + gd * 0.22 * painted
tyr = mat == 4; rt_ = smooth(0.40, 0.68, gm2) * tyr; col[tyr] = np.array((0.070, 0.070, 0.072), np.float32); col = mix(col, (0.165, 0.158, 0.145), rt_ * 0.50); col = mix(col, (0.20, 0.19, 0.17), smooth(-2.3, -2.85, z) * tyr * 0.45); rough[tyr] = 0.9
col[gr_] *= (0.50 + 0.50 * smooth(0.15, 0.95, ao2[gr_]))[..., None]
col[skin_m] *= (0.95 + 0.05 * ao1[skin_m])[..., None]
rough = np.clip(rough, 0.08, 0.97); metal = np.clip(metal, 0, 1); col = np.clip(col, 0, 1)
for c_ in range(16):
    m_ = (cls == c_) & cov
    if m_.sum() > 500: print('деталь', c_, 'цвет', (col[m_].mean(0) * 255).round(0), 'G', round(float(rough[m_].mean()), 2), 'B', round(float(metal[m_].mean()), 2))
log('материалы')
wav = fbm(0.8, 0.8, 0.8, 2, 79.0); height += (wav - 0.5) * 0.003 * skin_m
shag = fbm(70.0, 70.0, 70.0, 2, 73.0); height += (shag - 0.5) * 0.00012 * skin_m
gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * DS); gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / (2 * DS)
nn = np.stack([-gx, -gy, np.ones_like(gx)], -1); nn /= np.linalg.norm(nn, axis=-1, keepdims=True)
solidm = np.isin(mat, (2, 3)) | (cls == 11) | (cls == 12) | (cls == 13) | (cls == 14)
nn[solidm] = (0, 0, 1)
vanes = np.zeros_like(cov)


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
bleed([col, rough, metal, occ, nn], cov)
def lift(arr): return (np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)
Image.fromarray(lift(col)[::-1]).save(f'{OUT}/b2_color.png', compress_level=1)
Image.fromarray(lift(nn * 0.5 + 0.5)[::-1]).save(f'{OUT}/b2_normal.png', compress_level=1)
orm = np.stack([occ, rough, metal], -1); Image.fromarray(lift(orm)[::-1]).save(f'{OUT}/b2_orm.png', compress_level=1)
print('средний цвет обшивки sRGB', (col[skin_m & cov].mean(0) * 255).round(1), 'шероховатость', round(float(rough[skin_m & cov].mean()), 3))
log('сохранено', OUT)
