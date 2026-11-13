# _лист_формы.py - листы серой формы Ту-22 для Mark: наложения на чертёж 01 и профили 02, модель рядом с фото, крупные планы, подвижные части, отсек. /usr/bin/python3 -I _лист_формы.py
import site, sys, os
sys.path.append(site.getusersitepackages())
from PIL import Image, ImageDraw, ImageFont
H = os.path.dirname(os.path.abspath(__file__)); S = H + '/_снимки/' + (sys.argv[1] if len(sys.argv) > 1 else 'f6') + '/'; R = H + '/референсы/'; O = H + '/_листы/'; os.makedirs(O, exist_ok=True)
F = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 26)


def tile(p, cap, crop=None, W=800):
    im = Image.open(p)
    if im.mode == 'RGBA':
        bg = Image.new('RGBA', im.size, (150, 160, 175, 255)); bg.alpha_composite(im); im = bg
    im = im.convert('RGB')
    if crop: w, h = im.size; im = im.crop((int(w * crop[0]), int(h * crop[1]), int(w * crop[2]), int(h * crop[3])))
    im = im.resize((W, int(im.height * W / im.width))); d = ImageDraw.Draw(im); d.rectangle((0, 0, W, 38), fill=(0, 0, 0)); d.text((10, 5), cap, font=F, fill=(240, 240, 240)); return im


def sheet(rows, out, W=800):
    R_ = [[tile(*x, W=W) for x in r] for r in rows]; hs = [max(i.height for i in r) for r in R_]; cols = max(len(r) for r in R_)
    Sx = Image.new('RGB', (W * cols, sum(hs)), (24, 24, 24)); y = 0
    for r, h in zip(R_, hs):
        for i, im in enumerate(r): Sx.paste(im, (i * W, y))
        y += h
    Sx.save(O + out, quality=88); print(out, Sx.size)


sheet([[(S + 'наложение_сбоку.jpg', 'сбоку на чертёж 05 (красное; по длине растянут до 41,6 м)')], [(S + 'наложение_спереди.jpg', 'спереди на чертёж 05 (размах 23,17 м)')]], 'лист_0_наложения.jpg', W=1600)
sheet([[(S + 'наложение_сверху.jpg', 'сверху на план 05 (красное)', (0.0, 0.18, 1.0, 0.82))]], 'лист_1_план.jpg', W=1400)
sheet([[(S + 'p2_как_02.png', 'модель, ракурс 02'), (R + 'tu22_02.webp', 'фото 02')],
       [(S + 'p9_как_09.png', 'модель, ракурс 09'), (R + 'tu22_09.png', 'фото 09')],
       [(S + 'p1_как_01.png', 'модель, ракурс 01'), (R + 'tu22_01.webp', 'фото 01')],
       [(S + 'c_как_07.png', 'модель сзади'), (R + 'tu22_07.webp', 'фото 07')],
       [(S + 'c_как_10.png', 'модель, гондолы и киль'), (R + 'tu22_10.webp', 'фото 10')]], 'лист_2_фото.jpg')
sheet([[(S + 'c_нос.png', 'нос: штанга дозаправки, окно штурмана'), (S + 'c_фонарь.png', 'фонарь лётчика, крышка в крыше'), (S + 'c_гондолы.png', 'заборники, губы')],
       [(S + 't_сзади.png', 'корма: шар прицела, установка АМ-23'), (S + 'c_гондола_ш.png', 'гондола шасси, створки'), (S + 'c_низ.png', 'низ: створки отсека')]], 'лист_3_крупно.jpg')
sheet([[(S + 'o_поза_спереди.png', 'рули, закрылки, стабилизатор, губы, люки - в крайних положениях'), (S + 'o_поза_сзади.png', 'то же сзади')],
       [(S + 'o_поза_корма.png', 'турель повёрнута, крышка парашютов открыта'), (S + 'o_поза_гондолы.png', 'губы заборников выдвинуты (на земле)')],
       [(S + 'b_fab1000_снизу.png', 'ФАБ-1000 ×4 в отсеке, створки открыты'), (S + 'b_fab1000_сбоку.png', 'ФАБ-1000 ×4, вид сзади-снизу')]], 'лист_4_части_отсек.jpg')
