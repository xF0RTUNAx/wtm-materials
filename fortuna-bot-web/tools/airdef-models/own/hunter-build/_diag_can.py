import bpy, math
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import hn_geo as g
sc = bpy.data.scenes['HN']; bpy.context.view_layer.update(); objs = {o.name: o for o in sc.objects if o.type == 'MESH'}
def tree(o, M): return BVHTree.FromPolygons([M @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])
D = g.PARTS['canopy']
for s in (0.0, 0.1, 0.3, 0.5, 0.7):
    for nm in ('canopy', 'canopy_glass'):
        o = objs[nm]; M = Matrix.Translation(D['axis'] * s) @ o.matrix_world; t = tree(o, M)
        for other in ('HN_skin', 'cockpit_int'):
            q = objs[other]; pr = t.overlap(tree(q, q.matrix_world))
            if pr:
                pts = [M @ o.data.polygons[i].center for i, _ in pr[:400]]
                a = [7.0 - p.y for p in pts]; x = [abs(p.x) for p in pts]; z = [p.z + g.ZA for p in pts]
                print(f'сдвиг {s}: {nm} x {other}: {len(pr)} пар, a {min(a):.2f}..{max(a):.2f}, |x| {min(x):.3f}..{max(x):.3f}, z {min(z):.3f}..{max(z):.3f}')
