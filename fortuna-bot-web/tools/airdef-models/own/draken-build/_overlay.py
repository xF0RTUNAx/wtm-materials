# _overlay.py - контур модели (красный) на чертеже 09 и фото 07, 03. /usr/bin/python3 -I _overlay.py
import os, site, sys, math
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image, ImageDraw, ImageFont
H = os.path.dirname(os.path.abspath(__file__)); S = H + '/_снимки/'; R = H + '/референсы/'
K, W, L = 60.0, 20.0, 15.35
def edge(name):
    a = np.asarray(Image.open(S + name))[..., 3] > 30
    e = a & ~(np.roll(a, 1, 0) & np.roll(a, -1, 0) & np.roll(a, 1, 1) & np.roll(a, -1, 1)); ys, xs = np.nonzero(e)
    return (xs + 0.5) / K - W / 2, W / 2 - (ys + 0.5) / K                 # координаты в плоскости кадра, м
def draw(img, pts, out, title, k=3):
    im = img.convert('RGB'); im = im.resize((im.width * k, im.height * k), Image.LANCZOS); d = ImageDraw.Draw(im)
    for u, v in pts: d.point((u * k, v * k), fill=(230, 20, 20))
    d.text((10, 10), title, fill=(200, 0, 0), font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 26)); im.save(S + out, quality=90); print(out, im.size)
# сверху: камера над моделью, вправо в кадре = +X мира (правое крыло), вверх в кадре = +Y мира (нос)
tx, ty = edge('sil_top.png'); a_t = L / 2 - ty; x_t = tx
# сбоку (справа): вправо в кадре = +Y мира (к носу), вверх = +Z
sx_, sy_ = edge('sil_side.png'); a_s = L / 2 - sx_; z_s = sy_
im9 = Image.open(R + 'draken_09.png')
# 09 сверху: острие ПВД (30, 283), нос влево, 28,4 пикс/м по длине; правое крыло - вниз в кадре
d9 = 436 / L
draw(im9, [(30 + a * d9, 283 + x * d9) for a, x in zip(a_t, x_t)] + [(30 + a * d9, 83 - (z) * d9 - 0.0) for a, z in zip(a_s, z_s)], 'наложение_09.jpg', 'красное - модель, масштаб по длине 15,35 м')
# 07 снизу: острие обтекателя (95, 455), ось к хвосту под 2,7°, 100,6 пикс/м вдоль, 108 пикс/м поперёк; правое крыло (снизу смотрим) - вверх в кадре
im7 = Image.open(R + 'draken_07.webp'); sk = im7.width / 1600.0; c, s = math.cos(math.radians(2.7)), math.sin(math.radians(2.7))
pts = []
for a, x in zip(a_t, x_t):
    u = (a - 0.77) * 100.6; v = -x * 108.0; pts.append(((95 + u * c - v * s) * sk, (455 + u * s + v * c) * sk))
draw(im7, pts, 'наложение_07.jpg', 'красное - модель (план)', 1)
# 03 сбоку: острие обтекателя (190, 383), ось вниз к хвосту под 8,1°, 87,4 пикс/м
im3 = Image.open(R + 'draken_03.webp'); sk = im3.width / 1600.0; c, s = math.cos(math.radians(8.1)), math.sin(math.radians(8.1))
pts = []
for a, z in zip(a_s, z_s):
    u = (a - 0.77) * 87.4; v = -z * 87.4; pts.append(((190 + u * c - v * s) * sk, (383 + u * s + v * c) * sk))
draw(im3, pts, 'наложение_03.jpg', 'красное - модель (сбоку), на фото двухместный Sk 35C', 1)
