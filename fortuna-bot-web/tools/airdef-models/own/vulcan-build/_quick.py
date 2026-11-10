# _quick.py - быстрые снимки формы (Cycles, мало сэмплов): VUL_Q=имена через запятую. После build.py.
import os, math, bpy
from mathutils import Vector, Matrix
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_снимки', 'q'); os.makedirs(OUT, exist_ok=True)
sc = bpy.data.scenes['VUL']; sc.render.engine = 'CYCLES'
try:
    pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'METAL'; pr.get_devices()
    for d_ in pr.devices: d_.use = True
    sc.cycles.device = 'GPU' if os.environ.get('VUL_CPU') != '1' else 'CPU'
except Exception as e_: print('GPU нет', e_)
sc.cycles.samples = int(os.environ.get('VUL_SPP', '16')); sc.cycles.use_denoising = True; sc.cycles.max_bounces = 4
w = bpy.data.worlds.new('q_w'); sc.world = w; w.use_nodes = True
bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs['Color'].default_value = (0.70, 0.76, 0.84, 1); bg.inputs['Strength'].default_value = 0.62
for nm, rot_, en in (('v_sun', (math.radians(52), math.radians(8), math.radians(-38)), 2.1), ('v_fill', (math.radians(118), math.radians(-14), math.radians(150)), 0.35)):
    sd = bpy.data.lights.new(nm, 'SUN'); so = bpy.data.objects.new(nm, sd); sc.collection.objects.link(so); sd.energy = en; sd.angle = math.radians(6); so.rotation_euler = rot_
sc.render.film_transparent = True; sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.view_settings.view_transform = 'Standard'
cd = bpy.data.cameras.new('q_cam'); cam = bpy.data.objects.new('q_cam', cd); sc.collection.objects.link(cam); sc.camera = cam; cd.clip_start, cd.clip_end = 0.05, 400
ONLY = [q for q in os.environ.get('VUL_Q', '').split(',') if q]
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
Y = lambda a: 15.36 - a
shot('side.png', (0, 0, 0.8), (-1, 0, 0), 60, ortho=32.0, w=1800, h=700)
shot('top.png', (0, 0, 0), (0, 0, 1), 60, ortho=35.0, w=1500, h=1500, roll_y=True)
shot('bottom.png', (0, 0, 0), (0, 0, -1), 60, ortho=35.0, w=1500, h=1500, roll_y=True)
shot('front.png', (0, 0, 0.6), (0, 1, 0), 60, ortho=35.0, w=1600, h=600)
shot('p05.png', (0.0, 6.0, 0.4), (-0.48, 0.84, -0.10), 32.0, lens=50)
shot('p06.png', (0.0, -6.0, 0.6), (-0.55, -0.80, 0.18), 34.0, lens=50)
shot('p01.png', (0.0, 0.0, 0.0), (-0.30, 0.25, 0.92), 60.0, lens=50)
shot('c_inl.png', (-3.0, Y(11.5), 0.0), (-0.40, 0.90, 0.10), 9.0, lens=50)
shot('c_tail.png', (0.0, Y(27.5), 0.6), (-0.45, -0.85, 0.25), 11.0, lens=50)
shot('c_bay.png', (0.0, Y(18.0), -1.0), (-0.30, 0.25, -0.92), 14.0, lens=50)
shot('c_cock.png', (0.0, Y(7.3), 2.2), (-0.55, 0.60, 0.58), 6.0, lens=50)
shot('c_tail_photo.png', (0.0, Y(29.0), Zg(3.1)) if False else (0.0, Y(29.0), 0.1), (-0.78, -0.58, -0.10), 9.5, lens=50)
Zg = lambda z: z - 3.0
shot('c_can_f.png', (-0.55, Y(6.05), Zg(5.0)), (-0.80, 0.50, 0.30), 2.0, lens=50)
shot('c_can_r.png', (-0.40, Y(8.70), Zg(5.05)), (-0.80, -0.45, 0.35), 2.0, lens=50)
shot('c_fin_root.png', (-0.10, Y(27.6), Zg(4.4)), (-0.85, -0.35, 0.20), 2.6, lens=50)
