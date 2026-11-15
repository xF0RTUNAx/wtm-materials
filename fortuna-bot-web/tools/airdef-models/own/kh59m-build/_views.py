# _views.py — кадры формы Х-59М (Workbench): Blender -b --factory-startup --python _views.py   (сам исполняет build.py)
#   VIEWS_TAG - приставка имён, VIEWS_SET - список видов через запятую. Вид «side» - в масштабе вида 2 чертежа 04 ×3 (для наложения _overlay.py).
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
CX, CYP = 285.5, 172.0                           # середина куска чертежа 04 (x 0…571, y 108…236) - вид 2
CY = YA(A(CX)); CZ = (AXY - CYP) * SPX
VIEWS = {'side': ((-10, CY, CZ), (0, CY, CZ), 'o%.4f' % (571 * SPX), (1713, 384)),
         'top': ((0, -0.2, 10), (0, -0.2, 0), 'o6.0', (1920, 640)),
         'bottom': ((0, -0.2, -10), (0, -0.2, 0), 'o6.0', (1920, 640)),
         'front': ((0, 10, 0), (0, 0, -0.12), 'o1.8', (1000, 1000)),
         'aft': ((0, -10, 0), (0, 0, -0.12), 'o1.8', (1000, 1000)),
         'front34': ((-3.3, 4.9, 1.6), (0, 0.4, -0.1), 45, (1920, 1080)),
         'rear34': ((3.0, -5.0, 1.4), (0, -0.6, -0.1), 45, (1920, 1080)),
         'nose': ((-0.75, 3.35, 0.35), (0, 2.15, 0), 50, (1600, 1000)),
         'engine': ((-0.95, 0.35, -0.75), (0, -0.85, -0.38), 45, (1600, 1000)),
         'tail': ((1.15, -3.55, 0.35), (0, -2.15, -0.05), 50, (1600, 1000)),
         'sidest': ((10, YA((561 - 285.5) * SPX), (59.5 - 55.0) * SPX), (0, YA((561 - 285.5) * SPX), (59.5 - 55.0) * SPX), 'o%.4f' % (571 * SPX), (1713, 330)),
         'start34': ((-2.0, 1.3, 1.1), (0, 1.9, 0.0), 40, (1600, 1000)),
         'startaft': ((1.6, -4.9, 0.9), (0, -2.6, -0.1), 45, (1600, 1000)),
         'low34': ((-2.6, 3.6, -1.6), (0, 0.0, -0.2), 45, (1920, 1080))}
if os.environ.get('VIEWS_NODOME'): DOMEO.hide_render = True
sel_ = os.environ.get('VIEWS_SET'); keys = sel_.split(',') if sel_ else list(VIEWS)
for k in keys:
    pos, tgt, f, res = VIEWS[k]; cam.location = Vector(pos); cam.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
    sc.render.resolution_x, sc.render.resolution_y = res
    if isinstance(f, str): cd.type = 'ORTHO'; cd.ortho_scale = float(f[1:])
    else: cd.type = 'PERSP'; cd.lens = f
    if k == 'top': cam.rotation_euler = (0, 0, math.pi / 2)
    if k == 'bottom': cam.rotation_euler = (math.pi, 0, -math.pi / 2)
    if k in ('front', 'aft'): cam.rotation_euler = (math.pi / 2, 0, math.pi if k == 'front' else 0.0)
    sc.render.film_transparent = k in ('side', 'sidest')
    sc.render.filepath = os.path.join(OUTV, f'{TAG}_{k}.png'); bpy.ops.render.render(write_still=True)
print('VIEWS done', keys)
