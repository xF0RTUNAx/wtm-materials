# _quick.py - быстрые снимки формы (Cycles, мало сэмплов): F100_Q=имена через запятую. После build.py.
import os, math, bpy
from mathutils import Vector, Matrix
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_снимки', 'q'); os.makedirs(OUT, exist_ok=True)
sc = bpy.data.scenes['F100']; sc.render.engine = 'CYCLES'
try:
    pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'METAL'; pr.get_devices()
    for d_ in pr.devices: d_.use = True
    sc.cycles.device = 'GPU'
except Exception as e_: print('GPU нет', e_)
sc.cycles.samples = int(os.environ.get('F100_SPP', '16')); sc.cycles.use_denoising = True; sc.cycles.max_bounces = 4
w = bpy.data.worlds.new('q_w'); sc.world = w; w.use_nodes = True
bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs['Color'].default_value = (0.70, 0.76, 0.84, 1); bg.inputs['Strength'].default_value = 0.62
for nm, rot_, en in (('v_sun', (math.radians(52), math.radians(8), math.radians(-38)), 2.1), ('v_fill', (math.radians(118), math.radians(-14), math.radians(150)), 0.35)):
    sd = bpy.data.lights.new(nm, 'SUN'); so = bpy.data.objects.new(nm, sd); sc.collection.objects.link(so); sd.energy = en; sd.angle = math.radians(6); so.rotation_euler = rot_
sc.render.film_transparent = True; sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.view_settings.view_transform = 'Standard'
cd = bpy.data.cameras.new('q_cam'); cam = bpy.data.objects.new('q_cam', cd); sc.collection.objects.link(cam); sc.camera = cam; cd.clip_start, cd.clip_end = 0.05, 300
ONLY = [q for q in os.environ.get('F100_Q', '').split(',') if q]
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
Y = lambda a: 7.0 - a
shot('side.png', (0, 0, 0.2), (-1, 0, 0), 40, ortho=15.0, w=1600, h=700)
shot('top.png', (0, 0, 0), (0, 0, 1), 40, ortho=15.5, w=1500, h=1500, roll_y=True)
shot('front.png', (0, 0, 0.0), (0, 1, 0), 40, ortho=11.0, w=1400, h=700)
shot('p05.png', (0.0, 2.0, 0.0), (-0.55, 0.80, 0.10), 20.0, lens=55)
shot('p06.png', (0.0, -0.5, 0.3), (-0.50, -0.55, 0.62), 22.0, lens=60)
shot('p02.png', (0.0, 1.0, -0.2), (-0.30, 0.55, -0.78), 20.0, lens=55)
shot('p08.png', (0.0, -6.0, 0.6), (0.10, -0.98, -0.10), 9.0, lens=50)
shot('c_inl.png', (-1.0, Y(3.7), -0.1), (-0.45, 0.88, 0.10), 4.5, lens=50)
