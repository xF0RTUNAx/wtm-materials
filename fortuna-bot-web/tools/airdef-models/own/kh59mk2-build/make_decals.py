# make_decals.py - своя картинка трафаретов Х-59МК2: белое по прозрачному, строки по 128 пикс. (цвет задаёт шейдер). /usr/bin/python3 -I make_decals.py → mk2_decals.png
# Все номера и надписи выдуманы (кроме названия «Х-59МК2»). Знак завода с фото не переносится: вместо него свой знак ('#') - кольцо, в нём стреловидная
# ракета-«дельта» с тремя полосами следа (на заводской знак не похож).
# '[А|Б]' - две строки текста в рамке, '@' - знак центра масс.
import os, sys, site
sys.path.append(site.getusersitepackages())
from PIL import Image, ImageDraw, ImageFont
H = os.path.dirname(os.path.abspath(__file__))
FONT = next(p for p in ('/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf') if os.path.exists(p))
ROWS = ['Х-59МК2', '#', 'ИЗД. 59-207   № 1146', 'ПАРТ. 03   ОТК 7', 'ЦЕНТР МАСС', '@', 'ТОЧКА ПОДВЕСКИ', 'МЕСТО ОПОРЫ ВЕРХНЕГО ЛОЖЕМЕНТА',
        'МЕСТО ОПОРЫ НИЖНЕГО ЛОЖЕМЕНТА', 'ЗАЛИВ ТОПЛИВА', 'ЗАЗЕМЛЕНИЕ', 'ПРОВЕРЕНО 08.25', 'ПЕРЕД ПОДВЕСКОЙ СНЯТЬ ЗАГЛУШКУ', 'ОКНО ГСН РУКАМИ НЕ ТРОГАТЬ',
        '[КОНТРОЛЬНЫЙ|РАЗЪЁМ]', 'МЕСТО ОПОРЫ ПЕРЕДНЕГО ЛОЖЕМЕНТА']
NR = len(ROWS)
im = Image.new('RGBA', (1024, 128 * NR), (0, 0, 0, 0))
F = ImageFont.truetype(FONT, 200)
for row, txt in enumerate(ROWS):
    t = Image.new('L', (3600, 700), 0); d = ImageDraw.Draw(t)
    if txt == '@':                                                          # знак центра масс: круг, две закрашенные четверти
        d.ellipse((20, 20, 260, 260), outline=255, width=22); d.pieslice((20, 20, 260, 260), 0, 90, fill=255); d.pieslice((20, 20, 260, 260), 180, 270, fill=255)
    elif txt == '#':                                                        # свой знак: кольцо, ракета-«дельта» носом вправо-вверх, три полосы следа
        d.ellipse((20, 20, 620, 620), outline=255, width=46)
        d.polygon([(470, 190), (250, 300), (330, 330), (300, 420)], fill=255)          # стреловидный наконечник
        d.polygon([(330, 330), (250, 300), (215, 335), (300, 360)], fill=0)
        for k, (x0, y0) in enumerate(((150, 400), (185, 450), (225, 495))):           # полосы следа
            d.line((x0, y0, x0 + 120 - 25 * k, y0 - 60 + 12 * k), fill=255, width=26)
    elif txt.startswith('['):                                               # две строки в рамке
        a, b = txt[1:-1].split('|'); wa = d.textlength(a, font=F); wb = d.textlength(b, font=F); w = max(wa, wb)
        d.text((80 + (w - wa) / 2, 60), a, font=F, fill=255); d.text((80 + (w - wb) / 2, 300), b, font=F, fill=255)
        d.rectangle((20, 20, 140 + w, 560), outline=255, width=18)
    else:
        d.text((20, 20), txt, font=F, fill=255)
    t = t.crop(t.getbbox()); k = min(1000 / t.width, 104 / t.height); t = t.resize((max(1, int(t.width * k)), max(1, int(t.height * k))), Image.LANCZOS)
    a = Image.new('RGBA', t.size, (255, 255, 255, 0)); a.putalpha(t); im.paste(a, ((1024 - t.width) // 2, row * 128 + (128 - t.height) // 2), a)
im.save(os.path.join(H, 'mk2_decals.png')); print('шрифт', os.path.basename(FONT), 'строк', NR)
