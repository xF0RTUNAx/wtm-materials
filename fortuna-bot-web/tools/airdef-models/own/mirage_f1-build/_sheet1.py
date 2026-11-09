# _sheet1.py - листы формы с подписями. /usr/bin/python3 -I _sheet1.py
import site, sys, os
sys.path.append(site.getusersitepackages())
from PIL import Image, ImageDraw, ImageFont
H = os.path.dirname(os.path.abspath(__file__)); S = H + '/_снимки/'; R = S + 'рефы/'
ft = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 24)
def sheet(items, out, w=800, h=500, cols=3):
    items = [(f, t) for f, t in items if os.path.exists(f)]
    rows = (len(items) + cols - 1) // cols; G = Image.new('RGB', (w * cols, (h + 36) * rows), (40, 42, 46)); d = ImageDraw.Draw(G)
    for i, (f, t) in enumerate(items):
        im = Image.open(f).convert('RGBA'); bg = Image.new('RGBA', im.size, (178, 184, 190, 255)); bg.alpha_composite(im); im = bg.convert('RGB'); k = min(w / im.width, h / im.height); im = im.resize((int(im.width * k), int(im.height * k)), Image.LANCZOS)
        x, y = i % cols * w, i // cols * (h + 36); G.paste(im, (x + (w - im.width) // 2, y + 36 + (h - im.height) // 2)); d.text((x + 10, y + 5), t, font=ft, fill=(235, 235, 235))
    G.save(S + out, quality=90); print(out, G.size)
sheet([(S + 'наложение_07.jpg', 'контур формы поверх фото 07'), (S + 'side_r.png', 'сбоку'), (S + 'front.png', 'спереди'), (S + 'top.png', 'сверху'), (S + 'bottom.png', 'снизу'), (S + 'rear.png', 'сзади'),
       (S + 'p7_как_07.png', 'ракурс как фото 07'), (R + 'f1_07.png', 'фото 07'), (S + 'p2_как_02.png', 'ракурс как фото 02'), (R + 'f1_02.png', 'фото 02'), (S + 'p6_как_06.png', 'ракурс как фото 06'), (R + 'f1_06.png', 'фото 06'),
       (S + 'p1_как_01.png', 'ракурс как фото 01'), (R + 'f1_01.png', 'фото 01'), (S + 'p4_как_04.png', 'ракурс как фото 04'), (R + 'f1_04.png', 'фото 04'), (S + 'p3_как_03.png', 'ракурс как фото 03'), (R + 'f1_03.png', 'фото 03')], 'лист_1_форма.jpg')
sheet([(S + 'c_кабина.png', 'кабина со стеклом'), (S + 'c_кабина_борт.png', 'кабина с борта'), (S + 'c_нос.png', 'нос: щуп, штанги нет'), (S + 'c_устье.png', 'заборник спереди, полуконус'), (S + 'c_заборник.png', 'заборник сбоку'), (S + 'c_спина.png', 'спина'),
       (S + 'c_хвост.png', 'киль, контейнер, антенны'), (S + 'c_сопло.png', 'сопло с лепестками'), (S + 'c_крыло.png', 'крыло: предкрылки, закрылок, элерон'), (S + 'c_законцовка.png', 'направляющая на законцовке'), (S + 'c_щитки.png', 'тормозные щитки'), (S + 'c_гребни.png', 'подфюзеляжные гребни'),
       (S + 'c_низ.png', 'низ, стойки выпущены'), (S + 'j_низ_закрыто.png', 'низ, как в бою: створки закрыты'), (S + 'c_шасси_н.png', 'передняя стойка'), (S + 'c_шасси_м.png', 'основная стойка'), (S + 'c_шасси_сзади.png', 'стойки сзади')], 'лист_2_детали.jpg')
sheet([(S + 'o_поза_спереди.png', 'части в крайних положениях: спереди'), (S + 'o_поза_сзади.png', 'то же сзади'), (S + 'o_поза_снизу.png', 'то же снизу'), (S + 'o_поза_кабина.png', 'фонарь открыт: петля сзади, 40°')], 'лист_3_ход.jpg', 800, 500, 2)
