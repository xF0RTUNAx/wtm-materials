# _overlay.py - контур формы на фото: бок на f1_07 (нос (1700,672), срез сопла (190,658); 100,8 пикс/м по длине, по высоте ×1/0,915). /usr/bin/python3 -I _overlay.py
import site, sys, os, glob
sys.path.append(site.getusersitepackages())
from PIL import Image, ImageChops, ImageFilter, ImageDraw
H = os.path.dirname(os.path.abspath(__file__)); S = H + '/_снимки/'
def outline(al):
    M = al.point(lambda v: 255 if v > 25 else 0); return ImageChops.difference(M.filter(ImageFilter.MaxFilter(3)), M)
ph = Image.open(glob.glob(H + '/референсы/f1_07.*')[0]).convert('RGBA'); W0, H0 = ph.size
a = Image.open(S + 'side_r.png').convert('RGBA'); W, Hh = a.size                 # 100 пикс/м, центр (900,500) = (a 7.5, z 0.5)
KX, KY = 100.8 / 100, 100.8 / 0.915 / 100
m = a.resize((int(W * KX), int(Hh * KY)), Image.BICUBIC)
ox = int(1700 - (900 + 7.5 * 100) * KX); oy = int(665 - (500 + 0.5 * 100) * KY)
C = Image.new('L', ph.size, 0); C.paste(m.split()[3], (ox, oy))
G = ph.copy(); red = Image.new('RGBA', ph.size, (255, 30, 30, 255)); red.putalpha(outline(C)); G.alpha_composite(red)
G.convert('RGB').save(S + 'наложение_07.jpg', quality=88); print('наложение_07.jpg')
