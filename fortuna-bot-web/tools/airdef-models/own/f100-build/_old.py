# _old.py - прежняя модель игры: снимки сбоку и сверху для масштаба. Blender -b --factory-startup --python _old.py
import bpy, os, math
from mathutils import Vector
H = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='/Users/mark./wtm-materials/fortuna-bot-web/games/airdef/models/e_f100.glb')
sc = bpy.context.scene; pts = [o.matrix_world @ v.co for o in sc.objects if o.type == 'MESH' for v in o.data.vertices]
for ax in range(3): print('ось', ax, round(min(p[ax] for p in pts), 3), round(max(p[ax] for p in pts), 3))
# профиль: по срезам вдоль длины (ось Y Blender: нос -Z glTF -> +Y) верх, низ и полуширина
ys = sorted(set(round(p.y, 1) for p in pts))
for y in ys[::4]:
    s = [p for p in pts if abs(p.y - y) < 0.06]
    if s: print('y', y, 'z', round(min(p.z for p in s), 2), round(max(p.z for p in s), 2), 'x', round(max(abs(p.x) for p in s), 2), 'x при z~ось', round(max([abs(p.x) for p in s if abs(p.z) < 0.5] or [0]), 2))
sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'SINGLE'; sc.render.film_transparent = True
cd = bpy.data.cameras.new('c'); cam = bpy.data.objects.new('c', cd); sc.collection.objects.link(cam); sc.camera = cam; cd.type = 'ORTHO'; cd.ortho_scale = 16.0
for nm, loc, rot in (('old_side', (-40, 0, 0), (math.radians(90), 0, math.radians(-90))), ('old_top', (0, 0, 40), (0, 0, math.radians(-90))), ('old_bottom', (0, 0, -40), (math.radians(180), 0, math.radians(-90)))):
    cam.location = loc; cam.rotation_euler = rot; sc.render.resolution_x, sc.render.resolution_y = 1600, 1200 if 'side' not in nm else 600; sc.render.filepath = H + '/_снимки/' + nm + '.png'; bpy.ops.render.render(write_still=True)
