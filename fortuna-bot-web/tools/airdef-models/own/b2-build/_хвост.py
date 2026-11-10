# _хвост.py - крупный план «бобрового хвоста» снизу и сбоку (после build.py), без краски. Проверка щели шарнира.
import os, math, bpy
from mathutils import Vector
import b2_geo as g
OUT = os.path.join(os.path.dirname(os.path.abspath(bpy.data.filepath or __file__)) if False else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/B-2A', '_снимки', 'хвост'); os.makedirs(OUT, exist_ok=True)
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 32; sc.cycles.use_denoising = True
try:
    pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'METAL'; pr.get_devices()
    for d_ in pr.devices: d_.use = True
    sc.cycles.device = 'GPU'
except Exception: pass
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.45, 0.6, 0.95, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.0
cd = bpy.data.cameras.new('c'); cam = bpy.data.objects.new('c', cd); sc.collection.objects.link(cam); sc.camera = cam; cd.lens = 50
sc.render.resolution_x, sc.render.resolution_y = 1400, 900
def shot(n, tgt, d, dist):
    tgt = Vector(tgt); cam.location = tgt + Vector(d).normalized() * dist; cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler(); sc.render.filepath = os.path.join(OUT, n); bpy.ops.render.render(write_still=True)
T = g.P3(g.TAIL_A, 0.0, 0.0)
shot('снизу.png', T, (0.25, -0.35, -0.9), 9.0)
shot('снизу_сбоку.png', T + Vector((1.5, 0, 0)), (0.8, -0.3, -0.5), 7.0)
shot('сзади.png', T, (0.1, -0.9, 0.35), 8.0)
