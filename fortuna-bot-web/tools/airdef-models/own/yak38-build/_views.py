# _views.py - снимки формы без окраски (Cycles, студийный свет): ортогональные виды и перспектива с ракурсов фото. YK_OUT - папка, YK_ONLY - начала имён, YK_POSE=1 - части в крайних положениях.
import os, math, bpy
from mathutils import Vector, Matrix
OUT = os.environ.get('YK_OUT', os.path.join(os.path.dirname(os.path.abspath(__file__)), '_снимки')); os.makedirs(OUT, exist_ok=True)
sc = bpy.data.scenes["YK"]; sc.render.engine = 'CYCLES'
try:
    pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'METAL'; pr.get_devices()
    for d_ in pr.devices: d_.use = True
    sc.cycles.device = 'GPU'
except Exception as e_: print('GPU нет', e_)
sc.cycles.samples = int(os.environ.get('YK_SPP', '48')); sc.cycles.use_denoising = True; sc.cycles.denoising_input_passes = 'RGB'; sc.cycles.max_bounces = 6
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
ONLY = [q for q in os.environ.get('YK_ONLY', '').split(',') if q]
cd = bpy.data.cameras.get('v_cam') or bpy.data.cameras.new('v_cam'); cam = bpy.data.objects.get('v_cam') or bpy.data.objects.new('v_cam', cd)
if cam.name not in sc.collection.objects: sc.collection.objects.link(cam)
sc.camera = cam; cd.clip_start, cd.clip_end = 0.1, 400


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


import yak_geo as g


def _pose(name, v):
    o = bpy.data.objects.get(name)
    if o is None or name not in g.PARTS: return
    D = g.PARTS[name]; T = D['pivot']
    o.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(v), 4, D['axis']) @ Matrix.Translation(-T) @ o.matrix_world


GR_ = [o for o in sc.objects if o.name.startswith(('gear', 'gdoor'))]
Y = lambda a: g.L / 2 - a
for o in GR_: o.hide_render = True
shot('side_fly.png', (0, 0.4, 1.9), (-1, 0, 0), 30, ortho=19.0, w=1900, h=700)
shot('top.png', (0, 0.4, 0), (0, 0, 1), 30, ortho=19.0, w=1900, h=1900, roll_y=True)
shot('bottom.png', (0, 0.4, 0), (0, 0, -1), 30, ortho=19.0, w=1900, h=1900, roll_y=True)
shot('front_fly.png', (0, 0, 2.0), (0, 1, 0), 30, ortho=8.0, w=1600, h=1000)
for o in GR_: o.hide_render = False
shot('side_l.png', (0, 0.4, 1.9), (-1, 0, 0), 30, ortho=19.0, w=1900, h=700)
shot('front.png', (0, 0, 2.0), (0, 1, 0), 30, ortho=8.0, w=1600, h=1000)
shot('rear.png', (0, 0, 2.0), (0, -1, 0), 30, ortho=8.0, w=1600, h=1000)
shot('p2_как_02.png', (0.0, 1.0, 1.6), (0.75, 0.62, 0.10), 24.0, lens=55)
shot('p7_как_07.png', (0.0, 1.5, 1.6), (0.60, 0.78, 0.18), 22.0, lens=55)
shot('p8_как_08.png', (0.0, -2.0, 1.6), (-0.70, -0.70, 0.12), 20.0, lens=40)
shot('p4_как_04.png', (0.0, 0.0, 1.7), (-1.0, 0.04, 0.03), 26.0, lens=55)
shot('p6_как_06.png', (0.0, 0.5, 1.8), (-0.80, 0.30, 0.12), 24.0, lens=55)
shot('p9_снизу.png', (0.0, 0.0, 1.5), (-0.40, 0.30, -0.86), 24.0, lens=55)
shot('p3_сверху_сзади.png', (0.0, -1.0, 2.0), (-0.55, -0.62, 0.56), 24.0, lens=55)
shot('r1_спереди_сверху.png', (0.0, 1.5, 1.8), (0.55, 0.70, 0.45), 21.0, lens=50)
shot('r2_спереди_низко.png', (0.0, 2.0, 1.5), (-0.30, 0.95, 0.04), 20.0, lens=50)
shot('r3_сзади_снизу.png', (0.0, -2.0, 1.5), (0.55, -0.78, -0.20), 20.0, lens=50)
shot('r4_сбоку_сверху.png', (0.0, 0.3, 1.8), (-0.85, 0.10, 0.50), 22.0, lens=50)
shot('r5_в_лоб.png', (0.0, 2.0, 1.9), (0.0, 1.0, 0.05), 18.0, lens=50)
shot('c_нос.png', (0.0, Y(2.5), 1.8), (-0.60, 0.70, 0.30), 6.5)
shot('c_фонарь.png', (0.0, Y(3.6), 2.3), (-0.65, 0.45, 0.60), 4.0)
shot('c_заборник.png', (-0.7, Y(4.3), 1.6), (-0.55, 0.80, 0.15), 4.0)
shot('c_горб.png', (0.0, Y(6.5), 2.5), (-0.55, 0.50, 0.65), 5.5)
shot('c_сопло.png', (-1.0, Y(11.4), 1.1), (-0.85, -0.30, -0.10), 3.6)
shot('c_хвост.png', (0.0, Y(14.6), 2.6), (-0.70, -0.60, 0.30), 6.0)
shot('c_крыло.png', (-2.0, Y(9.5), 2.0), (-0.40, -0.40, 0.80), 6.5)
if os.environ.get('YK_POSE'):
    P = [('lift_door', g.LD_OPEN), ('lift_bot_r', g.LB_OPEN), ('lift_bot_l', g.LB_OPEN), ('canopy', 60), ('rudder', 20), ('nozzle_r', 90), ('nozzle_l', 90)]
    for s_ in ('r', 'l'): P += [('flap_' + s_, 28), ('ail_' + s_, 20 if s_ == 'r' else -20), ('stab_' + s_, -15)]
    for n_, d_ in P: _pose(n_, d_)
    bpy.context.view_layer.update()
    shot('o_поза_спереди.png', (0.0, 0.5, 1.8), (0.60, 0.68, 0.40), 22.0)
    shot('o_поза_сзади.png', (0.0, -1.0, 1.8), (-0.50, -0.72, 0.46), 22.0)
    shot('o_поза_снизу.png', (0.0, 0.0, 1.5), (-0.40, 0.30, -0.86), 20.0)
    for s_ in ('r', 'l'): _pose('wing_o_' + s_, 95)
    bpy.context.view_layer.update()
    shot('o_крыло_сложено.png', (0.0, 1.0, 1.8), (0.10, 0.99, 0.12), 14.0)
