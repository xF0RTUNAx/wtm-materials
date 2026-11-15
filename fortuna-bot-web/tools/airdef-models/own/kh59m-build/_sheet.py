# _sheet.py - лист формы Х-59М для Mark: /usr/bin/python3 -I _sheet.py → _показ/лист_формы.jpg
import sys, site, os
sys.path.append(site.getusersitepackages())
from PIL import Image, ImageDraw, ImageFont
H = os.path.dirname(os.path.abspath(__file__)); P = lambda n: os.path.join(H, '_показ', n)
F = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 26)
W = 1920; tw, th = W // 3, int(W // 3 * 10 / 16)
tiles = [('f_front34.png', 'общий вид (полётная - так в игре)'), ('f_low34.png', 'снизу: кабельный короб, пилон, двигатель'), ('f_rear34.png', 'сзади: крылья, элероны, купол антенны'),
         ('g_nose.png', 'голова без стекла: объектив, подвес, блоки, жгуты'), ('f_engine.png', 'двигатель: губа, компрессор, сопло'), ('s_start34.png', 'стартовая: рули сложены (догадка по чертежу)')]
rows = []
for tag, cap in (('f_наложение_бок.png', 'полётная конфигурация на виде 2 чертежа 04 (синее - модель, красный контур - её силуэт)'), ('s_наложение_старт.png', 'стартовая (ускоритель, сложенные рули) на виде 1')):
    ov = Image.open(P(tag)).convert('RGB'); rows.append((ov.resize((W, int(ov.height * W / ov.width))), cap))
fr = [Image.open(P(f)).convert('RGB').crop((100, 100, 900, 900)).resize((th, th)) for f in ('f_front.png', 'f_aft.png')]
dr = Image.open(os.path.join(H, 'референсы', '04.png')).convert('RGB').crop((30, 195, 330, 320)); dr = dr.resize((int(dr.width * th / dr.height), th))
Ht = sum(r.height + 40 for r, _ in rows) + 2 * (th + 40) + th + 40
sheet = Image.new('RGB', (W, Ht), (235, 236, 238)); d = ImageDraw.Draw(sheet); y = 0
for im, cap in rows: d.text((10, y + 6), cap, fill=(20, 20, 20), font=F); sheet.paste(im, (0, y + 40)); y += im.height + 40
for i, (f, cap) in enumerate(tiles):
    im = Image.open(P(f)).convert('RGB').resize((tw, th)); x = (i % 3) * tw; yy = y + (i // 3) * (th + 40)
    d.text((x + 10, yy + 6), cap, fill=(20, 20, 20), font=F); sheet.paste(im, (x, yy + 40))
y += 2 * (th + 40)
d.text((10, y + 6), 'спереди и сзади (модель) рядом с видами спереди и сзади чертежа', fill=(20, 20, 20), font=F)
sheet.paste(fr[0], (0, y + 40)); sheet.paste(fr[1], (th + 10, y + 40)); sheet.paste(dr, (2 * th + 30, y + 40))
sheet.save(P('лист_формы.jpg'), quality=88); print(sheet.size)
