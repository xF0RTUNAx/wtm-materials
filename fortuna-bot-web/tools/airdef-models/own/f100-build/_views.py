# _views.py - снимки формы без окраски (Cycles, студийный свет): ортогональные виды и перспектива с ракурсов фото. F100_OUT - папка, F100_ONLY - начала имён снимков, F100_POSE=1 - снимки с частями в крайних положениях.
import os, math, bpy
from mathutils import Vector, Matrix
OUT = os.environ.get('F100_OUT', os.path.join(os.path.dirname(os.path.abspath(__file__)), '_снимки')); os.makedirs(OUT, exist_ok=True)
sc = bpy.data.scenes["F100"]; sc.render.engine = 'CYCLES'
try:
    pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'METAL'; pr.get_devices()
    for d_ in pr.devices: d_.use = True
    sc.cycles.device = 'GPU'
except Exception as e_: print('GPU нет', e_)
sc.cycles.samples = int(os.environ.get('F100_SPP', '48')); sc.cycles.use_denoising = True; sc.cycles.denoising_input_passes = 'RGB'; sc.cycles.max_bounces = 6
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
ONLY = [q for q in os.environ.get('F100_ONLY', '').split(',') if q]
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


import f100_geo as g


def _pose(name, deg):
    o = bpy.data.objects.get(name)
    if o is None or name not in g.PARTS: return
    D = g.PARTS[name]; T = D['pivot']
    if D.get('kind') == 'slide': o.matrix_world = Matrix.Translation(D['axis'] * deg) @ o.matrix_world; return
    o.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(deg), 4, D['axis']) @ Matrix.Translation(-T) @ o.matrix_world


GR_ = [o for o in sc.objects if o.name.startswith('gear')]
for o in GR_: o.hide_render = True
shot('j_низ_закрыто.png', (0.0, 0.3, -0.4), (0.22, 0.20, -0.95), 14.0)
shot('side_fly.png', (0, 0, 0.6), (1, 0, 0), 40, ortho=18.0, w=1800, h=700)
for o in GR_: o.hide_render = False
DOORS = (('door_n_r', -92), ('door_n_l', 92), ('door_o_r', -80), ('door_o_l', 80), ('door_m_r', 88), ('door_m_l', -88))
for n_, d_ in DOORS: _pose(n_, d_)
bpy.context.view_layer.update()
shot('side_r.png', (0, 0, 0.6), (1, 0, 0), 40, ortho=18.0, w=1800, h=700)
shot('side_l.png', (0, 0, 0.6), (-1, 0, 0), 40, ortho=18.0, w=1800, h=700)
shot('top.png', (0, 0, 0), (0, 0, 1), 40, ortho=16.5, w=1500, h=1500, roll_y=True)
shot('bottom.png', (0, 0, 0), (0, 0, -1), 40, ortho=16.5, w=1500, h=1500, roll_y=True)
shot('front.png', (0, 0, 0.5), (0, 1, 0), 40, ortho=12.5, w=1400, h=800)
shot('rear.png', (0, 0, 0.5), (0, -1, 0), 40, ortho=12.5, w=1400, h=800)
Y = lambda a: g.L / 2 - a
shot('p1_как_01.png', (0.0, 0.8, 0.0), (0.42, 0.62, -0.66), 22.0, lens=60)
shot('p5_как_05.png', (0.0, 1.5, -0.3), (0.50, 0.85, 0.12), 20.0, lens=55)
shot('p6_как_06.png', (0.0, -0.5, 0.3), (0.52, -0.62, 0.59), 22.0, lens=60)
shot('p7_как_07.png', (0.0, 0.0, 0.2), (-0.98, 0.16, -0.02), 26.0, lens=70)
shot('p2_как_02.png', (0.0, -1.5, 0.2), (-0.50, -0.84, 0.20), 20.0, lens=55)
shot('c_кабина.png', (0.0, Y(3.6), 0.8), (-0.55, 0.62, 0.55), 4.6)
shot('c_кабина_борт.png', (0.0, Y(3.6), 0.8), (-0.86, 0.20, 0.48), 3.8)
shot('c_нос.png', (0.0, Y(0.6), -0.2), (-0.55, 0.78, 0.10), 4.6)
shot('c_устье.png', (0.0, Y(0.0), -0.12), (-0.12, 1.0, 0.02), 3.2)
shot('c_пушки.png', (0.0, Y(1.8), -0.4), (-0.62, 0.55, -0.56), 3.4)
shot('c_спина.png', (0.0, Y(6.0), 0.8), (-0.55, 0.10, 0.82), 6.0)
shot('c_хвост.png', (0.0, Y(12.0), 1.2), (-0.72, -0.58, 0.38), 8.0)
shot('c_сопло.png', (0.0, Y(13.0), 0.0), (-0.35, -0.90, 0.20), 3.6)
shot('c_стабилизатор.png', (-1.2, Y(12.2), -0.4), (-0.50, -0.50, 0.70), 5.0)
shot('c_крыло.png', (-3.0, Y(8.2), -0.2), (-0.34, -0.34, 0.86), 7.5)
shot('c_предкрылок.png', (-3.2, Y(7.6), -0.2), (-0.30, 0.65, 0.70), 3.4)
shot('c_низ.png', (0.0, 0.0, -0.5), (0.20, 0.20, -0.96), 16.0)
shot('c_щиток.png', (0.0, Y(6.2), -0.7), (-0.40, 0.30, -0.86), 4.2)
shot('c_штанга.png', (1.6, Y(4.6), -0.2), (0.80, 0.50, -0.30), 6.0)
shot('c_шасси_н.png', (0.0, Y(3.6), -1.0), (-0.70, 0.70, -0.10), 3.0)
shot('c_шасси_м.png', (-1.8, Y(7.8), -0.9), (-0.62, 0.74, -0.10), 3.4)
shot('c_пилоны.png', (-2.8, Y(7.6), -0.8), (-0.35, 0.40, -0.85), 6.0)
if os.environ.get('F100_POSE'):
    for n_, d_ in (('canopy', g.CAN_OPEN), ('flap_r', 45), ('flap_l', 45), ('rudder', 25), ('stab_r', -20), ('stab_l', -20), ('brake', g.BRK_OPEN), ('ail_r', 18), ('ail_l', -18), ('slat_i_r', g.SLAT_M), ('slat_i_l', g.SLAT_M), ('slat_o_r', g.SLAT_M), ('slat_o_l', g.SLAT_M)): _pose(n_, d_)
    bpy.context.view_layer.update()
    shot('o_поза_спереди.png', (0.0, 0.4, 0.2), (-0.60, 0.68, 0.40), 21.0)
    shot('o_поза_сзади.png', (0.0, -1.0, 0.2), (-0.50, -0.72, 0.46), 21.0)
    shot('o_поза_снизу.png', (0.0, 0.0, -0.3), (-0.40, 0.30, -0.86), 19.0)
    shot('o_поза_кабина.png', (0.0, Y(3.8), 1.0), (-0.55, 0.45, 0.72), 6.0)
