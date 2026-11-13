# _views.py - снимки формы без окраски (Cycles, студийный свет): ортогональные виды и перспектива с ракурсов фото. TU_OUT - папка, TU_ONLY - начала имён, TU_POSE=1 - части в крайних положениях.
import os, math, bpy
from mathutils import Vector, Matrix
OUT = os.environ.get('TU_OUT', os.path.join(os.path.dirname(os.path.abspath(__file__)), '_снимки')); os.makedirs(OUT, exist_ok=True)
sc = bpy.data.scenes["TU"]; sc.render.engine = 'CYCLES'
try:
    pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'METAL'; pr.get_devices()
    for d_ in pr.devices: d_.use = True
    sc.cycles.device = 'GPU'
except Exception as e_: print('GPU нет', e_)
sc.cycles.samples = int(os.environ.get('TU_SPP', '48')); sc.cycles.use_denoising = True; sc.cycles.denoising_input_passes = 'RGB'; sc.cycles.max_bounces = 6
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
ONLY = [q for q in os.environ.get('TU_ONLY', '').split(',') if q]
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


import tu22_geo as g


def _pose(name, v):
    o = bpy.data.objects.get(name)
    if o is None or name not in g.PARTS: return
    D = g.PARTS[name]; T = D['pivot']
    if D.get('kind') == 'slide': o.matrix_world = Matrix.Translation(D['axis'] * v) @ o.matrix_world; return
    o.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(v), 4, D['axis']) @ Matrix.Translation(-T) @ o.matrix_world


GR_ = [o for o in sc.objects if o.name.startswith(('gear', 'gdoor'))]
Y = lambda a: g.L / 2 - a
for o in GR_: o.hide_render = True
shot('side_fly.png', (0, 0, 1.2), (-1, 0, 0), 60, ortho=44.0, w=2200, h=800)
shot('top.png', (0, 0, 0), (0, 0, 1), 60, ortho=44.0, w=2200, h=2200, roll_y=True)
shot('bottom.png', (0, 0, 0), (0, 0, -1), 60, ortho=44.0, w=2200, h=2200, roll_y=True)
shot('front_fly.png', (0, 0, 1.2), (0, 1, 0), 60, ortho=25.0, w=2500, h=1100)
for o in GR_: o.hide_render = False
shot('side_l.png', (0, 0, 1.2), (-1, 0, 0), 60, ortho=44.0, w=2200, h=800)
shot('front.png', (0, 0, 1.2), (0, 1, 0), 60, ortho=25.0, w=2500, h=1100)
shot('rear.png', (0, 0, 1.2), (0, -1, 0), 60, ortho=25.0, w=2500, h=1100)
shot('p2_как_02.png', (0.0, 3.0, 0.0), (-0.62, 0.74, 0.06), 58.0, lens=55)
shot('p9_как_09.png', (0.0, -3.0, 0.5), (0.55, -0.80, 0.18), 60.0, lens=55)
shot('p1_как_01.png', (0.0, 2.0, 0.0), (0.40, 0.90, 0.10), 62.0, lens=55)
shot('p4_снизу.png', (0.0, 0.0, -0.5), (-0.35, 0.30, -0.88), 62.0, lens=55)
shot('p3_сверху_сзади.png', (0.0, -2.0, 0.5), (-0.55, -0.62, 0.56), 62.0, lens=55)
shot('c_нос.png', (0.0, Y(5.0), 0.2), (-0.60, 0.70, 0.30), 9.0)
shot('c_фонарь.png', (0.0, Y(8.6), 1.0), (-0.65, 0.45, 0.60), 5.5)
shot('c_гондолы.png', (0.0, Y(31.5), 1.6), (-0.60, 0.75, 0.25), 9.5)
shot('c_как_07.png', (0.0, Y(40.0), 1.0), (0.0, -1.0, 0.03), 9.5)
shot('c_как_10.png', (0.0, Y(36.5), 2.6), (-0.97, -0.10, 0.10), 13.0)
shot('c_корма.png', (0.0, Y(40.0), 0.2), (-0.55, -0.75, 0.25), 5.0)
shot('c_гондола_ш.png', (-4.25, Y(27.5), -0.8), (-0.75, 0.55, -0.20), 10.0)
shot('c_низ.png', (0.0, Y(20.5), -1.4), (-0.30, 0.20, -0.93), 14.0)
if os.environ.get('TU_POSE'):
    P = [('bay_r', g.BAY_OPEN), ('bay_l', g.BAY_OPEN), ('hatch_nav', g.HATCH_OPEN), ('hatch_op', g.HATCH_OPEN), ('hatch_pilot', g.PH_OPEN), ('chute_lid', g.CHUTE_OPEN),
         ('turret', 30), ('turret_gun', 20), ('rudder', 25), ('intake_r', g.LIP_SLIDE), ('intake_l', g.LIP_SLIDE)]
    for s_ in ('r', 'l'): P += [('flap_i_' + s_, 28), ('flap_o_' + s_, 28), ('ail_' + s_, 20 if s_ == 'r' else -20), ('stab_' + s_, -20)]
    for n_, d_ in P: _pose(n_, d_)
    bpy.context.view_layer.update()
    shot('o_поза_спереди.png', (0.0, 1.0, 0.2), (-0.60, 0.68, 0.40), 55.0)
    shot('o_поза_сзади.png', (0.0, -2.0, 0.2), (-0.50, -0.72, 0.46), 55.0)
    shot('o_поза_снизу.png', (0.0, 0.0, -0.3), (-0.40, 0.30, -0.86), 52.0)
    shot('o_поза_корма.png', (0.0, Y(39.0), 0.5), (-0.60, -0.60, -0.40), 9.0)
    shot('o_поза_гондолы.png', (0.0, Y(31.0), 1.6), (-0.60, 0.75, 0.25), 9.5)
