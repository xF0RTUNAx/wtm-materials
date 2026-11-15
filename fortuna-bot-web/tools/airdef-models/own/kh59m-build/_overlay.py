# _overlay.py — наложение вида сбоку (_показ/<tag>_side.png, масштаб ×3) на вид 2 чертежа 04 (x 0…571, y 108…236): /usr/bin/python3 _overlay.py [tag]
import sys, site, os
sys.path.append(site.getusersitepackages())
from PIL import Image, ImageChops, ImageFilter
H = os.path.dirname(os.path.abspath(__file__)); tag = sys.argv[1] if len(sys.argv) > 1 else 'f'; ST = len(sys.argv) > 2 and sys.argv[2] == 'start'
d = Image.open(os.path.join(H, 'референсы', '04.png')).convert('RGB').crop((0, 0, 571, 110) if ST else (0, 108, 571, 236)); d = d.resize((d.width * 3, d.height * 3), Image.LANCZOS)
m = Image.open(os.path.join(H, '_показ', f'{tag}_sidest.png' if ST else f'{tag}_side.png')).convert('RGBA')
tint = Image.new('RGBA', m.size, (40, 130, 255, 0)); a = m.split()[3].point(lambda v: int(v * 0.45)); tint.putalpha(a)
out = d.convert('RGBA'); out.alpha_composite(tint)
edge = m.split()[3].point(lambda v: 255 if v > 128 else 0)
e = ImageChops.subtract(edge.filter(ImageFilter.MaxFilter(3)), edge.filter(ImageFilter.MinFilter(3)))
red = Image.new('RGBA', m.size, (230, 20, 20, 255)); red.putalpha(e); out.alpha_composite(red)
out.convert('RGB').save(os.path.join(H, '_показ', f'{tag}_наложение_старт.png' if ST else f'{tag}_наложение_бок.png')); print('ok')
