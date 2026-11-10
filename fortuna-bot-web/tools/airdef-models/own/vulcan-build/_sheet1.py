# _sheet1.py - листы формы с подписями для показа Mark. /usr/bin/python3 -I _sheet1.py
import site, sys, os
sys.path.append(site.getusersitepackages())
from PIL import Image, ImageDraw, ImageFont
H = os.path.dirname(os.path.abspath(__file__)); S = H + '/_снимки/'; R = S + 'рефы/'
ft = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 24)


def sheet(items, out, w=800, h=500, cols=3):
    rows = (len(items) + cols - 1) // cols; G = Image.new('RGB', (w * cols, (h + 36) * rows), (40, 42, 46)); d = ImageDraw.Draw(G)
    for i, (f, t) in enumerate(items):
        if not os.path.exists(f): print('нет файла', f); continue
        im = Image.open(f).convert('RGBA'); bg = Image.new('RGBA', im.size, (178, 184, 190, 255)); bg.alpha_composite(im); im = bg.convert('RGB'); k = min(w / im.width, h / im.height); im = im.resize((int(im.width * k), int(im.height * k)), Image.LANCZOS)
        x, y = i % cols * w, i // cols * (h + 36); G.paste(im, (x + (w - im.width) // 2, y + 36 + (h - im.height) // 2)); d.text((x + 10, y + 5), t, font=ft, fill=(235, 235, 235))
    G.save(S + out, quality=90); print(out, G.size)


sheet([(S + 'наложение_04.jpg', 'наложение на фото 04 (красное - модель)'), (S + 'наложение_01.jpg', 'наложение на фото 01 (красное - модель)'), (S + 'side_l.png', 'слева'),
       (S + 'top.png', 'сверху'), (S + 'bottom.png', 'снизу, шасси выпущено'), (S + 'j_низ_полёт.png', 'снизу, как в бою: створки закрыты'),
       (S + 'front.png', 'спереди'), (S + 'rear.png', 'сзади'), (S + 'p01_как_01.png', 'ракурс как фото 01'),
       (R + 'vulcan_01.png', 'фото 01'), (S + 'p04_как_04.png', 'ракурс как фото 04'), (R + 'vulcan_04.png', 'фото 04'),
       (S + 'p05_как_05.png', 'ракурс как фото 05'), (R + 'vulcan_05.png', 'фото 05'), (S + 'p06_как_06.png', 'ракурс как фото 06'),
       (R + 'vulcan_06.png', 'фото 06'), (S + 'p02_как_02.png', 'сзади снизу, как 02'), (R + 'vulcan_02.png', 'фото 02'),
       (S + 'j_как_03.png', 'снизу, как 03'), (R + 'vulcan_03.png', 'фото 03')], 'лист_1_форма.jpg')
sheet([(S + 'c_кабина.png', 'кабина: колпак с переплётом, два кресла'), (S + 'c_нос.png', 'нос, штанга, блистер прицела'), (S + 'c_заборник.png', 'заборник в корне крыла'),
       (S + 'c_заборник_прямо.png', 'заборник спереди: перегородка'), (S + 'c_хвост.png', 'хвостовой конус и четыре сопла'), (S + 'c_хвост_как_фото.png', 'хвост в ракурсе твоего фото: конус плавно сходится в купол'), (S + 'c_киль.png', 'киль, руль, колпак'),
       (S + 'c_отсек.png', 'бомбоотсек закрыт'), (S + 'o_отсек_открыт.png', 'отсек открыт: балки, замки, цилиндры'), (S + 'o_отсек_сбоку.png', 'отсек открыт сбоку'),
       (S + 'o_тормоза.png', 'тормозные щитки выдвинуты'), (S + 'o_рули_сзади.png', 'элевоны и руль отклонены'), (S + 'c_пилон.png', 'пилон со сдвоенной балкой под Shrike'),
       (S + 'c_шасси_пер.png', 'передняя стойка'), (S + 'c_шасси_осн.png', 'основная стойка: тележка на 8 колёс'), (S + 'c_конец_крыла.png', 'конец крыла, приёмник')], 'лист_2_детали.jpg', 800, 500, 3)
