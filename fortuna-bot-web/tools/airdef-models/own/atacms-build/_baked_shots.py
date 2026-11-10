# _baked_shots.py — кадры ATACMS с запечёнными текстурами: ATA_OUT=<папка с картинками> Blender -b --factory-startup --python _baked_shots.py
import bpy, os, sys, math
from mathutils import Vector
HD = os.path.dirname(os.path.abspath(__file__))
os.environ['ATA_REUSE'] = '1'
p = os.path.join(HD, os.environ.get('ATA_BAKER', 'bake.py')); exec(compile(open(p, encoding='utf-8').read(), p, 'exec'))
sc.render.engine = 'CYCLES'; sc.cycles.samples = 64; sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = 1920, 1080; sc.view_settings.view_transform = 'AgX'; sc.view_settings.exposure = -0.4
w = bpy.data.worlds.new('V_world'); sc.world = w; w.use_nodes = True; bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs[0].default_value = (0.9, 0.92, 0.95, 1); bg.inputs[1].default_value = 0.55
ld = bpy.data.lights.new('V_sun', 'SUN'); ld.energy = 3.0; ld.angle = math.radians(3); sun = bpy.data.objects.new('V_sun', ld); COL.objects.link(sun); sun.rotation_euler = (math.radians(35), math.radians(-25), math.radians(70))
cam = bpy.data.objects.new('V_cam', bpy.data.cameras.new('V_cam')); COL.objects.link(cam); sc.camera = cam
OUT = os.path.join(os.environ.get('ATA_OUT', HD), 'кадры'); os.makedirs(OUT, exist_ok=True)
SX = 4.23 / 1604
for name, pos, tgt, f, op in (('сбоку', (10, (960 - 949) * SX, -(540 - 516) * SX), ((0, (960 - 949) * SX, -(540 - 516) * SX)), 'o%.4f' % (1920 * SX), 0.0),
                              ('сзади', (2.6, -4.6, 1.4), (0, -0.6, 0), 45, 1.0), ('спереди', (-2.4, 4.6, 1.2), (0, 0.6, 0), 45, 0.0), ('нос', (1.3, 1.9, 0.4), (0, 1.0, 0.0), 50, 0.0),
                              ('хвост', (1.4, -2.9, 0.6), (0, -1.9, 0), 45, 0.0)):
    pose(op); cam.location = Vector(pos); cam.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
    if isinstance(f, str): cam.data.type = 'ORTHO'; cam.data.ortho_scale = float(f[1:])
    else: cam.data.type = 'PERSP'; cam.data.lens = f
    sc.render.film_transparent = name == 'сбоку'
    sc.render.filepath = os.path.join(OUT, f'{name}.png'); bpy.ops.render.render(write_still=True); print('снимок', name, flush=True)
