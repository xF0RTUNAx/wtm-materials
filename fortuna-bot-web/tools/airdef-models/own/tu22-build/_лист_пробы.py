# _лист_пробы.py - листы пробы краски Ту-22: окраски рядом (Blender и игра), крупные планы, яркость против фото. /usr/bin/python3 -I _лист_пробы.py
import site, sys, os
sys.path.append(site.getusersitepackages())
from PIL import Image
import numpy as np
H = os.path.dirname(os.path.abspath(__file__)); sys.argv = sys.argv[:1] + ['f7']; src = open(H + '/_лист_формы.py').read().split('sheet([[')[0]; exec(src)
P = H + '/_проба/'
NM = {'metal': 'голый алюминий', 'grey': 'двухтонный серый', 'desert': 'песок, бурый, зелёный', 'aged': 'старый алюминий'}
def ex(p): return p if os.path.exists(p) else None
def g_(s, n): return ex(P + f'{s}/стенд/{n}') or (P + f'{s}/т_как_02.jpg')
sheet([[(P + f'{s}/т_как_02.jpg', f'{i + 1}. {NM[s]}'), (g_(s, 'бой_day_три_четверти.png'), f'{i + 1}. {NM[s]} - игра, бой')] for i, s in enumerate(NM)], 'лист_п1_варианты.jpg')
sheet([[(P + f'{s}/т_сверху.jpg', f'{NM[s]} - сверху'), (P + f'{s}/т_как_09.jpg', f'{NM[s]} - сзади')] for s in NM], 'лист_п2_сверху_сзади.jpg')
for s in NM:
    sheet([[(P + f'{s}/т_как_01.jpg', 'спереди, ракурс 01'), (P + f'{s}/т_как_10.jpg', 'гондолы и киль, ракурс 10')],
           [(P + f'{s}/т_нос.jpg', 'нос: номер, окна, ПВД'), (P + f'{s}/т_гондолы.jpg', 'заборники, губы')],
           [(P + f'{s}/т_крыло.jpg', 'крыло сверху'), (P + f'{s}/т_низ.jpg', 'низ: потёки, масло, отсек')],
           [(P + f'{s}/т_стойка.jpg', 'основная стойка'), (P + f'{s}/т_как_07.jpg', 'сзади, ракурс 07')],
           [(P + f'{s}/т_корма.jpg', 'корма: установка, копоть'), (g_(s, 'ангар_1.png'), 'игра: ангар')]], f'лист_п3_{s}.jpg')
