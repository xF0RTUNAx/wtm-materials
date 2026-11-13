# _collide.py - прогон подвижных частей Су-24М по всему ходу (BVH) при консолях 16° (SU_SWEEP=0), потом подвеска своими моделями. Итог: SU_OUT_J (json) и строки в вывод.
import bpy, math, json, os
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import su_geo as g
try:
    import su_gear as gr_
except ImportError:
    import types; gr_ = types.SimpleNamespace(POSE={})
sc = bpy.data.scenes["SU"]; bpy.context.view_layer.update()
objs = {o.name: o for o in sc.objects if o.type == 'MESH'}
def tree(o, mw): return BVHTree.FromPolygons([mw @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])
SL = set()
def rot(o, axis, deg, T):
    if o.name in SL: return Matrix.Translation(axis * deg) @ o.matrix_world
    return Matrix.Translation(T) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-T) @ o.matrix_world
def kids(n):
    out = []
    for c, o in objs.items():
        p_ = o.parent
        while p_ is not None:
            if p_.name == n: out.append(c); break
            p_ = p_.parent
    return tuple(out)
def sweep(name, degs):
    o = objs[name]; D = g.PARTS[name]; ax = D['axis']; T = D['pivot']; ch = kids(name)
    pool = [(n, tree(q, q.matrix_world)) for n, q in objs.items() if n != name and n not in ch and not n.startswith(('gear', 'door_'))]
    hits = {}
    for d in degs:
        ts = [tree(o, rot(o, ax, d, T))] + [tree(objs[c], (Matrix.Translation(ax * d) @ objs[c].matrix_world) if name in SL else rot(objs[c], ax, d, T)) for c in ch]
        for n, tt in pool:
            if any(t.overlap(tt) for t in ts): hits.setdefault(n, []).append(round(d, 2))
    return {'ход': (degs[0], degs[-1]), 'касаний': sum(len(v) for v in hits.values()), 'с чем': {n: (v[0], v[-1], len(v)) for n, v in hits.items()}}
res = {}
SL.update(n for n, D in g.PARTS.items() if D.get('kind') == 'slide')
for n, D in g.PARTS.items():
    if n not in objs or D.get('kind') == 'scale': continue
    r0, r1 = D['range']; degs = [r0 + (r1 - r0) * i / 24 for i in range(25)]
    if n.startswith('door_'): degs = [gr_.POSE.get(n, r1)]
    res[n] = sweep(n, degs)
OWN = '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/'; GAME = '/Users/mark./wtm-materials/fortuna-bot-web/games/airdef/models/'
def load(path):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=path); new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    bpy.context.view_layer.update(); V = []; F = []
    for o in new:
        M = o.matrix_world; base = len(V); V += [M @ v.co for v in o.data.vertices]; F += [[base + i for i in p.vertices] for p in o.data.polygons]
    for o in [o for o in bpy.data.objects if o not in before]: bpy.data.objects.remove(o)
    cx = (max(v.x for v in V) + min(v.x for v in V)) / 2; cy = (max(v.y for v in V) + min(v.y for v in V)) / 2; cz = (max(v.z for v in V) + min(v.z for v in V)) / 2
    V = [v - Vector((cx, cy, cz)) for v in V]; top = max(v.z for v in V)
    print(os.path.basename(path), 'длина', round(max(v.y for v in V) - min(v.y for v in V), 3), 'высота', round(top * 2, 3), 'размах', round(max(v.x for v in V) * 2, 3))
    return V, F, top
def wt(V, F, c): return BVHTree.FromPolygons([v + c for v in V], F)
def hang(V, F, top, pts, tag, doors=(), drop=3.5):
    hits = {}
    fixed = {n: tree(objs[n], objs[n].matrix_world) for n in objs if not n.startswith(('gear', 'door_'))}
    for k, p in pts.items():
        c = Vector((p.x, p.y, p.z - 0.05 - top)); bt = wt(V, F, c); h = [n for n, t in fixed.items() if bt.overlap(t)]
        if h: hits[k + ' на месте'] = h
    saved = {n: objs[n].matrix_world.copy() for n in doors}
    for n in doors: D = g.PARTS[n]; objs[n].matrix_world = rot(objs[n], D['axis'], D['range'][1], D['pivot'])
    bpy.context.view_layer.update(); fixed = {n: tree(objs[n], objs[n].matrix_world) for n in objs if not n.startswith(('gear', 'door_'))}
    for k, p in pts.items():
        c = Vector((p.x, p.y, p.z - 0.05 - top))
        for dz in [-0.05 * i for i in range(1, int(drop / 0.05) + 1)]:
            bt = wt(V, F, c + Vector((0, 0, dz))); h = [n for n, t in fixed.items() if bt.overlap(t)]
            if h: hits.setdefault(k + ' падение', set()).update(h)
    for n, M in saved.items(): objs[n].matrix_world = M
    bpy.context.view_layer.update()
    res[tag] = {'касаний': len(hits), 'с чем': {k: sorted(v) for k, v in hits.items()}}
# подвеска (задание главного чата): КАБ-500Л, Х-58, Х-29Т, Х-31П на всех шести точках, контейнер - на центральной; на месте, при сбросе, со стойками и открытыми створками, соседи
PTS = {k: v for k, v in g.STATIONS.items() if k != 'center'}; POD = {'center': g.STATIONS['center']}
STORES = [('КАБ-500Л', OWN + 'kab500l.glb', PTS), ('Х-58', GAME + 'w_kh58.glb', PTS), ('Х-29Т', OWN + 'kh29t.glb', PTS), ('Х-31П', OWN + 'kh31p.glb', PTS), ('контейнер', GAME + 'w_pod.glb', POD)]
LOADED = []
for nm_, path_, pts_ in STORES:
    V, F, top = load(path_); hang(V, F, top, pts_, '_' + nm_, drop=2.5); LOADED.append((nm_, V, F, top, pts_))
for n_, d_ in gr_.POSE.items():
    D = g.PARTS[n_]; objs[n_].matrix_world = rot(objs[n_], D['axis'], d_, D['pivot'])
bpy.context.view_layer.update()
gearT = {n: tree(objs[n], objs[n].matrix_world) for n in objs if n.startswith(('gear', 'door_'))}
for nm_, V, F, top, pts_ in LOADED:
    trees = {k: wt(V, F, Vector((p.x, p.y, p.z - 0.05 - top))) for k, p in pts_.items()}
    res['_' + nm_ + ' со стойками'] = {k: v for k, v in {k: [n for n, t in gearT.items() if bt.overlap(t)] for k, bt in trees.items()}.items() if v}
    ks = sorted(trees); res['_' + nm_ + ' соседи'] = [(a, b) for i, a in enumerate(ks) for b in ks[i + 1:] if trees[a].overlap(trees[b])]
    res['_' + nm_ + ' размах'] = round(max(v.x for v in V) * 2, 3)
DB = {nm_: (V, F, top) for nm_, V, F, top, _ in LOADED}
for a_, b_ in (('Х-31П', 'Х-29Т'), ('Х-29Т', 'Х-31П'), ('КАБ-500Л', 'КАБ-500Л')):              # загрузки игры: спереди st1, сзади st2
    hit = []
    for sd in ('l', 'r'):
        Va, Fa, ta = DB[a_]; Vb, Fb, tb = DB[b_]; p1, p2 = PTS['st1_' + sd], PTS['st2_' + sd]
        if wt(Va, Fa, Vector((p1.x, p1.y, p1.z - 0.05 - ta))).overlap(wt(Vb, Fb, Vector((p2.x, p2.y, p2.z - 0.05 - tb)))): hit.append(sd)
    res[f'_пара {a_} спереди + {b_} сзади'] = hit
for n, v in res.items(): print(f'{n:22s} {v}', flush=True)
out = os.environ.get('SU_OUT_J')
if out: json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=str)
