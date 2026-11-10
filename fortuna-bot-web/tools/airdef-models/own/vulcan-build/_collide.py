# _collide.py - прогон подвижных частей по всему ходу, BVH: VUL_STAGE=4. Итог: VUL_OUT_J (json) и строки в вывод.
import bpy, math, json, os
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import vul_geo as g
sc = bpy.data.scenes["VUL"]; bpy.context.view_layer.update()
objs = {o.name: o for o in sc.objects if o.type == 'MESH'}
def tree(o, mw): return BVHTree.FromPolygons([mw @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])
SLIDES = {n for n, D in g.PARTS.items() if D.get('kind') == 'slide'}
def rot(o, axis, deg, T, slide=False):
    if slide: return Matrix.Translation(axis * deg) @ o.matrix_world
    return Matrix.Translation(T) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-T) @ o.matrix_world
def sweep(name, degs, skip=(), children=()):
    o = objs[name]; D = g.PARTS[name]; ax = D['axis']; T = D['pivot']
    pool = [(n, tree(q, q.matrix_world)) for n, q in objs.items() if n != name and n not in skip and n not in children and not n.startswith('gear')]
    hits = {}
    for d in degs:
        M = rot(o, ax, d, T, name in SLIDES); ts = [tree(o, M)]
        for ch in children:
            c = objs[ch]; ts.append(tree(c, rot(c, ax, d, T, name in SLIDES)))
        for n, tt in pool:
            if any(t.overlap(tt) for t in ts): hits.setdefault(n, []).append(round(d, 2))
    return {'ход': (degs[0], degs[-1]), 'касаний': sum(len(v) for v in hits.values()), 'с чем': {n: (v[0], v[-1], len(v)) for n, v in hits.items()}}
res = {}
import vul_gear as gr_
for n, D in g.PARTS.items():
    r0, r1 = D['range']; degs = [r0 + (r1 - r0) * i / 24 for i in range(25)]
    if n.startswith('door_'): degs = [gr_.POSE.get(n, r1)]          # створки шасси только в файле стоек, неподвижно открыты: проверяется конечное положение
    ch = tuple(c for c in objs if c == n + '_ribs')
    res[n] = sweep(n, degs, children=ch)
# бомбы: восемь штук своей AN-M65A1 на точках отсека, проверка с закрытыми створками и путь падения при открытых
BOMB = '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/AN-M65A1/bomb1000.glb'
before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=BOMB); new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
for o in bpy.data.objects:
    if o not in before and o.name not in sc.collection.objects:
        try: sc.collection.objects.link(o)
        except Exception: pass
bpy.context.view_layer.update()
V = []; F = []
for o in new:
    M = o.matrix_world; base = len(V); V += [M @ v.co for v in o.data.vertices]; F += [[base + i for i in p.vertices] for p in o.data.polygons]
# в glTF нос бомбы -Z, верх +Y; в Blender после импорта: нос +Y, верх +Z. Ось бомбы на (0,0,0), проушины вверх
mn = min(v.z for v in V); mx = max(v.z for v in V); print('бомба: высота', round(mx - mn, 3), 'длина', round(max(v.y for v in V) - min(v.y for v in V), 3))
fixed = {n: tree(objs[n], objs[n].matrix_world) for n in objs if not n.startswith('gear')}
def bomb_tree(c, dz=0.0): return BVHTree.FromPolygons([v + c + Vector((0, 0, dz)) for v in V], F)
bomb_hits = {}
for k, p in g.STATIONS.items():
    c = Vector((p.x, p.y, p.z - 0.05 - g.BOMB_R))           # как вешает игра: ось на r + 5 см ниже точки
    bt = bomb_tree(c); h = [n for n, t in fixed.items() if bt.overlap(t)]
    if h:
        bomb_hits[k + ' на месте'] = h
        for n in h:
            pr = bt.overlap(fixed[n])[:3]; o = objs[n]; M = o.matrix_world
            print('  касание', k, n, [tuple(round(x, 3) for x in (M @ o.data.vertices[o.data.polygons[j].vertices[0]].co)) for _, j in pr])
# открыть створки и уронить на 3,5 м
for n in ('bay_l', 'bay_r'):
    D = g.PARTS[n]; o = objs[n]; o.matrix_world = rot(o, D['axis'], D['range'][1], D['pivot'])
bpy.context.view_layer.update()
fixed = {n: tree(objs[n], objs[n].matrix_world) for n in objs if not n.startswith('gear')}
for k, p in g.STATIONS.items():
    c = Vector((p.x, p.y, p.z - 0.05 - g.BOMB_R))
    for dz in [-0.05 * i for i in range(1, 71)]:
        bt = bomb_tree(c, dz); h = [n for n, t in fixed.items() if bt.overlap(t)]
        if h: bomb_hits.setdefault(k + ' падение', set()).update(h)
res['_бомбы'] = {'ход': (0, -3.5), 'касаний': len(bomb_hits), 'с чем': {k: sorted(v) for k, v in bomb_hits.items()}}
for n, v in res.items(): print(f'{n:16s} {v}', flush=True)
out = os.environ.get('VUL_OUT_J')
if out: json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=str)
