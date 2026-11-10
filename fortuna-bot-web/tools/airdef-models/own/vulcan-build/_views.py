# _views.py - снимки формы без окраски (Cycles, студийный свет): ортогональные виды, ракурсы фото, крупные планы, крайние положения. VUL_OUT - папка, VUL_ONLY - начала имён.
import os, math, bpy
from mathutils import Vector, Matrix
OUT = os.environ.get('VUL_OUT', os.path.join(os.path.dirname(os.path.abspath(__file__)), '_снимки')); os.makedirs(OUT, exist_ok=True)
sc = bpy.data.scenes["VUL"]; sc.render.engine = 'CYCLES'
try:
    pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'METAL'; pr.get_devices()
    for d_ in pr.devices: d_.use = True
    sc.cycles.device = 'GPU' if os.environ.get('VUL_CPU') != '1' else 'CPU'
except Exception as e_: print('GPU нет', e_)
sc.cycles.samples = int(os.environ.get('VUL_SPP', '48')); sc.cycles.use_denoising = True; sc.cycles.denoising_input_passes = 'RGB'; sc.cycles.max_bounces = 6
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
ONLY = [q for q in os.environ.get('VUL_ONLY', '').split(',') if q]
cd = bpy.data.cameras.get('v_cam') or bpy.data.cameras.new('v_cam'); cam = bpy.data.objects.get('v_cam') or bpy.data.objects.new('v_cam', cd)
if cam.name not in sc.collection.objects: sc.collection.objects.link(cam)
sc.camera = cam; cd.clip_start, cd.clip_end = 0.05, 400
def shot(name, tgt, d, dist, ortho=None, w=1600, h=1000, lens=50, roll_y=False):
    if ONLY and not any(name.startswith(q) for q in ONLY): return
    dv = Vector(d).normalized(); cam.location = Vector(tgt) + dv * dist
    if roll_y:
        up = Vector((1, 0, 0)) if dv.z > 0 else Vector((-1, 0, 0)); z_ = dv; x_ = up.cross(z_).normalized(); y_ = z_.cross(x_)
        cam.rotation_euler = Matrix((x_, y_, z_)).transposed().to_euler()
    else: cam.rotation_euler = (Vector(tgt) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    if ortho: cd.type = 'ORTHO'; cd.ortho_scale = ortho
    else: cd.type = 'PERSP'; cd.lens = lens; cd.sensor_width = 36
    sc.render.resolution_x, sc.render.resolution_y = w, h; sc.render.filepath = os.path.join(OUT, name); bpy.ops.render.render(write_still=True)
import vul_geo as g
def _pose(name, deg):
    o = bpy.data.objects.get(name)
    if o is None or name not in g.PARTS: return
    D = g.PARTS[name]; T = D['pivot']
    if D.get('kind') == 'slide': o.matrix_world = Matrix.Translation(D['axis'] * deg) @ o.matrix_world; return
    o.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(deg), 4, D['axis']) @ Matrix.Translation(-T) @ o.matrix_world
Y = lambda a: 15.36 - a; Zg = lambda z: z - 3.0
GR = [o for o in sc.objects if o.name.startswith(('gear', 'door_'))]
for o in GR: o.hide_render = True
shot('j_низ_полёт.png', (0, 0, 0), (0, 0, -1), 60, ortho=36.0, w=1500, h=1500, roll_y=True)
shot('j_как_03.png', (0.0, 0.0, 0.0), (0.12, 0.30, -0.95), 62.0, lens=55)
for o in GR: o.hide_render = False
import vul_gear as gr
for n_, d_ in gr.POSE.items(): _pose(n_, d_)
bpy.context.view_layer.update()
shot('side_l.png', (0, 0, Zg(4.0)), (-1, 0, 0), 60, ortho=32.5, w=1800, h=760)
shot('top.png', (0, 0, 0), (0, 0, 1), 60, ortho=36.0, w=1500, h=1500, roll_y=True)
shot('bottom.png', (0, 0, 0), (0, 0, -1), 60, ortho=36.0, w=1500, h=1500, roll_y=True)
shot('front.png', (0, 0, Zg(4.0)), (0, 1, 0), 60, ortho=35.5, w=1800, h=640)
shot('rear.png', (0, 0, Zg(4.0)), (0, -1, 0), 60, ortho=35.5, w=1800, h=640)
shot('p01_как_01.png', (0.0, 0.0, 0.0), (-0.25, 0.30, 0.92), 60.0, lens=50)
shot('p02_как_02.png', (0.0, -4.0, -0.5), (-0.20, -0.62, -0.76), 50.0, lens=50)
shot('p04_как_04.png', (0.0, 1.0, 0.5), (-0.90, 0.28, -0.20), 55.0, lens=55)
shot('p05_как_05.png', (0.0, 5.0, 0.0), (-0.50, 0.84, -0.12), 30.0, lens=45)
shot('p06_как_06.png', (0.0, -8.0, 0.8), (-0.62, -0.74, 0.18), 34.0, lens=50)
shot('c_кабина.png', (0.0, Y(7.3), Zg(5.0)), (-0.55, 0.62, 0.55), 6.5, lens=50)
shot('c_нос.png', (0.0, Y(3.5), Zg(3.4)), (-0.62, 0.70, -0.20), 8.0, lens=50)
shot('c_заборник.png', (-3.0, Y(11.5), Zg(3.0)), (-0.40, 0.90, 0.10), 9.0, lens=50)
shot('c_заборник_прямо.png', (-3.1, Y(11.0), Zg(3.0)), (-0.15, 0.99, 0.0), 7.0, lens=50)
shot('c_хвост.png', (0.0, Y(28.2), Zg(3.4)), (-0.45, -0.85, 0.25), 11.0, lens=50)
shot('c_хвост_как_фото.png', (0.0, Y(29.0), 0.1), (-0.78, -0.58, -0.10), 9.5, lens=50)
shot('c_киль.png', (0.0, Y(25.5), Zg(6.0)), (-0.92, -0.20, 0.30), 12.0, lens=50)
shot('c_отсек.png', (0.0, Y(18.0), Zg(2.0)), (-0.30, 0.25, -0.92), 15.0, lens=50)
shot('c_шасси_пер.png', (0.0, Y(9.8), Zg(1.2)), (-0.70, 0.66, -0.12), 6.0, lens=50)
shot('c_шасси_осн.png', (-4.75, Y(19.0), Zg(1.0)), (-0.72, 0.62, -0.10), 7.0, lens=50)
shot('c_пилон.png', (-9.6, Y(19.6), Zg(2.0)), (-0.45, 0.45, -0.77), 6.0, lens=50)
shot('c_конец_крыла.png', (-16.0, Y(25.5), Zg(3.0)), (-0.55, 0.72, 0.42), 6.0, lens=50)
if os.environ.get('VUL_POSE', '1') == '1':
    for n_, d_ in (('bay_l', 95), ('bay_r', 95), ('rudder', 25)): _pose(n_, d_)
    for s in ('r', 'l'):
        for i in range(1, 5): _pose(f'elev{i}_{s}', 20 if s == 'r' else -20)
        for n_ in ('brake_u1_', 'brake_u2_', 'brake_d1_'): _pose(n_ + s, 0.44)
    bpy.context.view_layer.update()
    shot('o_отсек_открыт.png', (0.0, Y(18.0), Zg(2.0)), (-0.40, 0.30, -0.86), 16.0, lens=50)
    shot('o_отсек_сбоку.png', (0.0, Y(18.0), Zg(2.3)), (-0.95, 0.10, -0.28), 9.0, lens=50)
    shot('o_рули_сзади.png', (0.0, Y(24.0), Zg(4.0)), (-0.50, -0.70, 0.50), 40.0, lens=50)
    shot('o_тормоза.png', (-3.2, Y(18.0), Zg(3.2)), (-0.75, 0.55, 0.36), 9.0, lens=50)
