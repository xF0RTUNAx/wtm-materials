# _fit.py — ракета со сложенными рулями: наибольший радиус от оси и длина (для трубы HIMARS)
import os, math, bpy
_p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build.py'); exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
pose(0.0); bpy.context.view_layer.update(); rmax = 0; ys = []
for o in COL.objects:
    if o.type != 'MESH': continue
    for v in o.data.vertices:
        w = o.matrix_world @ v.co; rmax = max(rmax, math.hypot(w.x, w.z)); ys.append(w.y)
print('FIT сложено: радиус %.4f м, длина %.4f м' % (rmax, max(ys) - min(ys)))
pose(1.0); bpy.context.view_layer.update(); rmax = 0
for o in FINS:
    for v in o.data.vertices: w = o.matrix_world @ v.co; rmax = max(rmax, math.hypot(w.x, w.z))
print('FIT раскрыто: размах по концам %.3f м' % (2 * rmax))
