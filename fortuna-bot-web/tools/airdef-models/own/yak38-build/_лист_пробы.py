# _лист_пробы.py - листы пробы краски Як-38М: окраски рядом с фото (Blender и игра), крупные планы знаков. /usr/bin/python3 -I _лист_пробы.py
import site, sys, os
sys.path.append(site.getusersitepackages())
from PIL import Image
H = os.path.dirname(os.path.abspath(__file__)); sys.argv = sys.argv[:1] + ['f8']; src = open(H + '/_лист_формы.py').read().split('sheet([[')[0]; exec(src)
P = H + '/_проба/'; RF = H + '/_снимки/'
NM = {'dark': 'тёмно-серая (05) - в игру', 'blue': 'синий верх, зелёный низ (04) - в запас'}
PH = {'grey': '02', 'blue': '04', 'dark': '05'}
def ex(p): return p if os.path.exists(p) else None
def g_(s, n): return ex(P + f'{s}/стенд/{n}') or (P + f'{s}/т_как_02.jpg')
def ref(n):
    q = RF + f'ref_{n}.jpg'
    if not os.path.exists(q):
        src_ = [f for f in os.listdir(H + '/референсы') if f.startswith(n + '.')][0]; Image.open(H + '/референсы/' + src_).convert('RGB').save(q, quality=90)
    return q
VIEW = {'grey': 'т_как_02.jpg', 'blue': 'т_как_04.jpg', 'dark': 'т_как_02.jpg'}
sheet([[(P + f'{s}/{VIEW[s]}', f'{i + 1}. {NM[s]}'), (ref(PH[s]), f'фото {PH[s]}')] for i, s in enumerate(NM)], 'лист_п1_варианты.jpg')
sheet([[(P + f'{s}/т_как_06.jpg', f'{i + 1}. сверху-сзади'), (g_(s, 'бой_day_три_четверти.png'), f'{i + 1}. игра, бой')] for i, s in enumerate(NM)], 'лист_п2_игра.jpg')
for s in NM:
    sheet([[(P + f'{s}/т_нос.jpg', 'заборник: номер, щели подпитки'), (P + f'{s}/т_губа.jpg', 'губа и канал заборника')],
           [(P + f'{s}/т_киль.jpg', 'киль: звезда в центре неподвижной части'), (P + f'{s}/т_крыло.jpg', 'консоль: звезда в центре без элерона')],
           [(P + f'{s}/т_сверху.jpg', 'сверху'), (P + f'{s}/т_низ.jpg', 'снизу')],
           [(P + f'{s}/т_сопло.jpg', 'поворотное сопло, копоть'), (P + f'{s}/т_стойка.jpg', 'основная стойка')],
           [(P + f'{s}/т_корень.jpg', 'корень крыла снизу-сзади: зализ'), (P + f'{s}/т_корень2.jpg', 'корень крыла сверху')],
           [(P + f'{s}/т_хвост.jpg', 'стабилизатор: корень по обводу хвоста'), (P + f'{s}/т_хвост2.jpg', 'хвост сзади')],
           [(P + f'{s}/т_кабина.jpg', 'кабина и ПВД'), (g_(s, 'ангар_1.png'), 'игра: ангар')]], f'лист_п3_{s}.jpg')
