# _collide.py - прогон подвижных частей по всему ходу, шаг 1 или 5°, BVH: RF_STAGE=4. Стойки шасси проверяются при открытых створках только со створками и подкосами: ниш в обшивке нет (в игру идёт убранное, шасси скрыто), поэтому обшивка для стоек не считается.
import bpy, math, json, os
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import rafale_geo as g
sc = bpy.data.scenes['RF']; bpy.context.view_layer.update()
objs = {o.name: o for o in sc.objects if o.type == 'MESH'}


def tree(o, mw): return BVHTree.FromPolygons([mw @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])


def rot(o, axis, deg, T=None):
    T = o.matrix_world.translation if T is None else T
    return Matrix.Translation(T) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-T) @ o.matrix_world


def sweep(name, degs, only=None, skip=(), children=()):
    o = objs[name]; D = g.PARTS[name]; ax = D['axis']; T = D['pivot']
    pool = [(n, tree(q, q.matrix_world)) for n, q in objs.items() if n != name and n not in skip and n not in children and (only is None or n in only)]
    hits = {}; where = {}
    for d in degs:
        M = rot(o, ax, d, T); ts = [tree(o, M)]
        for ch in children:
            c = objs[ch]; ts.append(tree(c, rot(c, ax, d, T)))
        for n, tt in pool:
            ov = ts[0].overlap(tt)
            if ov or any(t.overlap(tt) for t in ts):
                hits.setdefault(n, []).append(d)
                if ov and n not in where:
                    me = o.data; pl = me.polygons[ov[0][0]]; cc = sum(((M @ me.vertices[v].co) for v in pl.vertices), Vector((0, 0, 0))) / len(pl.vertices); where[n] = (round(d, 1), round(g.L / 2 - cc.y, 2), round(cc.x, 2), round(cc.z, 2))
    return {'ход': (degs[0], degs[-1]), 'касаний': sum(len(v) for v in hits.values()), 'с чем': {n: (v[0], v[-1], len(v)) for n, v in hits.items()}, 'где (угол, a, x, z)': where}


res = {}
for n, D in g.PARTS.items():
    if n.startswith(('gear', 'door')): continue
    r0, r1 = D['range']; degs = [r0 + (r1 - r0) * i / 30 for i in range(31)]
    ch = ('canopy_glass',) if n == 'canopy' else ()
    res[n] = sweep(n, degs, children=ch, skip=('det_seal',) + ((('slat_r', 'slat_l', 'aileron_r', 'aileron_l', 'det_hinges') if n.startswith('fold') else ())) + (('probe_door',) if n == 'probe' else ()) + (('probe',) if n == 'probe_door' else ()))
# стойки: створки открыты
for sx, n in ((1, 'r'), (-1, 'l')):
    for dn in ('door_n_' + n, 'door_m_' + n):
        D = g.PARTS[dn]; o = objs[dn]; ang = D['range'][0] if abs(D['range'][0]) > 0 else D['range'][1]; o.matrix_world = rot(o, D['axis'], ang, D['pivot'])
bpy.context.view_layer.update()
gd = ['door_n_r', 'door_n_l', 'door_m_r', 'door_m_l']
for n in ('gear_n', 'gear_m_r', 'gear_m_l'):
    D = g.PARTS[n]; r0, r1 = D['range']; degs = [r0 + (r1 - r0) * i / 19 for i in range(20)]
    res[n] = sweep(n, degs, only=gd)
for n, v in res.items(): print(f'{n:14s} {v}', flush=True)
out = os.environ.get('RF_OUT_J')
if out: json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=str)
