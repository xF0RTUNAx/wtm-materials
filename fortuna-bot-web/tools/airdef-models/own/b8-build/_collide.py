# _collide.py - ревизия 2: ракеты (r + cone_r) с обтекателем и (r + heli_r) без него: пересечения с корпусом, обтекателем, кольцами срезов, друг с другом.
import bpy, math, json, os
from mathutils.bvhtree import BVHTree
import modelkit as mk
sc = bpy.data.scenes['B8']; bpy.context.view_layer.update()
objs = [o for o in sc.objects if o.type == 'MESH']
def tree(o): return BVHTree.FromPolygons([o.matrix_world @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])
T = {o.name: tree(o) for o in objs}
isr = lambda n: (n[0] == 'r' and n[1:].isdigit())
res = {}
for vid, extra, hide in (('с обтекателем', 'cone_r', 'heli'), ('вертолётный', 'heli_r', 'cone')):
    names = [n for n in T if isr(n) or n.startswith(extra)]
    fixed = [n for n in T if not isr(n) and not n.startswith('cone_r') and not n.startswith('heli_r') and n != hide]
    hits = []
    for n in names:
        for m in fixed + [m for m in names if m > n and not (m.split('_')[-1] == n.split('_')[-1])]:
            if T[n].overlap(T[m]): hits.append(f'{n} × {m}')
    res[vid] = hits
print('СТОЛКНОВЕНИЯ', {k: (len(v), v[:6]) for k, v in res.items()}, flush=True)
json.dump(res, open(os.path.join(os.environ['B8_OUT'], '_live', 'collide.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
