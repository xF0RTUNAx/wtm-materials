# _corners.py - углы силуэта: контур маски и упрощение Дугласа-Пекера. /usr/bin/python3 -I _corners.py <маска.npy> <допуск, пикс>
import site, sys
sys.path.append(site.getusersitepackages())
import numpy as np
m = np.load(sys.argv[1]); tol = float(sys.argv[2])
H, W = m.shape
# граница: обход по краю (Moore)
ys, xs = np.nonzero(m); i0 = np.argmin(xs * 10000 + ys); start = (ys[i0], xs[i0])
dirs = [(0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1)]
def inside(y, x): return 0 <= y < H and 0 <= x < W and m[y, x]
cont = [start]; cur = start; d = 6
for _ in range(200000):
    for k in range(8):
        dd = (d + 6 + k) % 8; y, x = cur[0] + dirs[dd][0], cur[1] + dirs[dd][1]
        if inside(y, x): cur = (y, x); d = dd; break
    if cur == start: break
    cont.append(cur)
P = np.array([(x, y) for y, x in cont], float)
def dp(pts, tol):
    if len(pts) < 3: return list(pts)
    a, b = pts[0], pts[-1]; ab = b - a; n = np.hypot(*ab) or 1
    d = np.abs((pts[:, 0] - a[0]) * ab[1] - (pts[:, 1] - a[1]) * ab[0]) / n; i = int(np.argmax(d))
    if d[i] > tol: return dp(pts[:i + 1], tol)[:-1] + dp(pts[i:], tol)
    return [a, b]
# разрезать замкнутый контур в самой дальней точке от начала
j = int(np.argmax(np.hypot(*(P - P[0]).T)))
poly = dp(P[:j + 1], tol)[:-1] + dp(P[j:], tol)[:-1]
for p in poly: print(int(p[0]), int(p[1]))
