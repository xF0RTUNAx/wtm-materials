# _overlay.py <фото> <рендер с линиями> <выход> [масштаб] — чёрные линии рендера красным поверх фото, белая заливка модели - лёгкой вуалью
import sys
from PIL import Image
ph = Image.open(sys.argv[1]).convert('RGBA'); rd = Image.open(sys.argv[2]).convert('RGBA').resize(ph.size, Image.LANCZOS)
k = float(sys.argv[4]) if len(sys.argv) > 4 else 2.0
px = rd.load(); ov = Image.new('RGBA', ph.size, (0, 0, 0, 0)); po = ov.load()
for y in range(ph.size[1]):
    for x in range(ph.size[0]):
        r, g, b, a = px[x, y]
        if a < 10: continue
        if r < 110: po[x, y] = (255, 30, 30, 230)
        else: po[x, y] = (255, 255, 255, 40)
out = Image.alpha_composite(ph, ov).convert('RGB'); out = out.resize((int(out.width * k), int(out.height * k)), Image.LANCZOS); out.save(sys.argv[3])
