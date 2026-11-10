# _лист.py - лист формы для Mark: снимки с подписями. /usr/bin/python3 -I _лист.py <папка снимков> <выход.jpg>
import site, sys, os
sys.path.append(site.getusersitepackages())
from PIL import Image, ImageDraw, ImageFont
D, OUT = sys.argv[1], sys.argv[2]; H = '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/B-2A/_снимки/'
ITEMS = [(D + '/p_как_01.png', 'сверху-спереди, как фото 01'), (D + '/p_как_07.png', 'спереди-сверху, как фото 07'),
         (H + 'наложение_план_b2_12.jpg', 'план на фото 12: красный - модель'), (H + 'наложение_бок_b2_05.jpg', 'профиль на фото 05: красный - модель'),
         (D + '/o_сверху.png', 'сверху'), (D + '/g_снизу.png', 'снизу, шасси выпущено'),
         (D + '/c_кабина.png', 'кабина: 4 окна, рама одним кольцом'), (D + '/c_заборник.png', 'заборник: капюшон с пилой из 3 зубцов'),
         (D + '/c_выхлоп.png', 'жёлоб выхлопа, 2 сопла'), (D + '/c_конец.png', 'конец крыла: щитки и элевон'),
         (D + '/g_как_04.png', 'на шасси, как фото 04'), (D + '/b_отсеки.png', 'два отсека открыты: держатели, рёбра, пила на торцах')]
W, Hh, C = 900, 520, 2; ft = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 24)
rows = (len(ITEMS) + C - 1) // C; sheet = Image.new('RGB', (W * C, (Hh + 40) * rows), (30, 32, 36)); d = ImageDraw.Draw(sheet)
for i, (p, cap) in enumerate(ITEMS):
    if not os.path.exists(p): continue
    im = Image.open(p).convert('RGBA'); bg = Image.new('RGBA', im.size, (176, 184, 194, 255)); bg.alpha_composite(im); im = bg.convert('RGB')
    im.thumbnail((W - 10, Hh - 10)); x = (i % C) * W + (W - im.width) // 2; y = (i // C) * (Hh + 40) + 5 + (Hh - im.height) // 2
    sheet.paste(im, (x, y)); d.text(((i % C) * W + 12, (i // C) * (Hh + 40) + Hh + 6), cap, fill=(235, 235, 235), font=ft)
sheet.save(OUT, quality=88); print(OUT, sheet.size)
