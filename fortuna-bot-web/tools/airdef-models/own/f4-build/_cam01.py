# _cam01.py - камера фото f4_01 по опорным точкам (DLT): точки модели за кабиной (a, x, z) -> пиксели фото. Потом по этой камере ищется место острия носа и кромки обтекателя РЛС на оси.
import site, sys, json
sys.path.append(site.getusersitepackages())
import numpy as np
L = 19.2
PTS = [  # a, x(право +), z, u, v
    (17.13, 0, 3.04, 1052, 65), (19.02, 0, 3.04, 1105, 60),
    (13.22, 5.85, 0.30, 180, 378), (14.80, 5.85, 0.30, 250, 348), (10.84, 4.02, -0.09, 215, 535),
    (18.08, -2.65, -0.14, 1300, 478), (19.20, -2.65, -0.14, 1320, 463),
    (4.77, 0, 1.285, 430, 628), (7.57, 0, 1.55, 628, 500),
    (6.12, -1.30, 0.89, 700, 665), (6.12, -1.30, -0.29, 690, 792),
    (14.80, -5.85, 0.30, 1548, 660),
]
def W(a, x, z): return np.array([x, L / 2 - a, z, 1.0])
def solve(pts):
    A = []
    for a, x, z, u, v in pts:
        X = W(a, x, z); A += [np.r_[X, 0, 0, 0, 0, -u * X], np.r_[0, 0, 0, 0, X, -v * X]]
    _, _, Vt = np.linalg.svd(np.array(A)); return Vt[-1].reshape(3, 4)
def proj(P, a, x, z):
    q = P @ W(a, x, z); return q[0] / q[2], q[1] / q[2]
P = solve(PTS); err = []
for a, x, z, u, v in PTS:
    pu, pv = proj(P, a, x, z); err.append(np.hypot(pu - u, pv - v)); print(f'{a:6.2f} {x:5.2f} {z:5.2f}  фото ({u},{v})  модель ({pu:.0f},{pv:.0f})  {err[-1]:.1f}')
print('средняя ошибка, пикс:', round(float(np.mean(err)), 1))
np.save('_live/P01.npy', P)
def find(u, v, x, z, a0=-1.0, a1=6.0):
    best = min(np.linspace(a0, a1, 1401), key=lambda a: np.hypot(*(np.array(proj(P, a, x, z)) - (u, v)))); return round(float(best), 2), [round(c) for c in proj(P, best, x, z)]
for name, u, v, z in (('остриё носа', 178, 965, -0.14), ('верх кромки обтекателя РЛС', 290, 827, 0.42), ('основание козырька', 395, 735, 0.735)):
    print(name, (u, v), '-> a =', find(u, v, 0.0, z))
