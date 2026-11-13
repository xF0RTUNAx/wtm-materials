# _collide.py - Ил-28: прогон подвижных частей по всему ходу (31 шаг), BVH, с глубиной захода в мм. После build.py, IL_STAGE=4. IL_OUT_J=<файл json> - итог.
# Рули, утки, элевоны, носки, фонарь, щитки и створки - против всего остального (стойки не мешают: в полёте убраны). Стойки - при открытых створках, против створок и обшивки (с колёсами и подкосами).
import bpy, math, json, os
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import il28_geo as g
sc = bpy.data.scenes['IL']; bpy.context.view_layer.update()
objs = {o.name: o for o in sc.objects if o.type == 'MESH'}


def tree(o, mw): return BVHTree.FromPolygons([mw @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])


def rot(o, axis, deg, T): return Matrix.Translation(T) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-T) @ o.matrix_world


def kids(name): return tuple(n for n, q in objs.items() if n != name and (q.parent is not None and q.parent.name == name) and n not in g.PARTS)


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
        mx = 0.0
        for d in hits[n][:: max(1, len(hits[n]) // 8)]:
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
GEARS = tuple(n for n in objs if n.startswith(('gear', 'gdoor')))
for n, D in g.PARTS.items():
    if n.startswith('gear') or not D.get('range') or n not in objs: continue
    r0, r1 = D['range']; degs = [r0 + (r1 - r0) * i / 30 for i in range(31)]
    sk = GEARS + (('IL_skin', 'turret_guns') if n == 'turret' else ()) + (('turret',) if n == 'turret_guns' else ())   # шар утоплен в кольцо хвоста: поверхность шара при повороте не меняется; стволы - внутри шара по щели
    res[n] = sweep(n, degs, skip=sk, children=kids(n) + (('turret_guns',) if n == 'turret' else ()))
# турель по азимуту при стволах в крайних углах места: стволы против хвоста, кабины стрелка, рам и стёкол (шар утоплен в кольцо - его поверхность при повороте не меняется)
if 'turret' in objs and 'turret_guns' in objs:
    tg = objs['turret_guns']; Dg = g.PARTS['turret_guns']; Dt = g.PARTS['turret']
    pool = [(n, tree(q, q.matrix_world)) for n, q in objs.items() if n in ('IL_skin', 'gcab_frame', 'gcab_glass', 'hatch', 'rudder', 'elev_r', 'elev_l')]
    for el in (Dg['range'][0], 0.0, 20.0, Dg['range'][1]):
        hits = {}
        for i in range(31):
            az = Dt['range'][0] + (Dt['range'][1] - Dt['range'][0]) * i / 30
            M = rot(tg, Dg['axis'], el, Dg['pivot']); M = Matrix.Translation(Dt['pivot']) @ Matrix.Rotation(math.radians(az), 4, Dt['axis']) @ Matrix.Translation(-Dt['pivot']) @ M
            t = tree(tg, M)
            for n, tt in pool:
                if t.overlap(tt): hits.setdefault(n, []).append(round(az))
        res['стволы_угол_%+d' % el] = {'касаний': sum(len(v) for v in hits.values()), 'глубина_мм': {}, 'с чем': {n: (v[0], v[-1], len(v)) for n, v in hits.items()}, 'где (угол, a, x, z)': {}}
for n, v in res.items(): print('ХОД', f'{n:14s}', v['касаний'], 'мм', v['глубина_мм'], v['с чем'], v['где (угол, a, x, z)'], flush=True)
out = os.environ.get('IL_OUT_J')
if out: json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=str)
