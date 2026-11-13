# _views.py - снимки формы без окраски (Cycles, студийный свет): ортогональные виды, 3/4, крупные планы. SU_OUT - папка, SU_ONLY - начала имён.
import os, math, bpy
from mathutils import Vector, Matrix
OUT = os.environ.get('SU_OUT', os.path.join(os.path.dirname(os.path.abspath(__file__)), '_снимки')); os.makedirs(OUT, exist_ok=True)
sc = bpy.data.scenes['SU']; sc.render.engine = 'CYCLES'
try:
    pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'METAL'; pr.get_devices()
    for d_ in pr.devices: d_.use = True
    sc.cycles.device = 'GPU'
except Exception as e_: print('GPU нет', e_)
sc.cycles.samples = int(os.environ.get('SU_SPP', '48')); sc.cycles.use_denoising = True; sc.cycles.denoising_input_passes = 'RGB'; sc.cycles.max_bounces = 6
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
ONLY = [q for q in os.environ.get('SU_ONLY', '').split(',') if q]
cd = bpy.data.cameras.get('v_cam') or bpy.data.cameras.new('v_cam'); cam = bpy.data.objects.get('v_cam') or bpy.data.objects.new('v_cam', cd)
if cam.name not in sc.collection.objects: sc.collection.objects.link(cam)
sc.camera = cam; cd.clip_start, cd.clip_end = 0.02, 300
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
import su_geo as g
def pose(name, deg):
    o = bpy.data.objects.get(name)
    if o is None or name not in g.PARTS: return
    D = g.PARTS[name]; T = D['pivot']
    if D.get('kind') == 'slide': o.matrix_world = Matrix.Translation(D['axis'] * deg) @ o.matrix_world; return
    o.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(deg), 4, D['axis']) @ Matrix.Translation(-T) @ o.matrix_world
Y = lambda a: g.L / 2 - a
try:
    import su_gear as gr
except ImportError:
    import types; gr = types.SimpleNamespace(POSE={})
GR_ = [o for o in sc.objects if o.name.startswith(('gear', 'door_'))]
def sweep_to(deg):
    for sx, n_ in ((1, 'wing_r'), (-1, 'wing_l')):
        o = bpy.data.objects[n_]; cur = o.get('dl', g.D_FILE); g.pose_wing(o, deg - cur, sx); o['dl'] = deg
        p_ = bpy.data.objects.get('pyl_w_' + n_[-1])
        if p_ is not None: bpy.context.view_layer.update(); T = p_.matrix_world.translation.copy(); p_.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(-(deg - cur)), 4, Vector((0, 0, -sx))) @ Matrix.Translation(-T) @ p_.matrix_world
    bpy.context.view_layer.update()
for o in GR_: o.hide_render = True
sweep_to(0.0)
shot('p_полёт_16.png', (0.0, 0.0, 0.0), (-0.45, 0.55, 0.40), 32.0)
shot('top_16.png', (0, 0, 0), (0, 0, 1), 40, ortho=24.0, w=1500, h=1500, roll_y=True)
sweep_to(29.0 if g.SW0 == 16.0 else 45.0 - g.SW0); shot('top_45.png', (0, 0, 0), (0, 0, 1), 40, ortho=24.0, w=1500, h=1500, roll_y=True)
sweep_to(g.D_FILE); shot('top_69.png', (0, 0, 0), (0, 0, 1), 40, ortho=24.0, w=1500, h=1500, roll_y=True)
shot('p_полёт_69.png', (0.0, 0.0, 0.0), (-0.45, 0.55, 0.40), 32.0)
shot('p_полёт_снизу.png', (0.0, 0.0, 0.0), (0.40, 0.45, -0.75), 32.0)
for o in GR_: o.hide_render = False
for n_, d_ in gr.POSE.items(): pose(n_, d_)
bpy.context.view_layer.update()
shot('side_r.png', (0, 0, 0.3), (1, 0, 0), 40, ortho=24.0, w=2000, h=700)
shot('front.png', (0, 0, 0.3), (0, 1, 0), 40, ortho=12.5, w=1500, h=800)
shot('rear.png', (0, 0, 0.3), (0, -1, 0), 40, ortho=12.5, w=1500, h=800)
shot('r_34_спереди.png', (0.0, 1.0, -0.3), (-0.62, 0.65, 0.30), 29.0)
shot('r_34_сзади.png', (0.0, -1.0, -0.3), (0.62, -0.62, 0.30), 29.0)
shot('r_снизу_спереди.png', (0.0, 1.0, -0.5), (0.40, 0.60, -0.70), 29.0)
shot('c_нос.png', (0.0, Y(4.5), 0.4), (0.62, 0.72, 0.25), 7.5)
shot('c_заборник.png', (1.10, Y(8.0), 0.3), (0.45, 0.85, 0.15), 4.5)
shot('c_наплыв.png', (2.2, Y(13.3), 1.0), (0.55, 0.20, 0.80), 6.0)
shot('c_хвост.png', (0.0, Y(19.6), 1.0), (0.75, -0.55, 0.25), 8.0)
shot('c_стаб_корень.png', (1.6, Y(19.3), 0.65), (0.55, -0.45, 0.70), 7.0)
shot('c_стаб_корень_сбоку.png', (1.5, Y(19.3), 0.55), (0.80, -0.55, -0.10), 7.0)
shot('c_сопла.png', (0.0, Y(20.8), 0.3), (0.55, -0.75, 0.20), 8.0)
shot('c_сопла_сверху.png', (0.0, Y(19.8), 0.4), (0.05, -0.50, 0.86), 7.5)
shot('c_плита.png', (0.7, Y(20.9), 0.15), (0.62, -0.72, 0.30), 4.0)
shot('c_сопла_снизу.png', (0.0, Y(20.5), 0.0), (0.40, -0.55, -0.65), 8.0)
shot('c_шасси.png', (1.2, Y(13.8), -1.3), (0.70, 0.62, -0.10), 5.0)
shot('c_носовая.png', (0.0, Y(5.6), -1.3), (0.55, 0.78, -0.05), 3.6)
shot('c_подвеска.png', (1.0, Y(12.0), -0.9), (0.55, 0.45, -0.70), 7.0)
pose('brake', 50)
pose('canopy_r', 50); pose('canopy_l', 50)
sweep_to(0.0)
pass
bpy.context.view_layer.update()
shot('o_фонарь_щитки.png', (0.0, Y(10.0), 0.8), (0.70, -0.10, 0.70), 17.0)
shot('o_16_стоянка.png', (0.0, 1.0, -0.3), (-0.62, 0.65, 0.30), 31.0)
