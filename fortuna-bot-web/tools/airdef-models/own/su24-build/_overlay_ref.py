# _overlay_ref.py - контур Су-24М сверху (силуэт sil) на чертёж: python3 _overlay_ref.py <чертёж> <sil.png> <x конца конуса> <y оси> <пикс/м> <nose: l|r> <выход> [кроп x0,y0,x1,y1]
# Масштаб - по длине от конца конуса (a 0,88 м) до среза хвоста (20,81 м). Координаты чертежа - в его исходных пикселях.
import sys
from PIL import Image, ImageFilter
import numpy as np
src, sil, tipx, cy, pxm, side, out = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5]), sys.argv[6], sys.argv[7]
L2 = 22.67 / 2; K = 50.0
s = np.asarray(Image.open(sil).convert('L')) < 40
e = s & (np.asarray(Image.fromarray((s * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3))) == 0)
rs, cs = np.nonzero(e); Y = (650 - rs) / K; X = (cs - 650) / K; a = L2 - Y
ref = Image.open(src).convert('RGB'); U = 4; ref = ref.resize((ref.width * U, ref.height * U), Image.LANCZOS); A = np.asarray(ref).copy()
sg = -1 if side == 'r' else 1
rx = ((tipx + sg * (a - 0.88) * pxm) * U).astype(int); ry = ((cy + X * pxm) * U).astype(int)
ok = (rx >= 0) & (rx < A.shape[1] - 1) & (ry >= 0) & (ry < A.shape[0] - 1)
for dx in (0, 1):
    for dy in (0, 1): A[ry[ok] + dy, rx[ok] + dx] = (220, 0, 0)
im = Image.fromarray(A)
if len(sys.argv) > 8: im = im.crop(tuple(int(v) * U for v in sys.argv[8].split(',')))
im.save(out)
