# make_decals.py — свои трафареты «Искандера» (все надписи и номера выдуманы, с фото не переносятся): строки 2048 × 128 пикс., белое по прозрачному,
# текст высотой 100 пикс. от левого края; ширины строк — в isk_decals.json. /usr/bin/python3 make_decals.py
import os, json, sys, site
sys.path.append(site.getusersitepackages())
from PIL import Image, ImageDraw, ImageFont
H = os.path.dirname(os.path.abspath(__file__))
NB = next(p for p in ('/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf') if os.path.exists(p))
AB = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
ROWS = [('НЕ СТАНОВИТЬСЯ', NB), ('ДТ', NB), ('ОСТОРОЖНО! ПОДЪЁМ СТРЕЛЫ', NB), ('ГИДРАВЛИКА', NB), ('Р 4,2 кгс/см²', AB), ('ЗАЗЕМЛЕНИЕ', NB),
        ('ВЫСОКОЕ НАПРЯЖЕНИЕ', NB), ('ЗИП', NB), ('ОГНЕОПАСНО', NB), ('СТРОПИТЬ ЗДЕСЬ', NB), ('Л-27  0417', NB), ('ВЕРХ', NB)]
im = Image.new('RGBA', (2048, 128 * len(ROWS)), (0, 0, 0, 0)); widths = []
for row, (txt, fp) in enumerate(ROWS):
    f = ImageFont.truetype(fp, 220); t = Image.new('L', (4600, 320), 0); ImageDraw.Draw(t).text((20, 20), txt, font=f, fill=255)
    t = t.crop(t.getbbox()); k = 100 / t.height; w = min(2030, int(t.width * k)); t = t.resize((w, 100), Image.LANCZOS)
    a = Image.new('RGBA', t.size, (255, 255, 255, 0)); a.putalpha(t); im.paste(a, (4, row * 128 + 14), a); widths.append((w + 8) / 2048)
im.save(os.path.join(H, 'isk_decals.png')); json.dump({'rows': [r[0] for r in ROWS], 'w': widths}, open(os.path.join(H, 'isk_decals.json'), 'w'), ensure_ascii=False)
print('строк', len(ROWS), [round(w, 3) for w in widths])
