# _collide.py - прогон подвижных частей по всему ходу, BVH: F4_STAGE=4. Стойки проверяются при открытых створках со створками: в игру идёт убранное, шасси скрыто.
import bpy, math, json, os
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import f4_geo as g
sc = bpy.data.scenes['F4']; bpy.context.view_layer.update()
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
            if ov or any(t.overlap(tt) for t in ts[1:]):
                hits.setdefault(n, []).append(round(d, 1))
                if ov and n not in where:
                    me = o.data; pl = me.polygons[ov[0][0]]; cc = sum(((M @ me.vertices[v].co) for v in pl.vertices), Vector((0, 0, 0))) / len(pl.vertices); where[n] = (round(d, 1), round(g.L / 2 - cc.y, 2), round(cc.x, 2), round(cc.z, 2))
    return {'ход': (degs[0], degs[-1]), 'касаний': sum(len(v) for v in hits.values()), 'с чем': {n: (v[0], v[-1], len(v)) for n, v in hits.items()}, 'где (угол, a, x, z)': where}


res = {}
for n, D in g.PARTS.items():
    if n.startswith(('gear', 'door_n', 'door_m', 'door_o')): continue
    r0, r1 = D['range']; degs = [r0 + (r1 - r0) * i / 24 for i in range(25)]
    ch = ('canopy_glass',) if n == 'canopy' else ()
    sk = ()
    if n.startswith('fold'): sk = tuple(q + '_' + n[-1] for q in ('slat', 'aileron', 'flap')) + ('det_hinges', 'det_seal')   # консоль уносит носок и элерон; щель и шарниры на линии складывания
    res[n] = sweep(n, degs, children=ch, skip=sk)
for dn in ('door_n_r', 'door_n_l', 'door_m_r', 'door_m_l', 'door_o_r', 'door_o_l'):
    D = g.PARTS[dn]; r0, r1 = D['range']; degs = [r0 + (r1 - r0) * i / 12 for i in range(13)]
    res[dn] = sweep(dn, degs, skip=('gear_n', 'gear_n_brace', 'gear_m_r', 'gear_m_l', 'gear_m_brace_r', 'gear_m_brace_l'))
for dn in ('door_n_r', 'door_n_l', 'door_m_r', 'door_m_l', 'door_o_r', 'door_o_l'):
    D = g.PARTS[dn]; o = objs[dn]; ang = D['range'][0] if abs(D['range'][0]) > 0 else D['range'][1]; o.matrix_world = rot(o, D['axis'], ang, D['pivot'])
bpy.context.view_layer.update()
gd = ['door_n_r', 'door_n_l', 'door_m_r', 'door_m_l', 'door_o_r', 'door_o_l']
for n in ('gear_n', 'gear_m_r', 'gear_m_l'):
    D = g.PARTS[n]; r0, r1 = D['range']; degs = [r0 + (r1 - r0) * i / 19 for i in range(20)]
    res[n] = sweep(n, degs, only=gd)
res['_примечание'] = {'ход': (0, 0), 'касаний': 0, 'с чем': {}}
for n, v in res.items(): print(f'{n:14s} {v}', flush=True)
print('КОНТРОЛЬ обшивка×киль:', len(tree(objs['F4_skin'], objs['F4_skin'].matrix_world).overlap(tree(objs['fin_c'], objs['fin_c'].matrix_world))))
out = os.environ.get('F4_OUT_J')
if out: json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=str)
