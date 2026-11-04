# _collide.py - проход каждого руля по диапазону: ±RUD_RANGE с шагом 1° вокруг своей оси (радиальная), пересечения с остальными объектами (BVH по треугольникам).
# Контроль метода: крылья × рельс и корпус × крылья должны пересекаться (намеренный контакт). Запуск после build.py:  Blender -b --factory-startup --python build.py --python _collide.py
import bpy, math, json, os
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import agm_geo as g
sc = bpy.data.scenes['AGM65B']; objs = [o for o in sc.objects if o.type == 'MESH']
bpy.context.view_layer.update()                          # иначе matrix_world объектов с заданным location ещё единичная и проверка идёт не в том месте


def tree(o, mw):
    return BVHTree.FromPolygons([mw @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])


res = {}
for k in range(4):
    o = bpy.data.objects[f'rudder_{k}']; ax = g.RUD_PIVOTS[k]['axis']; base = o.matrix_world.copy()
    others = [(q.name, tree(q, q.matrix_world)) for q in objs if q is not o and q.name not in ('M65_seats',)]
    hits = {}
    for d in range(-int(g.RUD_RANGE), int(g.RUD_RANGE) + 1):
        M = Matrix.Translation(base.translation) @ Matrix.Rotation(math.radians(d), 4, ax) @ Matrix.Translation(-base.translation) @ base
        t = tree(o, M)
        for n, tt in others:
            if t.overlap(tt): hits.setdefault(n, []).append(d)
    # соседние рули при тех же углах не сближаются: оси через 90°, размах мал
    res[o.name] = {'углы': [-g.RUD_RANGE, g.RUD_RANGE], 'пересечений': sum(len(v) for v in hits.values()), 'с чем': {n: (v[0], v[-1]) for n, v in hits.items()}}
    print(o.name, 'начало', [round(c, 3) for c in base.translation], res[o.name], flush=True)
print('КОНТРОЛЬ крылья×корпус:', len(tree(bpy.data.objects['M65_wings'], Matrix()).overlap(tree(bpy.data.objects['M65_body'], Matrix()))))
out = os.environ.get('AGM_OUT')
if out: json.dump(res, open(os.path.join(out, '_live', 'collide.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
