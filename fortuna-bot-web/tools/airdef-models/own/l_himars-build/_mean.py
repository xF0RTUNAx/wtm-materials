# _mean.py — средний цвет участка фото и пробного кадра (sRGB и яркость), чтобы краска не вышла темнее фото: /usr/bin/python3 _mean.py файл x0 y0 x1 y1 [файл x0 y0 x1 y1 ...]
import sys
from PIL import Image
a = sys.argv[1:]
for i in range(0, len(a), 5):
    im = Image.open(a[i]).convert('RGB'); x0, y0, x1, y1 = map(int, a[i + 1:i + 5]); px = list(im.crop((x0, y0, x1, y1)).getdata()); n = len(px)
    m = [sum(p[k] for p in px) / n for k in range(3)]; L = 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]
    print('%-40s sRGB %3.0f %3.0f %3.0f  яркость %5.1f' % (a[i].split('/')[-1] + ' ' + '%d,%d,%d,%d' % (x0, y0, x1, y1), *m, L))
