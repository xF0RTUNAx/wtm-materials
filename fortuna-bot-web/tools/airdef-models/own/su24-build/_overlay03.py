# _overlay03.py - контур модели (красный) на чертеже 03 (48 пикс/м): вид сверху при 69° (sil_top_69), снизу при 16° (sil_top_16), сбоку с шасси (sil_side). /usr/bin/python3 -I _overlay03.py
import os, site, sys
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image, ImageDraw, ImageFont
H = os.path.dirname(os.path.abspath(__file__)); S = H + '/_снимки/'; R = H + '/референсы/'
K, W, L = 50.0, 26.0, 22.67
PX = 46.2                                                           # пикс/м чертежа по настоящим размерам (линейка 03 даёт 48, см. su_geo.SCL)
def edge(name):
    a = np.asarray(Image.open(S + name))[..., 3] > 30
    e = a & ~(np.roll(a, 1, 0) & np.roll(a, -1, 0) & np.roll(a, 1, 1) & np.roll(a, -1, 1)); ys, xs = np.nonzero(e)
    return (xs + 0.5) / K - W / 2, W / 2 - (ys + 0.5) / K
img = Image.open(R + 'su24_03.webp').convert('RGB'); k = 2; im = img.resize((img.width * k, img.height * k), Image.LANCZOS); d = ImageDraw.Draw(im)
def put(pts, col=(230, 20, 20)):
    for u, v in pts: d.rectangle((u * k - 1, v * k - 1, u * k + 1, v * k + 1), fill=col)
tx, ty = edge('sil_top_69.png'); a_ = L / 2 - ty; put([(156 + a * PX, 565 - x * PX) for a, x in zip(a_, tx) if x > -0.3])          # сверху, нос влево, верхняя половина
tx, ty = edge('sil_top_16.png'); a_ = L / 2 - ty; put([(1156 - a * PX, 1036 - x * PX) for a, x in zip(a_, tx) if x > -0.3])         # снизу, нос вправо
sx_, sy_ = edge('sil_side.png'); a_ = L / 2 - sx_; put([(1163 - a * PX, 1466 - z * PX) for a, z in zip(a_, sy_)])                  # сбоку, нос вправо
im.save(S + 'наложение_03.jpg', quality=88); print('наложение_03.jpg', im.size)
for nm, box in (('наложение_03_верх.jpg', (100, 290, 1210, 800)), ('наложение_03_низ.jpg', (140, 590, 1210, 1310)), ('наложение_03_бок.jpg', (100, 1260, 1210, 1570))):
    im.crop(tuple(v * k for v in box)).save(S + nm, quality=88)
# вид спереди (03, справа внизу): центр x 957, земля y 1390; консоли на чертеже сложены (69°) - снимок sil_front при файле
img2 = Image.open(R + 'su24_03.webp').convert('RGB').crop((690, 1080, 1225, 1400)); k2 = 3; im2 = img2.resize((img2.width * k2, img2.height * k2), Image.LANCZOS); d2 = ImageDraw.Draw(im2)
fx, fz = edge('sil_front.png'); AXT = 1.94 * 48 / 46.2
for x, z in zip(fx, fz):
    u = (957 + x * PX - 690) * k2; v = (1390 - (z + AXT) * PX - 1080) * k2; d2.rectangle((u - 1, v - 1, u + 1, v + 1), fill=(230, 20, 20))
im2.save(S + 'наложение_03_спереди.jpg', quality=88); print('наложение_03_спереди.jpg')
