# _overlay.py - контур формы на фото f4_03 (F-4D сбоку; нос у E длиннее на 1,44 м, поэтому нос контура выступает влево за нос фото): (a, z) -> (5 + (a - 1.44) * 88.6, 386.5 - z * 88.6). /usr/bin/python3 -I _overlay.py
import site, sys, os, glob
sys.path.append(site.getusersitepackages())
from PIL import Image, ImageChops, ImageFilter
H = os.path.dirname(os.path.abspath(__file__)); S = H + '/_снимки/'
def outline(al):
    M = al.point(lambda v: 255 if v > 25 else 0); return ImageChops.difference(M.filter(ImageFilter.MaxFilter(3)), M)
ph0 = Image.open(S + 'рефы/f4_03.png').convert('RGBA'); PAD = 140
ph = Image.new('RGBA', (ph0.width + PAD, ph0.height), (200, 205, 210, 255)); ph.paste(ph0, (PAD, 0))
a = Image.open(S + 'side_l.png').convert('RGBA'); K = 0.886 * 2200 / a.width
m = a.resize((int(a.width * K), int(a.height * K)), Image.BICUBIC)
C = Image.new('L', ph.size, 0); C.paste(m.split()[3], (int(round(-246.6)) + PAD, int(round(-100.8))))
G = ph.copy(); red = Image.new('RGBA', ph.size, (255, 30, 30, 255)); red.putalpha(outline(C)); G.alpha_composite(red)
G.convert('RGB').save(S + 'наложение_03.jpg', quality=88); print('наложение_03.jpg')
