# _trial.py — проба окраски 3М14 (Cycles на видеокарте, без запекания): кадры в _проба/
#   Blender -b --factory-startup --python _trial.py   (K14_WEAR=0/1/2)
import bpy, os, sys, math
import numpy as np
from mathutils import Vector
HD = os.path.dirname(os.path.abspath(__file__))
for f in ('build.py', '_paint.py'):
    _p = os.path.join(HD, f); exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
sys.path.insert(0, os.path.join(HERE, '..', '..', '_инструменты')); import gpu_setup
print('Cycles:', gpu_setup.use_gpu(sc))
apply_paint(int(os.environ.get('K14_WEAR', '1')))
sc.render.engine = 'CYCLES'; sc.cycles.samples = int(os.environ.get('K14_SAMPLES', '96')); sc.cycles.use_denoising = True
sc.view_settings.view_transform = 'AgX'; sc.view_settings.exposure = -0.35
w = bpy.data.worlds.new('V_world'); sc.world = w; w.use_nodes = True; nt = w.node_tree; bg = next(n for n in nt.nodes if n.type == 'BACKGROUND'); bg.inputs[1].default_value = 1.0
_tc = nt.nodes.new('ShaderNodeTexCoord'); _sp = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(_tc.outputs['Generated'], _sp.inputs[0])
_rp = nt.nodes.new('ShaderNodeValToRGB'); nt.links.new(_sp.outputs['Z'], _rp.inputs[0]); _r = _rp.color_ramp; _r.elements[0].position = 0.46; _r.elements[0].color = (0.46, 0.45, 0.43, 1)
_r.elements[1].position = 0.56; _r.elements[1].color = (0.85, 0.89, 0.95, 1); nt.links.new(_rp.outputs['Color'], bg.inputs[0])   # небо и земля - чтобы хром кольца было видно
ld = bpy.data.lights.new('V_sun', 'SUN'); ld.energy = 3.0; ld.angle = math.radians(3); sun = bpy.data.objects.new('V_sun', ld); COL.objects.link(sun); sun.rotation_euler = (math.radians(40), math.radians(-30), math.radians(-60))
cam = bpy.data.objects.new('V_cam', bpy.data.cameras.new('V_cam')); COL.objects.link(cam); sc.camera = cam
OUT = os.path.join(HERE, '_проба'); os.makedirs(OUT, exist_ok=True)
if not os.environ.get('K14_SHOTS'):
    for f in os.listdir(OUT): os.remove(os.path.join(OUT, f))
SH = [('1_общий', (-3.6, 4.6, 2.2), (0, 0.1, 0), 35, (1920, 1080), 0), ('2_сбоку', (-20, 0, 0.0), (0, 0, 0.0), 'o6.7', (1920, 700), 0),
      ('3_хвост', (-1.3, -4.7, 0.9), (0, -2.75, 0), 45, (1600, 1000), 0), ('4_нос', (-1.3, 4.6, 0.5), (0, 2.4, 0), 45, (1600, 1000), 0),
      ('5_крыло', (1.6, 0.3, 1.2), (0.7, -0.6, 0.05), 40, (1600, 1000), 0), ('6_снизу', (-1.8, -1.0, -2.2), (0, -1.6, 0), 40, (1600, 1000), 0),
      ('7_корпус_крупно', (-1.0, 1.3, 0.35), (0, 0.6, 0.05), 45, (1600, 1000), 0)]
_only = os.environ.get('K14_SHOTS'); SH = [x for x in SH if not _only or x[0] in _only.split(',')]
for name, pos, tgt, f, res, ps in SH:
    pose(ps); cam.location = Vector(pos); cam.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
    sc.render.resolution_x, sc.render.resolution_y = res
    if isinstance(f, str): cam.data.type = 'ORTHO'; cam.data.ortho_scale = float(f[1:])
    else: cam.data.type = 'PERSP'; cam.data.lens = f
    sc.render.filepath = os.path.join(OUT, f'{name}.png'); bpy.ops.render.render(write_still=True); print('снимок', name, flush=True)
pose(0.0)
print('проба готова', OUT)
