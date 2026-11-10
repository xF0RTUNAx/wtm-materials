# make_decals.py — своя картинка трафаретов ATACMS (фото 01): 4 строки по 128 пикс., белое по прозрачному. /usr/bin/python3 make_decals.py → ata_decals.png
import os
from PIL import Image, ImageDraw, ImageFont
H = os.path.dirname(os.path.abspath(__file__))
FONT = next(p for p in ('/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf') if os.path.exists(p))
im = Image.new('RGBA', (1024, 512), (0, 0, 0, 0))
for row, txt in enumerate(('AFT LIFT POINT FOR', 'WARHEAD ASSY', 'CG FOR LOADED', 'RKT MGM-140')):
    f = ImageFont.truetype(FONT, 200); t = Image.new('L', (3200, 300), 0); ImageDraw.Draw(t).text((20, 20), txt, font=f, fill=255)
    t = t.crop(t.getbbox()); k = min(1000 / t.width, 100 / t.height); t = t.resize((int(t.width * k), int(t.height * k)), Image.LANCZOS)
    a = Image.new('RGBA', t.size, (255, 255, 255, 0)); a.putalpha(t); im.paste(a, ((1024 - t.width) // 2, row * 128 + 14), a)
im.save(os.path.join(H, 'ata_decals.png')); print('шрифт', os.path.basename(FONT))
