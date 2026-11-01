# Клуб следа ракеты (2026-11-01, Mark: «шлейфы по подобию War Thunder»): у них след — плотные белые клубы, бугристые («капуста»), верх
# освещён солнцем, низ — в светло-серой тени, края рваные и полупрозрачные; клуб медленно разрастается и долго висит.
# Отличия от puff.py (дым подбитых): выброс медленный и плотный (дым двигателя, а не струя из пробоины), тёплый — всплывает и клубится,
# растворяется медленно (пряди не темнеют: светлый мир, больше отражений в объёме), снят дольше (≈ 4,3 с симуляции).
#   blender -b -P trail.py -- <папка> <вариант 0…3> [разрешение = 128] [сэмплы = 64] [клетка, px = 256]   → <папка>/v<вариант>/<кадр>.png + info.json
# Затем лист: trail-sheet.js (как puff-sheet.js) → games/airdef/fx/ex_trail.ktx2 (+ .webp, _lo), описание — explode.json «trail».
import bpy, sys, os, math, random, bmesh
from mathutils import Vector, Matrix
a = sys.argv[sys.argv.index('--') + 1:]
out, var = a[0], int(a[1]); res = int(a[2]) if len(a) > 2 else 128; spp = int(a[3]) if len(a) > 3 else 64; px = int(a[4]) if len(a) > 4 else 256
FRAMES = [5, 7, 9, 12, 15, 19, 23, 28, 34, 41, 49, 58, 68, 79, 91, 104]  # первые кадры (гладкий выброс) пропущены; конец — клуб ещё плотный в середине
random.seed(31 + var * 13)
bpy.ops.wm.read_homefile(use_empty=True)
sc = bpy.context.scene; sc.render.fps = 24; sc.frame_start = 1; sc.frame_end = FRAMES[-1]
try: sc.render.engine = 'CYCLES'
except TypeError: pass
try: sc.view_settings.view_transform = 'Standard'
except TypeError: pass
# выброс — отрезок следа: 4–6 комков вдоль короткой оси (не шар — у шара клуб круглый)
bm = bmesh.new()
for i in range(random.randint(4, 6)):
    r = random.uniform(0.1, 0.18); p = Vector((random.uniform(-0.3, 0.3), random.uniform(-0.1, 0.1), random.uniform(-0.1, 0.1)))
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0, matrix=Matrix.Translation(p) @ Matrix.Diagonal((r * random.uniform(1.0, 1.6), r * random.uniform(0.8, 1.3), r * random.uniform(0.8, 1.2), 1)))
me = bpy.data.meshes.new('Выброс'); bm.to_mesh(me); bm.free()
em = bpy.data.objects.new('Выброс', me); sc.collection.objects.link(em); bpy.context.view_layer.objects.active = em; em.select_set(True)
bpy.ops.object.quick_smoke(style='SMOKE')
dom = next(o for o in bpy.data.objects if o.modifiers and o.modifiers[0].type == 'FLUID' and o.modifiers[0].fluid_type == 'DOMAIN'); dom.name = 'Область'
dom.location = (0, 0, 0.8); dom.scale = (1, 1, 1); dom.dimensions = (6, 6, 6); bpy.context.view_layer.update()
ds = dom.modifiers[0].domain_settings
ds.resolution_max = res; ds.use_noise = True; ds.noise_scale = 2; ds.noise_strength = 1.2; ds.noise_pos_scale = 1.2
ds.cache_type = 'ALL'; ds.cache_directory = os.path.join(out, f'cache{var}'); ds.cache_frame_start = 1; ds.cache_frame_end = FRAMES[-1]
ds.use_adaptive_domain = True; ds.adapt_margin = 3; ds.adapt_threshold = 0.008
for b in ('front', 'back', 'left', 'right', 'top', 'bottom'): setattr(ds, 'use_collision_border_' + b, False)
ds.alpha = 0.0; ds.beta = 0.9; ds.vorticity = 0.35  # тёплый дым всплывает и клубится («капуста»), мелкая рябь — умеренно
ds.use_dissolve_smoke = True; ds.dissolve_speed = 120; ds.use_dissolve_smoke_log = True  # тает медленно: клуб долго плотный
ds.use_adaptive_timesteps = True; ds.timesteps_min = 1; ds.timesteps_max = 4
fs = em.modifiers[0].flow_settings
fs.flow_type = 'SMOKE'; fs.flow_behavior = 'INFLOW'; fs.density = 2.6; fs.temperature = 1.4; fs.smoke_color = (1, 1, 1); fs.subframes = 2; fs.surface_distance = 0.12; fs.volume_density = 1.0
fs.use_initial_velocity = True; fs.velocity_normal = random.uniform(0.25, 0.45)  # медленно во все стороны — дым двигателя, отставший от ракеты
fs.use_inflow = True; fs.keyframe_insert('use_inflow', frame=1); fs.keyframe_insert('use_inflow', frame=5); fs.use_inflow = False; fs.keyframe_insert('use_inflow', frame=6)
em.hide_render = True
tb = bpy.data.objects.new('Порывы', None); sc.collection.objects.link(tb); bpy.context.view_layer.objects.active = tb
bpy.ops.object.forcefield_toggle(); tb.field.type = 'TURBULENCE'; tb.field.strength = 2.5; tb.field.size = 0.7; tb.field.noise = 0.0; tb.field.seed = 5 + var * 19; tb.field.flow = 0.0
# материал: белый плотный дым, своя тень; мир светлый — тень светло-серая, пряди не темнеют
m = dom.active_material; nt = m.node_tree; pv = next(n for n in nt.nodes if n.type == 'PRINCIPLED_VOLUME')
pv.inputs['Color'].default_value = (1, 1, 1, 1); pv.inputs['Color Attribute'].default_value = ''; pv.inputs['Density'].default_value = 6.0  # без сетки цвета: она при растворении разбавляется до чёрного — пряди темнели (как в ex_puff)
try: pv.inputs['Anisotropy'].default_value = 0.25  # свет пробивает края клуба — светлая кайма
except KeyError: pass
pv.inputs['Blackbody Intensity'].default_value = 0.0
sun = bpy.data.objects.new('Солнце', bpy.data.lights.new('Солнце', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 6.0; sun.rotation_euler = (math.radians(28), 0, math.radians(-25))  # сверху-сбоку: верх клуба светлый, низ в тени
w = bpy.data.worlds.new('World'); sc.world = w; w.use_nodes = True
bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs[0].default_value = (0.78, 0.8, 0.84, 1); bg.inputs[1].default_value = 1.0
cam = bpy.data.objects.new('Камера', bpy.data.cameras.new('Камера')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.0; cam.data.clip_end = 100
el = math.radians(8); dd = 15
sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = px; sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
sc.cycles.samples = spp; sc.cycles.use_denoising = True; sc.cycles.volume_bounces = 4; sc.cycles.max_bounces = 6; sc.cycles.sample_clamp_indirect = 0.6
with bpy.context.temp_override(active_object=dom, object=dom, selected_objects=[dom]):
    bpy.ops.fluid.free_all(); bpy.ops.fluid.bake_all()
sys.path.insert(0, os.path.expanduser('~/Downloads/Воздушное превосходство/Модели/Свои/_инструменты'))
import gpu_setup, json; gpu_setup.use_gpu(sc)
vd = os.path.join(out, f'v{var}'); os.makedirs(vd, exist_ok=True)
sizes = []  # камера по границам дыма на каждом кадре (как puff.py): клуб заполняет клетку, разрастание — размером частицы в игре
for f in FRAMES:
    sc.frame_set(f); dg = bpy.context.evaluated_depsgraph_get(); de = dom.evaluated_get(dg)
    bb = [de.matrix_world @ Vector(c) for c in de.bound_box]; lo = Vector([min(v[i] for v in bb) for i in range(3)]); hi = Vector([max(v[i] for v in bb) for i in range(3)])
    ctr = (lo + hi) / 2; ext = max(hi.x - lo.x, hi.z - lo.z)
    if sizes: ext = min(ext, sizes[-1] * 1.3)
    cam.data.ortho_scale = ext * 1.06; sizes.append(round(ext, 3))
    cam.location = ctr + Vector((0, -dd * math.cos(el), dd * math.sin(el))); cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(vd, f'{f:03d}.png'); bpy.ops.render.render(write_still=True)
json.dump({'fps': 24, 'frames': FRAMES, 'sizes': sizes}, open(os.path.join(vd, 'info.json'), 'w'))
print('клуб следа', var, 'готов', flush=True)
