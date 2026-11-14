# _overlay.py - чертёж 01 (сверху, 34,47 пикс/м по шкале) и фото 04 (сбоку, 45,6 пикс/м) красным поверх снимков формы. /usr/bin/python3 -I _overlay.py [папка снимков]
import site, sys, os
sys.path.append(site.getusersitepackages())
from PIL import Image, ImageFilter
H = os.path.dirname(os.path.abspath(__file__)); S = (sys.argv[1] if len(sys.argv) > 1 else H + '/_снимки') + '/'


def lay(shot, drw, box, f, anchor_d, anchor_r, out, thr=150, edges=False, alpha=1.0):
    t = Image.open(S + shot).convert('RGBA'); bg = Image.new('RGBA', t.size, (200, 205, 212, 255)); bg.alpha_composite(t)
    D0 = Image.open(H + '/' + drw).convert('L')
    if edges:
        d = D0.filter(ImageFilter.FIND_EDGES).crop(box); d = d.resize((int(d.width * f), int(d.height * f)), Image.BILINEAR); a_ = d.point(lambda v: 0 if v < 25 else min(255, int((v - 25) * 5 * alpha)))
    else:
        d = D0.crop(box); d = d.resize((int(d.width * f), int(d.height * f)), Image.LANCZOS); a_ = d.point(lambda v: min(255, int((thr - v) * 255 / thr * 1.5)) if v < thr else 0)
    red = Image.new('RGBA', d.size, (225, 20, 20, 0)); red.putalpha(a_)
    bg.alpha_composite(red, (int(round(anchor_r[0] - (anchor_d[0] - box[0]) * f)), int(round(anchor_r[1] - (anchor_d[1] - box[1]) * f))))
    bg.convert('RGB').save(S + out, quality=90); print(out)


NOSE = (950 - (16.13 / 2 - 0.4) * 100, 0)
lay('top.png', 'референсы/01.png', (40, 0, 660, 260), 100 / 34.47, (70, 128.5), (NOSE[0], 950), 'наложение_сверху.jpg')
lay('side_l.png', 'референсы/04.png', (30, 120, 800, 330), 100 / 45.6, (50, 253), (NOSE[0], 350 - (1.25 - 1.9) * 100), 'наложение_сбоку_04.jpg', edges=True)
lay('side_l.png', 'референсы/09.png', (0, 20, 475, 140), 100 / 26.3, (38, 90), (NOSE[0], 350 - (1.25 - 1.9) * 100), 'наложение_сбоку_09.jpg')
