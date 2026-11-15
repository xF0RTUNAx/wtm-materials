# _limits.py - безопасный ход каждого подвижного узла по отдельности: от 0 в обе стороны до 15° шагом 0,25°, первый угол касания. → _live/limits.json
import bpy, math, json, os
from mathutils import Matrix
from mathutils.bvhtree import BVHTree
_p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build.py'); exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
objs = [o for o in COL.objects if o.type == 'MESH']
def tree(o): return BVHTree.FromPolygons([o.matrix_world @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])
pose(0.0, 0.0); fixed = [(q.name, tree(q)) for q in objs if q.name not in MOVE]
out = {}
for n, W in MOVE.items():
    o = bpy.data.objects[n]; p = BASEM[n].translation.copy(); lim = []
    for sgn in (-1, 1):
        ok = 15.0
        for i in range(1, 61):
            ang = sgn * 0.25 * i
            o.matrix_world = Matrix.Translation(p) @ Matrix.Rotation(math.radians(ang), 4, W['axis']) @ Matrix.Translation(-p) @ BASEM[n]; bpy.context.view_layer.update()
            t = tree(o); hit = [nm for nm, tt in fixed if t.overlap(tt)]
            if hit: ok = abs(ang) - 0.25; print(n, 'касание', ang, hit); break
        lim.append(sgn * ok)
    o.matrix_world = BASEM[n]; out[n] = lim
print('ПРЕДЕЛЫ', out, flush=True)
os.makedirs(os.path.join(HERE, '_live'), exist_ok=True); json.dump(out, open(os.path.join(HERE, '_live', 'limits.json'), 'w'), indent=1)
