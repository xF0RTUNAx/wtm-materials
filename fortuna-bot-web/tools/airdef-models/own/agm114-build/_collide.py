# _collide.py - передние рули ±15° вокруг оси вдоль размаха у корня, шаг 1°. Разрешено: диски осей (HF_pivots).
import bpy, math, json, os
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import modelkit as mk
sc = bpy.data.scenes['HF114']; objs = [o for o in sc.objects if o.type == 'MESH']
bpy.context.view_layer.update()
def tree(o, mw): return BVHTree.FromPolygons([mw @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])
def sweep(o, axis, a0, a1, step, skip=()):
    base = o.matrix_world.copy(); p = base.translation.copy()
    others = [(q.name, tree(q, q.matrix_world)) for q in objs if q is not o and q.name not in skip]
    hits = {}; d = a0
    while d <= a1 + 1e-6:
        M = Matrix.Translation(p) @ Matrix.Rotation(math.radians(d), 4, axis) @ Matrix.Translation(-p) @ base
        t = tree(o, M)
        for nm, tt in others:
            if t.overlap(tt): hits.setdefault(nm, []).append(round(d, 1))
        d += step
    return {'ход': [a0, a1], 'пересечений': sum(len(v) for v in hits.values()), 'с чем': {nm: (v[0], v[-1], len(v)) for nm, v in hits.items()}}
res = {}
for k in range(1, 5):
    o = bpy.data.objects[f'fin_c{k}']; res[o.name] = sweep(o, mk.WING[k]['axis'], -15.0, 15.0, 1.0, skip=('HF_pivots',)); print(o.name, res[o.name], flush=True)
out = os.environ.get('HF_OUT')
if out:
    os.makedirs(os.path.join(out, '_live'), exist_ok=True); json.dump(res, open(os.path.join(out, '_live', 'collide.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('проверка столкновений готова')
