# _decals.py - своя надпись КАБ-500С (маска в альфе, картинка в _decals/): узкий жирный шрифт с кириллицей, вдоль корпуса, как на референс_1. С картинок ничего не взято, ИНЕРТНАЯ и индекса с буквой Э нет.
# Текст, размер и место - в DECALS (их же читает bake.py): имя, строки, файл шрифта, высота буквы и шаг строк (м), центр вдоль оси a (м от носа), центр по высоте z (м), цвет, вид (side - вдоль корпуса, rot - поперёк).
# Запуск: /usr/bin/python3 _decals.py
import os, sys, json, site
sys.path.append(site.getusersitepackages())
from PIL import Image, ImageDraw, ImageFont

H = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(H, '_decals'); os.makedirs(OUT, exist_ok=True)
FN = '/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf'
BLACK, RED = (0.024, 0.026, 0.028), (0.50, 0.035, 0.025)
DECALS = [
    ('name', ['КАБ-500С'], FN, 0.058, 0.0, 2.060, 0.015, BLACK, 'side', False),
    ('plate', ['КАБ-500С', 'ЗАВ. № 0417', 'ПАРТИЯ 03-19'], FN, 0.0120, 0.0185, 1.420, -0.012, BLACK, 'side', False),   # табличка: номера придуманы
]
PX = 90                                     # пикселей на высоту буквы
CUT = set('AOD0BPRG689Q')                   # у этих букв - вертикальная перемычка трафарета


def block(name, lines, font, h, pitch, stencil):
    f = ImageFont.truetype(font, int(PX / 0.72)); pad = 8
    tmp = ImageDraw.Draw(Image.new('L', (8, 8)))
    wid = [tmp.textlength(s, font=f) for s in lines]
    step = (pitch / h * PX) if pitch else PX * 1.2
    W, Ht = int(max(wid)) + pad * 2, int(step * (len(lines) - 1) + PX * 1.25) + pad * 2
    im = Image.new('L', (W, Ht), 0); d = ImageDraw.Draw(im)
    for i, s in enumerate(lines):
        x = (W - wid[i]) / 2; y = pad + i * step
        d.text((x, y), s, font=f, fill=255)
        if stencil:
            xx = x
            for ch in s:
                w_ = d.textlength(ch, font=f)
                if ch in CUT:
                    cx = xx + w_ / 2; d.rectangle((cx - PX * 0.022, y - 2, cx + PX * 0.022, y + PX * 1.3), fill=0)
                xx += w_
    bb = im.getbbox(); im = im.crop(bb)
    rgba = Image.merge('RGBA', (Image.new('L', im.size, 255), Image.new('L', im.size, 255), Image.new('L', im.size, 255), im))
    rgba.save(os.path.join(OUT, name + '.png'))
    kh = h / PX                              # м на пиксель
    return dict(w=round(im.size[0] * kh, 4), h=round(im.size[1] * kh, 4))


if __name__ == '__main__':
    out = {}
    for name, lines, font, h, pitch, a, z, col, kind, st in DECALS:
        m = block(name, lines, font, h, pitch, st); m.update(a=a, z=z, col=col, kind=kind); out[name] = m; print(name, m)
    json.dump(out, open(os.path.join(OUT, 'decals.json'), 'w'), indent=1)
