# _collide.py - столкновения: ход крыла 16…72,5° с пилонами (пилоны смотрят вперёд), ход остальных частей, бомбы GBU-12 и Mk 82 на восьми точках. После build.py.
import bpy, math, json, os
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import f111_geo as g
sc = bpy.data.scenes['F111']; bpy.context.view_layer.update()
objs = {o.name: o for o in sc.objects if o.type == 'MESH'}
def tree(o, mw=None):
    mw = o.matrix_world if mw is None else mw; return BVHTree.FromPolygons([mw @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])
def rotm(T, axis, deg): return Matrix.Translation(T) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-T)
def kids(o): return [c for c in sc.objects if c.parent is o and c.type == 'MESH']
def fam(o):
    out = [o]
    for c in kids(o): out += fam(c)
    return out
res = {}
STATIC = [n for n in objs if not n.startswith(('wing', 'slat', 'flap', 'spoil', 'pylon', 'rack', 'gear'))]
ST = {n: tree(objs[n]) for n in STATIC}
# 1. ход крыла
for sx, tag in ((1, 'r'), (-1, 'l')):
    w = objs['wing_' + tag]; pv = g.pivot_v(sx); hits = {}
    for i in range(25):
        s = g.SW_MIN + (g.SW_MAX - g.SW_MIN) * i / 24; M = rotm(pv, 'Z', -sx * (s - g.SWEEP))
        for o in fam(w):
            Mo = M @ o.matrix_world
            top = o if o.name.startswith('pylon') else (o.parent if o.name.startswith('rack') else None)
            if top is not None: P = M @ g.PARTS[top.name]['pivot']; Mo = rotm(P, 'Z', sx * (s - g.SWEEP)) @ Mo      # пилон остаётся по потоку
            t = tree(o, Mo)
            for n, tt in ST.items():
                if t.overlap(tt): hits.setdefault(o.name + ' × ' + n, []).append(round(s, 1))
    res['ход крыла ' + tag] = {k_: (v[0], v[-1], len(v)) for k_, v in hits.items()}
# 2. ход остальных частей
for n, D in g.PARTS.items():
    if n.startswith(('gear', 'wing', 'pylon')) or not D.get('range') or n not in objs: continue
    o = objs[n]; r0, r1 = D['range']; grp = fam(o); skip = {q.name for q in grp} | ({o.parent.name} if o.parent else set()); hits = {}
    pool = {m: tree(q) for m, q in objs.items() if m not in skip and not m.startswith('gear')}
    for i in range(13):
        d = r0 + (r1 - r0) * i / 12; M = Matrix.Translation(D['axis'] * d) if D.get('kind') == 'slide' else rotm(D['pivot'], D['axis'], d)
        for q in grp:
            t = tree(q, M @ q.matrix_world)
            for m, tt in pool.items():
                if t.overlap(tt): hits.setdefault(m, []).append(round(d, 1))
    res[n] = {k_: (v[0], v[-1], len(v)) for k_, v in hits.items()}
# 3. бомбы на точках: верх бомбы у точки; шасси выпущено, щиток 35° и 60°, закрылки 35°
OWN = '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/'
def store(fn):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=OWN + fn); new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']; bpy.context.view_layer.update()
    vs = [o.matrix_world @ v.co for o in new for v in o.data.vertices]; fs = []; k0 = 0
    for o in new:
        fs += [tuple(k0 + i for i in p.vertices) for p in o.data.polygons]; k0 += len(o.data.vertices)
    top = max(v.z for v in vs); cy = (max(v.y for v in vs) + min(v.y for v in vs)) / 2; cx = (max(v.x for v in vs) + min(v.x for v in vs)) / 2
    vs = [v - Vector((cx, cy, top)) for v in vs]
    for o in list(set(bpy.data.objects) - before): bpy.data.objects.remove(o)
    print('подвеска', fn, 'длина', round(max(v.y for v in vs) - min(v.y for v in vs), 2), 'ширина', round(max(v.x for v in vs) - min(v.x for v in vs), 2), 'высота', round(-min(v.z for v in vs), 2)); return vs, fs
for n_, d_ in (('brake', 35), ('flap_i_r', 35), ('flap_o_r', 35), ('flap_i_l', 35), ('flap_o_l', 35)):
    o = objs[n_]; D = g.PARTS[n_]; M = rotm(D['pivot'], D['axis'], d_)
    for q in fam(o): q.matrix_world = M @ q.matrix_world
bpy.context.view_layer.update(); ALL = {n: tree(o) for n, o in objs.items()}
pts = {k_: v for k_, v in g.PYLON_PTS.items() if k_ != 'pod'}
for fn in ('gbu12.glb', 'mk82.glb'):
    vs, fs = store(fn); trs = {k_: BVHTree.FromPolygons([v + p for v in vs], fs) for k_, p in pts.items()}; hits = {}
    for k_, t in trs.items():
        for n, tt in ALL.items():
            if n.startswith('rack') and n.replace('rack', 'pylon') in k_: continue
            if t.overlap(tt): hits.setdefault(k_, []).append(n)
        for k2, t2 in trs.items():
            if k2 > k_ and t.overlap(t2): hits.setdefault(k_, []).append('бомба ' + k2)
    res['подвеска ' + fn] = hits; print('просвет до земли', fn, round(min(p.z for p in pts.values()) + min(v.z for v in vs) + 1.75, 2))
for n, v in res.items(): print(f'{n:16s} {v}', flush=True)
json.dump(res, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '_live', 'collide.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=str)
