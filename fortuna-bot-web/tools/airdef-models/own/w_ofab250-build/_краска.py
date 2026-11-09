# _краска.py - краска ОФАБ-250-270 из данных _данные.py: цвет (без света), нормали, карта блеска glTF (R затенение, G шероховатость, B металл).
# Без Blender: OF_TEX=2048 OF_OUT=<папка> /usr/bin/python3 -I _краска.py. OF_C=r,g,b - серый основы (sRGB 0…1). Пиксели фото не используются, трафареты нарисованы здесь.
import os, site, sys, time, math
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__)); DAT = os.path.join(HERE, '_проба')
S = int(os.environ.get('OF_TEX', '2048')); OUT = os.environ.get('OF_OUT', DAT); os.makedirs(OUT, exist_ok=True)
GREY = np.array([float(v) for v in os.environ.get('OF_C', '0.640,0.660,0.655').split(',')], np.float32)
T0 = time.time(); L2 = 0.74; RB = 0.156
pos = np.load(f'{DAT}/gb_pos_{S}.npy'); nor = np.load(f'{DAT}/gb_nor_{S}.npy'); idd = np.load(f'{DAT}/gb_id_{S}.npy'); aob = np.load(f'{DAT}/gb_ao_{S}.npy')
cov = idd[..., 2] > 0.5; mat = np.round(idd[..., 0] * 8).astype(np.int8); part = np.round(idd[..., 1] * 16).astype(np.int8)     # детали: 1 корпус, 2 взрыватель, 3 ушки, 4 хвост
x, y, z = pos[..., 0], pos[..., 1], pos[..., 2]; a = L2 - y; nx, ny, nz = nor[..., 0], nor[..., 1], nor[..., 2]
ao1, ao2, bev = aob[..., 0], aob[..., 1], aob[..., 2]
DS = 1.48 * 2.2 / S                                             # примерный метр на пиксель атласа


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
    for i in range(octv):
        qa = R3[0, 0] * pa + R3[0, 1] * px + R3[0, 2] * pz; qx = R3[1, 0] * pa + R3[1, 1] * px + R3[1, 2] * pz; qz = R3[2, 0] * pa + R3[2, 1] * px + R3[2, 2] * pz
        pa, px, pz = qa * 2.03, qx * 2.03, qz * 2.03; r = r + w * vnoise(qa + seed + i * 3.1, qx - seed * 0.7, qz + seed * 1.3 + i); tot += w; w *= 0.5
    return r / tot


def mix(c, col_, t):
    t = np.clip(t, 0, 1)[..., None]; return c * (1 - t) + np.asarray(col_, np.float32) * t


paint = (mat == 0)
# ── основа: светло-серая заводская краска, лёгкая неровность тона ──
mott = fbm(6.0, 6.0, 6.0, 4, 1.0); fine = fbm(60.0, 60.0, 60.0, 2, 5.0); patch = fbm(2.5, 2.5, 2.5, 3, 9.0)
col = np.ones(pos.shape, np.float32) * GREY
col *= (1 + (mott - 0.5) * 0.06 + (fine - 0.5) * 0.02)[..., None]
col = np.where((part == 4)[..., None], col * 0.985, col)        # хвост чуть другой партии краски
rough = np.full((S, S), 0.56, np.float32) + (mott - 0.5) * 0.08; metal = np.zeros((S, S), np.float32); height = np.zeros((S, S), np.float32)
# сварные швы валиком: темнее, грубее, рябь (ofab_03)
weld = np.zeros((S, S), np.float32)
for aw, wd in ((0.205, 0.010), (0.560, 0.008), (0.954, 0.010)):
    weld = np.maximum(weld, smooth(wd, wd * 0.3, np.abs(a - aw)) * (part == 1))
rip = 0.5 + 0.5 * np.sin(np.arctan2(z, x) * RB / 0.0045 * 2 * math.pi)
col = mix(col, GREY * 0.86, weld * 0.55); rough += weld * 0.12; height += weld * (rip - 0.5) * 0.0006
# канавки на головном поясе и уступы торца - тень в стыке
crev = smooth(0.75, 0.35, ao1) * paint; col = mix(col, GREY * 0.55, crev * 0.45); rough += crev * 0.12
col *= (0.93 + 0.07 * smooth(0.25, 0.95, ao2))[..., None]
# ── износ: потёртости по кромкам и ушкам, грязь снизу, мелкие сколы, потёки ──
edge = smooth(0.97, 0.80, bev) * paint
chip = edge * smooth(0.50, 0.66, fbm(30.0, 30.0, 30.0, 3, 41.0))
scuff = smooth(0.62, 0.72, fbm(14.0, 14.0, 14.0, 3, 43.0)) * smooth(0.72, 0.80, fbm(3.0, 40.0, 40.0, 2, 47.0)) * paint * 0.6
lugw = (part == 3) * smooth(0.45, 0.70, fbm(25.0, 25.0, 25.0, 3, 51.0)) * 0.7      # ушки: от замков держателя
bare = np.clip(chip * 0.8 + scuff * 0.4 + lugw, 0, 1)
col = mix(col, (0.48, 0.49, 0.50), bare * 0.85); rough = rough * (1 - bare) + 0.34 * bare; metal = np.maximum(metal, smooth(0.35, 0.8, bare) * 0.85)
under = smooth(-0.2, -0.9, nz) * paint; dirt = under * (0.35 + 0.65 * smooth(0.40, 0.70, patch))
col = mix(col, (0.36, 0.35, 0.32), dirt * 0.20); rough += dirt * 0.10
stre = fbm(2.0, 30.0, 4.0, 3, 61.0); streak = smooth(0.62, 0.78, stre) * smooth(0.6, 0.1, np.abs(nz)) * paint
col = mix(col, GREY * 0.78, streak * 0.25); rough += streak * 0.05
grime = smooth(1.00, 1.30, a) * (part == 1) * smooth(0.40, 0.70, patch) * 0.25; col = mix(col, (0.30, 0.30, 0.28), grime)    # конус у хвоста грязнее
# ── трафареты: свои, номера придуманы. Чёрная краска по трафарету, с краями чуть неровными ──
FB = '/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf'; FN = '/System/Library/Fonts/Supplemental/Arial Narrow.ttf'
def text_mask(t, font, H=200):
    f_ = ImageFont.truetype(font, int(H * 0.86)); tmp = ImageDraw.Draw(Image.new('L', (8, 8))); bb = tmp.textbbox((0, 0), t, font=f_); W = bb[2] - bb[0] + 20
    im_ = Image.new('L', (W, H), 0); ImageDraw.Draw(im_).text((W / 2, H / 2), t, font=f_, fill=255, anchor='mm'); return np.asarray(im_, np.float32) / 255.0, W / H
def stamp_side(t, font, ac, zc, Hm, side, ink=(0.10, 0.105, 0.11), alpha=0.92):
    m, asp = text_mask(t, font); Wm = Hm * asp; hp, wp = m.shape
    sel = paint & (part == 1) & (np.sign(x) == side) & (np.abs(nx) > 0.55) & (np.abs(a - ac) < Wm / 2) & (np.abs(z - zc) < Hm / 2)
    u = (a[sel] - ac) / Wm + 0.5
    if side > 0: u = 1 - u                                      # справа читается к носу
    v = 0.5 - (z[sel] - zc) / Hm
    acc = 0.0
    for du, dv in ((-0.3, -0.3), (0.3, -0.3), (-0.3, 0.3), (0.3, 0.3), (0, 0)):
        acc = acc + m[np.clip(((v + dv * DS / Hm) * hp).astype(int), 0, hp - 1), np.clip(((u + du * DS / Wm) * wp).astype(int), 0, wp - 1)]
    al = acc / 5 * alpha * (0.85 + 0.15 * smooth(0.3, 0.6, fine[sel])) * (1 - 0.6 * bare[sel])
    col[sel] = col[sel] * (1 - al[..., None]) + np.asarray(ink, np.float32) * al[..., None]; rough[sel] += al * 0.04
for sd in (1, -1):
    stamp_side('ОФАБ-250-270', FB, 0.505, 0.030, 0.060, sd)
    stamp_side('ТГ-20   4-83-117', FN, 0.505, -0.022, 0.026, sd, alpha=0.85)      # придуманная партия
    stamp_side('ВЗР. АВУ-ЕТ', FN, 0.505, -0.052, 0.022, sd, alpha=0.80)
    stamp_side('1983', FN, 0.120, 0.000, 0.026, sd, alpha=0.80)                    # год на головном поясе
# ── взрыватель: красный колпак, глянец, тёмное гнездо ──
fz = part == 2; col[fz] = (np.array((0.66, 0.09, 0.07), np.float32) * (0.92 + 0.10 * mott[fz])[..., None]); rough[fz] = 0.32; metal[fz] = 0.0
dk = mat == 2; col[dk] = (0.05, 0.05, 0.05); rough[dk] = 0.8
rough = np.clip(rough, 0.1, 0.95); col = np.clip(col, 0, 1)
# ── высота и нормали: шагрень краски, рябь швов ──
height += (fbm(300.0, 300.0, 300.0, 2, 73.0) - 0.5) * 0.00012 * paint + (fbm(20.0, 20.0, 20.0, 2, 79.0) - 0.5) * 0.0006 * paint
gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * DS); gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / (2 * DS)
nn = np.stack([-gx, -gy, np.ones_like(gx)], -1); nn /= np.linalg.norm(nn, axis=-1, keepdims=True); nn[~paint] = (0, 0, 1)
occ = np.clip(0.40 + 0.60 * smooth(0.10, 0.92, ao2) * smooth(0.25, 0.90, ao1), 0, 1)
def bleed(arrs, mask, n=10):
    m = mask.copy()
    for _ in range(n):
        w_ = m.astype(np.float32); W_ = np.roll(w_, 1, 0) + np.roll(w_, -1, 0) + np.roll(w_, 1, 1) + np.roll(w_, -1, 1); new = (~m) & (W_ > 0)
        if not new.any(): break
        for A_ in arrs:
            ex = A_ if A_.ndim == 3 else A_[..., None]
            s_ = (np.roll(ex * w_[..., None], 1, 0) + np.roll(ex * w_[..., None], -1, 0) + np.roll(ex * w_[..., None], 1, 1) + np.roll(ex * w_[..., None], -1, 1)) / np.maximum(W_, 1)[..., None]
            ex[new] = s_[new]
        m |= new
bleed([col, rough, metal, occ, nn], cov)
lift = lambda arr: (np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)
Image.fromarray(lift(col)[::-1]).save(f'{OUT}/ofab_color.png', compress_level=1)
Image.fromarray(lift(nn * 0.5 + 0.5)[::-1]).save(f'{OUT}/ofab_normal.png', compress_level=1)
Image.fromarray(lift(np.stack([occ, rough, metal], -1))[::-1]).save(f'{OUT}/ofab_orm.png', compress_level=1)
pm = cov & (part == 1)
print('средний цвет корпуса sRGB', (col[pm].mean(0) * 255).round(1), 'шероховатость', round(float(rough[pm].mean()), 3), 'за', round(time.time() - T0, 1), 'с')
