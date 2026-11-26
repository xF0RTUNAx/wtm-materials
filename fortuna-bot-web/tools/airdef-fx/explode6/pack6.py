# Листы взрыва для света в игре: проходы render6.py → games/airdef/fx/ex6_<тип>_a|b[_lo].ktx2 + запись в games/airdef/fx/explode6.json.
#   blender -b --factory-startup -P pack6.py -- <тип> <папка проходов> [клетка px = 384] [ref]
# a: R - свет справа, G - слева, B - сверху, A - прозрачность; b: R - снизу, G - сзади (просвет), B - цвет симуляции (0 сажа … 1 пыль), A - накал.
# Свет - без умножения на прозрачность, общий масштаб на весь взрыв (lmax), корень для точности тёмных мест. Края кадра растворяются (11 %, по кривой): облако, вышедшее за кадр съёмки, не обрывается прямой.
import OpenImageIO as oiio, numpy as np, sys, os, glob, json, subprocess, tempfile
a = sys.argv[sys.argv.index('--') + 1:]
kind, d = a[0], a[1]; CELL = int(a[2]) if len(a) > 2 else 384; ref = float(a[3]) if len(a) > 3 else 0
CLUMP = 'clump' in a[4:]; GROUND = 'ground' in a[4:]  # ground - клуб пыли у земли: низ - по линии земли (срез пола растворяется), не вращается  # клуб для роя (воздушный шар без земли): без среза по линии земли, рамка - квадрат по центру
FX = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../games/airdef/fx'))
meta = json.load(open(os.path.join(d, 'meta.json'))); frames = [f for f in meta['frames'] if os.path.exists(os.path.join(d, f'{f:03d}_alb.exr'))]
def box(x, k):  # размытие квадратом (2k+1) по двум осям, края - повтор
    for ax in (0, 1):
        c = np.cumsum(np.pad(x, [(k + 1, k) if i == ax else (0, 0) for i in range(2)], mode='edge'), axis=ax)
        x = (np.take(c, range(2 * k + 1, c.shape[ax]), axis=ax) - np.take(c, range(0, c.shape[ax] - 2 * k - 1), axis=ax)) / (2 * k + 1)
    return x
def unpre(v, al, k=4):  # свет без умножения на прозрачность: на тонком краю делить на малую альфу - яркие точки и светлый контур (Mark 2026-11-26),
    # поэтому край берёт свет соседей по плотности (нормированная свёртка), в густом - как есть
    pre = v * al; sm = box(pre, k) / np.maximum(box(al, k), 1e-4); w = np.clip((al - 0.08) / 0.5, 0, 1) ** 1.5
    return sm * (1 - w) + (pre / np.maximum(al, 0.02)) * w
def rd(f):
    i = oiio.ImageInput.open(f); x = i.read_image(oiio.FLOAT); i.close(); return x
P = []
for f in frames:
    E = {m: rd(os.path.join(d, f'{f:03d}_{m}.exr')) for m in ('rt', 'lf', 'up', 'dn', 'bk', 'heat', 'alb')}
    al = np.clip(E['rt'][..., 3], 0, 1)
    a0 = al; al = np.clip(0.75 * al + 0.25 * box(al, 2), 0, 1) if CLUMP else np.clip(0.3 * al + 0.7 * box(al, 5), 0, 1) ** 1.1  # клуб: фактура края - главное (рваный край даёт игра шумом и наложением клубов)  # край облака мягче: у симуляции граница плотности резкая (Mark 2026-11-26: «чёткие границы»)
    L = [unpre(E[m][..., :3].mean(-1) / np.maximum(a0, 1e-4), a0) for m in ('rt', 'lf', 'up', 'dn', 'bk')]  # EXR - с умножением на альфу
    P.append((al, L, E['heat'][..., :3].mean(-1), box(unpre(E['alb'][..., :3].mean(-1) / np.maximum(a0, 1e-4), a0), 9)))  # доля пыли - сглажена: крапинки сажи давали пятнистую «леопардовую» юбку
lm = float(np.percentile(np.concatenate([np.concatenate([l[al > 0.1] for l in L]) for al, L, h, b in P if (al > 0.1).any()]), 99.7))
hk = float(np.percentile(np.concatenate([h[h > 0.05] for al, L, h, b in P if (h > 0.05).any()] or [np.ones(1)]), 90))
bl = np.concatenate([b[al > 0.3] for al, L, h, b in P if (al > 0.3).any()]); b0, b1 = float(np.percentile(bl, 2)), float(np.percentile(bl, 98))
print(kind, 'кадров', len(frames), 'свет 99,7 %', round(lm, 3), 'накал 90 %', round(hk, 3), 'цвет', round(b0, 3), round(b1, 3), flush=True)
# обрезка по облаку (Mark 2026-11-26, «мыльно»): облако за весь взрыв занимает лишь часть кадра съёмки - кадры режутся по общей рамке
# (прозрачность > 0,02 хоть в одном кадре) с запасом 4 %, низ - не выше линии земли + 3 %; клетка листа - пропорции рамки
S0 = P[0][0].shape[0]; U = np.zeros((S0, S0), bool)
for al, L, h, b in P: U |= al > (0.1 if CLUMP else 0.02)  # клуб: слабая дымка у краёв съёмки раздувала рамку - клуб занимал треть клетки
ys, xs = np.where(U); m = int(0.04 * S0)
x0, x1 = max(0, xs.min() - m), min(S0, xs.max() + m + 1); y0 = max(0, ys.min() - m); y1 = min(S0, max(ys.max() + m + 1, int(meta['anchor'][1] * S0 + 0.03 * S0)))
if CLUMP and 'notail' not in a[4:]:  # квадрат вокруг центра облака: клуб вращается в игре - рамка без вытянутости
    cx, cy = (xs.min() + xs.max()) // 2, (ys.min() + ys.max()) // 2; hw = max(xs.max() - xs.min(), ys.max() - ys.min()) // 2 + m
    x0, x1, y0, y1 = max(0, cx - hw), min(S0, cx + hw + 1), max(0, cy - hw), min(S0, cy + hw + 1)
P = [(al[y0:y1, x0:x1], [l[y0:y1, x0:x1] for l in L], h[y0:y1, x0:x1], b[y0:y1, x0:x1]) for al, L, h, b in P]
if CLUMP:  # одиночные струи (быстрая частица выброса тянет «хвост»): в рое повторялись иглами - всё дальше основного шара растворяется
    def tail(al):
        m = al > 0.3
        if not m.any(): return al
        yy0, xx0 = np.mgrid[0:al.shape[0], 0:al.shape[1]]; w = al * m; cy0 = (w * yy0).sum() / w.sum(); cx0 = (w * xx0).sum() / w.sum()
        r0 = np.sqrt(m.sum() / np.pi); d = np.hypot(yy0 - cy0, xx0 - cx0)
        return al * np.clip((1.25 * r0 - d) / (0.25 * r0), 0, 1) ** 1.5
    if 'notail' not in a[4:]: P = [(tail(al), L, h * (tail(al) > 0), b) for al, L, h, b in P]  # notail - всплывающий клуб: ножка снизу - часть столба
CW, CH = x1 - x0, y1 - y0; print('рамка облака', x0, x1, y0, y1, 'из', S0, flush=True)
S = CH; yy, xx = np.mgrid[0:CH, 0:CW]; edge = (np.clip(np.minimum(xx, CW - 1 - xx) / (0.06 * CW), 0, 1) * np.clip(yy / (0.06 * CH), 0, 1)) ** 1.5  # рамка уже по облаку: края растворяются узко  # бока и низ - 20 %: пыль, ушедшая за кадр съёмки, тает, а не обрывается прямой  # низ кадра - шире (20 %): юбка пыли у края съёмки не обрывается прямой
# пол симуляции: пыль лежит на плоскости ровным срезом - в игре земля с ней не совпадает, срез виден прямой линией (Mark 2026-11-26) - низ облака
# над линией земли листа (anchor) растворяется на 4 % высоты кадра (с 1 % ниже линии: юбка пыли не отрывается от земли)
gy = meta['anchor'][1] * S0 - y0
if not CLUMP or GROUND: edge = edge * np.clip((gy + 0.01 * S0 - yy) / (0.04 * S0), 0, 1) ** 1.2
else: edge = edge * np.clip((CH - 1 - yy) / (0.08 * CH), 0, 1) ** 1.5  # клуб: низ кадра тоже растворяется (облако клуба расползается и вниз)
COLS = 8; ROWS = (len(frames) + COLS - 1) // COLS; tmp = tempfile.mkdtemp()
def save(img, fn):
    o = oiio.ImageOutput.create(fn); o.open(fn, oiio.ImageSpec(img.shape[1], img.shape[0], 4, 'uint8')); o.write_image(np.ascontiguousarray(img)); o.close()
asp = CW / CH
for suf, c in (('', CELL), ('_lo', CELL // 2)):
    cw = int(round(c * min(asp, 1.6) / 4) * 4) if asp < 1 else c; ch = c if asp < 1 else int(round(c / asp / 4) * 4)
    SA = np.zeros((ROWS * ch, COLS * cw, 4), np.uint8); SB = np.zeros_like(SA)
    for i, (al, L, h, b) in enumerate(P):
        enc = lambda x: np.sqrt(np.clip(x / lm, 0, 1))
        A = np.stack([enc(L[0]), enc(L[1]), enc(L[2]), al * edge], -1)
        B = np.stack([enc(L[3]), enc(L[4]), np.clip((b - b0) / max(b1 - b0, 1e-3), 0, 1), 1 - np.exp(-h / max(hk, 1e-3))], -1)
        for X, T in ((A, SA), (B, SB)):
            ib = oiio.ImageBuf(np.ascontiguousarray(X.astype(np.float32))); rs = oiio.ImageBufAlgo.resize(ib, roi=oiio.ROI(0, cw, 0, ch, 0, 1, 0, 4))
            r, q = divmod(i, COLS); T[r * ch:(r + 1) * ch, q * cw:(q + 1) * cw] = (np.clip(rs.get_pixels(oiio.FLOAT), 0, 1) * 255 + 0.5).astype(np.uint8)
    for nm, T in (('a', SA), ('b', SB)):
        png = os.path.join(tmp, f'{nm}{suf}.png'); save(T, png)
        subprocess.run(['basisu', '-ktx2', '-uastc', '-uastc_level', '2', '-uastc_rdo_l', '1.0', '-ktx2_zstandard_level', '18', '-mipmap', '-linear', '-y_flip', png, '-output_file', os.path.join(FX, f'ex6_{kind}_{nm}{suf}.ktx2')], check=True, stdout=subprocess.DEVNULL)
# последний кадр, где облако ещё в кадре съёмки: доля плотного дыма в верхних 10 % и по бокам 8 % - мала (дальше игра его растягивает и поднимает сама)
last = len(P) - 1
for i, (al, L, h, b) in enumerate(P):
    if max([float(al[-S // 25:].max())] if CLUMP and not GROUND else [float(al[:S // 10].max()), float(al[:, :S // 12].max()), float(al[:, -S // 12:].max())]) > 0.35: last = max(1, i - 1); break
print('последний целый кадр', last, 'из', len(P) - 1, flush=True)
J = os.path.join(FX, 'explode6.json'); allJ = json.load(open(J)) if os.path.exists(J) else {}
old = json.load(open(os.path.join(FX, 'explode.json'))).get(kind, {})
allJ[kind] = {'cols': COLS, 'rows': ROWS, 'frames': len(frames), 'times': [round((f - frames[0]) / meta['fps'], 4) for f in frames], 'width': meta['ortho'] * CW / S0, 'height': meta['ortho'] * CH / S0,
              'anchor': [round((meta['anchor'][0] * S0 - x0) / CW, 4), round((meta['anchor'][1] * S0 - y0) / CH, 4)], 'ref': ref or old.get('ref', 0), 'cell': CELL, 'last': last}
json.dump(allJ, open(J, 'w'), indent=1)
print('готово', kind, [round(os.path.getsize(os.path.join(FX, f'ex6_{kind}_{n}{s}.ktx2')) / 1048576, 2) for n in 'ab' for s in ('', '_lo')], flush=True)
