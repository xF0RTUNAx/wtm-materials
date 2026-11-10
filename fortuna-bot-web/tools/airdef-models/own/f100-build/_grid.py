# _grid.py - сетка пикселей на фото для съёма размеров: _grid.py имя шаг x0 y0 x1 y1 масштаб
import site, sys, os
sys.path.append(site.getusersitepackages())
from PIL import Image, ImageDraw
H = os.path.dirname(os.path.abspath(__file__)); R = H + '/_снимки/рефы/'
n, st, x0, y0, x1, y1, k = sys.argv[1], int(sys.argv[2]), *map(int, sys.argv[3:7]), float(sys.argv[7])
im = Image.open(R + n + '.png').convert('RGB').crop((x0, y0, x1, y1)); im = im.resize((int(im.width * k), int(im.height * k)), Image.LANCZOS); d = ImageDraw.Draw(im)
for x in range((x0 // st + 1) * st, x1, st):
    X = (x - x0) * k; d.line([(X, 0), (X, im.height)], fill=(255, 0, 0) if x % (st * 5) == 0 else (255, 160, 0), width=1); d.text((X + 2, 2), str(x), fill=(255, 255, 0))
for y in range((y0 // st + 1) * st, y1, st):
    Y = (y - y0) * k; d.line([(0, Y), (im.width, Y)], fill=(0, 200, 255) if y % (st * 5) == 0 else (0, 120, 160), width=1); d.text((2, Y + 2), str(y), fill=(255, 255, 0))
im.save(H + f'/_снимки/g_{n}_{x0}_{y0}.jpg', quality=90); print(im.size)
