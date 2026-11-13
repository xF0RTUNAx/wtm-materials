# _overlay.py - чертёж tu22_05 красным поверх снимков формы (сбоку, сверху, спереди). Масштаб чертежа разный вдоль (KA) и поперёк (KS), как в tu22_geo.py.
# /usr/bin/python3 -I _overlay.py [папка снимков]
import site, sys, os
sys.path.append(site.getusersitepackages())
from PIL import Image
H = os.path.dirname(os.path.abspath(__file__)); S = (sys.argv[1] if len(sys.argv) > 1 else H + '/_снимки') + '/'
KA, KS, KF = 41.6 / 770.0, 0.0515, 1 / 19.55; L = 41.6


def lay(shot, drw, box, fx, fy, anchor_d, anchor_r, out, thr=150):
    t = Image.open(S + shot).convert('RGBA'); bg = Image.new('RGBA', t.size, (200, 205, 212, 255)); bg.alpha_composite(t)
    d = Image.open(H + '/' + drw).convert('L').crop(box); d = d.resize((int(d.width * fx), int(d.height * fy)), Image.LANCZOS)
    a_ = d.point(lambda v: min(255, int((thr - v) * 255 / thr * 1.5)) if v < thr else 0)
    red = Image.new('RGBA', d.size, (225, 20, 20, 0)); red.putalpha(a_)
    bg.alpha_composite(red, (int(round(anchor_r[0] - (anchor_d[0] - box[0]) * fx)), int(round(anchor_r[1] - (anchor_d[1] - box[1]) * fy))))
    bg.convert('RGB').save(S + out, quality=90); print(out)


M = 50.0
# сбоку: 2200x800, 50 пикс/м, (a = 0; z = 1,2) -> (60; 400); носок чертежа (20; 709) - a 0, z (697,5-709)*KS
nose = (60, 400 - ((697.5 - 709) * KS - 1.2) * M)
lay('side_l.png', 'референсы/tu22_05.png', (0, 540, 800, 783), M * KA, M * KS, (20, 709), nose, 'наложение_сбоку.jpg')
lay('side_fly.png', 'референсы/tu22_05.png', (0, 540, 800, 783), M * KA, M * KS, (20, 709), nose, 'наложение_сбоку_полёт.jpg')
# сверху: 2200x2200, нос (a 0) на x = 1100 - 20,8*50, ось на y = 1100; повёрнутый план 05: носок (20; 408,5)
lay('top.png', '_снимки/c/05_top_rot.png', (0, 150, 820, 670), M * KA, M * KS, (20, 408.5), (1100 - L / 2 * M, 1100), 'наложение_сверху.jpg')
# спереди: 2500x1100, 100 пикс/м, (x 0; z 1,2) -> (1250; 550); чертёж: ось x 239,5, земля y 468 (z -3,89)
lay('front_fly.png', 'референсы/tu22_05.png', (5, 270, 475, 475), 100 * KF, 100 * KF, (239.5, 468), (1250, 550 - (-3.89 - 1.2) * 100), 'наложение_спереди.jpg')
