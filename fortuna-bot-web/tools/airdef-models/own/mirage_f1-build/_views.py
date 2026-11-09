# _views.py - снимки формы без окраски (Cycles, студийный свет): ортогональные виды и перспектива с ракурсов фото. F1_OUT - папка, F1_ONLY - начала имён снимков, F1_POSE=1 - снимки с частями в крайних положениях.
import os, math, bpy
from mathutils import Vector, Matrix
OUT = os.environ.get('F1_OUT', os.path.join(os.path.dirname(os.path.abspath(__file__)), '_снимки')); os.makedirs(OUT, exist_ok=True)
sc = bpy.data.scenes['F1']; sc.render.engine = 'CYCLES'
try:
    if os.environ.get('F1_CPU'): raise RuntimeError('счёт на процессоре: видеокарта занята')
    pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'METAL'; pr.get_devices()
    for d_ in pr.devices: d_.use = True
    sc.cycles.device = 'GPU'
except Exception as e_: print('GPU нет', e_)
sc.cycles.samples = int(os.environ.get('F1_SPP', '48')); sc.cycles.use_denoising = True; sc.cycles.denoising_input_passes = 'RGB'; sc.cycles.max_bounces = 6
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
ONLY = [q for q in os.environ.get('F1_ONLY', '').split(',') if q]
cd = bpy.data.cameras.get('v_cam') or bpy.data.cameras.new('v_cam'); cam = bpy.data.objects.get('v_cam') or bpy.data.objects.new('v_cam', cd)
if cam.name not in sc.collection.objects: sc.collection.objects.link(cam)
sc.camera = cam; cd.clip_start, cd.clip_end = 0.1, 300


def shot(name, tgt, d, dist, ortho=None, w=1600, h=1000, lens=50, roll_y=False):
    if ONLY and not any(name.startswith(q) for q in ONLY): return
    sc.render.film_transparent = bool(ortho)
    dv = Vector(d).normalized(); cam.location = Vector(tgt) + dv * dist
    if roll_y:                                                  # сверху/снизу: нос влево на кадре
        up = Vector((1, 0, 0)) if dv.z > 0 else Vector((-1, 0, 0))
        z_ = dv; x_ = up.cross(z_).normalized(); y_ = z_.cross(x_)
        cam.rotation_euler = Matrix((x_, y_, z_)).transposed().to_euler()
    else:
        cam.rotation_euler = (Vector(tgt) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    if ortho: cd.type = 'ORTHO'; cd.ortho_scale = ortho
    else: cd.type = 'PERSP'; cd.lens = lens; cd.sensor_width = 36
    sc.render.resolution_x, sc.render.resolution_y = w, h; sc.render.filepath = os.path.join(OUT, name); bpy.ops.render.render(write_still=True)


import f1_geo as g


def _pose(name, deg):
    o = bpy.data.objects.get(name)
    if o is None or name not in g.PARTS: return
    D = g.PARTS[name]; T = D['pivot']
    o.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(deg), 4, D['axis']) @ Matrix.Translation(-T) @ o.matrix_world


GR_ = [o for o in sc.objects if o.name.startswith('gear')]
for o in GR_: o.hide_render = True
shot('j_низ_закрыто.png', (0.0, 0.5, -0.4), (0.22, 0.20, -0.95), 13.0)
for o in GR_: o.hide_render = False
DOORS = (('door_n_r', -65), ('door_n_l', 65), ('door_o_r', g.PARTS['door_o_r']['range'][0]), ('door_o_l', g.PARTS['door_o_l']['range'][0]))
for n_, d_ in DOORS: _pose(n_, d_)
bpy.context.view_layer.update()
shot('side_r.png', (0, 0, 0.5), (1, 0, 0), 40, ortho=18.0, w=1800, h=1000)
shot('top.png', (0, 0, 0), (0, 0, 1), 40, ortho=18.0, w=1800, h=1400, roll_y=True)
shot('bottom.png', (0, 0, 0), (0, 0, -1), 40, ortho=18.0, w=1800, h=1400, roll_y=True)
shot('front.png', (0, 0, 0.5), (0, 1, 0), 40, ortho=11.0, w=1400, h=1000)
shot('rear.png', (0, 0, 0.5), (0, -1, 0), 40, ortho=11.0, w=1400, h=1000)
Y = lambda a: g.L / 2 - a
shot('p1_как_01.png', (0.0, 0.0, 0.3), (-0.35, 0.50, 0.80), 24.0, lens=70)
shot('p2_как_02.png', (0.0, 0.0, 0.4), (-0.86, 0.48, 0.06), 24.0, lens=70)
shot('p3_как_03.png', (0.0, 0.5, 0.3), (0.90, 0.40, 0.04), 22.0, lens=70)
shot('p4_как_04.png', (0.0, 0.0, 0.2), (0.88, 0.08, -0.46), 24.0, lens=70)
shot('p6_как_06.png', (0.0, -2.0, 0.6), (-0.58, -0.80, 0.12), 20.0, lens=60)
shot('p7_как_07.png', (0.0, 0.0, 0.5), (0.97, 0.24, 0.04), 26.0, lens=70)
shot('p5_как_05.png', (0.0, 0.0, 0.0), (0.10, -0.15, -0.98), 24.0, lens=70)
shot('c_кабина.png', (0.0, Y(3.6), 0.95), (0.55, 0.62, 0.50), 4.4)
shot('c_кабина_борт.png', (0.0, Y(3.7), 0.9), (0.90, 0.20, 0.40), 3.4)
shot('c_нос.png', (0.0, Y(1.9), 0.4), (0.62, 0.70, 0.30), 4.4)
shot('c_устье.png', (0.75, Y(4.7), 0.26), (0.25, 1.0, 0.0), 2.8)
shot('c_заборник.png', (0.75, Y(4.8), 0.26), (0.82, 0.55, 0.12), 3.2)
shot('c_спина.png', (0.0, Y(7.5), 0.8), (0.55, 0.15, 0.82), 6.5)
shot('c_хвост.png', (0.0, Y(13.0), 1.2), (0.78, -0.50, 0.36), 7.0)
shot('c_сопло.png', (0.0, Y(14.7), 0.0), (0.32, -0.92, 0.10), 3.6)
shot('c_крыло.png', (2.2, Y(9.0), 0.5), (0.30, -0.36, 0.88), 7.0)
shot('c_законцовка.png', (4.0, Y(10.6), 0.4), (0.62, 0.40, 0.68), 3.0)
shot('c_низ.png', (0.0, 0.0, -0.5), (0.20, 0.20, -0.96), 16.0)
shot('c_щитки.png', (0.5, Y(6.0), -0.6), (0.40, 0.30, -0.86), 3.6)
shot('c_гребни.png', (0.0, Y(13.0), -0.6), (0.55, -0.45, -0.70), 4.8)
shot('c_шасси_н.png', (0.0, Y(4.3), -0.8), (0.70, 0.70, 0.02), 3.2)
shot('c_шасси_м.png', (1.0, Y(9.3), -0.8), (0.80, 0.58, 0.05), 3.6)
shot('c_шасси_сзади.png', (0.0, Y(9.3), -0.8), (-0.35, -0.94, 0.05), 5.2)
if os.environ.get('F1_POSE'):
    for n_, d_ in (('canopy', 40), ('flap_r', 35), ('flap_l', 35), ('slat_i_r', 15), ('slat_o_r', 15), ('slat_i_l', 15), ('slat_o_l', 15), ('rudder', 25), ('stab_r', 18), ('stab_l', 18), ('brake_r', 55), ('brake_l', 55), ('aileron_r', 25), ('aileron_l', -25)): _pose(n_, d_)
    bpy.context.view_layer.update()
    shot('o_поза_спереди.png', (0.0, 0.4, 0.6), (0.60, 0.68, 0.40), 21.0)
    shot('o_поза_сзади.png', (0.0, -1.0, 0.6), (-0.50, -0.72, 0.46), 21.0)
    shot('o_поза_снизу.png', (0.0, 0.0, -0.3), (0.40, 0.30, -0.86), 19.0)
    shot('o_поза_кабина.png', (0.0, Y(3.8), 1.2), (0.55, 0.45, 0.72), 5.0)
