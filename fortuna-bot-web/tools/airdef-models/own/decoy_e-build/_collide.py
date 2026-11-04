# _collide.py - крылья от сложенного до раскрытого, рули ±RUD_RANGE вокруг радиальной оси. Шаг 1°. Контроль метода: подложка × корпус пересекаются.
import bpy, math, json, os
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import modelkit as mk
sc = bpy.data.scenes['DECOY_E']; objs = [o for o in sc.objects if o.type == 'MESH']
bpy.context.view_layer.update()
G = mk.GEO


def tree(o, mw):
    return BVHTree.FromPolygons([mw @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])


def sweep(o, axis, a0, a1, step, skip=()):
    base = o.matrix_world.copy(); p = base.translation.copy()
    others = [(q.name, tree(q, q.matrix_world)) for q in objs if q is not o and q.name not in skip]
    hits = {}; d = a0
    while (d <= a1 + 1e-6 if step > 0 else d >= a1 - 1e-6):
        M = Matrix.Translation(p) @ Matrix.Rotation(math.radians(d), 4, axis) @ Matrix.Translation(-p) @ base
        t = tree(o, M)
        for n, tt in others:
            if t.overlap(tt): hits.setdefault(n, []).append(round(d, 1))
        d += step
    return {'ход': [a0, a1], 'пересечений': sum(len(v) for v in hits.values()), 'с чем': {n: (v[0], v[-1], len(v)) for n, v in hits.items()}}


res = {}
for k, sgn in ((1, 1.0), (2, -1.0)):
    o = bpy.data.objects[f'wing{k}']; res[o.name] = sweep(o, Vector((0, 0, 1)), 0.0, sgn * G['WING_OPEN'], sgn * 1.0); print(o.name, res[o.name], flush=True)
for k in range(4):
    o = bpy.data.objects[f'rudder_{k}']; res[o.name] = sweep(o, mk.RUD[k]['axis'], -G['RUD_RANGE'], G['RUD_RANGE'], 1.0); print(o.name, res[o.name], flush=True)
res['контроль'] = len(tree(bpy.data.objects['DCE_fixed'], Matrix()).overlap(tree(bpy.data.objects['DCE_body'], Matrix()))); print('КОНТРОЛЬ:', res['контроль'])
out = os.environ.get('DCE_OUT')
if out:
    os.makedirs(os.path.join(out, '_live'), exist_ok=True); json.dump(res, open(os.path.join(out, '_live', 'collide.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('проверка столкновений готова')
