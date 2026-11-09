# _overlay.py - форма на фото: бок на se_12, сверху на выпрямленный se_11. /usr/bin/python3 -I _overlay.py
import site, sys, os
sys.path.append(site.getusersitepackages())
from PIL import Image
H = os.path.dirname(os.path.abspath(__file__)); S = H + '/_снимки/'
def side(n, sc, nx, ny, kk, ang=0.0, out=None, zn=0.47):
    r = Image.open(S + f'рефы/{n}.png').convert('RGBA'); r = r.resize((int(r.width * sc), int(r.height * sc)), Image.LANCZOS)
    t = Image.open(S + 'side_r.png').convert('RGBA').transpose(Image.FLIP_LEFT_RIGHT); k = kk / 100.0; t2 = t.resize((int(t.width * k), int(t.height * k)), Image.LANCZOS)
    ox = int(nx - (t.width / 2 - 7.155 * 100) * k); oy = int(ny - (t.height / 2 + (0.5 - zn) * 100) * k)
    lay = Image.new('RGBA', r.size, (0, 0, 0, 0)); lay.paste(t2, (ox, oy), t2)
    if ang: lay = lay.rotate(ang, center=(nx, ny), resample=Image.BICUBIC)
    al = lay.split()[3]; red = Image.new('RGBA', r.size, (255, 40, 40, 0)); red.putalpha(al.point(lambda v: int(v * 0.45))); r.alpha_composite(red); r.convert('RGB').save(S + out, quality=88)
side('se_12', 2.0, 50, 528, 110, out='наложение_12.jpg')
side('se_02', 1.0, 1570, 415, 89, ang=-1.5, out='наложение_02.jpg') if False else None
if os.path.exists(S + 'rect_11.jpg'):
    r = Image.open(S + 'rect_11.jpg').convert('RGBA'); t = Image.open(S + 'top.png').convert('RGBA'); k = 80 / 100.0; t2 = t.resize((int(t.width * k), int(t.height * k)), Image.LANCZOS); t3 = t2.rotate(-90, expand=True); ox = int(r.width / 2 - t3.width / 2); oy = int(40 - (t3.height / 2 - 7.155 * 80))
    lay = Image.new('RGBA', r.size, (0, 0, 0, 0)); lay.paste(t3, (ox, oy), t3); lay.putalpha(lay.split()[3].point(lambda v: int(v * 0.5))); r.alpha_composite(lay); r.convert('RGB').save(S + 'наложение_верх.jpg', quality=88)
print('наложения готовы')
