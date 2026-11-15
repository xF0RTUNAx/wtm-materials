# _fold.py - складывание носовых рулей: первый kf, при котором руль касается корпуса (шаг 0,0025). Blender -b --factory-startup --python _fold.py
import bpy, os
from mathutils.bvhtree import BVHTree
_p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build.py'); exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
def tree(o): return BVHTree.FromPolygons([o.matrix_world @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])
body = tree(bpy.data.objects['body'])
for i in range(0, 81):
    kf = 0.8 + i * 0.0025; pose(0, 0, kf); hit = [n for n in ('can1', 'can2', 'can3', 'can4') if tree(bpy.data.objects[n]).overlap(body)]
    if hit: print('КАСАНИЕ kf', round(kf, 4), 'угол', round(FOLD['deg'] * kf, 2), hit, flush=True); break
else: print('КАСАНИЕ нет до kf 1.0', flush=True)
