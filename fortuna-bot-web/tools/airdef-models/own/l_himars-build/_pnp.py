# _pnp.py — камера фото по точкам модели (метры) и пикселям: /usr/bin/python3 _pnp.py <файл точек.json>
# точки: {"w": ширина, "h": высота, "init": [x,y,z, рыскание°, тангаж°, крен°, f_пикс], "pts": [[X,Y,Z, u,v], ...]}
# печатает позицию, цель (точку на 10 м вперёд), горизонтальный угол обзора и невязку по точкам - для _photomatch.py
import json, sys, math
import numpy as np


def rot(yaw, pitch, roll):
    # камера смотрит вдоль -Z своей системы; поворот: рыскание вокруг мирового Z, тангаж, крен
    cy, sy, cp, sp, cr, sr = math.cos(yaw), math.sin(yaw), math.cos(pitch), math.sin(pitch), math.cos(roll), math.sin(roll)
    fwd = np.array([-sy * cp, cy * cp, sp])                 # yaw 0 - взгляд вдоль +Y мира
    right = np.array([cy, sy, 0.0]); up = np.cross(right, fwd)
    r2 = right * cr + up * sr; u2 = -right * sr + up * cr
    return np.array([r2, u2, -fwd])                        # строки: оси камеры x, y, z в мировых


def proj(p, P, w, h):
    C = np.array(p[:3]); R = rot(*[math.radians(a) for a in p[3:6]]); f = p[6]
    q = (R @ (np.array(P[:3]) - C)); return np.array([w / 2 + f * q[0] / -q[2], h / 2 - f * q[1] / -q[2]])


def solve(d):
    p = np.array(d['init'], float); pts = d['pts']; w, h = d['w'], d['h']
    def res(p): return np.concatenate([proj(p, P, w, h) - np.array(P[3:5]) for P in pts])
    lam = 1e-2
    for it in range(400):
        r = res(p); J = np.zeros((len(r), 7))
        for k in range(7):
            e = np.zeros(7); e[k] = 1e-4 if k < 6 else 1e-2; J[:, k] = (res(p + e) - r) / e[k]
        A = J.T @ J; g = J.T @ r
        dp = np.linalg.solve(A + lam * np.diag(np.diag(A) + 1e-9), -g)
        if np.sum(res(p + dp) ** 2) < np.sum(r ** 2): p = p + dp; lam *= 0.5
        else: lam *= 4
    return p, res(p)


if __name__ == '__main__':
    d = json.load(open(sys.argv[1])); p, r = solve(d)
    R = rot(*[math.radians(a) for a in p[3:6]]); fwd = -R[2]; C = p[:3]
    print('позиция', ','.join(f'{v:.3f}' for v in C), '\nцель', ','.join(f'{v:.3f}' for v in C + fwd * 10), '\nкрен°', round(p[5], 2),
          '\nугол°', round(math.degrees(2 * math.atan(d['w'] / 2 / p[6])), 2), 'f', round(p[6], 1))
    print('невязка, пикс:', [round(float(math.hypot(r[2 * i], r[2 * i + 1])), 1) for i in range(len(r) // 2)])
