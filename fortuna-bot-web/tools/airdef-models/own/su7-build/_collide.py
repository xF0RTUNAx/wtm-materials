# _collide.py - столкновения: ход всех подвижных частей, бомбы двух загрузок на шести точках со стойками, сдвоенные держатели под ФАБ-100. После build.py.
import bpy, math, json, os
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import su7_geo as g
sc = bpy.data.scenes['SU7']; bpy.context.view_layer.update()
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
OWN = '/Users/mark./wtm-materials/fortuna-bot-web/'
def store(fn):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=OWN + fn); new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']; bpy.context.view_layer.update()
    vs = [o.matrix_world @ v.co for o in new for v in o.data.vertices]; fs = []; k0 = 0
    for o in new:
        fs += [tuple(k0 + i for i in p.vertices) for p in o.data.polygons]; k0 += len(o.data.vertices)
    top = max(v.z for v in vs); cy = (max(v.y for v in vs) + min(v.y for v in vs)) / 2; cx = (max(v.x for v in vs) + min(v.x for v in vs)) / 2
    vs = [v - Vector((cx, cy, top)) for v in vs]
    for o in list(set(bpy.data.objects) - before): bpy.data.objects.remove(o)
    print('подвеска', fn, 'длина', round(max(v.y for v in vs) - min(v.y for v in vs), 2), 'ширина', round(max(v.x for v in vs) - min(v.x for v in vs), 2), 'высота', round(-min(v.z for v in vs), 2)); return vs, fs
for n_, d_ in (('flap_r', 24), ('flap_l', 24), ('brake_d_r', 50), ('brake_d_l', 50), ('brake_u_r', 50), ('brake_u_l', 50)):
    o = objs[n_]; D = g.PARTS[n_]; M = rotm(D['pivot'], D['axis'], d_)
    for q in fam(o): q.matrix_world = M @ q.matrix_world
bpy.context.view_layer.update(); ALL = {n: tree(o) for n, o in objs.items()}
FAB250 = 'tools/airdef-models/own/fab250.glb'; FAB100 = 'tools/airdef-models/own/fab100.glb'
S = {n: store(fn) for n, fn in (('fab500', 'tools/airdef-models/own/fab500.glb'), ('fab250', FAB250), ('fab100', FAB100), ('pod', 'games/airdef/models/w_pod.glb'))}
P = g.PYLON_PTS
def place(n, p): vs, fs = S[n]; return BVHTree.FromPolygons([v + p for v in vs], fs)
def check(title, items):
    """items: (груз, имя точки, сдвиг) - обе стороны сразу."""
    T = [(n + ' ' + k_, k_, place(n, P[k_] + Vector(d))) for n, k_, d in items]; hits = {}
    for nm, k_, t in T:
        h = [m for m, tt in ALL.items() if m != k_ and t.overlap(tt)]
        h += ['груз ' + n2 for n2, _, t2 in T if n2 != nm and t.overlap(t2)]
        if h: hits[nm] = h
    res[title] = hits; lo = min(P[k_].z + d[2] + min(v.z for v in S[n][0]) for n, k_, d in items); print('просвет до земли', title, round(lo - g.GROUND_Z, 2))
both = lambda lst: [(n, k_ + s_, (d[0] * (1 if s_ == 'r' else -1), d[1], d[2])) for n, k_, d in lst for s_ in ('r', 'l')]
Z0 = (0, 0, 0)
check('A: ФАБ-500 фюз. + ФАБ-250 внутр. крыл.', both([('fab500', 'pylon_f_', Z0), ('fab250', 'pylon_i_', Z0)]))
check('B6: ФАБ-250 крыл. ×4 + ФАБ-100 фюз. ×2', both([('fab250', 'pylon_i_', Z0), ('fab250', 'pylon_o_', Z0), ('fab100', 'pylon_f_', Z0)]))
check('все ФАБ-500', both([('fab500', 'pylon_f_', Z0), ('fab500', 'pylon_i_', Z0), ('fab500', 'pylon_o_', Z0)]))
# сдвоенный держатель (МБД) под ФАБ-100 на подфюзеляжной точке: две бомбы тандемом, ниже на 0,12 м
w100 = max(v.x for v in S['fab100'][0]) - min(v.x for v in S['fab100'][0]); l100 = max(v.y for v in S['fab100'][0]) - min(v.y for v in S['fab100'][0])
dy = l100 / 2 + 0.06
check('B8: ФАБ-250 крыл. ×4 + ФАБ-100 ×4 на МБД тандемом под фюз.', both([('fab250', 'pylon_i_', Z0), ('fab250', 'pylon_o_', Z0), ('fab100', 'pylon_f_', (0, dy, -0.12)), ('fab100', 'pylon_f_', (0, -dy, -0.12))]))
dx = w100 / 2 + 0.02
check('B8 рядом: ФАБ-100 ×4 парами бок о бок', both([('fab250', 'pylon_i_', Z0), ('fab250', 'pylon_o_', Z0), ('fab100', 'pylon_f_', (dx, 0, -0.12)), ('fab100', 'pylon_f_', (-dx, 0, -0.12))]))
print('ФАБ-100: длина', round(l100, 2), 'ширина', round(w100, 2))
FA = [place('fab500', P['pylon_f_' + s_]) for s_ in 'rl']; pod = {}
for i in range(0, 50):
    a = 3.0 + 0.2 * i; t = place('pod', g.P3(a, 0.0, g.FT[1](min(a, g.NOZ_A0)) - 0.02)); h = [m for m, tt in ALL.items() if t.overlap(tt)] + (['ФАБ-500 фюз.'] if any(t.overlap(q) for q in FA) else [])
    pod[round(a, 1)] = h
res['контейнер по оси, a: касания'] = {k_: v for k_, v in pod.items() if v}; res['контейнер чисто при a'] = [k_ for k_, v in pod.items() if not v]
if 'center' in P:
    t = place('pod', P['center']); res['контейнер'] = [m for m, tt in ALL.items() if t.overlap(tt)] + ['груз ФАБ-500 фюз.' for s_ in 'rl' if t.overlap(place('fab500', P['pylon_f_' + s_]))]
for n, v in res.items(): print(f'{n:16s} {v}', flush=True)
json.dump(res, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '_live', 'collide.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=str)
