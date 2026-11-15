# _trial_sheet.py - лист пробы окраски: бока полосами сверху и снизу, 8 кадров сеткой 4×2. /usr/bin/python3 -I _trial_sheet.py → _показ/лист_окраски.jpg
import os, sys, site
sys.path.append(site.getusersitepackages())
from PIL import Image
H = os.path.dirname(os.path.abspath(__file__)); P = os.path.join(H, '_проба'); W = 2400
def strip(n):
    im = Image.open(os.path.join(P, n + '.png')).convert('RGB'); return im.resize((W, int(im.height * W / im.width)), Image.LANCZOS)
grid = ['1_общий', '3_голова', '8_купол', '4_двигатель', '6_трафареты', '7_справа_сзади', '5_сзади_снизу', '9_хвост_сверху']
tw, th = W // 4, int(W // 4 * 0.625)
rows = [strip('2_сбоку_слева')]
for r in range(2):
    row = Image.new('RGB', (W, th), (40, 40, 40))
    for c in range(4):
        im = Image.open(os.path.join(P, grid[r * 4 + c] + '.png')).convert('RGB')
        k = max(tw / im.width, th / im.height); im = im.resize((int(im.width * k + 1), int(im.height * k + 1)), Image.LANCZOS)
        x0, y0 = (im.width - tw) // 2, (im.height - th) // 2; row.paste(im.crop((x0, y0, x0 + tw, y0 + th)), (c * tw, 0))
    rows.append(row)
rows.append(strip('10_справа'))
out = Image.new('RGB', (W, sum(r.height for r in rows)), (40, 40, 40)); y = 0
for r in rows: out.paste(r, (0, y)); y += r.height
os.makedirs(os.path.join(H, '_показ'), exist_ok=True); out.save(os.path.join(H, '_показ', 'лист_окраски.jpg'), quality=88); print('лист', out.size)
