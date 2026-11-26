# Клуб для роя взрыва (Mark 2026-11-26: «чёткие границы», «купол»; приёмы студий и регламента взрывов в Blender): одна небольшая симуляция,
# из которой игра собирает облако десятками повёрнутых клубов (units-render swarm). Выброс - не гладкой сферой (она и даёт купол), а десятками
# частиц с разной скоростью: газ выходит струями и рвётся на отдельные клубы; шум Mantaflow (noise) - мелкие завихрения края; пламя - короткое
# (быстро сгорает), дальше - тёмный дым.
#   blender -b -P clump.py -- <файл.blend> [seed = 3] [вид = burst | billow | dust] [кадр px = 512]
# Виды (Mark 2026-11-26: «клубы слишком одинаковые»): burst - огненный выброс (ядро + струи); billow - всплывающий клуб дыма без огня (горячий газ
# заворачивается кверху); dust - пыль ударной волны: выброс вбок у земли, тяжёлая, катится валом по полу (земля - граница области).
# Затем: bake_fluid.py (запечь), render6.py (свет с шести сторон), pack6.py ... clump (лист клуба).
import bpy, sys, os, math, random
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
path = a[0]; seed = int(a[1]) if len(a) > 1 else 3; KIND = a[2] if len(a) > 2 else 'burst'; PX = int(a[3]) if len(a) > 3 else 512; random.seed(seed)
G = float(a[4]) if len(a) > 4 else 1.0; VG = G ** 0.5  # G - масштаб сцены (как у пожара scene.py): в большой области всплытие слабее завихрений - клуб не поднимался;
# сцена в G раз меньше, скорости × √G, время × √G (подобие по Фруду); игре - game_scale = 1 / G (render6.py: кадр × 1/G, время × √(1/G))
BU, BI, DU = KIND in ('burst', 'jets', 'jetsg', 'jetsg2'), KIND == 'billow', KIND == 'dust'
JE = KIND in ('jets', 'jetsg', 'jetsg2'); JG = KIND in ('jetsg', 'jetsg2')  # jetsg - те же струи у земли: заряд на земле, струи вверх и в стороны, земля - граница  # jets - взрыв целиком (Mark 2026-11-26, съёмка с дрона): венец толстых тёмных струй, короткий огонь, струи тормозятся и вспухают одним многолопастным облаком
N = 72  # 3 с при 24 к/с: дальше клуб в игре растягивает hold
if JE: N = 96
bpy.ops.wm.read_homefile(use_empty=True)
sc = bpy.context.scene; sc.render.fps = 24; sc.frame_start = 1; sc.frame_end = N; sc['game_scale'] = 1 / G
try: sc.render.engine = 'CYCLES'
except TypeError: pass
try: sc.view_settings.view_transform = 'Standard'
except TypeError: pass
cache = os.path.join(os.path.dirname(path), 'cache_' + os.path.splitext(os.path.basename(path))[0].replace('explode_', ''))
# заряд: неровный ком (сфера, сплюснутая и сдвинутая шумом) - сам не излучает, только рождает частицы
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1.2 * G, location=(0, 0, (0.5 if DU else 0.8 if JG else 0) * G))
em = bpy.context.active_object; em.name = 'Заряд'; em.hide_render = True
if DU: em.scale = (1.6, 1.6, 0.45)
for v in em.data.vertices: v.co *= 0.75 + 0.5 * random.random()
bpy.ops.object.quick_smoke(style='BOTH')
dom = next(o for o in bpy.data.objects if o.modifiers and o.modifiers[0].type == 'FLUID' and o.modifiers[0].fluid_type == 'DOMAIN'); dom.name = 'Область'
W = (40.0 if KIND == 'jetsg2' else 24.0 if JE else 24.0 if DU else 21.0) * G; dom.location = (0, 0, W / 2 if DU or JG else 4.5 * G); dom.scale = (1, 1, 1); dom.dimensions = (W, W, W); bpy.context.view_layer.update()  # шире облака: стенки не режут край
ds = dom.modifiers[0].domain_settings
ds.resolution_max = 224; ds.use_noise = True; ds.noise_scale = 2; ds.noise_strength = 0.6; ds.noise_pos_scale = 2.5; ds.noise_time_anim = 0.2
ds.cache_type = 'ALL'; ds.cache_directory = cache; ds.cache_frame_start = 1; ds.cache_frame_end = N
ds.use_adaptive_domain = True; ds.adapt_margin = 12; ds.adapt_threshold = 0.002
for b in ('front', 'back', 'left', 'right', 'top', 'bottom'): setattr(ds, 'use_collision_border_' + b, False)
ds.use_collision_border_bottom = DU or JG  # пыль и струи у земли - по земле
ds.alpha = -0.1; ds.beta = 8.0; ds.vorticity = 0.8;  # горячий газ всплывает и заворачивается (неустойчивость Рэлея - Тейлора) - клубы «цветной капусты»
ds.flame_vorticity = 1.4  # сильнее завихрения - клубится (у прежних 0,45 - гладкий шар)
ds.burning_rate = 1.8; ds.flame_ignition = 1.5; ds.flame_max_temp = 3.0; ds.flame_smoke = 1.6; ds.flame_smoke_color = (0.12, 0.11, 0.1)  # пламя гаснет быстро, дым тротила - тёмный
ds.use_dissolve_smoke = False
if JE: ds.resolution_max = 336 if KIND == 'jetsg2' else 256; ds.noise_strength = 0.3; ds.vorticity = 1.0; ds.beta = 2.0; ds.burning_rate = 2.2; ds.flame_smoke = 2.0; ds.flame_smoke_color = (0.05, 0.048, 0.045)
if BI: ds.beta = 8.0; ds.alpha = -0.05; ds.vorticity = 0.9
if DU: ds.beta = 0.6; ds.alpha = 0.25; ds.vorticity = 0.7  # пыль тяжелее воздуха: не всплывает, оседает
ds.use_adaptive_timesteps = True; ds.timesteps_min = 2; ds.timesteps_max = 12; ds.cfl_condition = 3.0  # больше шагов: быстрый выброс не «размазывается»
# частицы-выброс: 22 крупных, 1-3 кадр, 4-10 м/с, сильное сопротивление - короткие толстые языки, газ остаётся клубами (быстрые тонкие давали «ежа»)
em.modifiers.new('Выброс', 'PARTICLE_SYSTEM'); ps = em.particle_systems[0]; st = ps.settings
st.count = 12; st.frame_start = 1; st.frame_end = 3; st.lifetime = 10; st.emit_from = 'FACE'; st.use_emit_random = True; ps.seed = seed
st.normal_factor = 5.0; st.factor_random = 6.0; st.object_align_factor = (0, 0, 3.0)
if BI: st.count = 9; st.frame_end = 6; st.normal_factor = 2.5; st.factor_random = 3.0; st.object_align_factor = (0, 0, 2.5)
if JE: st.count = 16; st.frame_end = 2; st.lifetime = 18; st.normal_factor = 18.0; st.factor_random = 8.0; st.object_align_factor = (0, 0, 1.0); st.effector_weights.gravity = 0.2
if JG: st.count = 18; st.object_align_factor = (0, 0, 9.0); st.normal_factor = 15.0  # у земли: струи веером вверх и в стороны (вниз - в грунт)
if KIND == 'jetsg2':  # струи сильнее и дольше (Mark 2026-11-26: «слабоватые, развиваются и резко останавливаются»): частица тянет струю до 2 с, воздух тормозит мягче, грунт выгибает струю дугой
    st.count = 20; st.lifetime = 30; st.normal_factor = 10.0; st.factor_random = 4.5; st.object_align_factor = (0, 0, 8.0); st.effector_weights.gravity = 1.0  # без сопротивления: полёт по дуге (вверх, выше 10 м, и вниз) - сопротивление с размером частицы раскачивало счёт
    st.effector_weights.smokeflow = 0.0  # течение газа на частицы не действует - иначе к 1-2 с их траектории раскачивались до бесконечности
if DU: st.count = 16; st.frame_end = 4; st.normal_factor = 7.0; st.factor_random = 4.0; st.object_align_factor = (0, 0, 0.4); st.effector_weights.gravity = 0.5
st.normal_factor *= VG; st.factor_random *= VG; st.object_align_factor = tuple(x * VG for x in st.object_align_factor)
st.physics_type = 'NEWTON'; st.mass = 1; st.effector_weights.gravity = 0.15; st.drag_factor = 0.0 if KIND == 'jetsg2' else 1.6 if JE else 1.0; st.particle_size = (1.7 if KIND == 'jetsg2' else 1.2 if JE else 2.0) * G; st.size_random = 0.6 if JE else 0.8; st.render_type = 'NONE'
if KIND == 'jetsg2': st.effector_weights.gravity = 1.0  # грунт струи - под полной тяжестью, дугой (строкой выше тяжесть общая 0,15)
fm = next(x for x in em.modifiers if x.type == 'FLUID'); f = fm.flow_settings  # газ - из частиц (сам ком не излучает)
with bpy.context.temp_override(object=em, active_object=em): bpy.ops.object.modifier_move_to_index(modifier='Выброс', index=0)
f.flow_type = 'BOTH'; f.flow_behavior = 'INFLOW'; f.flow_source = 'PARTICLES'; f.particle_system = ps; f.use_particle_size = True; f.particle_size = (1.7 if KIND == 'jetsg2' else 1.2 if JE else 2.0) * G
f.fuel_amount = 1.4; f.temperature = 5.0; f.density = 1.2; f.smoke_color = (0.12, 0.11, 0.1); f.subframes = 3; f.use_initial_velocity = True; f.velocity_factor = 0.7
if JE: f.fuel_amount = 0.5; f.temperature = 2.0; f.density = 1.6; f.smoke_color = (0.05, 0.048, 0.045)
if KIND == 'jetsg2': f.velocity_factor = 1.0; f.density = 2.0  # газ струи уносит всю скорость частицы
if not BU: f.flow_type = 'SMOKE'; f.temperature = 4.0 if BI else 0.3; f.density = 1.4
# ядро: сам заряд - огненный шар первые 2 кадра (частицы рвут его край языками)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1.6 * G, location=(0, 0, 0)); co = bpy.context.active_object; co.name = 'Ядро'; co.hide_render = True
for v in co.data.vertices: v.co *= 0.7 + 0.6 * random.random()
cm = co.modifiers.new('Fluid', 'FLUID'); cm.fluid_type = 'FLOW'; c = cm.flow_settings
c.flow_type = 'BOTH' if BU else 'SMOKE'; c.flow_behavior = 'INFLOW'; c.fuel_amount = 1.4; c.temperature = 5.0 if BU else 4.0 if BI else 0.3; c.density = 1.2; c.smoke_color = (0.12, 0.11, 0.1); c.subframes = 2
if DU: co.location = (0, 0, 0.5 * G); co.scale = (1.5, 1.5, 0.4)
if JE: co.scale = (0.35, 0.35, 0.35)
if JG: co.location = (0, 0, 0.8 * G)  # струи: ядро малое, облако - из струй
c.surface_distance = 0.6 * G; c.use_initial_velocity = True; c.velocity_normal = 5.0 * VG; c.velocity_factor = 1.0
for fr, on in (((1, True), (2, True), (3, False)) if BU else ((1, True), (6, True), (7, False))): c.use_inflow = on; c.keyframe_insert('use_inflow', frame=fr)  # без огня - газ подаётся дольше (клуб растёт из-под низа)
# материал объёма (как scene.py: render6.py ищет узлы «Пламя: цвет» и «Пламя: сила»)
m = dom.active_material; nt = m.node_tree; pv = next(n for n in nt.nodes if n.type == 'PRINCIPLED_VOLUME')
pv.inputs['Color'].default_value = (1, 1, 1, 1); pv.inputs['Color Attribute'].default_value = 'color'; pv.inputs['Density'].default_value = 12.0; pv.inputs['Blackbody Intensity'].default_value = 0.0
at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'flame'; at.label = 'Пламя'
ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.label = 'Пламя: цвет'
mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = 22.0; mul.label = 'Пламя: сила'
nt.links.new(at.outputs['Fac'], ramp.inputs['Fac']); nt.links.new(at.outputs['Fac'], mul.inputs[0])
nt.links.new(ramp.outputs['Color'], pv.inputs['Emission Color']); nt.links.new(mul.outputs['Value'], pv.inputs['Emission Strength'])
w = bpy.data.worlds.new('World'); sc.world = w; w.use_nodes = True
# камера: ортогональная, 15° сверху, кадр 16 м вокруг центра облака (низ клуба не срезан)
cam = bpy.data.objects.new('Камера', bpy.data.cameras.new('Камера')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = (36.0 if KIND == 'jetsg2' else 22.0 if JE else 16.0 if BU else 19.0 if BI else 22.0) * G
tgt = Vector((0, 0, (10.0 if KIND == 'jetsg2' else 6.0 if JG else 3.0 if JE else 1.5 if BU else 4.0 if BI else 3.5) * G)); el = math.radians(15); d = 80 * G
cam.location = tgt + Vector((0, -d * math.cos(el), d * math.sin(el))); cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler(); cam.data.clip_end = 400
sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = PX
sc.cycles.samples = 64; sc.cycles.use_denoising = True; sc.cycles.volume_bounces = 1; sc.cycles.max_bounces = 4; sc.cycles.volume_step_rate = 0.5  # шаг мельче - видна мелкая фактура
bpy.ops.wm.save_as_mainfile(filepath=path)
print('сцена клуба', path, flush=True)
