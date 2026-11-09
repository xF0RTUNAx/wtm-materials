# _views.py - снимки формы без окраски (Workbench, студийный свет, ребра): ортогональные виды и перспектива с ракурсов референсов. RF_OUT - папка.
import os, math, bpy
from mathutils import Vector
OUT = os.environ.get('RF_OUT', os.path.join(os.path.dirname(os.path.abspath(__file__)), '_снимки')); os.makedirs(OUT, exist_ok=True)
sc = bpy.data.scenes['RF']; sc.render.engine = 'CYCLES'
try:
    pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'METAL'; pr.get_devices()
    for d_ in pr.devices: d_.use = True
    sc.cycles.device = 'GPU'
except Exception as e_: print('GPU нет', e_)
sc.cycles.samples = int(os.environ.get('RF_SPP', '64')); sc.cycles.use_denoising = True; sc.cycles.denoising_input_passes = 'RGB'; sc.cycles.max_bounces = 6
w = bpy.data.worlds.get('v_w') or bpy.data.worlds.new('v_w'); sc.world = w
try: w.use_nodes = True
except Exception: pass
bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs['Color'].default_value = (0.70, 0.76, 0.84, 1); bg.inputs['Strength'].default_value = 0.62
for nm, rot_, en in (('v_sun', (math.radians(52), math.radians(8), math.radians(-38)), 2.1), ('v_fill', (math.radians(118), math.radians(-14), math.radians(150)), 0.35)):
    sd = bpy.data.lights.get(nm) or bpy.data.lights.new(nm, 'SUN'); so = bpy.data.objects.get(nm) or bpy.data.objects.new(nm, sd)
    if so.name not in sc.collection.objects: sc.collection.objects.link(so)
    sd.energy = en; sd.angle = math.radians(6); so.rotation_euler = rot_
sc.render.film_transparent = True; sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
try: sc.view_settings.view_transform = 'Standard'
except Exception: pass
ONLY = [q for q in os.environ.get('RF_ONLY', '').split(',') if q]
cd = bpy.data.cameras.get('v_cam') or bpy.data.cameras.new('v_cam'); cam = bpy.data.objects.get('v_cam') or bpy.data.objects.new('v_cam', cd)
if cam.name not in sc.collection.objects: sc.collection.objects.link(cam)
sc.camera = cam; cd.clip_start, cd.clip_end = 0.1, 300
def shot(name, tgt, d, dist, ortho=None, w=1600, h=1000, lens=50):
    if ONLY and not any(name.startswith(q) for q in ONLY): return
    sc.render.film_transparent = bool(ortho)    # альфа не шумоподавляется: на крупных планах фон - небо, стекло чистое
    dv = Vector(d).normalized(); cam.location = Vector(tgt) + dv * dist; cam.rotation_euler = (Vector(tgt) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    if ortho: cd.type = 'ORTHO'; cd.ortho_scale = ortho
    else: cd.type = 'PERSP'; cd.lens = lens; cd.sensor_width = 36
    sc.render.resolution_x, sc.render.resolution_y = w, h; sc.render.filepath = os.path.join(OUT, name); bpy.ops.render.render(write_still=True)
Y0 = 0.0
# снимки формы при выпущенном шасси: створки открыты (углы в файле не меняются)
import rafale_geo as g
from mathutils import Matrix
def _pose(name, deg):
    o = bpy.data.objects[name]; D = g.PARTS[name]; T = D['pivot']
    o.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(deg), 4, D['axis']) @ Matrix.Translation(-T) @ o.matrix_world
for n_, d_ in (('door_n_r', 86), ('door_n_l', 86), ('door_m_r', 92), ('door_m_l', 92)): _pose(n_, d_)
bpy.context.view_layer.update()
shot('side_r.png', (0, 0, 0.4), (1, 0, 0), 40, ortho=18.0, w=2000, h=1000)
shot('top.png', (0, 0, 0), (0, 0, 1), 40, ortho=18.0, w=1600, h=1600)
shot('bottom.png', (0, 0, 0), (0, 0, -1), 40, ortho=18.0, w=1600, h=1600)
shot('front.png', (0, 0, 0.3), (0, 1, 0), 40, ortho=12.0, w=1600, h=1000)
shot('rear.png', (0, 0, 0.3), (0, -1, 0), 40, ortho=12.0, w=1600, h=1000)
shot('p0_как_01_прямо.png', (0.0, 1.5, 0.0), (0.0, 1.0, -0.02), 19.0, lens=60)
shot('p1_как_01.png', (0.0, 0.0, 0.1), (0.52, 0.72, 0.22), 21.0, lens=45)
shot('p2_как_06.png', (0.0, 1.0, -0.3), (0.28, 0.80, -0.42), 20.0, lens=50)
shot('p3_как_11.png', (0.0, 2.0, 0.3), (0.0, 1.0, 0.38), 22.0, lens=60)
shot('p4_как_03.png', (0.0, -2.0, 0.2), (0.25, -0.92, 0.22), 22.0, lens=60)
shot('e_утка.png', (0.95, 1.45, 0.65), (0.55, 0.65, 0.52), 3.2, lens=50)
shot('e_утка2.png', (0.95, 1.45, 0.55), (0.35, 0.90, -0.25), 3.2, lens=50)
shot('d1_снизу.png', (0.0, 0.0, -0.3), (-0.10, 0.0, -1.0), 19.0, lens=50)
shot('d2_низко_спереди.png', (0.0, 0.6, -0.6), (0.10, 1.0, -0.02), 19.0, lens=60)
shot('d3_спереди_полёт.png', (0.0, 0.0, 0.0), (0.0, 1.0, 0.10), 24.0, lens=55)
shot('d4_три_четверти.png', (0.0, 0.4, 0.2), (-0.78, 0.55, 0.12), 20.0, lens=50)
shot('d5_сбоку_низко.png', (0.0, 0.4, 0.0), (-0.92, 0.33, -0.05), 19.0, lens=50)
shot('c_нос_кабина.png', (0.0, 4.2, 0.6), (0.62, 0.62, 0.42), 7.0)
shot('c_кабина.png', (0.0, 3.0, 1.2), (0.72, 0.10, 0.52), 3.8)
shot('c_заборник.png', (0.0, 2.0, -0.35), (0.25, 0.95, -0.12), 5.0)
shot('c_заборник2.png', (1.0, 1.9, -0.35), (0.75, 0.72, -0.10), 4.0)
shot('c_хвост.png', (0.0, -5.6, 1.2), (0.72, -0.60, 0.25), 7.5)
shot('c_сопла.png', (0.0, -7.0, -0.2), (0.28, -0.90, -0.14), 4.2)
shot('c_низ.png', (0.0, 0.0, -0.3), (0.05, -0.05, -1.0), 18.0)
shot('c_низ2.png', (0.0, 0.0, -0.3), (0.40, 0.30, -0.86), 18.0)
shot('c_крыло.png', (3.4, -4.0, 0.1), (0.25, -0.40, 0.88), 7.5)
shot('c_шасси_н.png', (0.0, 3.0, -1.5), (0.72, 0.62, 0.05), 3.8)
shot('c_шасси_м.png', (1.4, -2.3, -1.4), (0.82, 0.48, 0.05), 3.8)
for n, dd in (('canopy', 24), ('elevon_i_r', 20), ('elevon_o_r', 20), ('elevon_i_l', -20), ('elevon_o_l', -20), ('slat_i_r', 14), ('slat_o_r', 14), ('slat_i_l', 14), ('slat_o_l', 14), ('canard_r', 20), ('canard_l', -20), ('rudder', 25)): _pose(n, dd)
bpy.context.view_layer.update()
shot('o_поза_спереди.png', (0.0, 0.6, 0.3), (0.52, 0.72, 0.46), 20.0)
shot('o_поза_сзади.png', (0.0, -1.0, 0.6), (-0.45, -0.72, 0.52), 20.0)
print('снимки', OUT)
