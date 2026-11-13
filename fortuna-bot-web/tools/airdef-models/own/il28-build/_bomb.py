# _bomb.py - ФАБ-500М-62 ×4 и ФАБ-250 ×8 (свои модели из Свои/ФАБ-500М62, Свои/ФАБ-250) в отсеке Ил-28: при закрытых створках, друг с другом, с полом и стенками;
# при открытых створках - падение на 2,5 м. Бомба висит, как в игре: ось на vis.r + 5 см ниже точки (main.js). IL_STAGE=4. IL_OUT_J - итог json.
import bpy, math, os, json
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import il28_geo as g
sc = bpy.data.scenes['IL']; bpy.context.view_layer.update()
GLB = {'fab500': '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/ФАБ-500М62/fab500.glb', 'fab250': '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/ФАБ-250/fab250.glb'}
objs = {o.name: o for o in sc.objects if o.type == 'MESH' and not o.name.startswith(('gear', 'gdoor'))}
def tree(o, M=None):
    M = M if M is not None else o.matrix_world; return BVHTree.FromPolygons([M @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])
def rot(o, deg):
    D = g.PARTS[o.name]; T = D['pivot']; return Matrix.Translation(T) @ Matrix.Rotation(math.radians(deg), 4, D['axis']) @ Matrix.Translation(-T) @ o.matrix_world
res = {}
for key, path in GLB.items():
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=path); new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ v.co for o in new for v in o.data.vertices]
    print(key, 'габарит', [round(min(p[i] for p in pts), 3) for i in range(3)], [round(max(p[i] for p in pts), 3) for i in range(3)])
    places = [(a, sx * g.BAY_X) for a in g.BAY_PTS[key] for sx in (1, -1)]
    Ms = [Matrix.Translation(Vector((x, g.Yb(a), g.BAY_TOP - g.VIS_R[key] - 0.05))) for a, x in places]
    bombs = [[tree(o, M @ o.matrix_world) for o in new] for M in Ms]
    r = {'закрыто': {}, 'бомба_с_бомбой': 0, 'падение': {}}
    for n, o in objs.items():
        t = tree(o); k = sum(1 for bt in bombs for b_ in bt if b_.overlap(t))
        if k: r['закрыто'][n] = k
    for i in range(len(bombs)):
        for j in range(i + 1, len(bombs)):
            if any(x.overlap(y) for x in bombs[i] for y in bombs[j]): r['бомба_с_бомбой'] += 1
    # зазоры: до створок, до стенок, до соседей - наименьшее расстояние вершин бомбы до поверхности
    def gap(name, M_list):
        t = tree(objs[name]); best = 9.0
        for M in M_list:
            for o in new:
                for v in list(o.data.vertices)[::7]:
                    h = t.find_nearest(M @ o.matrix_world @ v.co)
                    if h[0] is not None: best = min(best, h[3])
        return round(best * 100, 1)
    r['зазор_см'] = {n: gap(n, Ms) for n in ('bay_r', 'bay_l', 'IL_skin', 'bay_int')}
    for dn in ('bay_r', 'bay_l'):
        o = objs[dn]; o.matrix_world = rot(o, g.BAY_OPEN)
    bpy.context.view_layer.update()
    for n in ('bay_r', 'bay_l', 'IL_skin', 'hatch', 'bay_int'):
        t = tree(objs[n]); hits = []
        for k in range(11):
            dz = -2.5 * k / 10
            for (a, x), M in zip(places, Ms):
                M2 = Matrix.Translation(Vector((0, 0, dz))) @ M
                if any(tree(o, M2 @ o.matrix_world).overlap(t) for o in new): hits.append((round(dz, 2), a, x))
        if hits: r['падение'][n] = hits[:6]
    for dn in ('bay_r', 'bay_l'):
        o = objs[dn]; o.matrix_world = rot(o, -g.BAY_OPEN)
    bpy.context.view_layer.update()
    for o in new: bpy.data.objects.remove(o)
    res[key] = r; print('БОМБЫ', key, json.dumps(r, ensure_ascii=False, default=str))
out = os.environ.get('IL_OUT_J')
if out: json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=str)
