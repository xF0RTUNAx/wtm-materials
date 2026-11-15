# make_decals.py - своя картинка трафаретов Х-59М: белое по прозрачному, строки по 128 пикс. (цвет задаёт шейдер). /usr/bin/python3 -I make_decals.py → x59_decals.png
# Все номера и надписи выдуманы (кроме названия «Х-59М»): номера с фото 10, 12, 13 не переносятся.
# Строка '[А|Б]' - две строки текста в рамке (трафарет на крышке лючка, как на фото 10), '@' - знак центра масс.
import os, sys, site
sys.path.append(site.getusersitepackages())
from PIL import Image, ImageDraw, ImageFont
H = os.path.dirname(os.path.abspath(__file__))
FONT = next(p for p in ('/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf') if os.path.exists(p))
ROWS = ['Х-59М', '07 41 1802', 'ИЗД. 47-118   № 0381', 'ПАРТ. 06   ОТК 4', 'ЦЕНТР МАСС', '@', 'ТОЧКА ПОДВЕСКИ', '[КОНТРОЛЬНЫЙ|РАЗЪЁМ]',
        '[ЗАЛИВ|ТОПЛИВА]', '[ТЕХНОЛОГИЧЕСКИЙ|ЛЮК]', 'ЗАЗЕМЛЕНИЕ', 'ПРОВЕРЕНО 03.25', 'НЕ ТРОГАТЬ РУКАМИ', 'ПЕРЕД ПОДВЕСКОЙ СНЯТЬ ЗАГЛУШКИ']
NR = len(ROWS)
im = Image.new('RGBA', (1024, 128 * NR), (0, 0, 0, 0))
F = ImageFont.truetype(FONT, 200)
for row, txt in enumerate(ROWS):
    t = Image.new('L', (3600, 700), 0); d = ImageDraw.Draw(t)
    if txt == '@':                                                          # знак центра масс: круг, две закрашенные четверти
        d.ellipse((20, 20, 260, 260), outline=255, width=22); d.pieslice((20, 20, 260, 260), 0, 90, fill=255); d.pieslice((20, 20, 260, 260), 180, 270, fill=255)
    elif txt.startswith('['):                                               # две строки в рамке
        a, b = txt[1:-1].split('|'); wa = d.textlength(a, font=F); wb = d.textlength(b, font=F); w = max(wa, wb)
        d.text((80 + (w - wa) / 2, 60), a, font=F, fill=255); d.text((80 + (w - wb) / 2, 300), b, font=F, fill=255)
        d.rectangle((20, 20, 140 + w, 560), outline=255, width=18)
    else:
        d.text((20, 20), txt, font=F, fill=255)
    t = t.crop(t.getbbox()); k = min(1000 / t.width, 104 / t.height); t = t.resize((max(1, int(t.width * k)), max(1, int(t.height * k))), Image.LANCZOS)
    a = Image.new('RGBA', t.size, (255, 255, 255, 0)); a.putalpha(t); im.paste(a, ((1024 - t.width) // 2, row * 128 + (128 - t.height) // 2), a)
im.save(os.path.join(H, 'x59_decals.png')); print('шрифт', os.path.basename(FONT), 'строк', NR)
