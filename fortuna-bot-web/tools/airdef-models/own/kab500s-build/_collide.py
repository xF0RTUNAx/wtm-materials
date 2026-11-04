# _collide.py - ход подвижных частей КАБ-500С: рули ±CAN_RANGE вокруг радиальной оси, крылья ±WING_RANGE вокруг оси вдоль корня. Шаг 1°, BVH по треугольникам.
# Контроль метода: крылья × планки в покое должны быть без касания (зазор 1 мм), корпус × планки - с касанием. Запуск: Blender -b --factory-startup --python build.py --python _collide.py
import bpy, math, json, os
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import k5s_geo as g
sc = bpy.data.scenes['KAB500S']; objs = [o for o in sc.objects if o.type == 'MESH']
bpy.context.view_layer.update()                          # иначе matrix_world объектов с заданным location ещё единичная и проверка идёт не в том месте


def tree(o, mw): return BVHTree.FromPolygons([mw @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])


res = {}
def sweep(o, mats, skip=()):
    others = [(q.name, tree(q, q.matrix_world)) for q in objs if q is not o and q.name not in skip]; hits = {}
    for tag, M in mats:
        t = tree(o, M)
        for n, tt in others:
            if t.overlap(tt): hits.setdefault(n, []).append(tag)
    return hits


for k in range(4):
    o = bpy.data.objects[f'canard_{k}']; b = o.matrix_world.copy(); ax = g.CAN_PIVOTS[k]['axis']; T = b.translation
    h = sweep(o, [(d, Matrix.Translation(T) @ Matrix.Rotation(math.radians(d), 4, ax) @ Matrix.Translation(-T) @ b) for d in range(-int(g.CAN_RANGE), int(g.CAN_RANGE) + 1)], skip=('K5S_plates',))
    res[o.name] = {'ход': g.CAN_RANGE, 'касаний': sum(len(v) for v in h.values()), 'с чем': {n: (v[0], v[-1]) for n, v in h.items()}}
    # отдельно: плита под рулём
    pl = bpy.data.objects['K5S_plates']; tp = tree(pl, pl.matrix_world); c = 0
    for d in range(-int(g.CAN_RANGE), int(g.CAN_RANGE) + 1):
        if tree(o, Matrix.Translation(T) @ Matrix.Rotation(math.radians(d), 4, ax) @ Matrix.Translation(-T) @ b).overlap(tp): c += 1
    res[o.name]['углов_с_плитой'] = c
    o = bpy.data.objects[f'wing_{k}']; b = o.matrix_world.copy(); T = b.translation
    h = sweep(o, [(d, Matrix.Translation(T) @ Matrix.Rotation(math.radians(d), 4, 'Y') @ Matrix.Translation(-T) @ b) for d in range(-int(g.WING_RANGE), int(g.WING_RANGE) + 1)])
    res[o.name] = {'ход': g.WING_RANGE, 'касаний': sum(len(v) for v in h.values()), 'с чем': {n: (v[0], v[-1]) for n, v in h.items()}}
for n, v in res.items(): print(n, v, flush=True)
print('КОНТРОЛЬ корпус×планки:', len(tree(bpy.data.objects['K5S_body'], Matrix()).overlap(tree(bpy.data.objects['K5S_planks'], Matrix()))))
pts = [bpy.data.objects['wing_0'].matrix_world @ v.co for v in bpy.data.objects['wing_0'].data.vertices]; print('верх крыла z', round(max(p.z for p in pts), 3), '| верх проушин z', round(g.R + g.LUG_H, 3))
out = os.environ.get('K5S_OUT')
if out: json.dump(res, open(os.path.join(out, '_live', 'collide.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
