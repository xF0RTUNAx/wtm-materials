# _collide.py - проверка столкновений: крылья от сложенного до раскрытого (вертикальная ось), киль и стабилизаторы ±RUD_RANGE (ось радиальная), гондола на шарнире 0…-180° (ось X, задняя часть уходит вверх и вперёд).
# У гондолы берётся только обечайка без пилона: пилон стоит в обшивке намеренно. Шаг 1° (гондола 5°). Контроль метода: плоский низ × корпус пересекаются.
import bpy, math, json, os
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import modelkit as mk
sc = bpy.data.scenes['KH101']; objs = [o for o in sc.objects if o.type == 'MESH']
bpy.context.view_layer.update()
G = mk.GEO


def tree(o, mw, keep=None):
    polys = [tuple(p.vertices) for p in o.data.polygons if keep is None or keep(p)]
    return BVHTree.FromPolygons([mw @ v.co for v in o.data.vertices], polys)


def sweep(o, axis, a0, a1, step, skip=(), keep=None):
    base = o.matrix_world.copy(); p = base.translation.copy()
    others = [(q.name, tree(q, q.matrix_world)) for q in objs if q is not o and q.name not in skip]
    hits = {}; d = a0
    while (d <= a1 + 1e-6 if step > 0 else d >= a1 - 1e-6):
        M = Matrix.Translation(p) @ Matrix.Rotation(math.radians(d), 4, axis) @ Matrix.Translation(-p) @ base
        t = tree(o, M, keep)
        for n, tt in others:
            if t.overlap(tt): hits.setdefault(n, []).append(round(d, 1))
        d += step
    return {'ход': [a0, a1], 'пересечений': sum(len(v) for v in hits.values()), 'с чем': {n: (v[0], v[-1], len(v)) for n, v in hits.items()}}


res = {}
for k, sgn in ((1, 1.0), (2, -1.0)):
    o = bpy.data.objects[f'wing{k}']; res[o.name] = sweep(o, Vector((0, 0, 1)), 0.0, sgn * G['WING_OPEN'], sgn * 1.0); print(o.name, res[o.name], flush=True)
for n in ('fin', 'stab1', 'stab2'):
    o = bpy.data.objects[n]; res[n] = sweep(o, mk.PARTS[n]['axis'], -G['RUD_RANGE'], G['RUD_RANGE'], 1.0, skip=('K101_body',) if False else ()); print(n, res[n], flush=True)
o = bpy.data.objects['nacelle']; me = o.data
zlim = (G['C_Z'] + 16.0) * mk.S - o.location.z
shell = lambda p: me.polygons[p.index].center.z < zlim
res['nacelle'] = sweep(o, Vector((1, 0, 0)), 0.0, -180.0, -5.0, skip=('fan',), keep=shell); print('nacelle', res['nacelle'], flush=True)
ctrl = len(tree(bpy.data.objects['K101_fixed'], Matrix()).overlap(tree(bpy.data.objects['K101_body'], Matrix())))
res['контроль'] = ctrl; print('КОНТРОЛЬ наплывы×корпус:', ctrl)
out = os.environ.get('K101_OUT')
if out:
    os.makedirs(os.path.join(out, '_live'), exist_ok=True); json.dump(res, open(os.path.join(out, '_live', 'collide.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('проверка столкновений готова')
