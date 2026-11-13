# _stores.py - загрузки игры на точках Су-25: «Ракеты: Х-29Т ×2 + Х-25МЛ ×2» + контейнер и «ФАБ-500 ×6». Верх груза - у точки подвески.
# Точки игры: mirror([p4, p3, p2, p1]) (от внешней к внутренней), порядок развески [3, 4, 2, 5, 1, 6, 0, 7] - самое тяжёлое на внутренние.
# Проверка: груз не задевает самолёт, шасси (выпущено, створки открыты), соседа, предкрылки 20°, щитки 55°, закрылки 15° (взлёт) и 40° (посадка - для сведения). После build.py (этап 9).
import bpy, math, os, itertools
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import su_geo as g
sc = bpy.context.scene; vl = bpy.context.view_layer; vl.update()
GM = '/Users/mark./wtm-materials/fortuna-bot-web/games/airdef/models/'
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


STORES = {k: load(GM + f) for k, f in (('kh29t', 'w_kh29t.glb'), ('kh25ml', 'w_kh25ml.glb'), ('fab500', 'w_fab500.glb'), ('pod', 'w_pod.glb'))}
for k, (t, size) in STORES.items(): print('ГРУЗ', k, 'размер', [round(v, 2) for v in size])
ORDER = [3, 4, 2, 5, 1, 6, 0, 7]
L_ = ['p4_l', 'p3_l', 'p2_l', 'p1_l']; R_ = ['p1_r', 'p2_r', 'p3_r', 'p4_r']; SLOTS = L_ + R_      # mirror([L0..L3]) -> L0 L1 L2 L3 R3 R2 R1 R0
LOADS = {'ракеты': [('kh29t', 2), ('kh25ml', 2)], 'фаб500': [('fab500', 6)]}


def bvh(tris, at):
    vs = []; fs = []
    for t in tris:
        k = len(vs); vs += [p + at for p in t]; fs.append(tuple(range(k, k + len(t))))
    return BVHTree.FromPolygons(vs, fs)


def otree(o, M=None):
    e = o.evaluated_get(dg); M = M or e.matrix_world; me = e.to_mesh()
    t = BVHTree.FromPolygons([M @ v.co for v in me.vertices], [tuple(p.vertices) for p in me.polygons]); e.to_mesh_clear(); return t


def rot(o, n, deg):
    D = g.PARTS[n]; T = D['pivot']; return Matrix.Translation(T) @ Matrix.Rotation(math.radians(deg), 4, D['axis']) @ Matrix.Translation(-T) @ o.matrix_world


PT = {n: otree(o) for n, o in plane.items()}
POSED = {}
for n, o in plane.items():
    D = g.PARTS.get(n)
    if not D or not D.get('range') or n.startswith('gear'): continue
    if n.startswith(('slat', 'sbrake')): POSED[n + '@max'] = otree(o, rot(o, n, D['range'][1]))
    if n.startswith('flap'): POSED[n + '@15'] = otree(o, rot(o, n, 15.0)); POSED[n + '@40'] = otree(o, rot(o, n, 40.0))
for lname, items in LOADS.items():
    placed = []; k = 0
    for kind, cnt in items:
        for _ in range(cnt): placed.append((SLOTS[ORDER[k]], kind)); k += 1
    if lname == 'ракеты': placed.append(('pod', 'pod'))
    print('ЗАГРУЗКА', lname, placed)
    trees = []
    for st, kind in placed:
        at = g.STATIONS[st]; tb = bvh(STORES[kind][0], at); trees.append((st, kind, tb))
        hits = sorted({n for n, t in list(PT.items()) + list(POSED.items()) if tb.overlap(t) and not n.startswith('pylon')})
        print('  ТОЧКА', st, kind, 'задевает:', hits or 'ничего')
    for (s1, k1, t1), (s2, k2, t2) in itertools.combinations(trees, 2):
        if t1.overlap(t2): print('  СОСЕДИ', s1, k1, '<->', s2, k2)
print('конец проверки')
