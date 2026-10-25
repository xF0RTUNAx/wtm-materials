# make_text.py — трафареты на корпусе PrSM (по рендеру 3: плотный блок мелких надписей за рядом заклёпок; по фото старта: светлая табличка с надписью у основания оживала): две картинки с прозрачным фоном для запекания
# (bake.py кладёт их на сторону +X плоской проекцией). Надписи — условные (на рендерах текст нечитаем): название и серийно-партионные строки. Запуск системным python3 (нужен Pillow): /usr/bin/python3 make_text.py
import os
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/System/Library/Fonts/Helvetica.ttc', '/Library/Fonts/Arial Bold.ttf']
fp = next((f for f in FONTS if os.path.exists(f)), None)
if fp is None: raise SystemExit('нет жирного шрифта среди ' + str(FONTS))


def block(name, size, lines):
    """lines — [(текст, высота заглавных в пикселях, отступ сверху)]; каждая строка по центру, влезает по ширине."""
    W, H = size; img = Image.new('RGBA', size, (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    for text, cap, top in lines:
        fs = int(cap / 0.716)
        while fs > 8:
            f = ImageFont.truetype(fp, fs); l, t, r, b = d.textbbox((0, 0), text, font=f)
            if r - l <= W - 16: break
            fs -= 2
        d.text(((W - (r - l)) // 2 - l, top - t), text, font=f, fill=(255, 255, 255, 255))
    img.save(os.path.join(HERE, name)); print(name, size)


# блок A (за рядом заклёпок, 0,31 × 0,17 м → 1240 × 680): название и три строки
block('трафарет_A.png', (1240, 680), [('PrSM', 130, 40), ('MISSILE ROUND', 58, 250), ('LOT 25-0417', 58, 370), ('SN 000417', 58, 490)])
# блок Б (табличка у основания оживала, 0,28 × 0,12 м → 1120 × 480): две строки мелким шрифтом
block('трафарет_B.png', (1120, 480), [('LOT 25-0417', 90, 90), ('SN 000417', 90, 270)])
