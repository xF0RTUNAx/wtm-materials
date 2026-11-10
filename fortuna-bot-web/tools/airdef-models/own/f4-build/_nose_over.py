# _nose_over.py - сечения носа модели на фото 01 по камере из _cam01.py: _nose_over.py тег [тег...]
import site, sys, json
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image, ImageDraw
P = np.load('_live/P01.npy'); out = []
for tag in sys.argv[1:]:
    R = json.load(open('_live/nose_%s.json' % tag)); im = Image.open('_снимки/рефы/f4_01.png').convert('RGB').crop((80, 620, 680, 1060)); im = im.resize((im.width * 2, im.height * 2), Image.LANCZOS); d = ImageDraw.Draw(im)
    def pr(p):
        q = P @ np.array([p[0], p[1], p[2], 1.0]); return ((q[0] / q[2] - 80) * 2, (q[1] / q[2] - 620) * 2)
    for key, col in (('fore', (255, 60, 60)), ('gun', (255, 200, 0))):
        for ring in R[key][::2]: pts = [pr(p) for p in ring]; d.line(pts + [pts[0]], fill=col, width=1)
        n = len(R[key][0])
        for k in range(0, n, max(1, n // 12)): d.line([pr(r[k]) for r in R[key]], fill=col, width=1)
    pts = [pr(p) for p in R['rad']]; d.line(pts + [pts[0]], fill=(0, 255, 255), width=3)
    d.text((10, 10), tag, fill=(255, 255, 255)); im.save('_снимки/нос_на_фото_%s.jpg' % tag, quality=88); out.append(tag)
print(out)
