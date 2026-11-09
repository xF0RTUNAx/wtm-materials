# _rectify.py - вид снизу из f18c_10 проективным выпрямлением: опорные точки в плоскости самолёта (a, x). /usr/bin/python3 -I _rectify.py
import site, sys, os
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image, ImageDraw
H = os.path.dirname(os.path.abspath(__file__)); S = H + '/_снимки/'; RF = S + 'рефы/'
K = 80.0; W, Hh = int(11 * K), int(16 * K)
def plan2px(x, a): return (W / 2 + x * K, 40 + a * K)
def homog(src, dst):
    A = []
    for (x, y), (u, v) in zip(src, dst):
        A += [[x, y, 1, 0, 0, 0, -u * x, -u * y, -u], [0, 0, 0, x, y, 1, -v * x, -v * y, -v]]
    _, _, Vt = np.linalg.svd(np.array(A, float)); return Vt[-1].reshape(3, 3)
AT = float(os.environ.get('AT', '10.0'))
pts = [(-4.80, AT, 13, 512), (4.80, AT, 968, 788), (0, 12.86, 450, 688), (0, 2.62, 672, 262)]
src = [plan2px(p[0], p[1]) for p in pts]; dst = [(p[2], p[3]) for p in pts]
Hm = homog(src, dst); c = (Hm / Hm[2, 2]).flatten()[:8].tolist()
im = Image.open(RF + 'se_11.png').convert('RGB').transform((W, Hh), Image.PERSPECTIVE, c, Image.BICUBIC); d = ImageDraw.Draw(im)
for a in range(0, 16):
    y = 40 + a * K; d.line([(0, y), (W, y)], fill=(255, 40, 40)); d.text((4, y), str(a), fill=(255, 255, 0))
for x in range(-5, 6):
    xx = W / 2 + x * K; d.line([(xx, 0), (xx, Hh)], fill=(40, 255, 255)); d.text((xx + 2, 4), str(abs(x)), fill=(255, 255, 0))
im.save(S + 'rect_11.jpg', quality=90); print(im.size)
