# _ov01.py - контур МиГ-25БМ на чертёж 01 Mark: бок (нос вправо) и план (нос вправо). 33,4 пикс/м (размах 14,02 м). Совмещение - по острию ПВД.
import sys
from PIL import Image, ImageFilter
import numpy as np
K = 50.0; U = 2; PXM = 33.4; TIPX = 947.5; SIDE_Z0 = float(sys.argv[1]) if len(sys.argv) > 1 else 128.0; PLAN_Y0 = 452.0
REF = Image.open('референсы/01.png').convert('RGB')
def edge(f):
    a = np.asarray(Image.open(f))[..., 3] > 40
    return a, a & (np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3))) == 0)
def put(A, xs, ys):
    ok = (xs >= 0) & (xs < A.shape[1] - 1) & (ys >= 0) & (ys < A.shape[0] - 1)
    for dx in (0, 1):
        for dy in (0, 1): A[ys[ok] + dy, xs[ok] + dx] = (220, 0, 0)
R = REF.resize((REF.width * U, REF.height * U), Image.LANCZOS); C = int(K * 26 / 2)
a, e = edge('_снимки/sil_side.png'); ys, xs = np.nonzero(a); tip = xs.max(); rr, cc = np.nonzero(e)
A = np.asarray(R).copy(); put(A, ((TIPX - (tip - cc) / K * PXM) * U).astype(int), ((SIDE_Z0 + (rr - C) / K * PXM) * U).astype(int))
Image.fromarray(A).crop((150 * U, 0, 960 * U, 210 * U)).save('_снимки/наложение_01_бок.png')
a, e = edge('_снимки/sil_top.png'); ys, xs = np.nonzero(a); tip = ys.min(); rr, cc = np.nonzero(e)
A = np.asarray(R).copy(); put(A, ((TIPX - (rr - tip) / K * PXM) * U).astype(int), ((PLAN_Y0 + (cc - C) / K * PXM) * U).astype(int))
Image.fromarray(A).crop((150 * U, 200 * U, 960 * U, 704 * U)).save('_снимки/наложение_01_план.png')
print('ok')
