# _views.py — кадры формы HIMARS (Workbench, без окна): Blender -b --factory-startup --python _views.py
# VIEWS_OUT - папка, VIEWS_TAG - приставка имён, поза - как в build.py (HIM_EL, HIM_TURN, HIM_BOOM, HIM_VAR); VIEWS_SET - список видов через запятую
import os, math, bpy
from mathutils import Vector
_p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build.py'); exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
OUT = os.environ.get('VIEWS_OUT', os.path.join(HERE, '_показ')); os.makedirs(OUT, exist_ok=True); TAG = os.environ.get('VIEWS_TAG', 'f')
pose(P_EL, P_TURN, P_BOOM, P_VAR)
try: sc.view_settings.view_transform = 'Standard'; sc.view_settings.exposure = 0.9
except Exception: pass
sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'MATERIAL'
sc.display.shading.show_cavity = True; sc.display.shading.cavity_type = 'BOTH'; sc.display.shading.show_shadows = True
sc.display.shading.show_object_outline = False; sc.render.film_transparent = False
try: sc.display.shading.background_type = 'WORLD'
except Exception: pass
W, H_ = int(os.environ.get('VIEWS_W', '1400')), int(os.environ.get('VIEWS_H', '900'))
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H_, 100
world = bpy.data.worlds.get('HIMW') or bpy.data.worlds.new('HIMW'); sc.world = world; world.color = (0.78, 0.80, 0.82)
# пол-сетка для масштаба
if not bpy.data.objects.get('_floor'):
    me = bpy.data.meshes.new('_floor'); n = 10; vs = []; fs = []
    for i in range(-n, n):
        for j in range(-n, n):
            k = len(vs); vs += [(i, j, 0), (i + 1, j, 0), (i + 1, j + 1, 0), (i, j + 1, 0)]; fs.append((k, k + 1, k + 2, k + 3))
    me.from_pydata(vs, [], fs); fl = bpy.data.objects.new('_floor', me); sc.collection.objects.link(fl)
    m = bpy.data.materials.new('_floor_m'); m.diffuse_color = (0.55, 0.56, 0.55, 1); me.materials.append(m)
    m2 = bpy.data.materials.new('_floor_m2'); m2.diffuse_color = (0.47, 0.48, 0.47, 1); me.materials.append(m2)
    for f in me.polygons: f.material_index = (int(f.center.x + 50) + int(f.center.y + 50)) % 2
cd = bpy.data.cameras.new('_cam'); cam = bpy.data.objects.new('_cam', cd); sc.collection.objects.link(cam); sc.camera = cam
VIEWS = {   # имя: (позиция, цель, фокус мм; ortho - масштаб)
    'fl34': ((-7.5, 9.5, 3.2), (0, 0.2, 1.5), 40),
    'rl34': ((-7.0, -9.5, 3.4), (0, -0.8, 1.6), 40),
    'fr34': ((7.5, 9.5, 3.2), (0, 0.2, 1.5), 40),
    'side': ((-20, 0, 1.6), (0, 0, 1.6), 'o8.6'),
    'front': ((0, 20, 1.6), (0, 0, 1.6), 'o3.6'),
    'rear': ((0, -20, 1.6), (0, 0, 1.6), 'o3.6'),
    'top': ((0, 0, 20), (0, 0, 0), 'o8.6'),
    'under': ((-4.5, 2.0, -0.2), (0, 0, 0.9), 30),
    'cab': ((-3.8, 6.8, 3.6), (0, 2.6, 2.1), 40),
    'wheel': ((-3.2, 3.6, 0.9), (-1.0, 2.62, 0.6), 50),
    'p11': ((-3.1, 7.0, 0.95), (0.2, 2.6, 1.75), 28),
    'p8': ((-6.8, 7.6, 1.5), (0.2, 0.2, 1.9), 34),
    'p13': ((0.3, 9.5, 1.3), (0, 2.0, 1.75), 38),
    'bump': ((-2.0, 7.4, 0.75), (0.0, 3.6, 0.88), 32),
    'bumpf': ((0.4, 9.0, 0.9), (0.0, 3.6, 1.0), 30),
    'top34': ((4.5, -9.5, 9.5), (0.0, -1.2, 1.6), 32),
    'p01': ((5.5, -7.8, 1.6), (0.0, -1.0, 2.4), 30),
    'muzzle': ((-2.6, 5.2, 4.6), (0, 0.6, 2.3), 35),
    'rearpod': ((-2.4, -7.6, 3.4), (0, -3.4, 2.0), 35),
    'cabL': ((-12, 2.2, 1.2), (0, 2.2, 1.2), 'o3.6'),
    'cabR': ((12, 2.2, 1.2), (0, 2.2, 1.2), 'o3.6'),
    'cabLo': ((-4.6, 0.2, 0.55), (0, 2.2, 0.9), 30),
    'cabRo': ((4.6, 0.2, 0.55), (0, 2.2, 0.9), 30),
    'cabCh': ((-4.2, 0.6, 1.1), (0.3, 2.3, 1.2), 32),
    'cabSd': ((-9, 2.4, 1.25), (0, 2.4, 1.25), 'o2.6'),
    'cabSdR': ((9, 2.55, 1.85), (0, 2.55, 1.85), 'o2.5'),
    'cabChR': ((4.2, 0.6, 1.3), (-0.3, 2.3, 1.4), 32),
    'stepR': ((3.0, 4.6, 1.3), (1.05, 3.4, 0.9), 32),
    'stepS': ((9, 3.2, 0.95), (0, 3.2, 0.95), 'o1.6'),
    'topC': ((0, 0.5, 20), (0, 0.5, 0), 'o4.0'),
    'mirL': ((-2.6, 5.2, 2.6), (-1.2, 3.35, 2.1), 34),
    'mU': ((2.2, 3.9, 2.45), (1.12, 3.48, 2.12), 40),
    'mD': ((2.2, 3.9, 1.75), (1.12, 3.50, 1.72), 40),
    'mS': ((2.6, 3.45, 1.95), (1.0, 3.45, 1.95), 'o1.0'),
    'mirR': ((2.6, 5.2, 2.6), (1.2, 3.35, 2.1), 34),
    'mirT': ((-1.25, 3.4, 5.0), (-1.25, 3.4, 2.1), 'o1.4'),
    'behL': ((-3.4, -0.6, 3.6), (-0.5, 1.4, 1.9), 34),
    'behR': ((3.4, -0.6, 3.6), (0.5, 1.4, 1.9), 34),
    'bumpLo': ((3.2, 5.6, 0.35), (0.6, 3.5, 0.65), 32),
    'stepC': ((3.3, 2.0, 1.15), (1.0, 3.1, 0.85), 34),
}
sel = os.environ.get('VIEWS_SET'); keys = sel.split(',') if sel else list(VIEWS)
for k in keys:
    pos, tgt, f = VIEWS[k]; cam.location = Vector(pos); cam.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
    if isinstance(f, str): cd.type = 'ORTHO'; cd.ortho_scale = float(f[1:])
    else: cd.type = 'PERSP'; cd.lens = f
    if k == 'top': cam.rotation_euler = (0, 0, -math.pi / 2)
    sc.render.filepath = os.path.join(OUT, f'{TAG}_{k}.png'); bpy.ops.render.render(write_still=True)
print('VIEWS done', keys)
