# Клуб дыма для следов подбитых самолётов (2026-10-24, Mark: «запечь дымы повреждений»): частица следа вместо ровного пятна берёт кадры
# настоящего клуба — плотный и клубящийся → рваный → тающие пряди, со светом и самозатенением. Дым белый (в игре — тон: серый, чёрный, белёсая течь).
# Короткий турбулентный выброс из пробоины тормозится в воздухе и расползается; всплытие слабое (след ложится по траектории, ветер — в игре).
#   blender -b -P puff.py -- <папка> <вариант 0…3> [разрешение = 128] [сэмплы = 64] [размер порывов, м = 0,9]   → <папка>/v<вариант>/<кадр>.png (16 кадров) + info.json
# Затем: puff-sheet.js — 4 варианта в лист 8×8 → games/airdef/fx/puff.ktx2 (+ .webp, _lo).
import bpy, sys, os, math, random, bmesh
from mathutils import Vector, Matrix
a = sys.argv[sys.argv.index('--') + 1:]
out, var = a[0], int(a[1]); res = int(a[2]) if len(a) > 2 else 128; spp = int(a[3]) if len(a) > 3 else 64
FRAMES = [6, 8, 10, 12, 14, 17, 20, 24, 28, 33, 38, 43, 49, 55, 62, 70]  # ≈ 2,7 с: первые кадры (гладкие комки выброса) — пропущены; конец — пока клуб
# ещё виден (почти растаявший раздувал рамку на весь кадр — бледный квадрат); дальше тает прозрачностью в игре
random.seed(11 + var * 7)
bpy.ops.wm.read_homefile(use_empty=True)
sc = bpy.context.scene; sc.render.fps = 24; sc.frame_start = 1; sc.frame_end = FRAMES[-1]
try: sc.render.engine = 'CYCLES'
except TypeError: pass
try: sc.view_settings.view_transform = 'Standard'
except TypeError: pass
# выброс — 3–5 неровных комков (не шар: у шара клуб выходит круглым)
bm = bmesh.new()
for i in range(random.randint(3, 5)):
    r = random.uniform(0.09, 0.17); p = Vector((random.uniform(-0.15, 0.15), random.uniform(-0.15, 0.15), random.uniform(-0.12, 0.12)))
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0, matrix=Matrix.Translation(p) @ Matrix.Diagonal((r * random.uniform(0.8, 1.5), r * random.uniform(0.8, 1.5), r * random.uniform(0.8, 1.3), 1)))
me = bpy.data.meshes.new('Выброс'); bm.to_mesh(me); bm.free()
em = bpy.data.objects.new('Выброс', me); sc.collection.objects.link(em); bpy.context.view_layer.objects.active = em; em.select_set(True)
bpy.ops.object.quick_smoke(style='SMOKE')
dom = next(o for o in bpy.data.objects if o.modifiers and o.modifiers[0].type == 'FLUID' and o.modifiers[0].fluid_type == 'DOMAIN'); dom.name = 'Область'
dom.location = (0, 0, 0); dom.scale = (1, 1, 1); dom.dimensions = (10, 10, 10); bpy.context.view_layer.update()  # струя уносит клуб на 3–4 м — стенок не касается (считается только участок с дымом)
ds = dom.modifiers[0].domain_settings
ds.resolution_max = res; ds.use_noise = True; ds.noise_scale = 2; ds.noise_strength = 1.6; ds.noise_pos_scale = 1.5
ds.cache_type = 'ALL'; ds.cache_directory = os.path.join(out, f'cache{var}'); ds.cache_frame_start = 1; ds.cache_frame_end = FRAMES[-1]
ds.use_adaptive_domain = True; ds.adapt_margin = 3; ds.adapt_threshold = 0.006  # границы дыма на каждом кадре — по ним камера
for b in ('front', 'back', 'left', 'right', 'top', 'bottom'): setattr(ds, 'use_collision_border_' + b, False)
ds.alpha = 0.0; ds.beta = 0.3; ds.vorticity = 0.6  # завихрения — клуб рвётся на пряди; всплытие — чуть (горячий дым)
ds.use_dissolve_smoke = True; ds.dissolve_speed = 40; ds.use_dissolve_smoke_log = True  # к концу — прозрачные пряди, не обрыв
ds.use_adaptive_timesteps = True; ds.timesteps_min = 1; ds.timesteps_max = 4
fs = em.modifiers[0].flow_settings
fs.flow_type = 'SMOKE'; fs.flow_behavior = 'INFLOW'; fs.density = 2.0; fs.temperature = 0.6; fs.smoke_color = (1, 1, 1); fs.subframes = 2; fs.surface_distance = 0.15; fs.volume_density = 1.0  # из всего объёма комков: только с поверхности — полые кольца
# струя (дым срывается с пробоины потоком), а не во все стороны — во все стороны клуб выходил ровным шаром
# дым из пробоины рвёт поток (Mark: «небрежнее, не цветная капуста» — капуста у всплывающего медленного дыма): быстрая струя в неподвижный
# воздух — срыв, сдвиг и рваные пряди; рост клуба не страшен — камера по его границам, разрастание — в игре
fs.use_initial_velocity = True; fs.velocity_normal = random.uniform(0.3, 0.6)
d = Vector((random.uniform(-1, 1), random.uniform(-0.4, 0.4), random.uniform(-0.3, 0.5))).normalized(); fs.velocity_coord = tuple(d * random.uniform(1.2, 1.8)); fs.velocity_factor = 1.0
fs.use_inflow = True; fs.keyframe_insert('use_inflow', frame=1); fs.keyframe_insert('use_inflow', frame=3); fs.use_inflow = False; fs.keyframe_insert('use_inflow', frame=4)
em.hide_render = True
# крупные порывы (поле турбулентности): растаскивают клуб клочьями — просветы и языки; мелкая рябь (vorticity) этого не даёт — зернистый шар
TS = float(a[4]) if len(a) > 4 else 0.9
tb = bpy.data.objects.new('Порывы', None); sc.collection.objects.link(tb); bpy.context.view_layer.objects.active = tb
bpy.ops.object.forcefield_toggle(); tb.field.type = 'TURBULENCE'; tb.field.strength = 6.0; tb.field.size = TS; tb.field.noise = 0.0; tb.field.seed = 3 + var * 17; tb.field.flow = 0.0
# материал: белый дым, тень от себя (в игре — тон и свет сцены)
m = dom.active_material; nt = m.node_tree; pv = next(n for n in nt.nodes if n.type == 'PRINCIPLED_VOLUME')
pv.inputs['Color'].default_value = (1, 1, 1, 1); pv.inputs['Color Attribute'].default_value = 'color'; pv.inputs['Density'].default_value = 4.5;  # плотность — как у клуба в несколько метров (в игре), а не метрового в симуляции pv.inputs['Blackbody Intensity'].default_value = 0.0
sun = bpy.data.objects.new('Солнце', bpy.data.lights.new('Солнце', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 7.0; sun.rotation_euler = (math.radians(40), 0, math.radians(-30))  # сверху-сбоку: верх клуба светлее, низ в тени
w = bpy.data.worlds.new('World'); sc.world = w; w.use_nodes = True
bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs[0].default_value = (0.6, 0.6, 0.6, 1); bg.inputs[1].default_value = 1.0  # белый дым в тени — светло-серый, не тёмный (тон — в игре)
cam = bpy.data.objects.new('Камера', bpy.data.cameras.new('Камера')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.6; cam.data.clip_end = 100
tgt = Vector((0, 0, 0)); el = math.radians(10); dd = 15
cam.location = tgt + Vector((0, -dd * math.cos(el), dd * math.sin(el))); cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = 256; sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
sc.cycles.samples = spp; sc.cycles.use_denoising = True; sc.cycles.volume_bounces = 2; sc.cycles.max_bounces = 4; sc.cycles.sample_clamp_indirect = 0.5
with bpy.context.temp_override(active_object=dom, object=dom, selected_objects=[dom]):
    bpy.ops.fluid.free_all(); bpy.ops.fluid.bake_all()
sys.path.insert(0, os.path.expanduser('~/Downloads/Воздушное превосходство/Модели/Свои/_инструменты'))
import gpu_setup, json; gpu_setup.use_gpu(sc)
vd = os.path.join(out, f'v{var}'); os.makedirs(vd, exist_ok=True)
# камера на каждом кадре — по границам дыма (подвижная область) с запасом: клуб всегда заполняет кадр и не касается краёв; рост клуба
# отбрасывается (разрастание — в игре: размер частицы), остаётся то, как он клубится и тает
sizes = []
for f in FRAMES:
    sc.frame_set(f); dg = bpy.context.evaluated_depsgraph_get(); de = dom.evaluated_get(dg)
    bb = [de.matrix_world @ Vector(c) for c in de.bound_box]; lo = Vector([min(v[i] for v in bb) for i in range(3)]); hi = Vector([max(v[i] for v in bb) for i in range(3)])
    ctr = (lo + hi) / 2; ext = max(hi.x - lo.x, hi.z - lo.z)  # по видимым размерам (x, z); глубина (y) в кадр не входит — по ней клуб выходил мелким
    if sizes: ext = min(ext, sizes[-1] * 1.3)  # рамка не прыгает: редкая дымка по краям — в растворение края листа
    cam.data.ortho_scale = ext * 1.08; sizes.append(round(ext, 3))
    cam.location = ctr + Vector((0, -dd * math.cos(el), dd * math.sin(el))); cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(vd, f'{f:03d}.png'); bpy.ops.render.render(write_still=True)
json.dump({'fps': 24, 'frames': FRAMES, 'sizes': sizes}, open(os.path.join(vd, 'info.json'), 'w'))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, f'puff{var}.blend'))
print('клуб', var, 'готов', flush=True)
