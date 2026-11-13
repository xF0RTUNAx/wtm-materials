# _sheet.py - листы снимков для показа Mark. /usr/bin/python3 -I _sheet.py <выход> <файл:подпись> ...
import site, sys, os
sys.path.append(site.getusersitepackages())
from PIL import Image, ImageDraw, ImageFont
H = os.path.dirname(os.path.abspath(__file__)); S = H + '/_снимки/'
ft = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 24)
out = sys.argv[1]; items = [a.split(':', 1) for a in sys.argv[2:]]; w, h, cols = 800, 500, 3
rows = (len(items) + cols - 1) // cols; G = Image.new('RGB', (w * cols, (h + 36) * rows), (40, 42, 46)); d = ImageDraw.Draw(G)
for i, (f, t) in enumerate(items):
    p = f if f.startswith('/') else S + f
    im = Image.open(p).convert('RGBA'); bg = Image.new('RGBA', im.size, (178, 184, 190, 255)); bg.alpha_composite(im); im = bg.convert('RGB'); k = min(w / im.width, h / im.height); im = im.resize((int(im.width * k), int(im.height * k)), Image.LANCZOS)
    x, y = i % cols * w, i // cols * (h + 36); G.paste(im, (x + (w - im.width) // 2, y + 36 + (h - im.height) // 2)); d.text((x + 10, y + 5), t, font=ft, fill=(235, 235, 235))
G.save(S + out, quality=88); print(out, G.size)
