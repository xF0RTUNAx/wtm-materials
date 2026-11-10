# _overlay.py - форма на фото: правый борт (снимок _снимки/side_fly.png, орто 18 м на 1800 пикс., центр a = L/2, z = 0.6) на f100_04. /usr/bin/python3 -I _overlay.py
import site, sys, os
sys.path.append(site.getusersitepackages())
from PIL import Image, ImageChops
H = os.path.dirname(os.path.abspath(__file__)); S = H + '/_снимки/'
K = 90.75                                                       # пикс/м на фото 04
LIP_X, AXIS_Y = 1301, 534                                       # кромка заборника и ось сопла на фото
r = Image.open(S + 'рефы/f100_04.png').convert('RGBA'); t = Image.open(S + (sys.argv[1] if len(sys.argv) > 1 else 'side_fly.png')).convert('RGBA'); m = t.width / 18.0
s = K / m; t2 = t.resize((int(t.width * s), int(t.height * s)), Image.LANCZOS)
px0 = t.width / 2 + (13.94 / 2) * m; py0 = t.height / 2 + 0.6 * m      # точка снимка (a=0, z=0)
ox = int(round(LIP_X - px0 * s)); oy = int(round(AXIS_Y - py0 * s))
lay = Image.new('RGBA', r.size, (0, 0, 0, 0)); lay.paste(t2, (ox, oy), t2)
al = lay.split()[3]; red = Image.new('RGBA', r.size, (255, 40, 40, 0)); red.putalpha(al.point(lambda v: int(v * 0.42))); r2 = r.copy(); r2.alpha_composite(red)
# контур модели поверх
ed = al.point(lambda v: 255 if v > 128 else 0); edge = ImageChops.difference(ed, ed.filter(__import__('PIL.ImageFilter', fromlist=['x']).MinFilter(5)))
yel = Image.new('RGBA', r.size, (255, 255, 0, 0)); yel.putalpha(edge); r3 = r.copy(); r3.alpha_composite(yel)
r2.convert('RGB').crop((0, 200, 1441, 680)).save(S + 'наложение_04.jpg', quality=88); r3.convert('RGB').crop((0, 200, 1441, 680)).save(S + 'контур_04.jpg', quality=90)
print('наложение готово')
