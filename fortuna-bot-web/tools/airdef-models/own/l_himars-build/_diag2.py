# _diag2.py — пары пересекающихся граней клетки и платформы (центры, в единицах сборки до масштаба): DIAG2="el,turn"
import bpy, os
from mathutils.bvhtree import BVHTree
_p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build.py'); exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
e, t = [float(v) for v in os.environ.get('DIAG2', '0,0').split(',')]; pose(e, t, 0, 'atacms'); bpy.context.view_layer.update()
def data(o):
    dg = bpy.context.evaluated_depsgraph_get(); me = o.evaluated_get(dg).to_mesh(); M = o.matrix_world
    vs = [M @ v.co for v in me.vertices]; fs = [list(p.vertices) for p in me.polygons]; o.evaluated_get(dg).to_mesh_clear(); return vs, fs
a, b = COL.objects[os.environ.get('A', 'pod')], COL.objects[os.environ.get('B', 'turn')]
va, fa = data(a); vb, fb = data(b); ta = BVHTree.FromPolygons(va, fa); tb = BVHTree.FromPolygons(vb, fb)
seen = set()
for i, j in ta.overlap(tb):
    ca = sum((va[k] for k in fa[i]), Vector()) / len(fa[i]) / SCALE_FIX; cb = sum((vb[k] for k in fb[j]), Vector()) / len(fb[j]) / SCALE_FIX
    key = (round(ca.x, 1), round(ca.y, 1), round(ca.z, 2))
    if key in seen: continue
    seen.add(key); print('ПАРА', a.name, '(%.3f %.3f %.3f)' % tuple(ca), b.name, '(%.3f %.3f %.3f)' % tuple(cb))
