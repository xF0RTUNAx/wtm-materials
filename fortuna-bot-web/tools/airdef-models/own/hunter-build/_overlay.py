# _overlay.py - форма на фото: бок (снимок _снимки/q/side.png, орто 15 м на 1600 пикс., центр a=7, z=1.85) на hunter_01. /usr/bin/python3 -I _overlay.py
import site, sys, os
sys.path.append(site.getusersitepackages())
from PIL import Image
H = os.path.dirname(os.path.abspath(__file__)); S = H + '/_снимки/'
KX, KY = 101.8, 108.0                                           # пикс/м на фото 01 по длине и по высоте
r = Image.open(S + 'рефы/hunter_01.png').convert('RGBA'); t = Image.open(S + ('side_l.png' if os.path.exists(S + 'side_l.png') else 'q/side.png')).convert('RGBA'); m = t.width / 15.0
t2 = t.resize((int(t.width * KX / m), int(t.height * KY / m)), Image.LANCZOS)
# точка снимка (a=0, z=1.445) -> фото (30, 545)
px0 = t.width / 2 - 7.0 * m; py0 = t.height / 2 - (1.445 - 1.85) * m
ox = int(30 - px0 * KX / m); oy = int(545 - py0 * KY / m)
lay = Image.new('RGBA', r.size, (0, 0, 0, 0)); lay.paste(t2, (ox, oy), t2)
al = lay.split()[3]; red = Image.new('RGBA', r.size, (255, 40, 40, 0)); red.putalpha(al.point(lambda v: int(v * 0.42))); r.alpha_composite(red); r.convert('RGB').save(S + 'наложение_01.jpg', quality=88)
print('наложение готово')
