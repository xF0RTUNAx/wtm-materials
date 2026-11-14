# _bomb.py - ОФАБ-250 (своя модель Свои/ОФАБ-250) на четырёх пилонах Як-38М: касания с обшивкой, пилонами, рулями в крайних положениях,
# стойками и створками шасси, соплами в положениях 0 и 90; сброс вниз на 2 м. Бомба висит, как в игре: ось на vis.r + 5 см ниже точки. YK_STAGE=4.
import bpy, math, os, json
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import yak_geo as g
sc = bpy.data.scenes['YK']; bpy.context.view_layer.update()
GLB = '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/ОФАБ-250/w_ofab250.glb'; VR = 0.163
objs = {o.name: o for o in sc.objects if o.type == 'MESH'}
def tree(o, M=None):
    M = M if M is not None else o.matrix_world; return BVHTree.FromPolygons([M @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])
def rotM(n, deg):
    D = g.PARTS[n]; T = D['pivot']; return Matrix.Translation(T) @ Matrix.Rotation(math.radians(deg), 4, D['axis']) @ Matrix.Translation(-T) @ objs[n].matrix_world
before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=GLB); new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']; bpy.context.view_layer.update()
pts = [o.matrix_world @ v.co for o in new for v in o.data.vertices]
print('ОФАБ габарит', [round(min(p[i] for p in pts), 3) for i in range(3)], [round(max(p[i] for p in pts), 3) for i in range(3)])
# в glTF игры нос бомбы -Z; после импорта Blender: нос +Y - как у самолёта
places = []
for a, xl, z in g.station_pts():
    for sx in (1, -1): places.append((a, -xl * sx, z))
Ms = [Matrix.Translation(Vector((x, g.Yb(a), z - VR - 0.05))) for a, x, z in places]
bombs = [[tree(o, M @ o.matrix_world) for o in new] for M in Ms]
res = {'точки': [(round(a, 3), round(x, 3), round(z, 3)) for a, x, z in places], 'касания': {}, 'бомба_с_бомбой': 0, 'падение': {}}
def check(tag, extra=None):
    hit = {}
    for n, o in objs.items():
        M = (extra or {}).get(n); t = tree(o, M)
        k = [i for i, bt in enumerate(bombs) if any(b_.overlap(t) for b_ in bt)]
        if k: hit[n] = k
    if hit: res['касания'][tag] = hit
check('всё в нуле')
check('сопла 90', {n: rotM(n, 90) for n in ('nozzle_r', 'nozzle_l')})
check('закрылки 28, элероны ±20', {**{n: rotM(n, 28) for n in ('flap_r', 'flap_l')}, **{n: rotM(n, 20) for n in ('ail_r', 'ail_l')}})
check('элероны -20', {n: rotM(n, -20) for n in ('ail_r', 'ail_l')})
for i in range(len(bombs)):
    for j in range(i + 1, len(bombs)):
        if any(x.overlap(y) for x in bombs[i] for y in bombs[j]): res['бомба_с_бомбой'] += 1
for n in [k for k in objs if not k.startswith(('gear', 'door_'))]:
    t = tree(objs[n]); hits = []
    for k in range(1, 11):
        dz = -2.0 * k / 10
        for (a, x, z), M in zip(places, Ms):
            if any(tree(o, Matrix.Translation(Vector((0, 0, dz))) @ M @ o.matrix_world).overlap(t) for o in new): hits.append((round(dz, 2), round(a, 2), round(x, 2)))
    if hits: res['падение'][n] = hits[:4]
print('БОМБЫ', json.dumps(res, ensure_ascii=False))
out = os.environ.get('YK_OUT_J')
if out: json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
