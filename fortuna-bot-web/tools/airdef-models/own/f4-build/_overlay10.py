# _overlay10.py - контур модели на боковой проекции f4_10 (F-4C, 48,7 пикс/м, совмещение по хвосту): (a, z) -> (871 - (19.2 - a) * 48.7, Y0 - z * 48.7). /usr/bin/python3 -I _overlay10.py [Y0]
import site, sys, os
sys.path.append(site.getusersitepackages())
from PIL import Image, ImageChops, ImageFilter
H = os.path.dirname(os.path.abspath(__file__)); S = H + '/_снимки/'; Y0 = float(sys.argv[1]) if len(sys.argv) > 1 else 167.0; Z = 2
ph0 = Image.open(S + 'рефы/f4_10.png').convert('RGBA'); ph0 = ph0.resize((ph0.width * Z, ph0.height * Z), Image.LANCZOS); PAD = 160
ph = Image.new('RGBA', (ph0.width + PAD, ph0.height + 40), (255, 255, 255, 255)); ph.paste(ph0, (PAD, 0))
a = Image.open(S + 'side_l.png').convert('RGBA'); k = 2200 / a.width; K = 0.487 * k * Z       # рендер 100 пикс/м: (a, z) -> (1100 + (a - 9.6) * 100, 550 - z * 100)
m = a.resize((int(a.width * K), int(a.height * K)), Image.BICUBIC)
ox = (871 - 19.2 * 48.7) * Z - (1100 - 960) * 0.487 * Z; oy = Y0 * Z - 550 * 0.487 * Z
M = m.split()[3].point(lambda v: 255 if v > 25 else 0); C = Image.new('L', ph.size, 0); C.paste(M, (int(round(ox)) + PAD, int(round(oy))))
ol = ImageChops.difference(C.filter(ImageFilter.MaxFilter(3)), C)
G = ph.copy(); red = Image.new('RGBA', ph.size, (255, 0, 0, 255)); red.putalpha(ol); G.alpha_composite(red)
G.convert('RGB').save(S + 'наложение_10.jpg', quality=90); print('наложение_10.jpg', G.size)
