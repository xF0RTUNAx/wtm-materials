# _collide.py - проверка столкновений по всему ходу: передние рули ±CAN_RANGE вокруг радиальной оси, хвостовые крылья ±WING_RANGE вокруг оси вдоль корпуса, головка ±25° по двум осям. Шаг 1° (головка 2,5°).
# Контроль метода: накладки × корпус должны пересекаться. Запуск после build.py: K5K_OUT=<папка> Blender -b --factory-startup --python build.py --python _collide.py
import bpy, math, json, os
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import modelkit as mk
sc = bpy.data.scenes['KAB500KR']; objs = [o for o in sc.objects if o.type == 'MESH']
bpy.context.view_layer.update()
G = mk.GEO


def tree(o, mw):
    return BVHTree.FromPolygons([mw @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])


def sweep(o, axis_list, rng, step):
    base = o.matrix_world.copy(); p = base.translation.copy()
    others = [(q.name, tree(q, q.matrix_world)) for q in objs if q is not o and q.name not in ('K5K_grid',)]
    hits = {}
    for ax in axis_list:
        d = -rng
        while d <= rng + 1e-6:
            M = Matrix.Translation(p) @ Matrix.Rotation(math.radians(d), 4, ax) @ Matrix.Translation(-p) @ base
            t = tree(o, M)
            for n, tt in others:
                if t.overlap(tt): hits.setdefault(n, []).append(round(d, 1))
            d += step
    return {'ход': [-rng, rng], 'пересечений': sum(len(v) for v in hits.values()), 'с чем': {n: (v[0], v[-1]) for n, v in hits.items()}}


res = {}
for k in range(4):
    o = bpy.data.objects[f'canard_{k}']; res[o.name] = sweep(o, [mk.CANARD[k]['axis']], G['CAN_RANGE'], 1.0); print(o.name, res[o.name], flush=True)
for k in range(4):
    o = bpy.data.objects[f'wing_{k}']; res[o.name] = sweep(o, [mk.WING[k]['axis']], G['WING_RANGE'], 1.0); print(o.name, res[o.name], flush=True)
o = bpy.data.objects['K5K_head']; res[o.name] = sweep(o, [Vector((1, 0, 0)), Vector((0, 0, 1))], 25.0, 2.5); print(o.name, res[o.name], flush=True)
ctrl = len(tree(bpy.data.objects['K5K_plates'], Matrix()).overlap(tree(bpy.data.objects['K5K_body'], Matrix())))
res['контроль_накладки_корпус'] = ctrl; print('КОНТРОЛЬ накладки×корпус:', ctrl)
res['высота'] = dict(проушины_м=round(G['LUG_TOP'], 3), крылья_м=round(G['WING_TOP'], 3))
out = os.environ.get('K5K_OUT')
if out:
    os.makedirs(os.path.join(out, '_live'), exist_ok=True); json.dump(res, open(os.path.join(out, '_live', 'collide.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('проверка столкновений готова')
