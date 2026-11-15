# _views.py — кадры формы Х-25МЛ (Workbench): Blender -b --factory-startup --python _views.py   (сам исполняет build.py)
#   VIEWS_TAG - приставка имён, VIEWS_SET - список видов через запятую. Вид «side» - в масштабе чертежа 06 ×3 (для наложения _overlay.py).
import os, math, bpy
from mathutils import Vector
_p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build.py'); exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
OUTV = os.path.join(HERE, '_показ'); os.makedirs(OUTV, exist_ok=True); TAG = os.environ.get('VIEWS_TAG', 'f')
sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'MATERIAL'
sc.display.shading.show_cavity = True; sc.display.shading.cavity_type = 'BOTH'
try: sc.view_settings.view_transform = 'Standard'
except Exception: pass
sc.display.shading.background_type = 'WORLD'; world = bpy.data.worlds.new('W'); sc.world = world; world.color = (0.85, 0.86, 0.87)
cd = bpy.data.cameras.new('_cam'); cam = bpy.data.objects.new('_cam', cd); sc.collection.objects.link(cam); sc.camera = cam
CY = YA(A(311.5)); CZ = (70.3 - 112.5) * SPX                     # середина чертежа 06 (623 × 225)
VIEWS = {'side': ((-10, CY, CZ), (0, CY, CZ), 'o%.4f' % (623 * SPX), (1869, 675)),
         'top': ((0, 0, 10), (0, 0, 0), 'o4.0', (1920, 700)),
         'bottom': ((0, 0, -10), (0, 0, 0), 'o4.0', (1920, 700)),
         'front': ((0, 10, 0), (0, 0, 0), 'o1.0', (1000, 1000)),
         'aft': ((0, -10, 0), (0, 0, 0), 'o1.0', (1000, 1000)),
         'front34': ((-2.4, 3.6, 1.3), (0, 0.5, 0), 45, (1920, 1080)),
         'rear34': ((2.2, -3.8, 1.2), (0, -0.6, 0), 45, (1920, 1080)),
         'nose': ((-0.55, 2.35, 0.32), (0, 1.40, 0), 50, (1600, 1000)),
         'tail': ((0.95, -2.35, 0.30), (0, -1.45, 0), 50, (1600, 1000)),
         'tailside': ((-1.1, -1.3, 0.15), (0, -1.45, 0), 50, (1600, 1000))}
sel_ = os.environ.get('VIEWS_SET'); keys = sel_.split(',') if sel_ else list(VIEWS)
for k in keys:
    pos, tgt, f, res = VIEWS[k]; cam.location = Vector(pos); cam.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
    sc.render.resolution_x, sc.render.resolution_y = res
    if isinstance(f, str): cd.type = 'ORTHO'; cd.ortho_scale = float(f[1:])
    else: cd.type = 'PERSP'; cd.lens = f
    if k == 'top': cam.rotation_euler = (0, 0, math.pi / 2)
    if k == 'bottom': cam.rotation_euler = (math.pi, 0, -math.pi / 2)
    if k in ('front', 'aft'): cam.rotation_euler = (math.pi / 2, 0, math.pi if k == 'front' else 0.0)
    sc.render.film_transparent = (k == 'side')
    sc.render.filepath = os.path.join(OUTV, f'{TAG}_{k}.png'); bpy.ops.render.render(write_still=True)
print('VIEWS done', keys)
