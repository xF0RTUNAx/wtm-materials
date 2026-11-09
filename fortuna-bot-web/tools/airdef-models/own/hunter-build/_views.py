# _views.py - снимки формы без окраски (Cycles, студийный свет): ортогональные виды и перспектива с ракурсов фото. HN_OUT - папка, HN_ONLY - начала имён снимков, HN_POSE=1 - снимки с частями в крайних положениях.
import os, math, bpy
from mathutils import Vector, Matrix
OUT = os.environ.get('HN_OUT', os.path.join(os.path.dirname(os.path.abspath(__file__)), '_снимки')); os.makedirs(OUT, exist_ok=True)
sc = bpy.data.scenes["HN"]; sc.render.engine = 'CYCLES'
try:
    pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'METAL'; pr.get_devices()
    for d_ in pr.devices: d_.use = True
    sc.cycles.device = 'GPU'
except Exception as e_: print('GPU нет', e_)
sc.cycles.samples = int(os.environ.get('HN_SPP', '48')); sc.cycles.use_denoising = True; sc.cycles.denoising_input_passes = 'RGB'; sc.cycles.max_bounces = 6
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
ONLY = [q for q in os.environ.get('HN_ONLY', '').split(',') if q]
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


import hn_geo as g


def _pose(name, deg):
    o = bpy.data.objects.get(name)
    if o is None or name not in g.PARTS: return
    D = g.PARTS[name]; T = D['pivot']
    if D.get('kind') == 'slide': o.matrix_world = Matrix.Translation(D['axis'] * deg) @ o.matrix_world; return
    o.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(deg), 4, D['axis']) @ Matrix.Translation(-T) @ o.matrix_world


GR_ = [o for o in sc.objects if o.name.startswith('gear')]
for o in GR_: o.hide_render = True
shot('j_низ_закрыто.png', (0.0, 0.5, -0.4), (0.22, 0.20, -0.95), 13.0)
for o in GR_: o.hide_render = False
DOORS = (('door_n', 95), ('door_o_r', -88), ('door_o_l', 88))
for n_, d_ in DOORS: _pose(n_, d_)
bpy.context.view_layer.update()
shot('side_r.png', (0, 0, 0.2), (1, 0, 0), 40, ortho=15.0, w=1600, h=700)
shot('side_l.png', (0, 0, 0.2), (-1, 0, 0), 40, ortho=15.0, w=1600, h=700)
shot('top.png', (0, 0, 0), (0, 0, 1), 40, ortho=15.5, w=1500, h=1500, roll_y=True)
shot('bottom.png', (0, 0, 0), (0, 0, -1), 40, ortho=15.5, w=1500, h=1500, roll_y=True)
shot('front.png', (0, 0, 0.0), (0, 1, 0), 40, ortho=11.0, w=1400, h=800)
shot('rear.png', (0, 0, 0.0), (0, -1, 0), 40, ortho=11.0, w=1400, h=800)
Y = lambda a: 7.0 - a
shot('p1_как_01.png', (0.0, 0.3, 0.0), (-0.86, 0.48, 0.10), 24.0, lens=70)
shot('p5_как_05.png', (0.0, 2.0, 0.0), (-0.55, 0.80, 0.10), 18.0, lens=50)
shot('p6_как_06.png', (0.0, -0.5, 0.3), (-0.62, -0.62, 0.40), 22.0, lens=60)
shot('p2_как_02.png', (0.0, 1.0, -0.2), (0.30, 0.55, -0.78), 20.0, lens=55)
shot('p8_как_08.png', (0.0, -6.0, 0.6), (0.10, -0.98, -0.10), 9.5, lens=50)
shot('p7_как_07.png', (0.0, 2.5, -0.3), (-0.60, 0.70, -0.38), 14.0, lens=50)
shot('c_кабина.png', (0.0, Y(2.8), 0.6), (-0.55, 0.62, 0.55), 4.0)
shot('c_кабина_борт.png', (0.0, Y(2.8), 0.6), (-0.86, 0.20, 0.48), 3.2)
shot('c_нос.png', (0.0, Y(1.4), -0.2), (-0.55, 0.75, -0.30), 4.2)
shot('c_устье.png', (-0.9, Y(3.9), -0.2), (-0.20, 1.0, 0.0), 3.0)
shot('c_заборник.png', (-1.0, Y(4.0), -0.2), (-0.70, 0.62, 0.30), 3.6)
shot('c_пушки.png', (0.0, Y(2.6), -0.5), (-0.62, 0.45, -0.64), 3.2)
shot('c_спина.png', (0.0, Y(5.0), 0.6), (-0.55, 0.10, 0.82), 5.5)
shot('c_хвост.png', (0.0, Y(12.4), 1.0), (-0.72, -0.58, 0.38), 6.5)
shot('c_сопло.png', (0.0, Y(13.6), 0.3), (-0.35, -0.90, 0.20), 3.4)
shot('c_крыло.png', (-3.0, Y(7.6), -0.2), (-0.34, -0.34, 0.86), 6.5)
shot('c_зуб.png', (-3.1, Y(6.0), -0.2), (-0.30, 0.65, 0.70), 2.6)
shot('c_низ.png', (0.0, 0.0, -0.5), (0.20, 0.20, -0.96), 15.0)
shot('c_щиток.png', (0.0, Y(9.9), -0.6), (-0.40, -0.30, -0.86), 3.6)
shot('c_шасси_н.png', (0.0, Y(1.8), -0.9), (-0.70, 0.70, -0.10), 2.8)
shot('c_шасси_м.png', (-2.2, Y(6.4), -0.9), (-0.62, 0.74, -0.10), 3.2)
shot('c_пилоны.png', (-3.5, Y(7.3), -0.8), (-0.35, 0.40, -0.85), 5.0)
if os.environ.get('HN_POSE'):
    for n_, d_ in (('canopy', g.SLIDE_M), ('flap_r', 60), ('flap_l', 60), ('rudder', 25), ('stab_r', -10), ('stab_l', -10), ('elev_r', 25), ('elev_l', 25), ('brake', 67), ('aileron_r', 18), ('aileron_l', -18)): _pose(n_, d_)
    bpy.context.view_layer.update()
    shot('o_поза_спереди.png', (0.0, 0.4, 0.2), (-0.60, 0.68, 0.40), 20.0)
    shot('o_поза_сзади.png', (0.0, -1.0, 0.2), (-0.50, -0.72, 0.46), 20.0)
    shot('o_поза_снизу.png', (0.0, 0.0, -0.3), (-0.40, 0.30, -0.86), 18.0)
    shot('o_поза_кабина.png', (0.0, Y(3.0), 0.8), (-0.55, 0.45, 0.72), 5.0)
