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
for o in GR_: o.hide_render = True
shot('p_полёт.png', (0.0, 0.0, 0.0), (-0.45, 0.55, 0.40), 31.0)
shot('top.png', (0, 0, 0), (0, 0, 1), 40, ortho=24.0, w=1500, h=1500, roll_y=True)
shot('p_полёт_снизу.png', (0.0, 0.0, 0.0), (0.40, 0.45, -0.75), 31.0)
for o in GR_: o.hide_render = False
for n_, d_ in __import__('mg_gear').POSE.items():
    o = bpy.data.objects.get(n_)
    if o is not None and n_ in g.PARTS:
        D = g.PARTS[n_]; T = D['pivot']; o.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(d_), 4, D['axis']) @ Matrix.Translation(-T) @ o.matrix_world
bpy.context.view_layer.update()
shot('side_r.png', (0, 0, 0.3), (1, 0, 0), 40, ortho=24.0, w=2000, h=800)
shot('front.png', (0, 0, 0.6), (0, 1, 0), 40, ortho=15.0, w=1500, h=900)
shot('rear.png', (0, 0, 0.6), (0, -1, 0), 40, ortho=15.0, w=1500, h=900)
shot('r_34_спереди.png', (0.0, 1.5, -0.3), (-0.62, 0.65, 0.30), 29.0)
shot('r_34_сзади.png', (0.0, -1.5, -0.3), (0.62, -0.62, 0.30), 29.0)
shot('r_снизу_спереди.png', (0.0, 1.5, -0.5), (0.40, 0.60, -0.70), 29.0)
shot('c_нос.png', (0.0, Y(4.0), 0.0), (0.62, 0.72, 0.25), 8.0)
shot('c_заборник.png', (1.0, Y(8.5), 0.0), (0.55, 0.80, 0.10), 6.0)
shot('c_заборник_спереди.png', (0.0, Y(8.5), 0.0), (0.05, 1.0, 0.05), 7.0)
shot('c_хвост.png', (0.0, Y(19.5), 0.6), (0.75, -0.55, 0.25), 9.0)
shot('c_сопла.png', (0.0, Y(20.8), 0.0), (0.35, -0.90, 0.20), 6.0)
shot('c_шасси.png', (1.6, Y(13.5), -1.4), (0.70, 0.62, -0.10), 6.0)
shot('c_носовая.png', (0.0, Y(9.2), -1.5), (0.55, 0.78, -0.05), 4.0)
shot('c_подвеска.png', (3.8, Y(15.5), -0.2), (0.45, 0.45, -0.75), 7.0)
shot('c_фонарь.png', (0.0, Y(6.8), 0.9), (0.60, 0.55, 0.55), 4.5)
shot('c_щель.png', (0.7, Y(9.5), 0.3), (0.30, 0.75, 0.60), 5.5)
shot('c_хвост_сбоку.png', (0.0, Y(20.0), 0.0), (0.95, -0.25, 0.10), 6.5)
shot('c_фонарь_сбоку.png', (0.0, Y(6.8), 0.8), (0.95, 0.15, 0.20), 4.0)
shot('c_кабина.png', (0.0, Y(6.6), 0.6), (0.15, -0.10, 0.98), 3.0)
# крупные планы стыков и механизации (после проверки стыков)
shot('s_стаб_снизу.png', (1.9, Y(20.2), -0.45), (0.35, -0.25, -0.90), 4.5)
shot('s_стаб_сбоку.png', (1.7, Y(20.3), -0.40), (0.97, -0.10, -0.20), 3.5)
shot('s_хвост_снизу_орто.png', (1.6, Y(20.0), -0.4), (0, 0, -1), 20, ortho=4.5, w=1400, h=1400, roll_y=True)
shot('s_хвост_сзади_орто.png', (1.0, Y(21), -0.2), (0, -1, 0), 20, ortho=4.0, w=1400, h=1100)
shot('s_крыло_закрылок.png', (4.2, Y(17.6), 0.6), (0.20, -0.45, 0.87), 5.0)
shot('s_створки_снизу.png', (1.8, Y(14.2), -1.0), (0.45, 0.20, -0.87), 5.0)
for n_, d_ in (('canopy', 55), ('flap_r', 25), ('aileron_r', -15), ('stab_r', 20), ('lip_r', 20), ('brake', 45), ('rudder_r', 25)): pose(n_, d_)
bpy.context.view_layer.update()
shot('m_фонарь_открыт.png', (0.2, Y(6.9), 0.9), (0.70, 0.45, 0.55), 5.0)
shot('m_механизация.png', (2.0, Y(17.0), 0.0), (0.70, -0.55, 0.45), 13.0)
shot('m_снизу.png', (1.0, Y(14.0), -0.8), (0.50, 0.30, -0.81), 13.0)
