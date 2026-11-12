# _collide.py - прогон подвижных частей по всему ходу, BVH: A10_STAGE=4. Стойки проверяются при открытых створках со створками: в игру идёт убранное, шасси скрыто.
import bpy, math, json, os
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import a10_geo as g
sc = bpy.data.scenes["A10"]; bpy.context.view_layer.update()
objs = {o.name: o for o in sc.objects if o.type == 'MESH'}


def tree(o, mw): return BVHTree.FromPolygons([mw @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])


SLIDES = {n for n, D in g.PARTS.items() if D.get('kind') == 'slide'}


def rot(o, axis, deg, T=None, slide=False):
    if slide: return Matrix.Translation(axis * deg) @ o.matrix_world
    T = o.matrix_world.translation if T is None else T
    return Matrix.Translation(T) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-T) @ o.matrix_world


def sweep(name, degs, only=None, skip=(), children=()):
    o = objs[name]; D = g.PARTS[name]; ax = D['axis']; T = D['pivot']
    pool = [(n, tree(q, q.matrix_world)) for n, q in objs.items() if n != name and n not in skip and n not in children and (only is None or n in only)]
    hits = {}
    for d in degs:
        M = rot(o, ax, d, T, name in SLIDES); ts = [tree(o, M)]
        for ch in children:
            c = objs[ch]; ts.append(tree(c, rot(c, ax, d, T, name in SLIDES)))
        for n, tt in pool:
            if any(t.overlap(tt) for t in ts): hits.setdefault(n, []).append(round(d, 1))
    return {'ход': (degs[0], degs[-1]), 'касаний': sum(len(v) for v in hits.values()), 'с чем': {n: (v[0], v[-1], len(v)) for n, v in hits.items()}}


res = {}
for n, D in g.PARTS.items():
    if n.startswith(('gear', 'door_')): continue
    r0, r1 = D['range']; degs = [r0 + (r1 - r0) * i / 24 for i in range(25)]
    ch = ('canopy_glass',) if n == 'canopy' else ()
    sk = ('ail_d_' + n[-1],) if n.startswith('ail_u_') else ('ail_u_' + n[-1],) if n.startswith('ail_d_') else ()
    res[n] = sweep(n, degs, children=ch, skip=sk)
GEAR = ('gear_n', 'gear_n_brace', 'gear_m_r', 'gear_m_l', 'gear_m_brace_r', 'gear_m_brace_l'); STOW = ('stow_m_r', 'stow_m_l'); DOORS = ('door_n_r', 'door_n_l', 'door_m_r', 'door_m_l')
for dn in DOORS:
    D = g.PARTS[dn]; r0, r1 = D['range']; degs = [r0 + (r1 - r0) * i / 12 for i in range(13)]
    res[dn] = sweep(dn, degs, skip=GEAR + STOW)
for dn in DOORS:
    D = g.PARTS[dn]; o = objs[dn]; o.matrix_world = rot(o, D['axis'], D['open'], D['pivot'])
bpy.context.view_layer.update()
for n in ('gear_n', 'gear_m_r', 'gear_m_l'):
    D = g.PARTS[n]; r0, r1 = D['range']; degs = [r0 + (r1 - r0) * i / 19 for i in range(20)]
    res[n] = sweep(n, degs, only=('door_n_r', 'door_n_l') if n == 'gear_n' else ('A10_skin',))
    res[n + '_стоянка'] = sweep(n, [0.0], skip=STOW + GEAR + (('door_m_r', 'door_m_l') if n != 'gear_n' else ()))
res['_примечание'] = {'ход': (0, 0), 'касаний': 0, 'с чем': {}}
for n, v in res.items(): print(f'{n:14s} {v}', flush=True)
out = os.environ.get('A10_OUT_J')
if out: json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=str)
