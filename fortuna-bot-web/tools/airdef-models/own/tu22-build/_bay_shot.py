# _bay_shot.py - кадры отсека с бомбами: ФАБ-1000 ×4, створки открыты (после build.py и _views.py: камера и свет уже есть). TU_STAGE=4.
import bpy, math, os
from mathutils import Matrix, Vector
import tu22_geo as g
import os as _o
_H = _o.path.dirname(_o.path.abspath(__file__)); _env = dict(_o.environ); _o.environ['TU_ONLY'] = '-'
exec(open(_H + '/_views.py').read()); ONLY.clear()
sc = bpy.data.scenes['TU']; OUT = os.environ.get('TU_OUT', os.path.join(os.path.dirname(os.path.abspath(__file__)), '_снимки'))
GLB = {'fab1000': '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/ФАБ-1000/fab1000.glb'}
for o in sc.objects:
    if o.name.startswith(('gear', 'gdoor')): o.hide_render = True
for dn in ('bay_r', 'bay_l'):
    o = bpy.data.objects[dn]; D = g.PARTS[dn]; T = D['pivot']; o.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(g.BAY_OPEN), 4, D['axis']) @ Matrix.Translation(-T) @ o.matrix_world
Y = lambda a: g.L / 2 - a
for key, path in GLB.items():
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=path); src = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    cp = []
    for a in g.BAY_PTS[key]:
        for sx in (1, -1):
            M = Matrix.Translation(Vector((sx * g.BAY_X, g.Yb(a), g.BAY_TOP - g.VIS_R[key] - 0.05)))
            for o in src:
                c = o.copy(); c.data = o.data; sc.collection.objects.link(c); c.matrix_world = M @ o.matrix_world; cp.append(c)
    for o in src: o.hide_render = True
    shot('b_' + key + '_снизу.png', (0.0, Y(20.5), -1.2), (-0.35, 0.30, -0.89), 13.0)
    shot('b_' + key + '_сбоку.png', (0.0, Y(20.5), -1.2), (-0.42, -0.30, -0.86), 10.0, lens=40)
    for o in cp: bpy.data.objects.remove(o)
