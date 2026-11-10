# _лист_проба.py - лист пробной покраски B-2A: кадры Cycles (т_*) и кадры игры (стенд/*) с подписями. python3 _лист_проба.py
import os
from PIL import Image, ImageDraw, ImageFont
H = os.path.dirname(os.path.abspath(__file__)); P = os.path.join(H, '_проба')
F = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 26)


def sheet(items, out, W=800, cols=3):
    th = []
    for f, cap in items:
        p = os.path.join(P, f)
        if not os.path.exists(p): continue
        im = Image.open(p).convert('RGB'); im = im.resize((W, int(im.height * W / im.width))); d = ImageDraw.Draw(im)
        d.rectangle((0, 0, W, 40), fill=(0, 0, 0)); d.text((12, 6), cap, font=F, fill=(240, 240, 240)); th.append(im)
    h = max(t.height for t in th); rows = (len(th) + cols - 1) // cols
    S = Image.new('RGB', (W * cols, h * rows), (24, 24, 24))
    for i, t in enumerate(th): S.paste(t, ((i % cols) * W, (i // cols) * h))
    S.save(os.path.join(P, out), quality=88); print(out, S.size)


sheet([('т_как_01.jpg', 'как фото 01'), ('т_спереди.jpg', 'спереди'), ('т_сверху.jpg', 'сверху'), ('т_снизу.jpg', 'снизу'), ('т_кабина.jpg', 'кабина'),
       ('т_заборник.jpg', 'заборник'), ('т_выхлоп.jpg', 'жёлоб выхлопа'), ('т_крыло.jpg', 'рули крыла'), ('т_низ.jpg', 'низ, шасси')], 'лист_проба_cycles.jpg')
sheet([('стенд/ангар_1.png', 'игра: ангар'), ('стенд/ангар_2.png', 'игра: ангар ближе'), ('стенд/бой_day_три_четверти.png', 'бой день 3/4'),
       ('стенд/бой_day_сзади.png', 'бой день сзади'), ('стенд/бой_day_снизу.png', 'бой день снизу'), ('стенд/бой_day_спереди.png', 'бой день спереди'),
       ('стенд/бой_evening_три_четверти.png', 'бой вечер 3/4'), ('стенд/бой_evening_сзади.png', 'бой вечер сзади'), ('стенд/бой_evening_спереди.png', 'бой вечер спереди')], 'лист_проба_игра.jpg')
