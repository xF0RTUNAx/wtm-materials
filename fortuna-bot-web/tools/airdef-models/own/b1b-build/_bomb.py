# _bomb.py - свои GBU-31 и Mk 82 на точках отсеков B-1B (как вешает игра: верх бомбы у точки, ось на 0,05 м + радиус ниже) и Tomahawk в переднем отсеке.
# Проверки: при закрытых створках касаются только замки (det_bay), при открытых на 90° бомба падает на 4 м свободно. B1_STAGE=3.
import bpy, math, os
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import b1b_geo as g, b1b_bay as bay
OWN = '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/'
vl = bpy.context.view_layer; vl.update()
objs = {o.name: o for o in bpy.context.scene.objects if o.type == 'MESH'}
def load(glb):
    before = set(bpy.data.objects)
    try: bpy.ops.import_scene.gltf(filepath=glb)
    except Exception as e:
        print('импорт glb не вышел, беру .blend', e); bl = glb[:-4] + '.blend'
        with bpy.data.libraries.load(bl) as (src, dst): dst.objects = [n for n in src.objects]
        for o in dst.objects:
            if o is not None and o.type == 'MESH': bpy.context.scene.collection.objects.link(o)
    new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']; vl.update()
    V = []; F = []
    for o in new:
        k = len(V); V += [o.matrix_world @ v.co for v in o.data.vertices]; F += [tuple(k + i for i in p.vertices) for p in o.data.polygons]
    for o in new: bpy.data.objects.remove(o)
    mn = Vector((min(v.x for v in V), min(v.y for v in V), min(v.z for v in V))); mx = Vector((max(v.x for v in V), max(v.y for v in V), max(v.z for v in V)))
    c = (mn + mx) / 2; L = mx.y - mn.y; rad = (mx.x - mn.x) / 2
    return [v - Vector((c.x, c.y, mx.z)) for v in V], F, L, rad            # начало - середина длины, верх
def tree_at(V, F, p): return BVHTree.FromPolygons([v + p for v in V], F)
def otree(o, M=None): M = M or o.matrix_world; return BVHTree.FromPolygons([M @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])
def hits(t, skip=()):
    out = []
    for n, o in objs.items():
        if n.startswith(('gear', 'door_')) or n in skip: continue
        if t.overlap(otree(o)): out.append(n)
    return out
res = {}
G31 = load(OWN + 'gbu31.glb'); M82 = load(OWN + 'mk82.glb')
print('GBU-31 длина', round(G31[2], 2), 'Mk 82', round(M82[2], 2))
load_ = {3: G31, 2: G31, 1: M82, 0: M82}                            # игра: тяжёлые первыми в индексы 3, 2
for i, (V, F, L, r) in load_.items():
    for s in ('r', 'l'):
        p = g.STATIONS['st%d_%s' % (i, s)].copy(); p.z -= 0.0                    # точка - низ замков; верх бомбы у точки (проушины)
        res[f'закрыто st{i}_{s}'] = hits(tree_at(V, F, p))
# открыть створки и опустить
for n, D in g.PARTS.items():
    if n.startswith('bay') and n[3] in '123' and not n.endswith('_ribs'):
        o = objs[n]; T = D['pivot']; M = Matrix.Translation(T) @ Matrix.Rotation(math.radians(90), 4, D['axis']) @ Matrix.Translation(-T)
        for q in [o] + [c for c in objs.values() if c.parent is o]: q.matrix_world = M @ q.matrix_world
vl.update()
for i, (V, F, L, r) in load_.items():
    for s in ('r', 'l'):
        p = g.STATIONS['st%d_%s' % (i, s)].copy(); bad = set()
        for k in range(1, 17): bad |= set(hits(tree_at(V, F, p + Vector((0, 0, -0.25 * k)))))
        res[f'падение st{i}_{s}'] = sorted(bad)
# Tomahawk: в переднем отсеке и в двух передних без перегородки
TL = load(OWN + 'tlam.glb'); print('Tomahawk длина', round(TL[2], 2), 'диаметр по крылу', round(2 * TL[3], 2))
for nm, ac in (('передний отсек', (bay.BAYS[0][0] + bay.BAYS[0][1]) / 2), ('передний+средний без перегородки', (bay.BAYS[0][0] + bay.BAYS[1][1]) / 2)):
    p = g.P3(ac, 0.0, bay.RACK_Z); res['Tomahawk ' + nm] = hits(tree_at(TL[0], TL[1], p), skip=('bay_bulkhead',) if 'без' in nm else ())
res['длина отсеков'] = [round(b - a, 2) for a, b in bay.BAYS]
for k, v in res.items(): print('ОТСЕК', k, v)
