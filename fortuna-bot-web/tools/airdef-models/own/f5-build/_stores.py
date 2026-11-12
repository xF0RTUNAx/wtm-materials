# _stores.py - Mk 82 (своя модель) на четырёх точках подвески F-5E и AIM-9 на законцовках. Верх груза - у точки подвески.
# Проверка: груз не задевает самолёт, шасси (выпущено, створки открыты) и соседа. После build.py (этап 4).
import bpy, math, os, itertools
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import f5_geo as g
sc = bpy.context.scene; vl = bpy.context.view_layer; vl.update()
OWN = '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/'; GM = '/Users/mark./wtm-materials/fortuna-bot-web/games/airdef/models/'
dg = bpy.context.evaluated_depsgraph_get()
plane = {o.name: o for o in sc.objects if o.type == 'MESH' and o.name != 'пол'}


def load(path):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=path); new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    pts = [o.matrix_world @ v.co for o in new for v in o.data.vertices]; mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
    tris = []
    for o in new:
        M = o.matrix_world; tris += [[M @ o.data.vertices[i].co for i in p.vertices] for p in o.data.polygons]
    for o in new: bpy.data.objects.remove(o)
    L_ = mx.y - mn.y; W_ = mx.x - mn.x
    if W_ > L_: tris = [[Vector((p.y, -p.x, p.z)) for p in t] for t in tris]; mn, mx = Vector((mn.y, -mx.x, mn.z)), Vector((mx.y, -mn.x, mx.z))     # длинной осью вдоль самолёта
    c = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mx.z)); return [[p - c for p in t] for t in tris], mx - mn


STORES = {'mk82': load(OWN + 'mk82.glb')}
for k, (t, size) in STORES.items(): print('ГРУЗ', k, 'размер', [round(v, 2) for v in size])
ST = {k: v.copy() for k, v in g.STATIONS.items()}
print('ТОЧКИ', {k: tuple(round(c, 3) for c in v) for k, v in ST.items()})


def tree_of(tris, at): vs = []; fs = []
def bvh(tris, at):
    vs = []; fs = []
    for t in tris:
        k = len(vs); vs += [p + at for p in t]; fs.append(tuple(range(k, k + len(t))))
    return BVHTree.FromPolygons(vs, fs)


def otree(o):
    e = o.evaluated_get(dg); M = e.matrix_world; me = e.to_mesh()
    t = BVHTree.FromPolygons([M @ v.co for v in me.vertices], [tuple(p.vertices) for p in me.polygons]); e.to_mesh_clear(); return t


PT = {n: otree(o) for n, o in plane.items()}
for st, at in ST.items():
    tb = bvh(STORES['mk82'][0], at); hits = sorted({n for n, t in PT.items() if tb.overlap(t) and not n.startswith('pylon')})
    # зазор до шасси: ближайшее расстояние от вершин бомбы до стоек и колёс
    gap = 9.0
    for n, o in plane.items():
        if not n.startswith('gear'): continue
        for tri in STORES['mk82'][0][::7]:
            for p in tri:
                q = p + at; r = PT[n].find_nearest(q)
                if r[0] is not None: gap = min(gap, r[3])
    print('ТОЧКА', st, 'задевает:', hits or 'ничего', 'зазор до шасси', round(gap, 3))
for s1, s2 in itertools.combinations(ST, 2):
    if bvh(STORES['mk82'][0], ST[s1]).overlap(bvh(STORES['mk82'][0], ST[s2])): print('СОСЕДИ', s1, '<->', s2)
print('конец проверки')
if os.environ.get('F5_WHERE'):
    o = plane['gear_m_r']; e = o.evaluated_get(dg); me = e.to_mesh(); M = e.matrix_world
    tb = bvh(STORES['mk82'][0], ST['i_r']); prs = tb.overlap(PT['gear_m_r'])
    pts = [M @ me.vertices[me.polygons[j].vertices[0]].co for i, j in prs]
    if pts:
        mn = Vector([min(p[k] for p in pts) for k in range(3)]); mx = Vector([max(p[k] for p in pts) for k in range(3)])
        print('ГДЕ', len(prs), 'x', round(mn.x, 3), round(mx.x, 3), 'a', round(g.L / 2 - mx.y, 3), round(g.L / 2 - mn.y, 3), 'z', round(mn.z, 3), round(mx.z, 3))
    e.to_mesh_clear()
    bb = [p + ST['i_r'] for t in STORES['mk82'][0] for p in t]; print('БОМБА x', round(min(p.x for p in bb), 3), round(max(p.x for p in bb), 3), 'z', round(min(p.z for p in bb), 3), round(max(p.z for p in bb), 3), 'a', round(g.L / 2 - max(p.y for p in bb), 3), round(g.L / 2 - min(p.y for p in bb), 3))
