"""Числовые измерения силуэта чертежа — вместо снятия координат на глаз с grid.py (уровень 1: измерения).

  /usr/bin/python3 -I measure.py <чертёж.png> [--step 20] [--x0 N] [--x1 N]

Силуэт — как в compare.py: всё, что недостижимо заливкой от краёв по светлым пикселям (линии внутри контура не мешают). Печатает: габариты силуэта, центр масс,
наибольший радиус от центра масс (на виде спереди/сзади — вылет кончиков крыльев), для каждой N-й колонки x — верхний и нижний край, середину и полувысоту
(на виде сбоку верх/низ — огибающая вместе с крыльями; плато полувысоты перед крыльями — радиус корпуса) и самые частые полувысоты. Координаты — в пикселях чертежа:
x вправо, y вниз, начало в левом верхнем углу изображения; пиксель с номером k занимает [k, k+1], середина кадра — (ширина/2, высота/2). Нужны Pillow и numpy.
"""
import sys, site
sys.path.append(site.getusersitepackages())
from PIL import Image, ImageDraw
import numpy as np
from collections import Counter


def ref_mask(path):
    im = Image.open(path).convert('L')
    b = im.point(lambda v: 255 if v > 190 else 0)
    W, H = b.size
    for pt in [(0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1), (W // 2, 0), (W // 2, H - 1)]:
        if b.getpixel(pt) == 255: ImageDraw.floodfill(b, pt, 128)
    return np.array(b) != 128


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a: print(__doc__); sys.exit(1)
    opt = lambda n, d: int(a[a.index('--' + n) + 1]) if '--' + n in a else d
    m = ref_mask(a[0]); H, W = m.shape; ys, xs = np.nonzero(m)
    if not len(xs): raise SystemExit('силуэт пуст: проверь, что чертёж на светлом фоне')
    cx, cy = xs.mean(), ys.mean(); rmax = float(np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2).max())
    print(f'файл {a[0].split("/")[-1]}: {W} × {H}; силуэт x {xs.min()}…{xs.max()}, y {ys.min()}…{ys.max()}; центр масс ({cx:.1f}, {cy:.1f}); наибольший радиус от центра масс {rmax:.1f}')
    print(f'середина силуэта: x {(xs.min() + xs.max() + 1) / 2:.1f}, y {(ys.min() + ys.max() + 1) / 2:.1f}')
    step, x0, x1 = opt('step', 20), opt('x0', int(xs.min())), opt('x1', int(xs.max()))
    rows, halves = [], []
    for x in range(x0, x1 + 1, step):
        col = np.nonzero(m[:, x])[0]
        if not len(col): continue
        top, bot = int(col.min()), int(col.max()) + 1
        rows.append((x, top, bot, (top + bot) / 2, (bot - top) / 2)); halves.append(round((bot - top) / 2))
    print('x:  верх  низ  середина  полувысота')
    for x, t, b_, mid, hh in rows: print(f'{x:5d} {t:5d} {b_:5d} {mid:8.1f} {hh:9.1f}')
    print('самые частые полувысоты (пикс. : колонок):', ', '.join(f'{v}: {c}' for v, c in Counter(halves).most_common(5)))
