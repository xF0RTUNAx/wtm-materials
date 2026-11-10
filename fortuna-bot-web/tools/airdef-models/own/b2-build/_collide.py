# _collide.py - B-2A: прогон подвижных частей по всему ходу (31 шаг), BVH. После build.py, B2_STAGE=4. B2_OUT_J=<файл json> - итог.
# Рули, «бобровый хвост», створки отсеков и шасси - против всего остального. Стойки - при открытых створках, против створок и обшивки (со своими колёсами и подкосами).
import bpy, math, json, os
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import b2_geo as g
sc = bpy.data.scenes['B2']; bpy.context.view_layer.update()
objs = {o.name: o for o in sc.objects if o.type == 'MESH'}


def tree(o, mw): return BVHTree.FromPolygons([mw @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])


def rot(o, axis, deg, T): return Matrix.Translation(T) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-T) @ o.matrix_world


def sweep(name, degs, only=None, skip=(), children=()):
    o = objs[name]; D = g.PARTS[name]; ax = D['axis']; T = D['pivot']
    pool = [(n, tree(q, q.matrix_world)) for n, q in objs.items() if n != name and n not in skip and n not in children and (only is None or n in only)]
    hits = {}; where = {}
    for d in degs:
        M = rot(o, ax, d, T); ts = [tree(o, M)] + [tree(objs[c], rot(objs[c], ax, d, T)) for c in children]
        for n, tt in pool:
            ov = ts[0].overlap(tt)
            if ov or any(t.overlap(tt) for t in ts[1:]):
                hits.setdefault(n, []).append(round(d, 1))
                if ov and n not in where:
                    me = o.data; pl = me.polygons[ov[0][0]]; cc = sum(((M @ me.vertices[v].co) for v in pl.vertices), Vector((0, 0, 0))) / len(pl.vertices)
                    where[n] = (round(d, 1), round(g.L / 2 - cc.y, 2), round(cc.x, 2), round(cc.z, 2))
    deep = {}                                                        # глубина захода: вершины детали внутри другой детали (луч вверх, чётность) и расстояние до её поверхности
    for n, tt in pool:
        if n not in hits: continue
        q = objs[n]; mx = 0.0
        for d in hits[n]:
            M = rot(o, ax, d, T)
            for v in o.data.vertices:
                p = M @ v.co; k = 0; p0 = p.copy()
                for _ in range(40):
                    h = tt.ray_cast(p0, Vector((0, 0, 1)))
                    if h[0] is None: break
                    k += 1; p0 = h[0] + Vector((0, 0, 1e-5))
                if k % 2 == 1:
                    nn = tt.find_nearest(p)
                    if nn[0] is not None: mx = max(mx, (nn[0] - p).length)
        deep[n] = round(mx * 1000, 1)
    return {'глубина_мм': deep, 'ход': (degs[0], degs[-1]), 'касаний': sum(len(v) for v in hits.values()), 'с чем': {n: (v[0], v[-1], len(v)) for n, v in hits.items()}, 'где (угол, a, x, z)': where}


res = {}
GEARS = [n for n in objs if n.startswith('gear')]
for n, D in g.PARTS.items():
    if n.startswith('gear') or not D.get('range') or n not in objs: continue
    r0, r1 = D['range']; degs = [r0 + (r1 - r0) * i / 30 for i in range(31)]
    pair = ('split_d_' + n[-1],) if n.startswith('split_u') else ('split_u_' + n[-1],) if n.startswith('split_d') else ()
    res[n] = sweep(n, degs, skip=tuple(GEARS) + pair)
    if pair:                                                       # половины расщепляющегося руля расходятся в разные стороны: проверка вместе
        res[n + '+' + pair[0]] = sweep(n, degs, only=pair)
# стойки: створки открыты, колёса и подкосы идут со стойкой
for dn in [k for k in g.PARTS if k.startswith('door_')]:
    D = g.PARTS[dn]; o = objs[dn]; o.matrix_world = rot(o, D['axis'], D['range'][1], D['pivot'])
bpy.context.view_layer.update()
for n, ch in (('gear_n', ('gear_n_brace',)), ('gear_m_r', ('gear_w_r', 'gear_m_brace_r')), ('gear_m_l', ('gear_w_l', 'gear_m_brace_l'))):
    if n not in objs: continue
    D = g.PARTS[n]; r0, r1 = D['range']; degs = [r0 + (r1 - r0) * i / 19 for i in range(20)]
    res[n] = sweep(n, degs, skip=tuple(q for q in GEARS if q != n), children=tuple(c for c in ch if c in objs))
for n, v in res.items(): print('ХОД', f'{n:22s}', v['касаний'], 'мм', v['глубина_мм'], v['с чем'], v['где (угол, a, x, z)'], flush=True)
out = os.environ.get('B2_OUT_J')
if out: json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=str)
