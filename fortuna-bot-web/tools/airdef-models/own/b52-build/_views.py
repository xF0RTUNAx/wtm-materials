# _views.py - снимки формы без окраски (Cycles, студийный свет): ортогональные виды, ракурсы фото, крупные планы, крайние положения. B52_OUT - папка, B52_ONLY - начала имён.
import os, math, bpy
from mathutils import Vector, Matrix
OUT = os.environ.get('B52_OUT', os.path.join(os.path.dirname(os.path.abspath(__file__)), '_снимки')); os.makedirs(OUT, exist_ok=True)
sc = bpy.data.scenes['B52']; sc.render.engine = 'CYCLES'
try:
    pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'METAL'; pr.get_devices()
    for d_ in pr.devices: d_.use = True
    sc.cycles.device = 'GPU' if os.environ.get('B52_CPU') != '1' else 'CPU'
except Exception as e_: print('GPU нет', e_)
sc.cycles.samples = int(os.environ.get('B52_SPP', '48')); sc.cycles.use_denoising = True; sc.cycles.denoising_input_passes = 'RGB'; sc.cycles.max_bounces = 6
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
ONLY = [q for q in os.environ.get('B52_ONLY', '').split(',') if q]
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
import b52_geo as g, b52_gear as gr
def _pose(name, deg):
    o = bpy.data.objects.get(name)
    if o is None or name not in g.PARTS: return
    D = g.PARTS[name]; T = D['pivot']
    if D.get('kind') == 'slide': o.matrix_world = Matrix.Translation(D['axis'] * deg) @ o.matrix_world; return
    o.matrix_world = Matrix.Translation(T) @ Matrix.Rotation(math.radians(deg), 4, D['axis']) @ Matrix.Translation(-T) @ o.matrix_world
Y = lambda a: 24.39 - a; Zg = lambda z: z - 4.0
GR_ = [o for o in sc.objects if o.name.startswith(('gear', 'door_'))]
for o in GR_: o.hide_render = True
shot('front_полёт.png', (0, 0, 2.0), (0, 1, 0), 90, ortho=58.5, w=1800, h=600)
shot('p_полёт.png', (0.0, 0.0, 0.0), (-0.45, 0.55, -0.35), 85.0, lens=50)
shot('p_полёт_сверху.png', (0.0, 0.0, 0.0), (0.40, 0.45, 0.80), 85.0, lens=50)
shot('p_полёт_сзади.png', (0.0, 0.0, 0.0), (-0.35, -0.85, 0.15), 85.0, lens=50)
for o in GR_: o.hide_render = False
for n_, d_ in gr.POSE.items(): _pose(n_, d_)
for n_ in ('wing_r', 'wing_l'): _pose(n_, g.PARTS[n_]['ground'])
bpy.context.view_layer.update()
shot('side_r.png', (0, 0, 1.0), (1, 0, 0), 90, ortho=50.5, w=1800, h=660)
shot('top.png', (0, 0, 0), (0, 0, 1), 90, ortho=58.0, w=1500, h=1500, roll_y=True)
shot('bottom.png', (0, 0, 0), (0, 0, -1), 90, ortho=58.0, w=1500, h=1500, roll_y=True)
shot('front.png', (0, 0, 2.0), (0, 1, 0), 90, ortho=58.5, w=1800, h=600)
shot('rear.png', (0, 0, 2.0), (0, -1, 0), 90, ortho=58.5, w=1800, h=600)
shot('p14_как_14.png', (0.0, 10.0, -1.5), (0.0, 0.99, -0.02), 120.0, lens=60)
shot('p06_как_06.png', (0.0, 12.0, -1.0), (0.45, 0.85, 0.05), 60.0, lens=45)
shot('p02_как_02.png', (0.0, 0.0, 0.0), (-0.20, -0.05, 0.98), 95.0, lens=50)
shot('r_34_спереди_слева.png', (0.0, 4.0, -1.0), (-0.65, 0.65, 0.25), 75.0, lens=50)
shot('r_34_сзади_справа.png', (0.0, -4.0, -1.0), (0.65, -0.65, 0.25), 75.0, lens=50)
shot('r_сверху_сзади.png', (0.0, -2.0, 0.0), (-0.30, -0.60, 0.74), 80.0, lens=50)
shot('r_снизу_спереди.png', (0.0, 4.0, -1.0), (0.35, 0.60, -0.72), 75.0, lens=50)
shot('r_низко_сбоку.png', (0.0, 2.0, -2.0), (0.92, 0.38, -0.02), 70.0, lens=45)
shot('p04_как_04.png', (0.0, 0.0, 0.0), (-0.25, 0.35, -0.90), 85.0, lens=50)
shot('c_нос.png', (0.0, Y(3.6), Zg(3.9)), (0.62, 0.72, 0.10), 9.5, lens=50)
shot('c_кабина.png', (0.0, Y(3.6), Zg(5.0)), (0.40, 0.75, 0.55), 6.5, lens=50)
shot('c_гондола.png', (11.0, Y(g.pod_front(11.0) + 2.0), g.pod_z(11.0)), (0.35, 0.92, 0.05), 8.5, lens=50)
shot('c_сопла.png', (11.0, Y(g.pod_front(11.0) + 5.0), g.pod_z(11.0)), (0.35, -0.92, -0.15), 7.0, lens=50)
shot('c_хвост.png', (0.0, Y(46.8), Zg(4.6)), (0.80, -0.55, 0.20), 9.0, lens=50)
shot('c_хвост_как_09.png', (0.0, Y(45.0), Zg(6.5)), (0.98, -0.22, 0.02), 16.0, lens=50)
shot('c_киль.png', (0.0, Y(42.5), Zg(8.0)), (0.95, -0.10, 0.25), 18.0, lens=50)
shot('c_пилон.png', (5.6, Y(15.0), Zg(4.0)), (0.55, 0.65, -0.52), 9.0, lens=50)
shot('c_шасси.png', (0.95, Y(13.6), Zg(1.0)), (0.75, 0.60, -0.10), 8.0, lens=50)
shot('c_опора.png', (22.5, Y(g.LE(22.5) + 2.1), Zg(2.2)), (0.70, 0.65, 0.10), 9.0, lens=50)
shot('c_низ.png', (0.0, Y(22.0), Zg(2.0)), (0.30, 0.30, -0.90), 30.0, lens=50)
def _ctr(n_):
    o = bpy.data.objects[n_]; vs = [o.matrix_world @ v.co for v in o.data.vertices]; return sum(vs, Vector()) / len(vs)
shot('d_пвд.png', (1.9, Y(3.4), Zg(3.4)), (0.80, 0.55, 0.10), 3.2, lens=50)
shot('d_спина.png', (0.0, Y(32.5), Zg(5.6)), (0.75, 0.25, 0.60), 9.0, lens=50)
shot('d_спина_перед.png', (0.0, Y(12.0), Zg(5.6)), (0.70, 0.30, 0.65), 9.0, lens=50)
shot('d_низ_нос.png', (0.0, Y(10.0), Zg(1.7)), (0.55, 0.35, -0.75), 10.0, lens=50)
shot('d_низ_хвост.png', (0.0, Y(36.0), Zg(2.0)), (0.55, 0.30, -0.78), 11.0, lens=50)

shot('d_конец_крыла.png', tuple(_ctr('det_wing_r')), (0.55, 0.70, 0.45), 3.0, lens=50)
shot('d_конец_крыла_сзади.png', tuple(_ctr('det_wing_r')), (0.45, -0.75, 0.30), 4.5, lens=50)
shot('d_гондола_низ.png', tuple(_ctr('det_pod1_r')), (0.35, 0.40, -0.85), 7.0, lens=50)
shot('d_гондола_бок.png', tuple(_ctr('det_pod2_l')), (-0.85, 0.45, 0.25), 6.5, lens=50)
shot('d_стойка.png', (1.25, Y(13.6), Zg(1.6)), (0.30, 0.95, 0.05), 3.2, lens=50)
shot('d_створка.png', (1.9, Y(13.6), Zg(0.8)), (0.80, 0.20, 0.55), 4.0, lens=50)
shot('d_хвост_коробки.png', (0.9, Y(45.6), Zg(4.4)), (0.85, 0.25, 0.15), 4.0, lens=50)
shot('d_хвост_щели.png', (0.7, Y(47.3), Zg(3.7)), (0.85, -0.40, -0.25), 2.8, lens=50)
shot('d_киль_огонь.png', (0.0, Y(g.FTE(11.9)), Zg(11.9)), (0.70, -0.65, 0.25), 2.5, lens=50)
for n_ in ('bay_l', 'bay_r'): _pose(n_, 95)
bpy.context.view_layer.update()
shot('o_отсек_открыт.png', (0.0, Y(22.0), Zg(2.6)), (0.40, 0.30, -0.86), 16.0, lens=50)
shot('d_отсек_стенка.png', (-1.2, Y(22.0), Zg(3.0)), (0.55, 0.20, -0.81), 4.5, lens=40)
shot('c_руль_низ.png', (0.0, Y(g.FTE(g.RUD[0]) - 0.5), Zg(g.RUD[0])), (0.85, -0.40, 0.25), 2.6, lens=50)
shot('c_руль_верх.png', (0.0, Y(g.FTE(g.RUD[1]) - 0.5), Zg(g.RUD[1])), (0.85, -0.40, 0.25), 2.6, lens=50)
shot('c_корень_киля.png', (0.0, Y(g.FLE(5.4) + 1.0), Zg(5.5)), (0.85, 0.40, 0.25), 4.0, lens=50)
shot('c_хвост_как_10.png', (0.0, Y(46.5), Zg(4.4)), (-0.70, -0.62, 0.30), 9.5, lens=50)
shot('c_хвост_сбоку.png', (0.0, Y(47.0), Zg(4.2)), (1.0, -0.05, 0.02), 7.0, lens=50)
shot('c_хвост_сверху.png', (0.0, Y(47.0), Zg(4.2)), (0.3, -0.35, 0.89), 8.0, lens=50)
