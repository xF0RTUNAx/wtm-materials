# make_decals.py — своя картинка трафаретов Х-25МЛ: белое по прозрачному, строки по 128 пикс. (цвет задаёт шейдер). /usr/bin/python3 make_decals.py → x25_decals.png
# Все надписи и номера выдуманы: номера и надписи с фото (02, 03, 04) не переносятся.
import os, sys, site
sys.path.append(site.getusersitepackages())
from PIL import Image, ImageDraw, ImageFont
H = os.path.dirname(os.path.abspath(__file__))
FONT = next(p for p in ('/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf') if os.path.exists(p))
ROWS = ['7', 'ПАРТ. 41  № 0263', 'ИЗД. 12-07  ОТК 3', 'ЦЕНТР МАСС', 'ТОЧКА ПОДЪЁМА', 'ЗАЗЕМЛЕНИЕ', 'СНЯТЬ ЧЕХОЛ ПЕРЕД ВЫЛЕТОМ', 'НЕ ТРОГАТЬ РУКАМИ', 'ПРОВЕРЕНО 08.24', '@']
NR = len(ROWS)
im = Image.new('RGBA', (1024, 128 * NR), (0, 0, 0, 0))
for row, txt in enumerate(ROWS):
    t = Image.new('L', (3200, 300), 0); d = ImageDraw.Draw(t)
    if txt == '@':                                                          # знак центра масс: круг, две закрашенные четверти
        d.ellipse((20, 20, 260, 260), outline=255, width=22); d.pieslice((20, 20, 260, 260), 0, 90, fill=255); d.pieslice((20, 20, 260, 260), 180, 270, fill=255)
    else:
        d.text((20, 20), txt, font=ImageFont.truetype(FONT, 200), fill=255)
    t = t.crop(t.getbbox()); k = min(1000 / t.width, 104 / t.height); t = t.resize((max(1, int(t.width * k)), max(1, int(t.height * k))), Image.LANCZOS)
    a = Image.new('RGBA', t.size, (255, 255, 255, 0)); a.putalpha(t); im.paste(a, ((1024 - t.width) // 2, row * 128 + 12), a)
im.save(os.path.join(H, 'x25_decals.png')); print('шрифт', os.path.basename(FONT), 'строк', NR)
