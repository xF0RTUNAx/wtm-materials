# _sheet1.py - листы формы с подписями. /usr/bin/python3 -I _sheet1.py
import site, sys, os
sys.path.append(site.getusersitepackages())
from PIL import Image, ImageDraw, ImageFont
H = os.path.dirname(os.path.abspath(__file__)); S = H + '/_снимки/'; R = S + 'рефы/'
ft = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 24)
def sheet(items, out, w=800, h=500, cols=3):
    rows = (len(items) + cols - 1) // cols; G = Image.new('RGB', (w * cols, (h + 36) * rows), (40, 42, 46)); d = ImageDraw.Draw(G)
    for i, (f, t) in enumerate(items):
        im = Image.open(f).convert('RGBA'); bg = Image.new('RGBA', im.size, (178, 184, 190, 255)); bg.alpha_composite(im); im = bg.convert('RGB'); k = min(w / im.width, h / im.height); im = im.resize((int(im.width * k), int(im.height * k)), Image.LANCZOS)
        x, y = i % cols * w, i // cols * (h + 36); G.paste(im, (x + (w - im.width) // 2, y + 36 + (h - im.height) // 2)); d.text((x + 10, y + 5), t, font=ft, fill=(235, 235, 235))
    G.save(S + out, quality=90); print(out, G.size)
sheet([(S + 'наложение_04.jpg', 'подложка сбоку: фото 04 (красное - модель)'), (S + 'контур_04.jpg', 'контур модели на фото 04'), (S + 'side_l.png', 'сбоку, на шасси'), (S + 'top.png', 'сверху'), (S + 'bottom.png', 'снизу'), (S + 'front.png', 'спереди'),
       (S + 'rear.png', 'сзади'), (S + 'p7_как_07.png', 'ракурс как фото 07'), (R + 'f100_07.png', 'фото 07 (только форма)'), (S + 'p6_как_06.png', 'сверху-сзади, как 06'), (R + 'f100_06.png', 'фото 06 (ранний A: общий вид)'), (S + 'p1_как_01.png', 'снизу-спереди, как 01'),
       (R + 'f100_01.png', 'фото 01 (двухместный: низ)'), (S + 'p5_как_05.png', 'спереди-сбоку, как 05'), (R + 'f100_05.png', 'копия 05 (только форма)'), (S + 'p2_как_02.png', 'сзади, как 02'), (R + 'f100_02.png', 'копия 02 (только форма)')], 'лист_1_форма.jpg')
sheet([(S + 'c_кабина.png', 'кабина со стеклом'), (S + 'c_кабина_борт.png', 'кабина с борта'), (S + 'c_нос.png', 'нос, штанга ПВД'), (S + 'c_устье.png', 'воздухозаборник спереди'), (S + 'c_пушки.png', 'пушки под кабиной'), (S + 'c_спина.png', 'гаргрот за фонарём'),
       (S + 'c_хвост.png', 'киль, руль, стабилизатор'), (S + 'c_сопло.png', 'сопло с лепестками'), (S + 'c_стабилизатор.png', 'корень стабилизатора'), (S + 'c_крыло.png', 'крыло: закрылок, элерон, перегородка'), (S + 'c_предкрылок.png', 'предкрылки'), (S + 'c_штанга.png', 'штанга дозаправки'),
       (S + 'c_низ.png', 'низ, шасси выпущено'), (S + 'j_низ_закрыто.png', 'низ, как в бою: створки закрыты'), (S + 'c_щиток.png', 'тормозной щиток'), (S + 'c_пилоны.png', 'пилоны'), (S + 'c_шасси_н.png', 'передняя стойка'), (S + 'c_шасси_м.png', 'основная стойка')], 'лист_2_детали.jpg', 800, 500, 3)
sheet([(S + 'o_поза_спереди.png', 'части в крайних положениях: спереди'), (S + 'o_поза_сзади.png', 'то же сзади'), (S + 'o_поза_снизу.png', 'то же снизу: щиток, закрылки, предкрылки'), (S + 'o_поза_кабина.png', 'фонарь откинут')], 'лист_3_ход.jpg', 800, 500, 2)
