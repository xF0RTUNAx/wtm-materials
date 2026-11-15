# _views.py - кадры формы Х-59МК2 (Workbench): Blender -b --factory-startup --python _views.py   (сам исполняет build.py)
#   VIEWS_TAG - приставка имён, VIEWS_SET - список видов через запятую, MK2_POSE - поза (рули, крыло 0…1)
import os, math, bpy
from mathutils import Vector
_p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build.py'); exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
OUTV = os.path.join(HERE, '_показ'); os.makedirs(OUTV, exist_ok=True); TAG = os.environ.get('VIEWS_TAG', 'f')
sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'MATERIAL'
sc.display.shading.show_cavity = True; sc.display.shading.cavity_type = 'BOTH'
try: sc.view_settings.view_transform = 'Standard'
except Exception: pass
sc.display.shading.background_type = 'WORLD'; world = bpy.data.worlds.new('W'); sc.world = world; world.color = (0.55, 0.57, 0.60)
cd = bpy.data.cameras.new('_cam'); cam = bpy.data.objects.new('_cam', cd); sc.collection.objects.link(cam); sc.camera = cam; cd.clip_start = 0.02
VIEWS = {'side': ((-10, 0, 0), (0, 0, 0), 'o6.0', (1920, 640)),
         'top': ((0, 0, 10), (0, 0, 0), 'o6.0', (1920, 1000)),
         'bottom': ((0, 0, -10), (0, 0, 0), 'o6.0', (1920, 1000)),
         'front': ((0, 10, 0), (0, 0, 0), 'o1.2', (1000, 1000)),
         'aft': ((0, -10, 0), (0, 0, 0), 'o1.2', (1000, 1000)),
         'front34': ((-3.6, 5.2, 1.7), (0, 0.4, 0.0), 40, (1920, 1080)),
         'rear34': ((3.2, -5.4, 1.5), (0, -0.6, 0.0), 40, (1920, 1080)),
         'nose': ((-1.05, 3.85, 0.15), (0, 2.45, -0.05), 45, (1600, 1000)),
         'nosel': ((-0.55, 3.75, -0.55), (0, 2.6, -0.06), 45, (1600, 1000)),
         'tail': ((1.10, -3.95, 0.55), (0, -2.45, -0.02), 45, (1600, 1000)),
         'low34': ((-2.9, 3.9, -1.7), (0, 0.0, -0.1), 40, (1920, 1080))}
sel_ = os.environ.get('VIEWS_SET'); keys = sel_.split(',') if sel_ else list(VIEWS)
for k in keys:
    pos, tgt, f, res = VIEWS[k]; cam.location = Vector(pos); cam.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
    sc.render.resolution_x, sc.render.resolution_y = res
    if isinstance(f, str): cd.type = 'ORTHO'; cd.ortho_scale = float(f[1:])
    else: cd.type = 'PERSP'; cd.lens = f
    if k == 'top': cam.rotation_euler = (0, 0, math.pi / 2)
    if k == 'bottom': cam.rotation_euler = (math.pi, 0, -math.pi / 2)
    if k in ('front', 'aft'): cam.rotation_euler = (math.pi / 2, 0, math.pi if k == 'front' else 0.0)
    sc.render.filepath = os.path.join(OUTV, f'{TAG}_{k}.png'); bpy.ops.render.render(write_still=True)
print('VIEWS done', keys)
