# _collide.py - раскрытие крыла «ромб»: wing1, wing2, wing1s, wing2s поворачиваются вместе, линейно от 0 до 100 % (101 шаг).
# Проверка: пересечения подвижных частей между собой и с неподвижными (кроме осей-пальцев SDB_pins - сквозные по замыслу),
# зазор: от конца подкоса (низ, середина торца) до ближайшей точки своего крыла.
import bpy, math, json, os
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import modelkit as mk
sc = bpy.data.scenes['GBU39']; bpy.context.view_layer.update()
objs = [o for o in sc.objects if o.type == 'MESH']
MOV = ['wing1', 'wing2', 'wing1s', 'wing2s']
KEY = {'wing1': 1, 'wing2': 2, 'wing1s': '1s', 'wing2s': '2s'}
BASE = {n: bpy.data.objects[n].matrix_world.copy() for n in MOV}
def mat(n, t):
    W = mk.WING[KEY[n]]; p = BASE[n].translation.copy()
    return Matrix.Translation(p) @ Matrix.Rotation(math.radians(W['open_deg'] * t), 4, W['axis']) @ Matrix.Translation(-p) @ BASE[n]
def tree(o, mw): return BVHTree.FromPolygons([mw @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])
fixed = [(q.name, tree(q, q.matrix_world)) for q in objs if q.name not in MOV and q.name != 'SDB_pins']
hits = {}; gaps = {1: [], 2: []}
for i in range(101):
    t = i / 100; T = {n: tree(bpy.data.objects[n], mat(n, t)) for n in MOV}
    for n in MOV:
        for nm, tt in fixed + [(m, T[m]) for m in MOV if m > n]:
            if T[n].overlap(tt): hits.setdefault(f'{n} × {nm}', []).append(t)
    for k in (1, 2):
        tip = mat(f'wing{k}s', t) @ mk.WING[f'{k}s']['tip_local']
        loc, nor, idx, d = T[f'wing{k}'].find_nearest(tip); gaps[k].append(round(d, 4))
res = {'шагов': 101, 'пересечений': {k: (v[0], v[-1], len(v)) for k, v in hits.items()},
       'зазор_подкос_крыло_м': {f'wing{k}s→wing{k}': dict(наибольший=max(gaps[k]), при=gaps[k].index(max(gaps[k])) / 100, сложено=gaps[k][0], половина=gaps[k][50], раскрыто=gaps[k][100]) for k in (1, 2)}}
print('ПЕРЕСЕЧЕНИЯ', res['пересечений']); print('ЗАЗОРЫ', res['зазор_подкос_крыло_м'], flush=True)
out = os.environ.get('SDB_OUT')
if out:
    os.makedirs(os.path.join(out, '_live'), exist_ok=True); json.dump(res, open(os.path.join(out, '_live', 'collide.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('проверка столкновений готова')
