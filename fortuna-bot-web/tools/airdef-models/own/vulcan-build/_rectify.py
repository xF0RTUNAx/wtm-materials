# _rectify.py - план Vulcan с фото vulcan_03 (снизу, почти плановый вид): аффинное преобразование по острию штанги, концу хвостового конуса и концам крыла.
# Неизвестная продольная координата концов крыла at решается вместе с аффинной матрицей (8 уравнений, 7 неизвестных). /usr/bin/python3 -I _rectify.py
import site, sys; sys.path.append(site.getusersitepackages())
import numpy as np
L, HS = 30.72, 33.668 / 2                         # длина со штангой, полуразмах (прежняя модель игры)
# фото 03: A - верхнее крыло на снимке = правое, B - нижнее = левое
P = dict(probe=(650, 177), tail=(151, 300), A_le=(128, 93), B_le=(336, 441))
rows, rhs = [], []
def eq(u, v, ix, val, at_coef=0.0):
    r = [0.0] * 7
    if ix == 0: r[0], r[1], r[4] = u, v, 1.0
    else: r[2], r[3], r[5] = u, v, 1.0
    r[6] = at_coef; rows.append(r); rhs.append(val)
eq(*P['probe'], 0, 0.0); eq(*P['probe'], 1, 0.0)
eq(*P['tail'], 0, 0.0); eq(*P['tail'], 1, L)
eq(*P['A_le'], 0, HS); eq(*P['A_le'], 1, 0.0, -1.0)
eq(*P['B_le'], 0, -HS); eq(*P['B_le'], 1, 0.0, -1.0)
s, res, *_ = np.linalg.lstsq(np.array(rows), np.array(rhs), rcond=None)
M = np.array([[s[0], s[1]], [s[2], s[3]]]); T = np.array([s[4], s[5]]); at = s[6]
f = lambda u, v: M @ np.array([u, v]) + T
print('a конца крыла по передней кромке', round(at, 3), 'невязка', np.round(np.array(rows) @ s - np.array(rhs), 3))
pts = {
 'radome': [(616, 193)],
 'A_te_tip': [(91, 104)], 'B_te_tip': [(300, 452)],
 'A_le': [(128, 93), (190, 108), (240, 123), (290, 140), (330, 154), (345, 160), (380, 170), (400, 180)],
 'B_le': [(336, 441), (350, 430), (381, 400), (400, 372), (415, 345), (430, 320), (445, 300), (462, 275), (470, 262), (490, 245)],
 'A_te': [(91, 104), (140, 172), (186, 236)], 'B_te': [(300, 452), (271, 400), (232, 330)],
 'intake_A': [(400, 180), (470, 197)], 'pipes_A': [(195, 245), (205, 262)], 'pipes_B': [(233, 310), (244, 327)],
 'bay': [(390, 250), (680 / 2, 350 / 2)],
}
for k, v in pts.items():
    print(k, [tuple(round(float(q), 2) for q in f(*p)) for p in v])
