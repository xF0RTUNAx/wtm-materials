# _overlay79.py - контур Су-24М сверху (16°) на чертёж Mark 79 (вид снизу, нос вправо), по длине от конца конуса до среза хвоста. Выход: _снимки/наложение_79.png
import sys
from PIL import Image, ImageFilter
import numpy as np
L2 = 22.67 / 2; K = 50.0
SRC = sys.argv[1] if len(sys.argv) > 1 else '/private/tmp/claude-501/-Users-mark-------------/f2fb5971-da5d-4788-a464-fff39d18d062/images/79.png'
s = np.asarray(Image.open('_снимки/sil_top_16.png').convert('L')) < 40
e = s & (np.asarray(Image.fromarray((s * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3))) == 0)
rs, cs = np.nonzero(e); Y = (650 - rs) / K; X = (cs - 650) / K; a = L2 - Y
ref = Image.open(SRC).convert('RGB'); U = 4; ref = ref.resize((ref.width * U, ref.height * U), Image.LANCZOS); A = np.asarray(ref).copy()
tipx, pxm, cy = 475, 21.9, 190
rx = ((tipx - (a - 0.88) * pxm) * U).astype(int); ry = ((cy + X * pxm) * U).astype(int)
ok = (rx >= 0) & (rx < A.shape[1] - 1) & (ry >= 0) & (ry < A.shape[0] - 1)
for dx in (0, 1):
    for dy in (0, 1): A[ry[ok] + dy, rx[ok] + dx] = (220, 0, 0)
Image.fromarray(A).crop((0, 0, 2120, 1180)).save('_снимки/наложение_79.png')
