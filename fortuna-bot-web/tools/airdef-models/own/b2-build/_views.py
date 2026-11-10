# _views.py - снимки формы без окраски (Cycles, студийный свет): ортогональные виды и ракурсы фото. B2_OUT - папка, B2_ONLY - начала имён через запятую.
import os, math, bpy
from mathutils import Vector, Matrix
OUT = os.environ.get('B2_OUT', os.path.join(os.path.dirname(os.path.abspath(__file__)), '_снимки')); os.makedirs(OUT, exist_ok=True)
sc = bpy.data.scenes['B2']; sc.render.engine = 'CYCLES'
try:
    pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'METAL'; pr.get_devices()
    for d_ in pr.devices: d_.use = True
    sc.cycles.device = 'GPU'
except Exception as e_: print('GPU нет', e_)
sc.cycles.samples = int(os.environ.get('B2_SPP', '48')); sc.cycles.use_denoising = True; sc.cycles.max_bounces = 6
w = bpy.data.worlds.get('v_w') or bpy.data.worlds.new('v_w'); sc.world = w
try: w.use_nodes = True
except Exception: pass
bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs['Color'].default_value = (0.70, 0.76, 0.84, 1); bg.inputs['Strength'].default_value = 0.62
for nm, rot_, en in (('v_sun', (math.radians(52), math.radians(8), math.radians(-38)), 2.1), ('v_fill', (math.radians(118), math.radians(-14), math.radians(150)), 0.35)):
    sd = bpy.data.lights.get(nm) or bpy.data.lights.new(nm, 'SUN'); so = bpy.data.objects.get(nm) or bpy.data.objects.new(nm, sd)
    if so.name not in sc.collection.objects: sc.collection.objects.link(so)
    sd.energy = en; sd.angle = math.radians(6); so.rotation_euler = rot_
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
try: sc.view_settings.view_transform = 'Standard'
except Exception: pass
ONLY = [q for q in os.environ.get('B2_ONLY', '').split(',') if q]
cd = bpy.data.cameras.get('v_cam') or bpy.data.cameras.new('v_cam'); cam = bpy.data.objects.get('v_cam') or bpy.data.objects.new('v_cam', cd)
if cam.name not in sc.collection.objects: sc.collection.objects.link(cam)
sc.camera = cam; cd.clip_start, cd.clip_end = 0.1, 500
def shot(name, tgt, d, dist, ortho=None, w=1600, h=1000, lens=50):
    if ONLY and not any(name.startswith(q) for q in ONLY): return
    sc.render.film_transparent = bool(ortho)
    dv = Vector(d).normalized(); cam.location = Vector(tgt) + dv * dist; cam.rotation_euler = (Vector(tgt) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    if ortho: cd.type = 'ORTHO'; cd.ortho_scale = ortho
    else: cd.type = 'PERSP'; cd.lens = lens; cd.sensor_width = 36
    sc.render.resolution_x, sc.render.resolution_y = w, h; sc.render.filepath = os.path.join(OUT, name); bpy.ops.render.render(write_still=True)
import b2_geo as g
def P(a, x, z): return g.P3(a, x, z)
# ортогональные: 40 пикс/м
shot('o_сверху.png', P(10.5, 0, 0), (0, 0, 1), 60, ortho=54.0, w=2160, h=1000)
shot('o_снизу.png', P(10.5, 0, 0), (0, 0, -1), 60, ortho=54.0, w=2160, h=1000)
shot('o_сбоку.png', P(10.5, 0, 0), (1, 0, 0), 60, ortho=22.0, w=2200, h=500)
shot('o_спереди.png', P(10.5, 0, 0), (0, 1, 0), 60, ortho=54.0, w=2160, h=400)
# ракурсы фото
shot('p_как_07.png', P(8.0, 0, -0.3), (0.0, 1.0, 0.42), 75.0, lens=50, w=1600, h=870)
shot('p_как_09.png', P(8.0, 0, -0.3), (0.0, 1.0, -0.15), 75.0, lens=50, w=1600, h=870)
shot('p_как_05.png', P(9.0, 0, 0.2), (-1.0, -0.05, 0.10), 48.0, lens=50, w=1600, h=900)
shot('p_как_01.png', P(8.0, 0, 0.3), (-0.45, 0.62, 0.62), 55.0, lens=50, w=1600, h=900)
shot('p_как_08.png', P(9.0, 0, 0.0), (-0.95, 0.25, 0.42), 52.0, lens=50, w=1600, h=900)
shot('c_кабина.png', P(4.0, 0, 1.3), (0.15, 0.85, 0.65), 8.5, lens=50, w=1400, h=1000)
shot('c_заборник.png', P(6.3, 4.3, 1.2), (0.45, 0.75, 0.55), 6.0, lens=50, w=1400, h=1000)
shot('c_выхлоп.png', P(15.5, 4.3, 0.8), (-0.35, -0.65, 0.75), 8.0, lens=50, w=1400, h=1000)
shot('c_хвост_низ.png', P(17.5, 6.0, 0.0), (-0.4, -0.75, -0.55), 15.0, lens=50, w=1400, h=1000)
shot('c_конец.png', P(19.0, 19.5, 0.0), (0.55, -0.6, 0.55), 12.0, lens=50, w=1400, h=1000)
# шасси выпущено: створки шасси открыты
def _pose(name, deg):
    if name not in g.PARTS or name not in bpy.data.objects: return
    o = bpy.data.objects[name]; D = g.PARTS[name]; T = D['pivot']
    o.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(deg), 4, D['axis']) @ Matrix.Translation(-T) @ o.matrix_world
for n_, d_ in (('door_n', 95), ('door_mi_r', 95), ('door_mi_l', 95), ('door_mo_r', 92), ('door_mo_l', 92)): _pose(n_, d_)
bpy.context.view_layer.update()
shot('g_сбоку.png', P(10.5, 0, -0.5), (-1.0, -0.06, 0.08), 40.0, lens=50, w=1800, h=700)
shot('g_как_04.png', P(6.0, 0, -0.8), (-0.75, 0.62, 0.12), 26.0, lens=40, w=1600, h=900)
shot('g_шасси_м.png', P(10.0, 6.25, -1.6), (-0.85, 0.45, -0.05), 7.5, lens=50, w=1400, h=1000)
shot('g_шасси_н.png', P(2.6, 0.0, -1.5), (-0.55, 0.8, 0.05), 5.0, lens=50, w=1400, h=1000)
shot('g_снизу.png', P(10.5, 0, 0), (0, 0, -1), 60, ortho=54.0, w=2160, h=1000)
for n_ in ('bay_r_i', 'bay_r_o', 'bay_l_i', 'bay_l_o'): _pose(n_, 95)
bpy.context.view_layer.update()
shot('b_отсеки.png', P(9.9, 0.0, -0.6), (-0.15, 0.35, -0.92), 13.0, lens=40, w=1600, h=1000)
shot('b_отсек_бок.png', P(9.9, 1.3, -0.3), (-0.75, 0.30, -0.55), 8.0, lens=40, w=1600, h=1000)
print('снимки', OUT)
