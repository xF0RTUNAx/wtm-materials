# _views.py - снимки формы без окраски (Cycles, студийный свет): ортогональные виды и перспектива с ракурсов фото. F4_OUT - папка, F4_ONLY - начала имён снимков, F4_POSE=1 - части в крайних положениях.
import os, math, bpy
from mathutils import Vector, Matrix
OUT = os.environ.get('F4_OUT', os.path.join(os.path.dirname(os.path.abspath(__file__)), '_снимки')); os.makedirs(OUT, exist_ok=True)
sc = bpy.data.scenes['F4']; sc.render.engine = 'CYCLES'
try:
    if os.environ.get('F4_CPU'): raise RuntimeError('счёт на процессоре: видеокарта занята')
    pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'METAL'; pr.get_devices()
    for d_ in pr.devices: d_.use = True
    sc.cycles.device = 'GPU'
except Exception as e_: print('GPU нет', e_)
sc.cycles.samples = int(os.environ.get('F4_SPP', '48')); sc.cycles.use_denoising = True; sc.cycles.denoising_input_passes = 'RGB'; sc.cycles.max_bounces = 6
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
ONLY = [q for q in os.environ.get('F4_ONLY', '').split(',') if q]
cd = bpy.data.cameras.get('v_cam') or bpy.data.cameras.new('v_cam'); cam = bpy.data.objects.get('v_cam') or bpy.data.objects.new('v_cam', cd)
if cam.name not in sc.collection.objects: sc.collection.objects.link(cam)
sc.camera = cam; cd.clip_start, cd.clip_end = 0.1, 300
KS = float(os.environ.get('F4_K', '1'))


def shot(name, tgt, d, dist, ortho=None, w=1600, h=1000, lens=50, roll_y=False):
    if ONLY and not any(name.startswith(q) for q in ONLY): return
    sc.render.film_transparent = True
    dv = Vector(d).normalized(); cam.location = Vector(tgt) + dv * dist
    if roll_y:
        up = Vector((1, 0, 0)) if dv.z > 0 else Vector((-1, 0, 0))
        z_ = dv; x_ = up.cross(z_).normalized(); y_ = z_.cross(x_)
        cam.rotation_euler = Matrix((x_, y_, z_)).transposed().to_euler()
    else:
        cam.rotation_euler = (Vector(tgt) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    if ortho: cd.type = 'ORTHO'; cd.ortho_scale = ortho
    else: cd.type = 'PERSP'; cd.lens = lens; cd.sensor_width = 36
    sc.render.resolution_x, sc.render.resolution_y = int(w * KS), int(h * KS); sc.render.filepath = os.path.join(OUT, name); bpy.ops.render.render(write_still=True)


import f4_geo as g


def _pose(name, deg):
    o = bpy.data.objects.get(name)
    if o is None or name not in g.PARTS: return
    D = g.PARTS[name]; T = D['pivot']
    o.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(deg), 4, D['axis']) @ Matrix.Translation(-T) @ o.matrix_world


Y = lambda a: g.L / 2 - a
GR_ = [o for o in sc.objects if o.name.startswith('gear')]
for o in GR_: o.hide_render = True
shot('j_низ_закрыто.png', (0.0, 0.0, -0.4), (-0.22, 0.20, -0.95), 17.0)
shot('j_бой_сверху.png', (0.0, 0.3, 0.0), (-0.46, 0.60, 0.65), 24.0)
shot('side_l.png', (0, 0, 0.5), (-1, 0, 0), 40, ortho=22.0, w=2200, h=1000)        # 100 пикс/м, нос слева: (a, z) -> (1100 + (a - 9.6) * 100, 550 - z * 100)
shot('top.png', (0, 0, 0), (0, 0, 1), 40, ortho=22.0, w=2200, h=1400, roll_y=True)
shot('bottom.png', (0, 0, 0), (0, 0, -1), 40, ortho=22.0, w=2200, h=1400, roll_y=True)
shot('front.png', (0, 0, 0.5), (0, 1, 0), 40, ortho=13.0, w=1560, h=900)
shot('rear.png', (0, 0, 0.5), (0, -1, 0), 40, ortho=13.0, w=1560, h=900)
shot('p1_как_01.png', (0.0, 1.0, 0.0), (-0.44, 0.76, 0.48), 21.0, lens=34, w=1668, h=1123)
shot('p5_как_05.png', (0.0, -2.0, 0.0), (0.50, -0.62, -0.60), 20.0, lens=34, w=1600, h=900)
shot('p6_как_06.png', (0.0, -1.5, 0.4), (-0.62, -0.76, -0.16), 24.0, lens=40, w=1600, h=1066)
shot('k_киль_основание.png', (0.0, Y(18.4), 1.15), (-0.80, -0.50, 0.25), 3.2, lens=85)
shot('k_руль.png', (0.0, Y(18.6), 1.9), (-0.85, -0.45, 0.20), 3.6, lens=85)
shot('k_стаб_сверху.png', (-0.6, Y(17.6), 0.9), (-0.35, -0.25, 0.90), 3.6, lens=85)
shot('k_стаб_снизу.png', (-0.6, Y(17.8), 0.8), (-0.45, -0.35, -0.82), 3.6, lens=85)
shot('k_носок.png', (-3.9, Y(11.3), 0.0), (-0.30, 0.60, 0.74), 2.6, lens=85)
shot('k_створки_н.png', (0.0, Y(4.6), -0.5), (-0.45, 0.55, -0.70), 3.4, lens=85)
shot('k_гак.png', (0.0, Y(17.0), 0.5), (-0.80, -0.20, -0.56), 4.2, lens=85)
for o in GR_: o.hide_render = False
for n_ in ('door_n_r', 'door_n_l', 'door_m_r', 'door_m_l', 'door_o_r', 'door_o_l'):
    if n_ in g.PARTS: r_ = g.PARTS[n_]['range']; _pose(n_, r_[0] if abs(r_[0]) > abs(r_[1]) else r_[1])
bpy.context.view_layer.update()
shot('p2_как_02.png', (0.0, 1.0, -0.3), (-0.60, 0.79, 0.04), 24.0, lens=50, w=1600, h=1050)
shot('p3_как_03.png', (0.0, 0.0, -0.1), (-0.99, 0.08, 0.02), 30.0, lens=60, w=2000, h=866)
shot('p11_спереди.png', (0.0, 0.0, 0.0), (0.0, 1.0, -0.03), 24.0, lens=85, w=1500, h=1000)
shot('p12_спереди_близко.png', (0.0, Y(4.0), 0.35), (0.0, 1.0, -0.02), 9.0, lens=85, w=1500, h=1000)
shot('c_кабина.png', (0.0, Y(5.7), 1.2), (-0.60, 0.50, 0.62), 6.2)
shot('c_кабина_борт.png', (0.0, Y(5.8), 1.1), (-0.92, 0.12, 0.36), 5.2)
shot('c_нос.png', (0.0, Y(3.0), 0.1), (-0.66, 0.70, 0.10), 6.0)
shot('c_заборник.png', (-1.0, Y(6.3), 0.3), (-0.70, 0.68, 0.20), 4.2)
shot('c_спина.png', (0.0, Y(10.5), 0.9), (-0.55, 0.20, 0.80), 9.0)
shot('c_хвост.png', (0.0, Y(16.5), 1.2), (-0.74, -0.55, 0.38), 9.5)
shot('c_сопло.png', (0.0, Y(15.6), 0.2), (-0.42, -0.88, 0.20), 5.0)
shot('c_гак.png', (0.0, Y(16.6), 0.2), (-0.55, -0.50, -0.66), 6.0)
shot('c_крыло.png', (-3.0, Y(12.0), 0.2), (-0.30, -0.36, 0.88), 8.5)
shot('c_низ.png', (0.0, 0.0, -0.5), (-0.20, 0.20, -0.96), 20.0)
shot('c_пилоны.png', (-2.4, Y(10.5), -0.6), (-0.62, 0.50, -0.60), 6.5)
shot('c_шасси_н.png', (0.0, Y(4.5), -0.9), (-0.72, 0.68, 0.04), 4.2)
shot('c_шасси_м.png', (-2.6, Y(11.5), -0.9), (-0.74, 0.66, 0.06), 4.4)
shot('c_шасси_сзади.png', (0.0, Y(11.5), -0.8), (-0.30, -0.95, 0.06), 8.5)
if os.environ.get('F4_POSE'):
    for n_, d_ in (('canopy_f', 55), ('canopy_r', 55), ('flap_r', 45), ('flap_l', 45), ('slat_i_r', 10), ('slat_o_r', 17), ('slat_i_l', 10), ('slat_o_l', 17), ('rudder', 25), ('stab_r', -18), ('stab_l', -18), ('brake_r', 55), ('brake_l', 55), ('ail_r', 30), ('spoil_l', -45)): _pose(n_, d_)
    bpy.context.view_layer.update()
    shot('o_поза_спереди.png', (0.0, 0.4, 0.6), (-0.60, 0.68, 0.40), 26.0)
    shot('o_поза_сзади.png', (0.0, -1.0, 0.6), (0.50, -0.72, 0.46), 26.0)
    shot('o_поза_снизу.png', (0.0, 0.0, -0.3), (-0.40, 0.30, -0.86), 24.0)
    shot('o_поза_кабина.png', (0.0, Y(5.8), 1.3), (-0.62, 0.45, 0.62), 7.0)
