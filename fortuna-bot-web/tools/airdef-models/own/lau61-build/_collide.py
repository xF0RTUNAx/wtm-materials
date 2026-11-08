# _collide.py - ракеты в трубах: пересечения каждой ракеты r0..r18 с корпусом, обечайками, мелочами и друг с другом; зазор до стенки трубы.
import bpy, math, json, os
from mathutils.bvhtree import BVHTree
import modelkit as mk
sc = bpy.data.scenes['LAU61']; bpy.context.view_layer.update()
objs = [o for o in sc.objects if o.type == 'MESH']
def tree(o): return BVHTree.FromPolygons([o.matrix_world @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])
T = {o.name: tree(o) for o in objs}
rk = [o.name for o in objs if o.name.startswith('r') and o.name[1:].isdigit()]
hits = []
for n in rk:
    for m, t in T.items():
        if m == n or (m in rk and m < n): continue
        if T[n].overlap(t): hits.append(f'{n} × {m}')
rmax = max(math.hypot(v.co.x, v.co.z) for v in bpy.data.objects['r0'].data.vertices)
res = {'ракет': len(rk), 'пересечений': hits, 'зазор_до_стенки_трубы_мм': round((mk.GEO['R_H'] - rmax) * 1000, 1)}
print('СТОЛКНОВЕНИЯ', res, flush=True)
json.dump(res, open(os.path.join(os.environ['LAU_OUT'], '_live', 'collide.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
