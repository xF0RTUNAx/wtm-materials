# _views.py - снимки формы без окраски (Cycles, студийный свет): ортогональные виды, 3/4, крупные планы. MG_OUT - папка, MG_ONLY - начала имён.
import os, math, bpy
from mathutils import Vector, Matrix
OUT = os.environ.get('MG_OUT', os.path.join(os.path.dirname(os.path.abspath(__file__)), '_снимки')); os.makedirs(OUT, exist_ok=True)
sc = bpy.data.scenes['MG']; sc.render.engine = 'CYCLES'
try:
    pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'METAL'; pr.get_devices()
    for d_ in pr.devices: d_.use = True
    sc.cycles.device = 'GPU'
except Exception as e_: print('GPU нет', e_)
sc.cycles.samples = int(os.environ.get('MG_SPP', '48')); sc.cycles.use_denoising = True; sc.cycles.denoising_input_passes = 'RGB'; sc.cycles.max_bounces = 6
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
ONLY = [q for q in os.environ.get('MG_ONLY', '').split(',') if q]
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
import mg_geo as g
def pose(name, deg):
    o = bpy.data.objects.get(name)
    if o is None or name not in g.PARTS: return
    D = g.PARTS[name]; T = D['pivot']
    if D.get('kind') == 'slide': o.matrix_world = Matrix.Translation(D['axis'] * deg) @ o.matrix_world; return
    o.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(deg), 4, D['axis']) @ Matrix.Translation(-T) @ o.matrix_world
Y = lambda a: g.L / 2 - a
import mg_gear as gr
GR_ = [o for o in sc.objects if o.name.startswith(('gear', 'door_'))]
def sweep_to(deg):
    for sx, n_ in ((1, 'wing_r'), (-1, 'wing_l')):
        o = bpy.data.objects[n_]; cur = o.get('dl', g.D_FILE); g.pose_wing(o, deg - cur, sx); o['dl'] = deg
    bpy.context.view_layer.update()
for o in GR_: o.hide_render = True
sweep_to(0.0)
shot('p_полёт_16.png', (0.0, 0.0, 0.0), (-0.45, 0.55, 0.40), 25.0)
shot('top_16.png', (0, 0, 0), (0, 0, 1), 40, ortho=17.5, w=1500, h=1500, roll_y=True)
sweep_to(29.0); shot('top_45.png', (0, 0, 0), (0, 0, 1), 40, ortho=17.5, w=1500, h=1500, roll_y=True)
sweep_to(g.D_FILE); shot('top_72.png', (0, 0, 0), (0, 0, 1), 40, ortho=17.5, w=1500, h=1500, roll_y=True)
shot('p_полёт_72.png', (0.0, 0.0, 0.0), (-0.45, 0.55, 0.40), 25.0)
shot('p_полёт_снизу.png', (0.0, 0.0, 0.0), (0.40, 0.45, -0.75), 25.0)
for o in GR_: o.hide_render = False
for n_, d_ in gr.POSE.items(): pose(n_, d_)
bpy.context.view_layer.update()
shot('side_r.png', (0, 0, 0.3), (1, 0, 0), 40, ortho=17.5, w=1800, h=700)
shot('front.png', (0, 0, 0.3), (0, 1, 0), 40, ortho=9.0, w=1500, h=800)
shot('rear.png', (0, 0, 0.3), (0, -1, 0), 40, ortho=9.0, w=1500, h=800)
shot('r_34_спереди.png', (0.0, 1.0, -0.3), (-0.62, 0.65, 0.30), 22.0)
shot('r_34_сзади.png', (0.0, -1.0, -0.3), (0.62, -0.62, 0.30), 22.0)
shot('r_снизу_спереди.png', (0.0, 1.0, -0.5), (0.40, 0.60, -0.70), 22.0)
shot('c_нос.png', (0.0, Y(4.0), 0.1), (0.62, 0.72, 0.25), 6.0)
shot('c_кайра.png', (0.0, Y(1.3), -0.25), (0.35, 0.92, 0.12), 2.6)
shot('c_кайра_сбоку.png', (0.0, Y(1.8), -0.2), (0.95, 0.25, 0.05), 3.4)
shot('c_капля.png', (0.0, Y(1.55), -0.15), (0.55, 0.78, 0.30), 1.6)
shot('c_капля_сбоку.png', (0.0, Y(1.6), -0.15), (0.97, 0.12, 0.20), 1.6)
shot('c_пвд_слева.png', (0.0, Y(2.2), -0.25), (-0.55, 0.80, 0.18), 4.2)
shot('v_как_фото11.png', (0.0, Y(6.5), -0.3), (-0.62, 0.76, 0.12), 16.0)
shot('c_пвд_справа.png', (0.15, Y(2.4), -0.25), (0.62, 0.74, 0.20), 3.6)
shot('c_пвд_корень.png', (0.22, Y(1.9), -0.25), (0.85, 0.35, 0.30), 1.4)
shot('v_спереди_справа.png', (0.0, Y(6.5), -0.3), (0.62, 0.76, 0.12), 16.0)
shot('c_пушка.png', (0.25, Y(7.4), -0.6), (0.55, 0.60, -0.55), 3.0)
shot('v_спереди_низко.png', (0.0, 1.5, -0.6), (-0.30, 0.95, 0.05), 15.0)
shot('v_сбоку_слева.png', (0.0, 0.3, -0.2), (-1.0, 0.0, 0.10), 19.0, lens=60)
shot('v_сверху_сзади.png', (0.0, -1.0, 0.0), (0.35, -0.55, 0.75), 20.0)
shot('v_снизу.png', (0.0, 0.0, -0.3), (0.25, 0.30, -0.92), 20.0)
shot('c_заборник.png', (0.95, Y(5.9), 0.2), (0.45, 0.85, 0.15), 3.6)
shot('c_наплыв.png', (1.8, Y(9.4), 0.6), (0.55, 0.20, 0.80), 4.5)
shot('c_хвост.png', (0.0, Y(15.2), 0.4), (0.75, -0.55, 0.25), 6.0)
shot('c_шасси.png', (1.0, Y(10.4), -1.2), (0.70, 0.62, -0.10), 4.2)
shot('c_носовая.png', (0.0, Y(4.5), -1.3), (0.55, 0.78, -0.05), 3.2)
shot('c_подвеска.png', (0.8, Y(9.0), -0.9), (0.55, 0.45, -0.70), 5.5)
for n_ in ('brake_u_r', 'brake_d_r', 'brake_u_l', 'brake_d_l'): pose(n_, 50)
pose('canopy', 50)
sweep_to(0.0)
for n_ in ('flap1_r', 'flap2_r', 'flap1_l', 'flap2_l'): pose(n_, 0)
bpy.context.view_layer.update()
shot('o_фонарь_щитки.png', (0.0, Y(10.0), 0.5), (0.70, -0.10, 0.70), 14.0)
shot('o_16_стоянка.png', (0.0, 1.0, -0.3), (-0.62, 0.65, 0.30), 24.0)
