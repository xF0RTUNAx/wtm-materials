# paint.py - краска F-117A из данных gbuf.py: цвет без света, нормали, карта R затенение, G шероховатость, B металл. Без Blender.
# F117_TEX=2048|4096, F117_OUT=<папка>, F117_BASE=r,g,b (0…1, sRGB)
import json, math, os, site, sys, time
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image, ImageDraw, ImageFont
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__)); DAT = os.path.join(HERE, '_проба')
S = int(os.environ.get('F117_TEX', '2048')); OUT = os.environ.get('F117_OUT', DAT); os.makedirs(OUT, exist_ok=True)
BASEC = np.array([float(v) for v in os.environ.get('F117_BASE', '0.155,0.16,0.172').split(',')], np.float32)
ROUGH0 = float(os.environ.get('F117_ROUGH', '0.34'))
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f} с]', *a, flush=True)
L2 = 10.0
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


# ── основа: чёрный с синеватым, лист от листа чуть отличается; блеск сильный на гладких гранях ──
skin_m = (mat == 0) & (cls <= 9)
fine = fbm(32.0, 32.0, 32.0, 2, 5.0); mott = fbm(5.0, 5.0, 5.0, 3, 9.0)
p1 = fbm(0.8, 0.8, 0.8, 4, 1.0); p2 = fbm(2.6, 2.6, 2.6, 3, 2.0); p3 = fbm(0.28, 3.6, 3.6, 3, 4.0)      # пятна, мелкие пятна, разводы по потоку
col = np.ones((S, S, 3), np.float32) * BASEC; rough = np.full((S, S), ROUGH0, np.float32); metal = np.full((S, S), 0.10, np.float32); height = np.zeros((S, S), np.float32)
col *= (0.84 + 0.30 * p1 + 0.08 * p2)[..., None]
rough += (p1 - 0.5) * 0.14 + (p2 - 0.5) * 0.08
# листы: прямоугольники по плану, мягкий край
RS = np.random.RandomState(31)
ids = np.nonzero((skin_m & cov).ravel())[0]; AA, XX = a.ravel()[ids], x.ravel()[ids]
for k in range(46):
    a0 = RS.uniform(1.0, 18.0); w = RS.uniform(0.35, 1.5); q0 = RS.uniform(-6.0, 6.0); h_ = RS.uniform(0.3, 1.1); e_ = 0.012
    d = np.minimum.reduce([AA - a0, a0 + w - AA, XX - q0, q0 + h_ - XX]); sel = d > -e_
    if not sel.any(): continue
    t_ = np.clip((d[sel] + e_) / (2 * e_), 0, 1); kk = RS.uniform(0.92, 1.12); cc = ids[sel]
    for ch_ in range(3): col[..., ch_].ravel()[cc] *= 1 + (kk - 1) * t_
    rough.ravel()[cc] += t_ * RS.uniform(-0.06, 0.07)
# вытертые места: мягкие светлые и матовые, без резких пятен (f117_06, 16)
wear = smooth(0.52, 0.78, p1 * 0.7 + p3 * 0.3) * (0.55 + 0.45 * smooth(-0.1, 0.5, nz)) * skin_m
col = mix(col, (0.30, 0.305, 0.315), wear * 0.42); rough += wear * 0.14
streak = smooth(0.50, 0.72, p3) * skin_m; col = mix(col, (0.11, 0.11, 0.115), streak * 0.25)
# рассеянные мелкие потёртости
scr = smooth(0.70, 0.86, fbm(11.0, 11.0, 11.0, 3, 7.0)) * smooth(0.45, 0.65, p1) * skin_m; col = mix(col, (0.34, 0.345, 0.355), scr * 0.22); rough += scr * 0.08
# низ матовее и чуть серее
under = smooth(-0.3, -0.8, nz) * skin_m; col = mix(col, (0.17, 0.175, 0.185), under * 0.45); rough += under * 0.14
# светлые канты по рёбрам граней и кромкам
edge = smooth(0.995, 0.93, bev) * skin_m * (0.55 + 0.45 * smooth(0.4, 0.7, mott)); col = mix(col, (0.36, 0.37, 0.385), edge * 0.40); rough += edge * 0.06
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


up = skin_m & (nz > 0.25); dn = skin_m & (nz < -0.25); LN = (0.37, 0.38, 0.395); LW = (0.60, 0.61, 0.62); w_px = max(0.009, 1.6 * DS)
# верх: швы вдоль рёбер и по крылу
for pl in ([(6.6, 1.22), (8.0, 1.12), (13.0, 1.20)], [(8.5, 2.05), (13.0, 2.18)], [(7.0, 0.62), (9.4, 0.35), (13.0, 0.40)], [(13.0, 1.20), (13.95, 2.0)], [(4.0, 0.42), (2.75, 0.22)],
           [(7.25, 3.1), (14.4, 6.2)], [(10.6, 2.62), (15.2, 6.2)], [(9.6, 2.62), (9.6, 3.7)], [(11.6, 2.62), (11.6, 4.3)], [(13.4, 4.0), (13.4, 5.0)], [(10.6, 0.0), (10.6, 1.20)], [(12.2, 0.0), (12.2, 1.20)], [(15.0, 0.0), (15.0, 0.92)]):
    stroke(pl, up, w_px, LN, 0.55)
for ac, xc, ra, rx in ((3.75, 0.72, 0.15, 0.13), (5.9, 1.45, 0.15, 0.13), (9.9, 0.72, 0.22, 0.20), (11.2, 1.72, 0.20, 0.17), (12.6, 0.62, 0.18, 0.15), (9.3, 3.1, 0.17, 0.15), (11.4, 4.5, 0.16, 0.14), (13.2, 5.4, 0.12, 0.11)):
    stroke(hexl(ac, xc, ra, rx), up, w_px, LW, 0.70)
for ac, xc, ra, rx in ((7.6, 1.70, 0.16, 0.12), (10.7, 2.28, 0.14, 0.10), (14.2, 1.05, 0.12, 0.10), (12.8, 3.6, 0.10, 0.09)):
    stroke(diam(ac, xc, ra, rx), up, w_px, LW, 0.70)
# низ: швы и люки (f117_13)
for pl in ([(2.6, 0.0), (9.0, 2.2)], [(7.2, 0.0), (7.2, 0.9)], [(12.4, 0.0), (12.4, 1.9)], [(13.0, 0.0), (14.3, 1.4)], [(11.8, 0.9), (11.8, 1.40)], [(6.5, 1.70), (9.7, 1.40)], [(7.25, 3.1), (14.4, 6.2)], [(9.6, 2.62), (9.6, 3.7)], [(11.6, 2.62), (11.6, 4.3)]):
    stroke(pl, dn, w_px, LN, 0.45)
for ac, xc, ra, rx in ((5.2, 0.85, 0.19, 0.17), (6.3, 1.25, 0.14, 0.13), (4.2, 0.72, 0.12, 0.11), (12.9, 0.85, 0.17, 0.15), (13.7, 0.5, 0.13, 0.12), (9.1, 3.0, 0.15, 0.14), (11.4, 4.2, 0.13, 0.12)):
    stroke(hexl(ac, xc, ra, rx), dn, w_px, LW, 0.50)
# пилообразные канты: вокруг створок снизу, окон и люка сверху, перед проёмом воздухозаборника (f117_01, 07, 15)
LZ = (0.46, 0.47, 0.485)
BAYa0, BAYa1, BAYx = 7.20, 11.60, 0.90
stroke(teeth((BAYa0 - 0.10, 0.0), (BAYa0 - 0.10, BAYx + 0.10), 4, 0.10) + [(BAYa1 + 0.10, BAYx + 0.10)] + teeth((BAYa1 + 0.10, BAYx + 0.10), (BAYa1 + 0.10, 0.0), 4, 0.10), dn, w_px, LZ, 0.55)
stroke(teeth((9.72, 1.37), (9.72, 2.36), 4, 0.09) + [(12.08, 2.36)] + teeth((12.08, 2.36), (12.08, 1.37), 4, 0.09) + [(9.72, 1.37)], dn, w_px, LZ, 0.55)
stroke(teeth((3.12, 0.0), (3.12, 0.38), 2, 0.08) + [(5.18, 0.38)] + teeth((5.18, 0.38), (5.18, 0.0), 2, 0.08), dn, w_px, LZ, 0.55)
stroke(hexl(3.02, 0.0, 0.30, 0.36, 3, 0.04), up, w_px, LZ, 0.65)                                        # окно перед кабиной
stroke(hexl(3.05, 0.30, 0.28, 0.30, 3, 0.04), dn, w_px, LZ, 0.55)                                       # окно под носом
stroke(hexl(8.25, 0.0, 0.46, 0.42, 3, 0.04), up, w_px, LZ, 0.60)                                        # люк дозаправки
stroke(teeth((5.15, 1.05), (7.05, 1.88), 7, 0.06), up, w_px, LZ, 0.60)                                  # над проёмом
stroke(teeth((4.00, 1.60), (5.90, 2.45), 7, 0.06), up, w_px, LZ, 0.55)                                  # под проёмом
stroke(teeth((3.45, 0.40), (5.05, 0.92), 6, 0.05), up, w_px, LZ, 0.55)                                  # перед фонарём
stroke(teeth((12.2, 3.45), (15.5, 6.0), 12, 0.05), up, w_px, LZ, 0.45)                                  # перед элевонами
log('швы')

# ── знаки: малозаметные серые, белые буквы и номер придуманные ──
GR = (116, 120, 126, 255); WH = (206, 208, 208, 255)


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


RND = roundel_img()
stamp(RND, 12.4, -4.4, 1.55, 0.62, 'top', along=False); stamp(RND, 12.4, 4.4, 1.55, 0.62, 'bot', along=False)         # крыло: сверху левое, снизу правое (f117_08, 13, 14)
for sd in ('r', 'l'):
    stamp(RND, 10.7, 0.62, 1.05, 0.42, sd)                                                 # борт короба (f117_15)
    stamp(text_img('AX', 240), 16.45, 1.74, 0.72, 0.34, sd, cl=(1,))                        # буквы и номер придуманные (f117_11)
    stamp(text_img('870', 200), 16.72, 1.46, 0.46, 0.13, sd, cl=(1,))
    stamp(text_img('USAF', 160), 16.70, 1.34, 0.42, 0.075, sd, cl=(1,), alpha=0.8)
RED = (150, 44, 36, 255)
def tri_img(S_=200):
    im_ = Image.new('RGBA', (S_, S_), (0, 0, 0, 0)); d_ = ImageDraw.Draw(im_); P_ = [(S_ / 2, S_ * 0.05), (S_ * 0.96, S_ * 0.92), (S_ * 0.04, S_ * 0.92)]; d_.line(P_ + [P_[0]], fill=RED, width=int(S_ * 0.1)); return im_
for sd in ('r', 'l'): stamp(tri_img(), 4.55, 0.86, 0.14, 0.11, sd)                         # катапульта
def bar_mask(ac, xc, w, h, ang):
    ca, sa = math.cos(ang), math.sin(ang); da, dq = a - ac, ax - xc; u_ = da * ca + dq * sa; v_ = -da * sa + dq * ca; return (np.abs(u_) < w / 2) & (np.abs(v_) < h / 2) & up
for ac, xc, w, h, ang in ((7.30, 0.85, 0.42, 0.045, 0.45), (7.55, 1.50, 0.34, 0.045, -0.5), (12.1, 1.55, 0.40, 0.04, 0.25)):
    m_ = bar_mask(ac, xc, w, h, ang); col[m_] = np.array(WH[:3], np.float32) / 255 * 0.85; rough[m_] = 0.45
log('знаки')


# ── материалы деталей ──
def solid(m, c, r, me=0.0, nz_=0.08):
    col[m] = np.array(c, np.float32) * (1 - nz_ / 2 + nz_ * fine[m])[..., None]; rough[m] = r; metal[m] = me


solid(mat == 2, (0.028, 0.028, 0.03), 0.9)                # нутро
well = (mat == 2) & (cls == 0) & (z < 0.45) & (ax > 1.3) & (a > 9.5); solid(well, (0.12, 0.122, 0.125), 0.8)      # ниши стоек
solid(mat == 4, (0.045, 0.045, 0.048), 0.86)              # резина
solid(mat == 5, (0.22, 0.225, 0.235), 0.62, 0, 0.16)      # кабина
bay_m = (mat == 5) & (cls == 0) & (a > 7.05)
solid(bay_m, (0.62, 0.63, 0.63), 0.62, 0, 0.14); col[bay_m] *= (0.55 + 0.45 * ao2[bay_m])[..., None]      # отсек светлый (f117_09)
solid(cls == 13, (0.60, 0.61, 0.61), 0.6, 0, 0.14); solid((cls == 13) & (mat == 1), (0.40, 0.41, 0.42), 0.42, 0.8); solid((cls == 13) & (mat == 2), (0.10, 0.10, 0.105), 0.7); col[cls == 13] *= (0.55 + 0.45 * ao2[cls == 13])[..., None]
door_in = (cls == 7) & (nz > 0.2) & (z < 0.1); solid(door_in, (0.70, 0.70, 0.68), 0.55, 0, 0.14); solid((cls == 7) & (mat == 5), (0.62, 0.63, 0.62), 0.6)
solid(mat == 6, (0.42, 0.36, 0.26), 0.92, 0, 0.2); solid(mat == 8, (0.30, 0.28, 0.21), 0.9, 0, 0.14); solid(mat == 7, (0.018, 0.038, 0.032), 0.12, 0, 0.0)
hs = ((pos[..., 0] + pos[..., 1] + pos[..., 2]) / 0.035) % 1.0 > 0.5; solid(mat == 9, (0.74, 0.60, 0.06), 0.42); col[(mat == 9) & hs] = np.array((0.035, 0.035, 0.035), np.float32)
solid((mat == 1) & (cls == 11), (0.46, 0.47, 0.48), 0.38, 1.0)
c9 = cls == 9; col[c9 & (mat == 0)] *= 0.86
# решётки, лопатки, щупы: тёмный металл
h_m = (cls == 14) & (mat == 1); solid(h_m, (0.20, 0.205, 0.215), 0.5, 0.7, 0.12)
vanes = (cls == 14) & (mat == 1) & (a > 13); solid(vanes, (0.15, 0.148, 0.142), 0.58, 0.45, 0.12)
tips = (cls == 14) & (mat == 1) & (a < 1.2); solid(tips, (0.30, 0.31, 0.32), 0.4, 0.7)
hb = (cls == 14) & (mat == 0); solid(hb, BASEC * 1.1, 0.42, 0.1, 0.1)
# шасси: высокие светлые стойки, потёртые (f117_07, 12)
gr_ = cls == 12; g_p = gr_ & (mat == 0); g_c = gr_ & (mat == 1); g_s = gr_ & (mat == 8); g_d = gr_ & (mat == 5)
gm1 = fbm(2.4, 2.4, 2.4, 4, 91.0); gm2 = fbm(18.0, 18.0, 18.0, 3, 93.0); gst = fbm(1.0, 16.0, 2.2, 4, 87.0); gst2 = fbm(0.7, 34.0, 1.3, 3, 89.0)
solid(g_p, (0.62, 0.62, 0.60), 0.62, 0, 0.10); solid(g_c, (0.47, 0.47, 0.46), 0.30, 0.85, 0.08); solid(g_s, (0.145, 0.142, 0.14), 0.58, 0.75, 0.14)
solid(g_d, (0.335, 0.35, 0.365), 0.60, 0, 0.10); solid(gr_ & (mat == 9), (0.60, 0.56, 0.40), 0.28, 0, 0.1); solid(gr_ & (mat == 2), (0.05, 0.048, 0.046), 0.72, 0, 0.14)
painted = g_p | g_d; col[painted] *= (0.84 + 0.30 * gm1[painted] + 0.06 * gm2[painted])[..., None]
oil_ = smooth(0.46, 0.68, gst) * (0.5 + 0.5 * smooth(0.40, 0.70, gst2)); col = mix(col, (0.15, 0.125, 0.095), oil_ * 0.52 * (painted | g_c)); rough = rough + oil_ * 0.20 * painted - oil_ * 0.10 * g_c
gd = smooth(-0.45, -1.62, z) * gr_ * (0.45 + 0.55 * smooth(0.36, 0.66, gm1)); col = mix(col, (0.215, 0.195, 0.165), gd * 0.55 * (painted | g_s)); rough = rough + gd * 0.22 * painted
for ac_, xc_, zc_, rw_ in ((3.95, 0.0, -1.31, 0.31), (11.05, 2.03, -1.245, 0.375), (11.05, -2.03, -1.245, 0.375)):
    rd_ = np.hypot(a - ac_, z - zc_); md_ = gr_ & (rd_ < rw_ * 0.68) & (np.abs(x - xc_) < 0.20)
    dust = smooth(rw_ * 0.68, rw_ * 0.10, rd_) * (0.45 + 0.55 * smooth(0.34, 0.62, gm2)) * md_; col = mix(col, (0.115, 0.10, 0.085), dust * 0.72); rough = rough + dust * 0.15
g_e = smooth(0.985, 0.90, bev) * painted * smooth(0.50, 0.62, gm2); col = mix(col, (0.26, 0.255, 0.24), g_e * 0.8)
tyr = mat == 4; rt_ = smooth(0.40, 0.68, gm2) * tyr; col[tyr] = np.array((0.070, 0.070, 0.072), np.float32); col = mix(col, (0.165, 0.158, 0.145), rt_ * 0.50); col = mix(col, (0.20, 0.19, 0.17), smooth(-1.15, -1.62, z) * tyr * 0.45); rough[tyr] = 0.9
col[gr_] *= (0.50 + 0.50 * smooth(0.15, 0.95, ao2[gr_]))[..., None]
# немного затенения в цвете у стыков
col[skin_m] *= (0.95 + 0.05 * ao1[skin_m])[..., None]
rough = np.clip(rough, 0.08, 0.97); metal = np.clip(metal, 0, 1); col = np.clip(col, 0, 1)
for c_ in range(16):
    m_ = (cls == c_) & cov
    if m_.sum() > 500: print('деталь', c_, 'цвет', (col[m_].mean(0) * 255).round(0), 'G', round(float(rough[m_].mean()), 2), 'B', round(float(metal[m_].mean()), 2))
log('материалы')
# ── высота и нормали ──
wav = fbm(1.4, 1.4, 1.4, 2, 79.0); height += (wav - 0.5) * 0.003 * skin_m
shag = fbm(150.0, 150.0, 150.0, 2, 73.0) if S >= 4096 else fbm(70.0, 70.0, 70.0, 2, 73.0); height += (shag - 0.5) * 0.00014 * skin_m
gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * DS); gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / (2 * DS)
nn = np.stack([-gx, -gy, np.ones_like(gx)], -1); nn /= np.linalg.norm(nn, axis=-1, keepdims=True)
solidm = np.isin(mat, (2, 10, 7, 9)) | (cls == 11) | (cls == 12) | (cls == 13) | (cls == 14)
nn[solidm] = (0, 0, 1)


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
occ = np.where(vanes, np.minimum(occ, 0.5), occ)      # лопатки в глубине щели: на солнце не белеют
bleed([col, rough, metal, occ, nn], cov)
def lift(arr): return (np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)
Image.fromarray(lift(col)[::-1]).save(f'{OUT}/f117_color.png', compress_level=1)
Image.fromarray(lift(nn * 0.5 + 0.5)[::-1]).save(f'{OUT}/f117_normal.png', compress_level=1)
orm = np.stack([occ, rough, metal], -1); Image.fromarray(lift(orm)[::-1]).save(f'{OUT}/f117_orm.png', compress_level=1)
print('средний цвет обшивки sRGB', (col[skin_m & cov].mean(0) * 255).round(1), 'шероховатость', round(float(rough[skin_m & cov].mean()), 3))
log('сохранено', OUT)
