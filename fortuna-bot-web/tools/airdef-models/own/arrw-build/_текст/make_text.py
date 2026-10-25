# make_text.py — трафареты на корпусе ARRW (по рендерам Mark: крупная надпись «AGM-183A» за вторым ремнём, мелкий блок строк над ней, круглый значок у основания оживала):
# три картинки с прозрачным фоном (цвет + альфа) для запекания (bake.py кладёт их на сторону −X плоской проекцией). 2,5 пикселя на миллиметр.
# Мелкие надписи и значок — условные (на рендерах нечитаемы: строки блока взяты как похожие, значок — упрощённый круг с полосами). Логотип на носу и рисунок значка не воспроизводились.
# Запуск системным python3 (нужен Pillow): /usr/bin/python3 make_text.py
import os, math
from PIL import Image, ImageDraw, ImageFont, ImageChops
HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/Library/Fonts/Arial Bold.ttf', '/System/Library/Fonts/Helvetica.ttc']
fp = next((f for f in FONTS if os.path.exists(f)), None)
if fp is None: raise SystemExit('нет жирного шрифта среди ' + str(FONTS))


def solid(size, colour, mask):
    s = Image.new('RGBA', size, tuple(colour) + (255,)); s.putalpha(mask); return s


def text_block(name, size, lines, colour, align='center', margin=14):
    """lines — [(текст, высота заглавных, px; отступ сверху)]; слой цвета + альфа (цвет постоянный, альфа — маска текста)."""
    W, H = size; mask = Image.new('L', size, 0); d = ImageDraw.Draw(mask)
    for text, cap, top in lines:
        fs = int(cap / 0.716)
        while fs > 8:
            f = ImageFont.truetype(fp, fs); l, t, r, b = d.textbbox((0, 0), text, font=f)
            if r - l <= W - 2 * margin: break
            fs -= 2
        x = (W - (r - l)) // 2 - l if align == 'center' else margin - l
        d.text((x, top - t), text, font=f, fill=255)
    img = solid(size, colour, mask); img.save(os.path.join(HERE, name)); print(name, size)


def arc_text(mask, text, cx, cy, r, fs):
    """Надпись по дуге сверху (по часовой стрелке), каждая буква повёрнута по касательной."""
    f = ImageFont.truetype(fp, fs); widths = [f.getlength(ch) for ch in text]; a = -sum(widths) / r / 2
    for ch, w in zip(text, widths):
        ang = a + (w / r) / 2
        g = Image.new('L', (fs * 2, fs * 2), 0); ImageDraw.Draw(g).text((fs, fs), ch, font=f, fill=255, anchor='mm')
        g = g.rotate(-math.degrees(ang), resample=Image.BICUBIC, center=(fs, fs))
        mask.paste(255, (int(cx + r * math.sin(ang) - fs), int(cy - r * math.cos(ang) - fs)), g)
        a += w / r


def emblem(name, S=940):
    """Круглый значок: тёмное кольцо с надписью по дуге, светлый круг с косыми тёмными полосами и тёмной фигурой в центре."""
    cx = cy = S / 2; R0 = S / 2 - 6; R1 = R0 * 0.80
    def disc(r):
        m = Image.new('L', (S, S), 0); ImageDraw.Draw(m).ellipse((cx - r, cy - r, cx + r, cy + r), fill=255); return m
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    img = Image.alpha_composite(img, solid((S, S), (24, 26, 30), disc(R0)))
    img = Image.alpha_composite(img, solid((S, S), (232, 233, 236), disc(R1)))
    st = Image.new('L', (S, S), 0); sd = ImageDraw.Draw(st); step = S * 0.115; k = -S * 0.6
    while k < S * 1.6:
        sd.polygon([(k, 0), (k + step * 0.55, 0), (k + step * 0.55 - S * 0.55, S), (k - S * 0.55, S)], fill=255); k += step
    img = Image.alpha_composite(img, solid((S, S), (28, 30, 34), ImageChops.multiply(st, disc(R1 * 0.98))))
    fig = Image.new('L', (S, S), 0); fd = ImageDraw.Draw(fig)
    fd.ellipse((cx - R1 * 0.40, cy - R1 * 0.42, cx + R1 * 0.40, cy + R1 * 0.44), fill=255)
    img = Image.alpha_composite(img, solid((S, S), (232, 233, 236), fig))
    fig2 = Image.new('L', (S, S), 0); fd2 = ImageDraw.Draw(fig2)
    fd2.ellipse((cx - R1 * 0.33, cy - R1 * 0.35, cx + R1 * 0.33, cy + R1 * 0.37), fill=255)
    img = Image.alpha_composite(img, solid((S, S), (22, 24, 28), fig2))
    ring = Image.new('L', (S, S), 0); rd = ImageDraw.Draw(ring)                                  # тонкое светлое кольцо внутри тёмной фигуры
    rd.ellipse((cx - R1 * 0.26, cy - R1 * 0.28, cx + R1 * 0.26, cy + R1 * 0.30), fill=255); rd.ellipse((cx - R1 * 0.22, cy - R1 * 0.24, cx + R1 * 0.22, cy + R1 * 0.26), fill=0)
    img = Image.alpha_composite(img, solid((S, S), (232, 233, 236), ring))
    tm = Image.new('L', (S, S), 0); arc_text(tm, 'AGM-183A ARRW', cx, cy, (R0 + R1) / 2, int(R0 * 0.17 / 0.716 * 1.0))
    img = Image.alpha_composite(img, solid((S, S), (226, 228, 232), tm))
    img.save(os.path.join(HERE, name)); print(name, (S, S))


# А: «AGM-183A» (0,767 × 0,190 м → 1918 × 475): заглавные 0,105 м
text_block('трафарет_A.png', (1918, 475), [('AGM-183A', 262, 106)], (20, 22, 26))
# Б: мелкий блок строк над надписью (0,616 × 0,12 м → 1540 × 300), заглавные 0,0175 м, прижато влево
text_block('трафарет_B.png', (1540, 300), [('PN: 64059-85-04412', 40, 28), ('NOMEN: MSL, INERT, AGM-183A', 40, 108), ('SN: IMY-2', 40, 188)], (70, 73, 78), align='left')
# В: значок (диаметр 0,377 м → 940 × 940)
emblem('значок.png')
