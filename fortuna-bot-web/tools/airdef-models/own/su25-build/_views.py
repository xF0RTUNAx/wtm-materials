# _views.py - снимки формы без окраски (Cycles, студийный свет) для Mark: ортопроекции и ракурсы. S25_OUT - папка, S25_TAG - приставка, S25_ONLY - начала имён.
import os, math, bpy
from mathutils import Vector, Matrix
OUT = os.environ.get('S25_OUT', os.path.join(os.path.dirname(os.path.abspath(__file__)), '_снимки')); os.makedirs(OUT, exist_ok=True); TAG = os.environ.get('S25_TAG', 'v')
sc = bpy.data.scenes["S25"] if "S25" in bpy.data.scenes else bpy.context.scene; sc.render.engine = 'CYCLES'
try:
    pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'METAL'; pr.get_devices()
    for d_ in pr.devices: d_.use = True
    sc.cycles.device = 'GPU'
except Exception as e_: print('GPU нет', e_)
sc.cycles.samples = int(os.environ.get('S25_SPP', '40')); sc.cycles.use_denoising = True; sc.cycles.max_bounces = 6
w = bpy.data.worlds.new('v_w'); sc.world = w
try: w.use_nodes = True
except Exception: pass
bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs['Color'].default_value = (0.70, 0.76, 0.84, 1); bg.inputs['Strength'].default_value = 0.62
for nm, rot_, en in (('v_sun', (math.radians(52), math.radians(8), math.radians(-38)), 2.1), ('v_fill', (math.radians(118), math.radians(-14), math.radians(150)), 0.45)):
    sd = bpy.data.lights.new(nm, 'SUN'); so = bpy.data.objects.new(nm, sd); sc.collection.objects.link(so); sd.energy = en; sd.angle = math.radians(6); so.rotation_euler = rot_
sc.render.film_transparent = False
try: sc.view_settings.view_transform = 'Standard'
except Exception: pass
ONLY = [q for q in os.environ.get('S25_ONLY', '').split(',') if q]
cd = bpy.data.cameras.new('v_cam'); cam = bpy.data.objects.new('v_cam', cd); sc.collection.objects.link(cam); sc.camera = cam; cd.clip_start, cd.clip_end = 0.05, 500
def shot(name, tgt, d, dist, ortho=None, w=1600, h=1000, lens=50, up=(0, 0, 1)):
    if ONLY and not any(name.startswith(q) for q in ONLY): return
    dv = Vector(d).normalized(); cam.location = Vector(tgt) + dv * dist
    z_ = dv; x_ = Vector(up).cross(z_).normalized(); y_ = z_.cross(x_); cam.rotation_euler = Matrix((x_, y_, z_)).transposed().to_euler()
    if ortho: cd.type = 'ORTHO'; cd.ortho_scale = ortho
    else: cd.type = 'PERSP'; cd.lens = lens; cd.sensor_width = 36
    sc.render.resolution_x, sc.render.resolution_y = w, h; sc.render.filepath = os.path.join(OUT, f'{TAG}_{name}.png'); bpy.ops.render.render(write_still=True)
Y = lambda a_: 7.765 - a_
shot('34верх', (0, -0.6, 0.4), (-0.55, 0.62, 0.45), 26, lens=50, w=1600, h=1000)
shot('34низ', (0, -0.6, 0.2), (-0.50, 0.62, -0.42), 26, lens=50, w=1600, h=1000)
shot('сбоку', (0, 0, 1.0), (-1, 0, 0), 60, ortho=16.8, w=1600, h=640)
shot('спереди', (0, 0, 0.6), (0, 1, 0), 60, ortho=15.2, w=1600, h=640)
shot('сзади34', (0, -2.0, 0.6), (0.55, -0.70, 0.30), 24, lens=50, w=1600, h=1000)
shot('нос', (0.0, Y(2.8), 0.2), (-0.60, 0.65, 0.40), 5.0, lens=50, w=1600, h=1000)
shot('кабина', (0.0, Y(4.3), 0.9), (0.70, 0.45, 0.55), 4.2, lens=50, w=1600, h=1000)
shot('заборник', (1.0, Y(6.3), 0.2), (0.55, 0.80, 0.12), 4.2, lens=50, w=1600, h=1000)
shot('хвост', (0.0, Y(13.5), 1.2), (0.65, -0.62, 0.38), 6.5, lens=50, w=1600, h=1000)
shot('законцовка', (7.0, Y(9.8), 0.5), (0.45, -0.75, 0.45), 3.0, lens=50, w=1600, h=1000)
