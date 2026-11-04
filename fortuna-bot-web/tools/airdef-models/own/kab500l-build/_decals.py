# _decals.py - свои надписи КАБ-500Л (маски в альфе, картинки в _decals/): узкий шрифт с кириллицей, блок поперёк корпуса между проушинами, как на референс_1. С картинок ничего не взято, надписи УЧЕБНАЯ нет, партия и масса придуманы.
# Текст, размер и место - в DECALS (их же читает bake.py): имя, строки, файл шрифта, высота буквы и шаг строк (м), центр вдоль оси a (м от носа), центр по высоте z (м), цвет, вид (side - вдоль корпуса, rot - поперёк).
# Запуск: /usr/bin/python3 _decals.py
import os, sys, json, site
sys.path.append(site.getusersitepackages())
from PIL import Image, ImageDraw, ImageFont

H = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(H, '_decals'); os.makedirs(OUT, exist_ok=True)
FN = '/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf'
BLACK, RED = (0.024, 0.026, 0.028), (0.50, 0.035, 0.025)
DECALS = [
    ('data', ['КАБ-500Л', 'ПАРТИЯ 07-86', 'МАССА 525 КГ', 'ВВ ТГАФ-5'], FN, 0.0200, 0.0310, 1.690, 0.035, BLACK, 'rot', False),
    ('tail', ['ОБР. 86'], FN, 0.0150, 0.0, 2.520, -0.020, BLACK, 'side', False),
    ('nose', ['НЕ ПОДНИМАТЬ', 'ЗА ГОЛОВКУ'], FN, 0.0120, 0.0170, 1.060, -0.070, BLACK, 'side', False),
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
