# _plan.py - план B-2A из снимка снизу b2_14 в приближении параллельной проекции: ось самолёта - прямая через нос и середины симметричных пар,
# поперечное направление - среднее направление пар. Масштаб: размах 52,22 и длина 21,0 (прежняя модель игры). /usr/bin/python3 -I _plan.py
import site, sys, json
sys.path.append(site.getusersitepackages())
import numpy as np
L, HS = 21.0, 26.111
import os
IMG = os.environ.get('IMG', '14')
N = np.array((1118, 238.0)) if IMG == '14' else np.array((442.7, 171.7))
PAIRS = {  # (точка на консоли слева на снимке, симметричная справа)
 'tipLE': ((103, 49), (781, 773)), 'tipTE': ((56, 129), (645, 747)), 'N1': ((422, 203), (755, 567)), 'A1': ((329, 355), (512, 547)), 'N2': ((441, 373), (540, 479))}
if IMG == '12':
    PAIRS = {'tipLE': ((121.7, 6.7), (120, 353.3)), 'tipTE': ((80, 28.3), (68.3, 323.3)), 'N1': ((176.7, 88.3), (175, 268.3)), 'A1': ((106.7, 131.7), (101.7, 233.3)), 'N2': ((136.7, 146.7), (135, 213.3))}
C = np.array((397, 453.0)) if IMG == '14' else np.array((91.7, 180.0))
P = {k: (np.array(a, float), np.array(b, float)) for k, (a, b) in PAIRS.items()}
w = sum((b - a) / np.linalg.norm(b - a) for a, b in P.values()); w /= np.linalg.norm(w)
mids = np.array([(a + b) / 2 for a, b in P.values()] + [C, N])
c0 = mids.mean(0); U, S, Vt = np.linalg.svd(mids - c0); u = Vt[0]
if u.dot(C - N) < 0: u = -u
print('ось', u.round(3), 'поперёк', w.round(3), 'разброс середин от оси, пикс', np.abs((mids - c0) @ Vt[1]).round(1))
for k, (a, b) in P.items():
    d = (b - a) / np.linalg.norm(b - a); print(f'  пара {k:6s} угол к средней поперёк {np.degrees(np.arccos(min(1, abs(d @ w)))):.1f}°')
M = np.column_stack([u, w])
def ab(p): return np.linalg.solve(M, p - N)
raw = {k: (ab(a), ab(b)) for k, (a, b) in P.items()}; raw['C'] = (ab(C), ab(C))
sx = HS / ((abs(raw['tipLE'][0][1]) + abs(raw['tipLE'][1][1])) / 2)
amax = max(max(p[0], q[0]) for p, q in raw.values()); sa = L / amax
out = {}
for k, (p, q) in raw.items():
    a = (p[0] + q[0]) / 2 * sa; x = (abs(p[1]) + abs(q[1])) / 2 * sx; out[k] = (round(a, 3), round(x, 3))
    print(f'{k:6s} a {a:7.3f}  x {x:7.3f}   (разница пары: a {abs(p[0]-q[0])*sa:.2f}, x {abs(abs(p[1])-abs(q[1]))*sx:.2f})')
le = np.degrees(np.arctan2(out['tipLE'][0], out['tipLE'][1])); print('стреловидность передней кромки', round(90 - le, 2), '°')
json.dump(out, open('_снимки/plan%s.json' % IMG, 'w'), indent=1)
