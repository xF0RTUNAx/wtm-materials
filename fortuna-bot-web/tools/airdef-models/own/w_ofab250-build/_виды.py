# _виды.py - снимки формы без краски (Cycles). После офаб.py в той же сессии: blender -b --factory-startup --python офаб.py --python _виды.py
import os, math, bpy, sys
from mathutils import Vector, Matrix
HERE = '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/ОФАБ-250'; OUT = os.path.join(HERE, '_снимки'); os.makedirs(OUT, exist_ok=True)
sc = bpy.context.scene; sc.render.engine = 'CYCLES'
try:
    pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'METAL'; pr.get_devices()
    for d_ in pr.devices: d_.use = True
    sc.cycles.device = 'GPU'
except Exception as e: print('GPU нет', e)
sc.cycles.samples = int(os.environ.get('OF_SPP', '48')); sc.cycles.use_denoising = True; sc.cycles.max_bounces = 6
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs['Color'].default_value = (0.70, 0.76, 0.84, 1); bg.inputs['Strength'].default_value = 0.7
for nm, rot_, en in (('sun', (math.radians(50), math.radians(8), math.radians(-38)), 2.4), ('fill', (math.radians(118), math.radians(-14), math.radians(150)), 0.4)):
    sd = bpy.data.lights.new(nm, 'SUN'); so = bpy.data.objects.new(nm, sd); sc.collection.objects.link(so); sd.energy = en; sd.angle = math.radians(5); so.rotation_euler = rot_
sc.render.film_transparent = True; sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.view_settings.view_transform = 'Standard'
cd = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam; cd.clip_start, cd.clip_end = 0.01, 50
ONLY = [q for q in os.environ.get('OF_ONLY', '').split(',') if q]
def shot(name, tgt, d, dist, ortho=None, w=1600, h=900, lens=50):
    if ONLY and not any(name.startswith(q) for q in ONLY): return
    dv = Vector(d).normalized(); cam.location = Vector(tgt) + dv * dist; cam.rotation_euler = (Vector(tgt) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    if ortho: cd.type = 'ORTHO'; cd.ortho_scale = ortho
    else: cd.type = 'PERSP'; cd.lens = lens; cd.sensor_width = 36
    sc.render.resolution_x, sc.render.resolution_y = w, h; sc.render.filepath = os.path.join(OUT, name); bpy.ops.render.render(write_still=True)
Y = lambda a: 0.74 - a
shot('side.png', (0, 0, 0.02), (1, 0, 0), 5, ortho=1.60, w=2000, h=600)          # нос вправо, как на фото 03
ONLY_T = not ONLY or any('top.png'.startswith(q) for q in ONLY)
if ONLY_T:
    cam.location = (0, 0, 5); cam.rotation_euler = (0, 0, math.pi / 2); cd.type = 'ORTHO'; cd.ortho_scale = 1.60; sc.render.resolution_x, sc.render.resolution_y = 2000, 600; sc.render.filepath = os.path.join(OUT, 'top.png'); bpy.ops.render.render(write_still=True)
shot('front.png', (0, 0, 0.02), (0, 1, 0), 5, ortho=0.45, w=800, h=800)
shot('rear.png', (0, 0, 0.02), (0, -1, 0), 5, ortho=0.45, w=800, h=800)
shot('p_как_01.png', (0, 0.05, 0), (-0.55, 0.62, 0.55), 3.0, lens=50)
shot('p_как_02.png', (0, 0.0, 0), (-0.45, 0.30, 0.84), 2.4, lens=50)
shot('c_нос.png', (0, Y(0.05), 0), (-0.45, 0.80, 0.40), 0.75, lens=50)
shot('c_хвост.png', (0, Y(1.30), 0), (-0.55, -0.70, 0.45), 0.80, lens=50)
shot('c_хвост_сбоку.png', (0, Y(1.25), 0), (-1.0, -0.05, 0.25), 0.80, lens=50)
shot('c_ушко.png', (0, Y(0.47), 0.17), (-0.70, 0.30, 0.65), 0.45, lens=50)
