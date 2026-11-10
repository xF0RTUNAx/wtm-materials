# _trial.py — пробные варианты окраски HIMARS (как у пусковой PAC-3) (Cycles на видеокарте, без запекания): HIM_VARS — через запятую (или all), кадры — SHOTS; файлы: пробный_окраска/<вариант>_<кадр>.png
import bpy, os, sys, math, time
from mathutils import Vector
HD = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.getcwd()
for f in ('build.py', '_paint.py'):
    p = os.path.join(HD, f); exec(compile(open(p, encoding='utf-8').read(), p, 'exec'))
sys.path.insert(0, os.path.join(HD, '..', '_инструменты')); import gpu_setup
print('Cycles:', gpu_setup.use_gpu(sc))
sc.render.engine = 'CYCLES'; sc.cycles.samples = int(os.environ.get('HIM_SAMPLES', '48')); sc.cycles.use_denoising = True; sc.cycles.max_bounces = 6
sc.render.resolution_x, sc.render.resolution_y = 1280, 800; sc.view_settings.view_transform = 'AgX'; sc.view_settings.exposure = -0.9
try: sc.view_settings.look = 'AgX - Medium High Contrast'
except Exception: pass
w = bpy.data.worlds.new('V_world'); sc.world = w; w.use_nodes = True; nt = w.node_tree
for n in list(nt.nodes): nt.nodes.remove(n)
sky = nt.nodes.new('ShaderNodeTexSky'); bg = nt.nodes.new('ShaderNodeBackground'); out = nt.nodes.new('ShaderNodeOutputWorld')
try: sky.sky_type = 'NISHITA'; sky.sun_elevation = math.radians(35); sky.sun_rotation = math.radians(140); sky.air_density = 1.2; sky.dust_density = 1.5
except Exception: pass
bg.inputs[1].default_value = 0.22; nt.links.new(sky.outputs[0], bg.inputs[0]); nt.links.new(bg.outputs[0], out.inputs[0])
ld = bpy.data.lights.new('V_sun', 'SUN'); ld.energy = 2.6; ld.angle = math.radians(2.0); ld.color = (1.0, 0.96, 0.90)
sun = bpy.data.objects.new('V_sun', ld); COL.objects.link(sun); sun.rotation_euler = (math.radians(50), math.radians(8), math.radians(140))
gm = bpy.data.meshes.new('V_ground'); s_ = 600.0; gm.from_pydata([(-s_, -s_, 0), (s_, -s_, 0), (s_, s_, 0), (-s_, s_, 0)], [], [(0, 1, 2, 3)]); gr = bpy.data.objects.new('V_ground', gm); COL.objects.link(gr)
gmat = bpy.data.materials.new('V_ground'); gmat.use_nodes = True; gb = next(n for n in gmat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); gb.inputs['Base Color'].default_value = (0.10, 0.095, 0.075, 1); gb.inputs['Roughness'].default_value = 0.95; gm.materials.append(gmat)
cam = bpy.data.objects.new('V_cam', bpy.data.cameras.new('V_cam')); COL.objects.link(cam); cam.data.lens = 45; sc.camera = cam
OUT = os.path.join(HD, 'пробный_окраска'); os.makedirs(OUT, exist_ok=True)
SHOTS_ALL = [('общий', -50, 12, 17, (0, -0.3, 1.6), 0), ('борт', -90, 4, 15, (0, -0.4, 1.6), 0), ('перед', -24, 6, 7.5, (0, 3.2, 1.4), 0), ('кабина', -40, 16, 5.5, (0, 2.6, 2.0), 0),
             ('боевое', -135, 14, 17, (0, -1.0, 2.6), 45), ('корма', 160, 12, 10, (0, -3.6, 1.8), 0)]
SHOTS = [s for s in SHOTS_ALL if not os.environ.get('HIM_SHOTS') or s[0] in os.environ['HIM_SHOTS'].split(',')]
vars_ = list(VARIANTS) if os.environ.get('HIM_VARS', 'all') == 'all' else os.environ['HIM_VARS'].split(',')
for vn in vars_:
    t0 = time.time(); apply_paint(VARIANTS[vn], 1)
    for sh in SHOTS:
        name, az, el, dist, at = sh[:5]
        pose(sh[5], 0.0, 0.0, 'gmlrs')
        a, e = math.radians(az), math.radians(el); d = Vector((math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e)))
        cam.location = Vector(at) + d * dist; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler(); bpy.context.view_layer.update()
        sc.render.filepath = os.path.join(OUT, f'{vn}_{name}.png'); bpy.ops.render.render(write_still=True)
        print('снимок', vn, name, '%.0f с' % (time.time() - t0), flush=True)
