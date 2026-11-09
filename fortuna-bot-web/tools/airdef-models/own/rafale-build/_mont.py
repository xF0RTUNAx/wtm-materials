# _mont.py - лист кадров: _mont.py out.jpg w h file1 file2 ... (пути относительно _снимки), в ряд по 2-3
import site, sys, os
sys.path.append(site.getusersitepackages())
from PIL import Image, ImageDraw
H = os.path.dirname(os.path.abspath(__file__)); S = H + '/_снимки/'
out, W, Hh, cols = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]); fs = sys.argv[5:]
rows = (len(fs) + cols - 1) // cols
sh = Image.new('RGB', (W * cols, Hh * rows), (40, 42, 46))
for i, f in enumerate(fs):
    im = Image.open(f if f.startswith('/') else S + f).convert('RGBA'); bg = Image.new('RGBA', im.size, (178, 184, 190, 255)); bg.alpha_composite(im); im = bg.convert('RGB')
    k = min(W / im.width, Hh / im.height); im = im.resize((int(im.width * k), int(im.height * k)), Image.LANCZOS)
    sh.paste(im, (i % cols * W + (W - im.width) // 2, i // cols * Hh + (Hh - im.height) // 2))
sh.save(S + out, quality=88)
