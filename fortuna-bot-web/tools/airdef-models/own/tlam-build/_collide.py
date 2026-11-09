# _collide.py - раскрытие: крылья wing1, wing2, рули fin1..4 и воздухозаборник intake поворачиваются вместе, линейно от 0 до 100 % (101 шаг); пересечения между собой и с корпусом.
import bpy, math, json, os
from mathutils import Matrix
from mathutils.bvhtree import BVHTree
import modelkit as mk
sc = bpy.data.scenes['TLAM']; bpy.context.view_layer.update()
objs = [o for o in sc.objects if o.type == 'MESH']
MOV = list(mk.WING.keys())
BASE = {n: bpy.data.objects[n].matrix_world.copy() for n in MOV}
def mat(n, t):
    W = mk.WING[n]; p = BASE[n].translation.copy()
    return Matrix.Translation(p) @ Matrix.Rotation(math.radians(W['open_deg'] * t), 4, W['axis']) @ Matrix.Translation(-p) @ BASE[n]
def tree(o, mw): return BVHTree.FromPolygons([mw @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])
fixed = [(q.name, tree(q, q.matrix_world)) for q in objs if q.name not in MOV]
hits = {}
for i in range(101):
    t = i / 100; T = {n: tree(bpy.data.objects[n], mat(n, t)) for n in MOV}
    for n in MOV:
        for nm, tt in fixed + [(m, T[m]) for m in MOV if m > n]:
            if T[n].overlap(tt): hits.setdefault(f'{n} × {nm}', []).append(t)
res = {'шагов': 101, 'пересечений': {k: (v[0], v[-1], len(v)) for k, v in hits.items()}}
print('ПЕРЕСЕЧЕНИЯ', res['пересечений'], flush=True)
json.dump(res, open(os.path.join(os.environ['TH_OUT'], '_live', 'collide.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
