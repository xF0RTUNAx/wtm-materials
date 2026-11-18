# make_decals.py — свои трафареты 3М14 (все надписи выдуманы): белое по прозрачному, строки по 128 пикс. (цвет задаёт шейдер). /usr/bin/python3 make_decals.py → k14_decals.png
# Все номера выдуманы: номера и надписи с рендеров 01-03 и с фото 04 не переносятся.
import os, sys, site
sys.path.append(site.getusersitepackages())
from PIL import Image, ImageDraw, ImageFont
H = os.path.dirname(os.path.abspath(__file__))
NARROW = next(p for p in ('/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf') if os.path.exists(p))
PLAIN = next(p for p in ('/System/Library/Fonts/Supplemental/Arial Narrow.ttf', NARROW) if os.path.exists(p))
ROWS = [('ВЕРХ', NARROW), ('НЕ КАНТОВАТЬ', NARROW), ('ИЗД. 4417-23', NARROW), ('СТРОПИТЬ ЗДЕСЬ', NARROW), ('ОСТОРОЖНО! РУЛИ', PLAIN), ('ПРОВЕРЕНО ОТК 07', PLAIN),
        ('Л-31  СБ. 2207-14', PLAIN), ('ЗАЗЕМЛЕНИЕ', PLAIN), ('НЕ НАСТУПАТЬ', PLAIN), ('ВЗРЫВООПАСНО', NARROW), ('Р-2', NARROW), ('@', None)]
NR = len(ROWS)
im = Image.new('RGBA', (1024, 128 * NR), (0, 0, 0, 0))
for row, (txt, font) in enumerate(ROWS):
    t = Image.new('L', (3200, 300), 0); d = ImageDraw.Draw(t)
    if txt == '@':                                                          # знак «опасно - электростатика»: рука в треугольнике (упрощённо - треугольник с волной)
        d.polygon([(140, 20), (270, 260), (10, 260)], outline=255, width=22); d.arc((90, 120, 190, 220), 200, 340, fill=255, width=18)
    else:
        d.text((20, 20), txt, font=ImageFont.truetype(font, 200), fill=255)
    t = t.crop(t.getbbox()); k = min(1000 / t.width, 104 / t.height); t = t.resize((max(1, int(t.width * k)), max(1, int(t.height * k))), Image.LANCZOS)
    a = Image.new('RGBA', t.size, (255, 255, 255, 0)); a.putalpha(t); im.paste(a, ((1024 - t.width) // 2, row * 128 + 12), a)
im.save(os.path.join(H, 'k14_decals.png')); print('строк', NR)
