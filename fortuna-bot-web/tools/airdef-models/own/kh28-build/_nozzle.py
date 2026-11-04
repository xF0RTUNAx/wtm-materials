# _nozzle.py - считает сопло так же, как nozzleOf в игре, с заданной осью [0, 0] (vis.nzAx) и без неё. Запуск после build.py.
import bpy, math
sc = bpy.data.scenes['KH28']; bpy.context.view_layer.update()
P = []
for o in sc.objects:
    if o.type != 'MESH': continue
    for v in o.data.vertices:
        w = o.matrix_world @ v.co; P.append((w.x, w.z, -w.y))        # оси glTF: +Z к хвосту
z0, z1 = min(p[2] for p in P), max(p[2] for p in P); L = z1 - z0; r = 0.215
mid = [p for p in P if z0 + L / 3 < p[2] < z1 - L / 3]
ys = sorted(p[1] for p in mid); xs = sorted(p[0] for p in mid); print('медиана средней трети x, y:', round(xs[len(xs) // 2], 3), round(ys[len(ys) // 2], 3))
zt = z1 - max(0.03 * L, 0.04); tail = [p for p in P if p[2] > zt]; print('в последних 3 %:', len(tail), 'вершин, ширина', round(max(p[0] for p in tail) - min(p[0] for p in tail), 2), 'высота', round(max(p[1] for p in tail) - min(p[1] for p in tail), 2))
cx, cy = 0.0, 0.0
ds = sorted(math.hypot(p[0] - cx, p[1] - cy) for p in mid); rb = ds[len(ds) // 4]; lim = max(r * 0.95, min(rb * 1.2, r * 3))
zs = sorted(p[2] for p in P if math.hypot(p[0] - cx, p[1] - cy) < lim)
print('с осью [0, 0]: сопло z =', round(zs[int(len(zs) * 0.97)] - 0.05, 3), '| срез корпуса z =', round(max(p[2] for p in P if math.hypot(p[0], p[1]) < 0.12 ), 3), '| lim', round(lim, 3))
