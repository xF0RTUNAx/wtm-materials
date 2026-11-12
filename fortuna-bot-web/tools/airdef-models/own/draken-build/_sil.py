# _sil.py - силуэты сверху, сбоку, спереди (Workbench, ортогонально, прозрачный фон) для наложения на чертёж и фото: _снимки/sil_*.png, масштаб K пикс/м, центр - начало мира.
import os, bpy, math
from mathutils import Vector, Matrix
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_снимки'); os.makedirs(OUT, exist_ok=True)
sc = bpy.data.scenes['DR']; K = 60.0; W = 20.0
sc.render.engine = 'BLENDER_WORKBENCH'; sc.render.film_transparent = True; sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
sc.display.shading.light = 'FLAT'; sc.display.shading.color_type = 'SINGLE'; sc.display.shading.single_color = (0.1, 0.1, 0.1)
cd = bpy.data.cameras.new('sc'); cam = bpy.data.objects.new('sc', cd); sc.collection.objects.link(cam); sc.camera = cam; cd.type = 'ORTHO'; cd.ortho_scale = W; cd.clip_start, cd.clip_end = 0.1, 200
sc.render.resolution_x = sc.render.resolution_y = int(W * K)
for nm, loc, rot in (('sil_top.png', (0, 0, 50), (0, 0, 0)), ('sil_side.png', (50, 0, 0), (math.pi / 2, 0, math.pi / 2)), ('sil_front.png', (0, 50, 0), (math.pi / 2, 0, math.pi))):
    cam.location = loc; cam.rotation_euler = rot; sc.render.filepath = os.path.join(OUT, nm); bpy.ops.render.render(write_still=True)
print('силуэты готовы', K, W)
