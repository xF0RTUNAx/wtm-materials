# _bomb.py - GBU-57 из Свои/GBU-57 в отсеках: помещается ли при закрытых створках и выходит ли вниз при открытых (BVH). B2_STAGE=4.
import bpy, math, os
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import b2_geo as g
sc = bpy.data.scenes['B2']; bpy.context.view_layer.update()
GLB = '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/GBU-57/gbu57.glb'
before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=GLB); new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
def tree(o, M=None):
    M = M or o.matrix_world; return BVHTree.FromPolygons([M @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])
pts = [o.matrix_world @ v.co for o in new for v in o.data.vertices]; top = max(p.z for p in pts); cy = (max(p.y for p in pts) + min(p.y for p in pts)) / 2
objs = {o.name: o for o in sc.objects if o.type == 'MESH' and o not in new}
res = {}
for side in ('r', 'l'):
    st = g.STATIONS['bay_' + side][3]          # середина отсека
    M = Matrix.Translation(Vector((st.x, st.y - cy, st.z - top)))
    bt = [tree(o, M @ o.matrix_world) for o in new]
    hits = []
    for n, o in objs.items():
        if n.startswith('gear'): continue
        to = tree(o)
        for t, bo in zip(bt, new):
            ov = t.overlap(to)
            if ov:
                pl = bo.data.polygons[ov[0][0]]; c = sum(((M @ bo.matrix_world) @ bo.data.vertices[v].co for v in pl.vertices), Vector()) / len(pl.vertices)
                hits.append((n, len(ov), 'a=%.2f x=%.2f z=%.2f' % (g.L / 2 - c.y, c.x, c.z)))
    res['закрыто_' + side] = hits
    # падение: створки открыты на 95°, бомба опускается на 2,5 м
    for n in ('bay_%s_i' % side, 'bay_%s_o' % side):
        o = objs[n]; D = g.PARTS[n]; T = D['pivot']; o.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(float(os.environ.get('B2_DOOR', '95'))), 4, D['axis']) @ Matrix.Translation(-T) @ o.matrix_world
    bpy.context.view_layer.update(); fall = set()
    for k in range(1, 11):
        Mk = Matrix.Translation(Vector((0, 0, -0.25 * k))) @ M; bt = [tree(o, Mk @ o.matrix_world) for o in new]
        for n, o in objs.items():
            if n.startswith('gear'): continue
            to = tree(o)
            for t, bo in zip(bt, new):
                ov = t.overlap(to)
                if ov and n not in [f[0] for f in fall]:
                    pl = o.data.polygons[ov[0][1]]; c = sum((o.matrix_world @ o.data.vertices[v].co for v in pl.vertices), Vector()) / len(pl.vertices)
                    fall.add((n, k, 'a=%.2f x=%.2f z=%.2f' % (g.L / 2 - c.y, c.x, c.z)))
    res['падение_' + side] = sorted(fall)
    pz = [M @ (o.matrix_world @ v.co) for o in new for v in o.data.vertices]
    res['низ_бомбы_' + side] = round(min(p.z for p in pz), 3); res['низ_обшивки_' + side] = round(g.bot(g.L / 2 - st.y, st.x), 3)
for k, v in res.items(): print('БОМБА', k, v)
