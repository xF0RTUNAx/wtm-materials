# make_decals.py — свои трафареты и наклейки HIMARS (вымышленные номера, без настоящих частей): строки по 128 пикс., белое по прозрачному,
# текст высотой 100 пикс. от левого края; ширины строк — в him_decals.json (шейдер берёт их для пропорций). /usr/bin/python3 make_decals.py
import os, json
from PIL import Image, ImageDraw, ImageFont
H = os.path.dirname(os.path.abspath(__file__))
ST = '/System/Library/Fonts/Supplemental/Stencil.ttf'; AB = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
ROWS = [('1-3 FA', ST), ('A-12', ST), ('DANGER  ROCKET EXHAUST', AB), ('STAY CLEAR 300 FT', AB), ('JP-8', ST), ('CAUTION', AB), ('USA 2C 4521', ST), ('NO STEP', AB)]
im = Image.new('RGBA', (1024, 128 * len(ROWS)), (0, 0, 0, 0)); widths = []
for row, (txt, fp) in enumerate(ROWS):
    f = ImageFont.truetype(fp if os.path.exists(fp) else AB, 220); t = Image.new('L', (4000, 320), 0); ImageDraw.Draw(t).text((20, 20), txt, font=f, fill=255)
    t = t.crop(t.getbbox()); k = 100 / t.height; w = min(1010, int(t.width * k)); t = t.resize((w, 100), Image.LANCZOS)
    a = Image.new('RGBA', t.size, (255, 255, 255, 0)); a.putalpha(t); im.paste(a, (4, row * 128 + 14), a); widths.append((w + 8) / 1024)
im.save(os.path.join(H, 'him_decals.png')); json.dump({'rows': [r[0] for r in ROWS], 'w': widths}, open(os.path.join(H, 'him_decals.json'), 'w'), ensure_ascii=False)
print('строк', len(ROWS), [round(w, 3) for w in widths])
