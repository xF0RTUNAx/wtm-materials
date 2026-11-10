# _views.py — кадры формы ATACMS: Blender -b --factory-startup --python _views.py (ATA_OPEN=1 - рули раскрыты), VIEWS_TAG, VIEWS_SET
import os, math, bpy
from mathutils import Vector
_p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build.py'); exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
OUT = os.path.join(HERE, '_показ'); os.makedirs(OUT, exist_ok=True); TAG = os.environ.get('VIEWS_TAG', 'f')
sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'MATERIAL'
sc.display.shading.show_cavity = True; sc.display.shading.cavity_type = 'BOTH'
try: sc.view_settings.view_transform = 'Standard'
except Exception: pass
sc.display.shading.background_type = 'WORLD'; world = bpy.data.worlds.new('W'); sc.world = world; world.color = (0.85, 0.86, 0.87)
sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
cd = bpy.data.cameras.new('_cam'); cam = bpy.data.objects.new('_cam', cd); sc.collection.objects.link(cam); sc.camera = cam
SX = 4.23 / 1604; VIEWS = {'side': ((10, (960 - 949) * SX, -(540 - 516) * SX), (0, (960 - 949) * SX, -(540 - 516) * SX), 'o%.4f' % (1920 * SX)), 'top': ((0, 0, 10), (0, 0, 0), 'o4.6'), 'rear34': ((2.6, -4.6, 1.8), (0, -0.6, 0), 45),
         'front34': ((-2.6, 4.4, 1.6), (0, 0.4, 0), 45), 'aft': ((0, -8, 0), (0, 0, 0), 'o1.6')}
sel = os.environ.get('VIEWS_SET'); keys = sel.split(',') if sel else list(VIEWS)
for k in keys:
    pos, tgt, f = VIEWS[k]; cam.location = Vector(pos); cam.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
    if isinstance(f, str): cd.type = 'ORTHO'; cd.ortho_scale = float(f[1:])
    else: cd.type = 'PERSP'; cd.lens = f
    if k == 'top': cam.rotation_euler = (0, 0, -math.pi / 2)
    sc.render.film_transparent = (k == 'side')
    sc.render.filepath = os.path.join(OUT, f'{TAG}_{k}.png'); bpy.ops.render.render(write_still=True)
print('VIEWS done')
