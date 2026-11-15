# _trial.py - проба окраски Х-59М (Cycles на видеокарте, без запекания): кадры в _проба/, медиана борта (sRGB) против фото 05 (тень под крылом: ~116·115·119).
#   Blender -b --factory-startup --python _trial.py   (X59_WEAR=0/1/2, X59_SAMPLES, X59_SHOTS=имена через запятую)
import bpy, os, sys, math
import numpy as np
from mathutils import Vector
HD = os.path.dirname(os.path.abspath(__file__))
for f in ('build.py', '_paint.py'):
    _p = os.path.join(HD, f); exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
sys.path.insert(0, os.path.join(HD, '..', '_инструменты')); import gpu_setup
print('Cycles:', gpu_setup.use_gpu(sc))
apply_paint(int(os.environ.get('X59_WEAR', '1')))
sc.render.engine = 'CYCLES'; sc.cycles.samples = int(os.environ.get('X59_SAMPLES', '96')); sc.cycles.use_denoising = True
sc.view_settings.view_transform = 'AgX'; sc.view_settings.exposure = 0.25
w = bpy.data.worlds.new('V_world'); sc.world = w; w.use_nodes = True; nt = w.node_tree; bg = next(n for n in nt.nodes if n.type == 'BACKGROUND'); bg.inputs[1].default_value = 1.0
_tc = nt.nodes.new('ShaderNodeTexCoord'); _sp = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(_tc.outputs['Generated'], _sp.inputs[0])
_rp = nt.nodes.new('ShaderNodeValToRGB'); nt.links.new(_sp.outputs['Z'], _rp.inputs[0]); _r = _rp.color_ramp; _r.elements[0].position = 0.46; _r.elements[0].color = (0.46, 0.45, 0.43, 1)
_r.elements[1].position = 0.56; _r.elements[1].color = (0.85, 0.89, 0.95, 1); nt.links.new(_rp.outputs['Color'], bg.inputs[0])   # небо и земля - металл их отражает
ld = bpy.data.lights.new('V_sun', 'SUN'); ld.energy = 4.0; ld.angle = math.radians(3); sun = bpy.data.objects.new('V_sun', ld); COL.objects.link(sun); sun.rotation_euler = (math.radians(40), math.radians(-30), math.radians(-60))
cam = bpy.data.objects.new('V_cam', bpy.data.cameras.new('V_cam')); COL.objects.link(cam); sc.camera = cam; cam.data.clip_start = 0.02
OUT = os.path.join(HD, '_проба'); os.makedirs(OUT, exist_ok=True)
ONLY = [s for s in os.environ.get('X59_SHOTS', '').split(',') if s]
if not ONLY:
    for f in os.listdir(OUT): os.remove(os.path.join(OUT, f))
SH = [('1_общий', (-3.2, 3.9, 1.3), (0, 0.3, -0.12), 40, (1920, 1080), (0, 0)), ('2_сбоку_слева', (-10, 0, -0.12), (0, 0, -0.12), 'o5.6', (1920, 640), (0, 0)),
      ('3_голова', (-0.80, 3.35, 0.28), (0, 2.15, 0), 50, (1600, 1000), (0, 0)), ('4_двигатель', (-0.85, 0.75, -0.80), (0, -0.55, -0.42), 45, (1600, 1000), (0, 0)),
      ('5_сзади_снизу', (1.3, -4.3, -1.0), (0, -1.6, -0.25), 45, (1920, 1080), (0, 0)), ('6_трафареты', (-1.7, 1.05, 0.30), (0, 1.05, 0.0), 35, (1920, 1080), (0, 0)),
      ('7_справа_сзади', (2.5, -3.1, 0.9), (0, -0.5, -0.12), 40, (1920, 1080), (0.8, 0.6)), ('8_купол', (-0.28, 3.15, 0.08), (0, 2.45, 0), 70, (1400, 1000), (0, 0)),
      ('9_хвост_сверху', (-0.6, -1.0, 1.9), (0, -1.85, 0), 40, (1600, 1000), (0, 0)), ('10_справа', (10, 0, -0.12), (0, 0, -0.12), 'o5.6', (1920, 640), (0, 0))]
for name, pos, tgt, f, res, ps in SH:
    if ONLY and name not in ONLY: continue
    pose(*ps); cam.location = Vector(pos); cam.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
    sc.render.resolution_x, sc.render.resolution_y = res
    if isinstance(f, str): cam.data.type = 'ORTHO'; cam.data.ortho_scale = float(f[1:])
    else: cam.data.type = 'PERSP'; cam.data.lens = f
    sc.render.filepath = os.path.join(OUT, f'{name}.png'); bpy.ops.render.render(write_still=True); print('снимок', name, flush=True)
pose(0, 0)
fp = os.path.join(OUT, '2_сбоку_слева.png')
if os.path.exists(fp):
    im = bpy.data.images.load(fp)
    px = np.array(im.pixels[:], dtype=np.float32).reshape(im.size[1], im.size[0], im.channels)[..., :3]
    Wd, Ht = im.size; c0, c1 = int(Wd * 0.25), int(Wd * 0.70)
    up = px[int(Ht * 0.53):int(Ht * 0.60), c0:c1]; lo = px[int(Ht * 0.48):int(Ht * 0.52), c0:c1]     # пиксели снизу вверх: верх борта - строки 0,53…0,60
    print('МЕДИАНА борта (sRGB) верх', [int(v) for v in np.median(up.reshape(-1, 3), axis=0) * 255], 'середина', [int(v) for v in np.median(lo.reshape(-1, 3), axis=0) * 255],
          'всё', [int(v) for v in np.median(px[int(Ht * 0.48):int(Ht * 0.62), c0:c1].reshape(-1, 3), axis=0) * 255], flush=True)
print('проба готова', OUT)
