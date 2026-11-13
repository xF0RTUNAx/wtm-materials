# _ov01.py - контур модели на чертёж 01 (МиГ-27К): бок (нос влево) и план (нос влево). Масштаб чертежа: от острия ПВД до заднего края 536 пикс = 17,08 м (длина прежней модели в игре).
# Выход: _снимки/наложение_01_бок.png, _снимки/наложение_01_план.png (чертёж увеличен в U раз).
import sys
from PIL import Image, ImageFilter
import numpy as np
K = 60.0; U = 3; PXM = 536 / 17.08
REF = Image.open('референсы/01.png').convert('RGB')
def edge(f):
    a = np.asarray(Image.open(f))[..., 3] > 40
    e = a & (np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3))) == 0); return a, e
def put(A, xs, ys, col=(220, 0, 0)):
    ok = (xs >= 0) & (xs < A.shape[1] - 1) & (ys >= 0) & (ys < A.shape[0] - 1)
    for dx in (0, 1):
        for dy in (0, 1): A[ys[ok] + dy, xs[ok] + dx] = col
R = REF.resize((REF.width * U, REF.height * U), Image.LANCZOS)
# бок: у силуэта нос справа (x_max = острие), верх - меньше y; на чертеже нос слева, острие x=11, ось (z=0) подбирается: SIDE_Z0
a, e = edge('_снимки/sil_side.png'); ys, xs = np.nonzero(a); tipx = xs.max(); rr, cc = np.nonzero(e)
SIDE_Z0 = float(sys.argv[1]) if len(sys.argv) > 1 else 205.0          # y чертежа (исходные пиксели) для z = 0 модели
zc = 600                                                               # строка силуэта для z = 0 (центр кадра)
A = np.asarray(R).copy()
put(A, ((11 + (tipx - cc) / K * PXM) * U).astype(int), ((SIDE_Z0 + (rr - zc) / K * PXM) * U).astype(int))
Image.fromarray(A).crop((0, 80 * U, 556 * U, 260 * U)).save('_снимки/наложение_01_бок.png')
# план: силуэт сверху - нос снизу (y_max), правое крыло - справа? на чертеже нос слева, ось y=PLAN_Y0
a, e = edge('_снимки/sil_top.png'); ys, xs = np.nonzero(a); tipy = ys.min(); rr, cc = np.nonzero(e)
PLAN_Y0 = float(sys.argv[2]) if len(sys.argv) > 2 else 443.0
A = np.asarray(R).copy()
put(A, ((7 + (rr - tipy) / K * PXM) * U).astype(int), ((PLAN_Y0 + (cc - 600) / K * PXM) * U).astype(int))
Image.fromarray(A).crop((0, 225 * U, 556 * U, 552 * U)).save('_снимки/наложение_01_план.png')
print('готово')
