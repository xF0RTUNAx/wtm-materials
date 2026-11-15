# _sheet.py - лист формы Х-59МК2: кадры Workbench (_показ/f_*, d_* - крыло раскрыто) рядом с фото 10, 11, 13. /usr/bin/python3 -I _sheet.py → _показ/лист_формы.jpg
import os, sys, site
sys.path.append(site.getusersitepackages())
from PIL import Image, ImageDraw, ImageFont
H = os.path.dirname(os.path.abspath(__file__)); S = os.path.join(H, '_показ'); R = os.path.join(H, 'референсы'); W = 2400
F = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 30)
def fit(p, w, h, label=''):
    im = Image.open(p).convert('RGB'); k = max(w / im.width, h / im.height); im = im.resize((int(im.width * k + 1), int(im.height * k + 1)), Image.LANCZOS)
    x0, y0 = (im.width - w) // 2, (im.height - h) // 2; im = im.crop((x0, y0, x0 + w, y0 + h))
    if label: d = ImageDraw.Draw(im); d.rectangle((0, 0, d.textlength(label, font=F) + 20, 44), fill=(30, 30, 30)); d.text((10, 6), label, font=F, fill=(255, 255, 255))
    return im
def strip(p, label):
    im = Image.open(p).convert('RGB'); im = im.resize((W, int(im.height * W / im.width)), Image.LANCZOS); im = im.crop((0, int(im.height * 0.18), W, int(im.height * 0.82)))
    d = ImageDraw.Draw(im); d.rectangle((0, 0, d.textlength(label, font=F) + 20, 44), fill=(30, 30, 30)); d.text((10, 6), label, font=F, fill=(255, 255, 255)); return im
tw, th = W // 2, int(W // 2 * 0.56)
rows = [strip(os.path.join(S, 'f_side.png'), 'сбоку, крыло сложено (как в игре)'), strip(os.path.join(S, 'd_side.png'), 'сбоку, крыло раскрыто')]
pairs = [(os.path.join(S, 'f_front34.png'), 'спереди, сложено'), (os.path.join(R, '11_maks2015_side_profile.jpg'), 'фото 11'),
         (os.path.join(S, 'd_front34.png'), 'раскрыто, рули отклонены'), (os.path.join(R, '13_maks2015_rear_nozzle_fins_b.jpg'), 'фото 13'),
         (os.path.join(S, 'f_nose.png'), 'нос'), (os.path.join(R, '10_maks2015_front_oblique_nose_window.jpg'), 'фото 10'),
         (os.path.join(S, 'f_nosel.png'), 'окно ГСН снизу'), (os.path.join(S, 'f_tail.png'), 'хвост: сопло, рули'),
         (os.path.join(S, 'd_top.png'), 'сверху, крыло раскрыто'), (os.path.join(S, 'f_top.png'), 'сверху, крыло сложено')]
for i in range(0, len(pairs), 2):
    row = Image.new('RGB', (W, th)); row.paste(fit(pairs[i][0], tw, th, pairs[i][1]), (0, 0)); row.paste(fit(pairs[i + 1][0], tw, th, pairs[i + 1][1]), (tw, 0)); rows.append(row)
out = Image.new('RGB', (W, sum(r.height for r in rows)), (40, 40, 40)); y = 0
for r in rows: out.paste(r, (0, y)); y += r.height
out.save(os.path.join(S, 'лист_формы.jpg'), quality=86); print(out.size)
