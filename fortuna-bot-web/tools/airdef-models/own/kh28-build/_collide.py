# _collide.py - ход рулей Х-28: каждый ±RUD_RANGE вокруг своей оси, шаг 1°, BVH по треугольникам. Контроль метода: крылья × корпус должны касаться. Запуск: Blender -b --factory-startup --python build.py --python _collide.py
import bpy, math, json, os
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import k28_geo as g
sc = bpy.data.scenes['KH28']; objs = [o for o in sc.objects if o.type == 'MESH']
bpy.context.view_layer.update()                          # иначе matrix_world объектов с заданным location ещё единичная


def tree(o, mw): return BVHTree.FromPolygons([mw @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])


res = {}
for name, D in g.RUD_PIVOTS.items():
    o = bpy.data.objects[name]; b = o.matrix_world.copy(); T = b.translation; ax = D['axis']; hits = {}
    others = [(q.name, tree(q, q.matrix_world)) for q in objs if q is not o]
    for d in range(-int(g.RUD_RANGE), int(g.RUD_RANGE) + 1):
        t = tree(o, Matrix.Translation(T) @ Matrix.Rotation(math.radians(d), 4, ax) @ Matrix.Translation(-T) @ b)
        for n, tt in others:
            if t.overlap(tt): hits.setdefault(n, []).append(d)
    res[name] = {'ход': g.RUD_RANGE, 'касаний': sum(len(v) for v in hits.values()), 'с чем': {n: (v[0], v[-1]) for n, v in hits.items()}}
for n, v in res.items(): print(n, v, flush=True)
print('КОНТРОЛЬ корпус×крылья:', len(tree(bpy.data.objects['K28_body'], Matrix()).overlap(tree(bpy.data.objects['K28_wings'], Matrix()))))
pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]; print('габарит Y', round(min(p.y for p in pts), 3), round(max(p.y for p in pts), 3), 'X', round(max(p.x for p in pts), 3), 'Z', round(min(p.z for p in pts), 3), round(max(p.z for p in pts), 3))
out = os.environ.get('K28_OUT')
if out: json.dump(res, open(os.path.join(out, '_live', 'collide.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
