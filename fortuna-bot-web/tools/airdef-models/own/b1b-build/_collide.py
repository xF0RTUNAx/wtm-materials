# _collide.py - прогон подвижных частей B-1B по всему ходу (BVH): консоли крыла от 15° до 67,5° вместе с механизацией, рули, стабилизаторы, створки отсеков.
# Запуск: B1_STAGE=3 Blender -b --factory-startup --python build.py --python _collide.py. Итог: _снимки/_collide.json и строки в вывод.
import bpy, math, json, os
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import b1b_geo as g
bpy.context.view_layer.update()
objs = {o.name: o for o in bpy.context.scene.objects if o.type == 'MESH'}
def tree(o, mw): return BVHTree.FromPolygons([mw @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])
def rot(axis, deg, T): return Matrix.Translation(T) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-T)
def kids(n): return [c for c in objs.values() if c.parent is not None and c.parent.name == n]
def desc(n):
    out = []
    for c in kids(n): out += [c.name] + desc(c.name)
    return out
SKIP_POOL = ('gear', 'door_', 'canopy_glass', 'cockpit_int')
def sweep(name, degs, rest=0.0):
    o = objs[name]; D = g.PARTS[name]; ax = D['axis']; T = D['pivot']; own = [name] + desc(name); back = None
    if D.get('parent'):                                              # механизация крыла: проверяется при крыле вперёд (15°), где её выпускают
        PD = g.PARTS[D['parent']]; Po = objs[D['parent']]; Mf = rot(PD['axis'], -PD.get('rest', 0.0), PD['pivot']); back = Po.matrix_world.copy()
        Po.matrix_world = Mf @ Po.matrix_world; bpy.context.view_layer.update(); T = Mf @ T; ax = (Mf.to_3x3() @ ax).normalized()
    pool = [(n, tree(q, q.matrix_world)) for n, q in objs.items() if n not in own and not n.startswith(SKIP_POOL) and not n.endswith('_ribs') or (n == D.get('parent'))]
    pool = [(n, t) for n, t in pool if n not in own]
    hits = {}
    for d in degs:
        M = rot(ax, d - rest, T); ts = [(m, tree(objs[m], M @ objs[m].matrix_world)) for m in own]
        for n, tt in pool:
            for m, t in ts:
                ov = t.overlap(tt)
                if ov:
                    pl = objs[m].data.polygons[ov[0][0]]; c = sum((M @ objs[m].matrix_world @ objs[m].data.vertices[v].co for v in pl.vertices), Vector()) / len(pl.vertices)
                    q = objs[n]; pq = q.data.polygons[ov[0][1]]; c2 = sum((q.matrix_world @ q.data.vertices[v].co for v in pq.vertices), Vector()) / len(pq.vertices)
                    hits.setdefault(n, []).append((round(d, 1), m, len(ov), 'a=%.2f x=%.2f z=%.2f | его грань a=%.2f x=%.2f z=%.2f мат %d' % (g.L / 2 - c.y, c.x, c.z, g.L / 2 - c2.y, c2.x, c2.z, pq.material_index)))
    if back is not None: objs[D['parent']].matrix_world = back; bpy.context.view_layer.update()
    return {'ход': (degs[0], degs[-1]), 'касаний': sum(len(v) for v in hits.values()), 'с чем': {n: (v[0][0], v[-1][0], len(v), sorted({h[1] for h in v})[:4], v[0][3], v[-1][3]) for n, v in hits.items()}}
res = {}
for n, D in g.PARTS.items():
    if n not in objs: continue
    if n.startswith('door_'): continue                               # створки шасси - только в файле стоек
    if os.environ.get('B1_ONLYP') and not n.startswith(os.environ['B1_ONLYP']): continue
    r0, r1 = D['range']; steps = 42 if n.startswith('wing_') else 20
    degs = [r0 + (r1 - r0) * i / steps for i in range(steps + 1)]
    res[n] = sweep(n, degs, D.get('rest', 0.0))
bad = {n: r for n, r in res.items() if r['касаний']}
for n, r in res.items():
    print('ХОД', n, r['ход'], 'касаний', r['касаний'], r['с чем'] if r['касаний'] else '')
json.dump(res, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '_снимки', '_collide.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=str)
print('ИТОГ частей', len(res), 'с касаниями', len(bad))
