# _collide.py - крылья от сложенного до раскрытого вокруг общей вертикальной оси, шаг 1°; втулка-ось (MLD_pin) - разрешённое касание.
# Контроль метода: кили × корпус пересекаются (кили врезаны в обшивку).
import bpy, math, json, os
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import modelkit as mk
sc = bpy.data.scenes['MALD']; objs = [o for o in sc.objects if o.type == 'MESH']
bpy.context.view_layer.update()


def tree(o, mw):
    return BVHTree.FromPolygons([mw @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])


def sweep(o, axis, a0, a1, step, skip=()):
    base = o.matrix_world.copy(); p = base.translation.copy()
    others = [(q.name, tree(q, q.matrix_world)) for q in objs if q is not o and q.name not in skip]
    hits = {}; d = a0
    while d <= a1 + 1e-6:
        M = Matrix.Translation(p) @ Matrix.Rotation(math.radians(d), 4, axis) @ Matrix.Translation(-p) @ base
        t = tree(o, M)
        for n, tt in others:
            if t.overlap(tt): hits.setdefault(n, []).append(round(d, 1))
        d += step
    return {'ход': [a0, a1], 'пересечений': sum(len(v) for v in hits.values()), 'с чем': {n: (v[0], v[-1], len(v)) for n, v in hits.items()}}


res = {}
for k in (1, 2):
    o = bpy.data.objects[f'wing{k}']; res[o.name] = sweep(o, Vector((0, 0, 1)), 0.0, mk.WING[k]['open_deg'], 1.0, skip=('MLD_pin',)); print(o.name, res[o.name], flush=True)
res['контроль'] = len(tree(bpy.data.objects['MLD_fin_top'], Matrix()).overlap(tree(bpy.data.objects['MLD_body'], Matrix()))); print('КОНТРОЛЬ:', res['контроль'])
out = os.environ.get('MLD_OUT')
if out:
    os.makedirs(os.path.join(out, '_live'), exist_ok=True); json.dump(res, open(os.path.join(out, '_live', 'collide.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('проверка столкновений готова')
