# _stores.py - бомбы игры на точках подвески Gripen: GBU-12 и GBU-31 (свои модели), контейнер LITENING. Верх груза - у точки подвески.
# Проверка: груз не задевает самолёт, шасси (выпущено, створки открыты) и соседа. После build.py, GR_STAGE=4.
import bpy, math, os, itertools
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import gripen_geo as g
sc = bpy.data.scenes['GR']; vl = bpy.context.view_layer; vl.update()
OWN = '/Users/mark./wtm-materials/fortuna-bot-web/tools/airdef-models/own/'; GM = '/Users/mark./wtm-materials/fortuna-bot-web/games/airdef/models/'
for n_, d_ in (('door_n_r', 86), ('door_n_l', 86), ('door_m_r', 90), ('door_m_l', 90)):
    o = bpy.data.objects[n_]; D = g.PARTS[n_]; T = D['pivot']; o.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(d_), 4, D['axis']) @ Matrix.Translation(-T) @ o.matrix_world
vl.update()
plane = {o.name: o for o in sc.objects if o.type == 'MESH'}


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


STORES = {'gbu12': load(OWN + 'gbu12.glb'), 'gbu31': load(OWN + 'gbu31.glb'), 'pod': load(GM + 'w_pod.glb')}
for k, (t, size) in STORES.items(): print('ГРУЗ', k, 'размер', [round(v, 2) for v in size])
P = g.PYLON_PTS
ST = {'o_r': P['pylon_o_r'], 'o_l': P['pylon_o_l'], 'i_r': P['pylon_i_r'], 'i_l': P['pylon_i_l'], 'c_r': P['pylon_c_r'], 'c_l': P['pylon_c_l'], 'pod': P['pod']}


def tree_of(tris, at): vs = []; fs = []
def bvh(tris, at):
    vs = []; fs = []
    for t in tris:
        k = len(vs); vs += [p + at for p in t]; fs.append(tuple(range(k, k + len(t))))
    return BVHTree.FromPolygons(vs, fs)


PT = {n: BVHTree.FromPolygons([o.matrix_world @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons]) for n, o in plane.items()}
res = {}
for st, at in ST.items():
    for kind in (('pod',) if st == 'pod' else ('gbu12', 'gbu31')):
        tb = bvh(STORES[kind][0], at); hits = sorted({n for n, t in PT.items() if tb.overlap(t) and not n.startswith('pylon')})
        res[(st, kind)] = hits; print('ТОЧКА', st, kind, 'задевает:', hits or 'ничего')
# соседи: все пары точек одновременно
for (s1, k1), (s2, k2) in itertools.combinations([(s, k) for s in ST for k in (('pod',) if s == 'pod' else ('gbu12', 'gbu31'))], 2):
    if s1 == s2: continue
    if bvh(STORES[k1][0], ST[s1]).overlap(bvh(STORES[k2][0], ST[s2])): print('СОСЕДИ', s1, k1, '<->', s2, k2)
print('конец проверки')
