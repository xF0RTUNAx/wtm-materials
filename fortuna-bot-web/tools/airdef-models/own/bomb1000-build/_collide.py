# _collide.py — проверка крыльчаток: полный оборот 360° (шаг 3°) вокруг оси бомбы, пересечения с остальными объектами (BVH по треугольникам).
# Запуск после build.py в том же Blender:  Blender -b --factory-startup --python build.py --python _collide.py
import bpy, math, json, os
from mathutils import Matrix
from mathutils.bvhtree import BVHTree
sc = bpy.data.scenes['BOMB1000']; dg = bpy.context.evaluated_depsgraph_get()
objs = [o for o in sc.objects if o.type == 'MESH']


def tree(o, mw):
    me = o.data; return BVHTree.FromPolygons([mw @ v.co for v in me.vertices], [tuple(p.vertices) for p in me.polygons])


res = {}
for vn in ('vane_nose', 'vane_tail'):
    v = bpy.data.objects[vn]; others = [(o.name, tree(o, o.matrix_world)) for o in objs if o is not v]
    hits = []; base = v.matrix_world.copy()
    for k in range(120):
        ang = 3.0 * k
        mw = base @ Matrix.Rotation(math.radians(ang), 4, 'Y')
        tv = tree(v, mw)
        for n, t in others:
            if tv.overlap(t): hits.append((ang, n))
    res[vn] = {'шагов': 120, 'пересечений': len(hits), 'с чем': sorted(set(n for a, n in hits))}
    print(vn, res[vn])
out = os.environ.get('M65_OUT')
if out: json.dump(res, open(os.path.join(out, '_live', 'collide.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
