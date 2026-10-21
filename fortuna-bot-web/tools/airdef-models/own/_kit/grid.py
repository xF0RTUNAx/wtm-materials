"""Увеличенный кусок чертежа с сеткой координат — снимать размеры в пикселях (уровень 1: измерения).

  /usr/bin/python3 -I grid.py <чертёж.png> <x0,y0,x1,y1> <увеличение> <шаг_сетки> <выход.png>

Красные линии — x (толстые каждые 100), синие — y; числа — координаты в пикселях исходного чертежа. Пример: кусок 160 × 140 пикс. с шагом 10 и
увеличением 7 даёт картинку, на которой видно положение каждой кромки с точностью до пикселя. Нужен Pillow (путь к пользовательским пакетам — в скрипте).
"""
import sys, site
sys.path.append(site.getusersitepackages())
from PIL import Image, ImageDraw


def grid(path, box, zoom, step, out):
    im = Image.open(path).convert('RGB').crop(box)
    im = im.resize((im.width * zoom, im.height * zoom), Image.LANCZOS)
    d = ImageDraw.Draw(im); x0, y0 = box[0], box[1]
    for gx in range((x0 // step + 1) * step, box[2], step):
        X = (gx - x0) * zoom
        d.line([(X, 0), (X, im.height)], fill=(255, 0, 0) if gx % 100 == 0 else (255, 170, 170), width=1); d.text((X + 2, 2), str(gx), fill=(200, 0, 0))
    for gy in range((y0 // step + 1) * step, box[3], step):
        Y = (gy - y0) * zoom
        d.line([(0, Y), (im.width, Y)], fill=(0, 0, 255) if gy % 100 == 0 else (170, 170, 255), width=1); d.text((2, Y + 2), str(gy), fill=(0, 0, 200))
    im.save(out)


if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) < 5: print(__doc__); sys.exit(1)
    grid(a[0], tuple(int(v) for v in a[1].split(',')), int(a[2]), int(a[3]), a[4])
