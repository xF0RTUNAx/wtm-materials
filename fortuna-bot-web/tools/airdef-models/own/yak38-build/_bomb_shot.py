# _bomb_shot.py - кадры ОФАБ-250 ×4 на пилонах (после build.py; камера и свет из _views.py). YK_STAGE=4.
import bpy, math, os
from mathutils import Matrix, Vector
os.environ['YK_ONLY'] = '-'
__file__ = '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Як-38М/_views.py'; exec(open(__file__).read()); ONLY.clear()
before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath='/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/ОФАБ-250/w_ofab250.glb'); src = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
for a, xl, z in g.station_pts():
    for sx in (1, -1):
        M = Matrix.Translation(Vector((-xl * sx, g.Yb(a), z - 0.163 - 0.05)))
        for o in src:
            c = o.copy(); c.data = o.data; sc.collection.objects.link(c); c.matrix_world = M @ o.matrix_world
for o in src: o.hide_render = True
for n_ in ('nozzle_r', 'nozzle_l'): _pose(n_, 90)
bpy.context.view_layer.update()
shot('b_ofab_спереди.png', (0.0, Y(9.8), 1.4), (0.55, 0.75, 0.10), 8.0)
shot('b_ofab_снизу.png', (0.0, Y(9.8), 1.2), (-0.35, 0.20, -0.91), 8.0)
