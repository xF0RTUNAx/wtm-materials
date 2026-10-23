# Сцена симуляции взрыва (Mantaflow, газ: огонь + дым) по типу боевой части — для раскадровок «Воздушного превосходства».
#   blender -b -P scene.py -- <тип> <файл.blend>        (или из открытого Blender: exec, задав ARGS = [тип, файл])
# Затем: bake.py (запечь), render.py (кадры), sheet.js (лист → games/airdef/fx). Подбор — по съёмкам подрывов (Mark 2026-10-23: «физически
# правдоподобно, чтобы не смотрелось нелепо»): вспышка и огненный шар — доли секунды, дальше тёмный дым тротила, горячий газ поднимается «грибом»;
# у наземных — стелющаяся волна пыли (плотная, без жара — не всплывает), бурый столб выброса грунта и комья по баллистическим дугам с тёмными
# шлейфами земли; у воздушных — без земли: шар и чёрный дым (у самолёта — горящее топливо дольше и падающие обломки со шлейфами).
# Масштаб s — от «тяжёлой» (ФАБ-500 / Mk 84): длины × s, скорости × √s, время × √s (подобие по Фруду: всплытие и падение комьев — от тяжести).
import bpy, sys, os, math
from mathutils import Vector

T = {
    #            s     кадры  земля  столб  комья пыль  огонь (горение: больше — быстрее гаснет)  ref — радиус поражения игры, под который снято
    'light':     dict(s=0.32, n=96, ground=True, column=False, ej=8, dust=True, burn=1.5, fuel=1.6, ref=12),   # НАР, ПТУР, лёгкие ракеты
    'medium':    dict(s=0.68, n=120, ground=True, column=True, ej=14, dust=True, burn=1.3, fuel=1.8, ref=32),    # Mk 82, ОФАБ-250, крылатые ракеты
    'heavy':     dict(s=1.0, n=144, ground=True, column=True, ej=18, dust=True, burn=1.2, fuel=2.0, ref=47),     # ФАБ-500, Mk 84, 1000 lb, баллистика
    'super':     dict(s=1.7, n=192, ground=True, column=True, ej=28, dust=True, burn=1.4, fuel=1.6, ref=74, dirt=1.5), # ФАБ-1500, GBU-57: грунт важнее огня
    'air':       dict(s=0.36, n=96, ground=False, column=False, ej=0, dust=False, burn=1.4, fuel=1.6, ref=14),  # подрыв ЗУР: вспышка и чёрный клуб
    'plane':     dict(s=0.7, n=120, ground=False, column=False, ej=14, dust=False, burn=0.55, fuel=3.2, ref=26), # сбитый самолёт: топливо горит дольше, обломки
}

def build(kind, path):
    P = T[kind]; s = P['s']; v = math.sqrt(s)
    bpy.ops.wm.read_homefile(use_empty=True)
    sc = bpy.context.scene; sc.render.fps = 24; sc.frame_start = 1; sc.frame_end = P['n']
    try: sc.render.engine = 'CYCLES'
    except TypeError: pass
    try: sc.view_settings.view_transform = 'Standard'
    except TypeError: pass
    cache = os.path.join(os.path.dirname(path), f'cache_{kind}')
    # заряд
    z0 = 3 * s if P['ground'] else 0
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=4.0 * s, location=(0, 0, z0))
    em = bpy.context.active_object; em.name = 'Заряд'
    if P['ground']: em.scale = (1.6, 1.6, 1.3)
    bpy.ops.object.quick_smoke(style='BOTH')
    dom = next(o for o in bpy.data.objects if o.modifiers and o.modifiers[0].type == 'FLUID' and o.modifiers[0].fluid_type == 'DOMAIN'); dom.name = 'Область'
    W, H = 120 * s, 160 * s  # длинная симуляция (облако расплывается и рассеивается само, Mark: «резко исчезают») — область больше
    if P['ground']: dom.location = (0, 0, H / 2)
    else: W, H = 110 * s, 110 * s; dom.location = (0, 0, H * 0.12)
    dom.scale = (1, 1, 1); dom.dimensions = (W, W, H); bpy.context.view_layer.update()
    ds = dom.modifiers[0].domain_settings
    ds.resolution_max = 192; ds.use_noise = True; ds.noise_scale = 2; ds.noise_strength = 1.0; ds.noise_pos_scale = 2.0
    ds.cache_type = 'ALL'; ds.cache_directory = cache; ds.cache_frame_start = 1; ds.cache_frame_end = P['n']
    # адаптивная область: считается только участок с дымом + запас (взрыв первую секунду занимает малую часть куба — в 2–3 раза быстрее)
    ds.use_adaptive_domain = True; ds.adapt_margin = 16; ds.adapt_threshold = 0.004; ds.use_collision_border_bottom = P['ground']  # запас 16 — быстрый столб не обгоняет границу (проверено: как без адаптивной)
    for b in ('front', 'back', 'left', 'right', 'top'): setattr(ds, 'use_collision_border_' + b, False)
    if not P['ground']: ds.use_collision_border_bottom = False
    ds.alpha = -0.15; ds.beta = 16.0 if P['ground'] else 6.0; ds.vorticity = 0.45; ds.flame_vorticity = 1.0
    ds.burning_rate = P['burn']; ds.flame_ignition = 1.5; ds.flame_max_temp = 3.0; ds.flame_smoke = 1.2; ds.flame_smoke_color = (0.3, 0.28, 0.26) if kind != 'plane' else (0.09, 0.085, 0.08)
    ds.use_dissolve_smoke = True; ds.dissolve_speed = int(220 * v); ds.use_dissolve_smoke_log = True  # медленнее: облако тает постепенно
    ds.use_adaptive_timesteps = True; ds.timesteps_min = 1; ds.timesteps_max = 10; ds.time_scale = 1.0
    fs = em.modifiers[0].flow_settings
    fs.flow_type = 'BOTH'; fs.flow_behavior = 'INFLOW'; fs.fuel_amount = P['fuel']; fs.temperature = 6; fs.density = 1.0
    fs.smoke_color = (0.24, 0.21, 0.18) if kind != 'plane' else (0.08, 0.075, 0.07); fs.subframes = 3; fs.surface_distance = 1.5 * s
    fs.use_initial_velocity = True; fs.velocity_normal = 120 * v; fs.velocity_coord = (0, 0, (35 if P['ground'] else 4) * v); fs.velocity_factor = 1.0
    on = 3 if kind != 'plane' else 6
    key(fs, 1, True); key(fs, on, True); key(fs, on + 1, False); em.hide_render = True
    if P.get('dirt'): fs.fuel_amount = P['fuel']
    if P['dust']:  # стелющаяся волна пыли
        bpy.ops.mesh.primitive_torus_add(major_radius=8 * s, minor_radius=1.6 * s, location=(0, 0, 1.4 * s))
        du = bpy.context.active_object; du.name = 'Пыль'; du.hide_render = True
        f2 = flow(du, 'SMOKE', 5.0 * P.get('dirt', 1), (0.7, 0.64, 0.54), 0.2)
        f2.use_initial_velocity = True; f2.velocity_normal = 45 * v; f2.velocity_coord = (0, 0, 4 * v); f2.velocity_factor = 1.0; f2.subframes = 2
        key(f2, 1, False); key(f2, 2, True); key(f2, 12, True); key(f2, 13, False)
    if P['column']:  # столб выброса грунта
        bpy.ops.mesh.primitive_cylinder_add(radius=3 * s, depth=4 * s, location=(0, 0, 2 * s))
        st = bpy.context.active_object; st.name = 'Столб'; st.hide_render = True
        f3 = flow(st, 'SMOKE', 4.0 * P.get('dirt', 1), (0.34, 0.27, 0.19), 3.0)  # горячий грунт и газ — всплывает столбом с «шапкой»
        f3.use_initial_velocity = True; f3.velocity_normal = 10 * v; f3.velocity_coord = (0, 0, 110 * v); f3.velocity_factor = 1.0; f3.subframes = 3
        key(f3, 1, False); key(f3, 2, True); key(f3, 9, True); key(f3, 10, False)
    if P['ej']:  # комья (наземные) / обломки (самолёт) по дугам, каждый тянет шлейф
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=2.5 * s, location=(0, 0, 1.5 * s if P['ground'] else 0))
        ej = bpy.context.active_object; ej.name = 'Выброс'; ej.hide_render = True
        ej.modifiers.new('Комья', 'PARTICLE_SYSTEM'); ps = ej.particle_systems[0]; stt = ps.settings
        # комья: ≈ 30 м/с, взлёт на 25–35 м, шлейф — первые ≈ 0,7 с, разной толщины (одинаковые длинные струи — «ёж», так не бывает: грунт падает и оседает)
        stt.count = P['ej']; stt.frame_start = 1; stt.frame_end = 3; stt.lifetime = int(16 * v) if P['ground'] else P['n']; stt.emit_from = 'FACE'; stt.use_emit_random = True
        stt.normal_factor = 22 * v if P['ground'] else 30 * v; stt.factor_random = 14 * v; stt.particle_size = 1.6 * s; stt.size_random = 0.7; stt.object_align_factor = (0, 0, (22 if P['ground'] else 6) * v)
        stt.physics_type = 'NEWTON'; stt.mass = 1; stt.effector_weights.gravity = 1.0; stt.drag_factor = 0.25; stt.render_type = 'NONE'
        fm = ej.modifiers.new('Fluid', 'FLUID'); fm.fluid_type = 'FLOW'; f4 = fm.flow_settings
        f4.flow_type = 'SMOKE' if P['ground'] else 'BOTH'; f4.flow_behavior = 'INFLOW'
        f4.flow_source = 'PARTICLES'; f4.particle_system = ps; f4.use_particle_size = True; f4.particle_size = 1.6 * s
        f4.density = 0.5 * P.get('dirt', 1); f4.smoke_color = (0.3, 0.25, 0.19) if P['ground'] else (0.07, 0.065, 0.06); f4.temperature = 0.0 if P['ground'] else 1.0
        f4.fuel_amount = 0.6; f4.subframes = 2; f4.use_initial_velocity = True; f4.velocity_factor = 0.6
    # материал объёма: плотность, цвет дыма из симуляции, пламя — излучение по полю flame
    m = dom.active_material; nt = m.node_tree; pv = next(n for n in nt.nodes if n.type == 'PRINCIPLED_VOLUME')
    pv.inputs['Color'].default_value = (1, 1, 1, 1); pv.inputs['Color Attribute'].default_value = 'color'; pv.inputs['Density'].default_value = 1.5; pv.inputs['Blackbody Intensity'].default_value = 0.0  # 3 — облако непрозрачное, свет только в тонком слое: почти чёрное
    at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'flame'; at.label = 'Пламя'
    ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.label = 'Пламя: цвет'; cr = ramp.color_ramp
    cr.elements[0].position = 0.0; cr.elements[0].color = (0.25, 0.02, 0.0, 1); cr.elements[1].position = 1.0; cr.elements[1].color = (1.0, 0.92, 0.6, 1)
    e = cr.elements.new(0.35); e.color = (0.9, 0.22, 0.02, 1); e = cr.elements.new(0.65); e.color = (1.0, 0.55, 0.1, 1)
    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = 22.0; mul.label = 'Пламя: сила'
    nt.links.new(at.outputs['Fac'], ramp.inputs['Fac']); nt.links.new(at.outputs['Fac'], mul.inputs[0])
    nt.links.new(ramp.outputs['Color'], pv.inputs['Emission Color']); nt.links.new(mul.outputs['Value'], pv.inputs['Emission Strength'])
    # свет: солнце сбоку-спереди, рассеянный — серый (голубое небо давало тёмному дыму сиреневый оттенок; в игре дым освещают небо и солнце карты)
    sun = bpy.data.objects.new('Солнце', bpy.data.lights.new('Солнце', 'SUN')); sc.collection.objects.link(sun)
    sun.data.energy = 5.0; sun.rotation_euler = (math.radians(50), 0, math.radians(-40))
    w = bpy.data.worlds.new('World'); sc.world = w; w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs[0].default_value = (0.5, 0.5, 0.5, 1); bg.inputs[1].default_value = 0.8
    # камера: ортогональная, сверху 30° (наземные) / 15° (воздушные) — как видит лётчик
    cam = bpy.data.objects.new('Камера', bpy.data.cameras.new('Камера')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 140 * s if P['ground'] else 110 * s
    tgt = Vector((0, 0, 58 * s if P['ground'] else 0)); el = math.radians(30 if P['ground'] else 15); d = 300 * s
    cam.location = tgt + Vector((0, -d * math.cos(el), d * math.sin(el))); cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.clip_end = d * 3
    sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = 512
    sc.cycles.samples = 96; sc.cycles.use_denoising = True; sc.cycles.volume_bounces = 1; sc.cycles.max_bounces = 4; sc.cycles.volume_step_rate = 1.0
    sc.cycles.sample_clamp_indirect = 0.5  # белые точки («светлячки») в дыме от рассеянного света
    bpy.ops.wm.save_as_mainfile(filepath=path)
    print('сцена', kind, path, flush=True)

# пожар (горящий объект, минуты): горит пятно топлива, над ним — плотный столб тёмного дыма. Снимается долго (240 кадров), в лист идёт
# установившийся участок с бесшовной петлёй (sheet.js --loop): в игре — одна-две картинки вместо сотен частиц дыма (нагрузка)
def build_burn(path):
    bpy.ops.wm.read_homefile(use_empty=True)
    sc = bpy.context.scene; sc.render.fps = 24; sc.frame_start = 1; sc.frame_end = 360  # 15 с: с ~10 с столб установившийся (петля из кадров 240–358)
    try: sc.render.engine = 'CYCLES'
    except TypeError: pass
    try: sc.view_settings.view_transform = 'Standard'
    except TypeError: pass
    # Сцена в 4 раза меньше игровой (2026-10-23, черновики 128 вокселей): в полном размере (очаг 10 м, область 80 × 200 м) дым расползался горой
    # и упирался в стенки — завихрения Mantaflow считаются в клетках, а всплытие — в метрах, и в большой области всплытие слабее завихрений.
    # В игру — game_scale: кадр в метрах × 4, время × √4 (подобие по Фруду, как у взрывов — render.py)
    G = 0.25; sc['game_scale'] = 1 / G
    bpy.ops.mesh.primitive_cylinder_add(radius=5.0 * G, depth=1.0 * G, location=(0, 0, 0.6 * G))
    em = bpy.context.active_object; em.name = 'Очаг'
    bpy.ops.object.quick_smoke(style='BOTH')
    dom = next(o for o in bpy.data.objects if o.modifiers and o.modifiers[0].type == 'FLUID' and o.modifiers[0].fluid_type == 'DOMAIN'); dom.name = 'Область'
    dom.location = (0, 0, 100 * G); dom.scale = (1, 1, 1); dom.dimensions = (128 * G, 128 * G, 200 * G); bpy.context.view_layer.update()  # шире кадра (21 м) в 1,5 раза: дым не касается стенок (прямые края)
    ds = dom.modifiers[0].domain_settings
    ds.resolution_max = 256; ds.use_noise = True; ds.noise_scale = 2; ds.noise_strength = 1.0; ds.noise_pos_scale = 2.0
    ds.cache_type = 'ALL'; ds.cache_directory = os.path.join(os.path.dirname(path), 'cache_burn'); ds.cache_frame_start = 1; ds.cache_frame_end = 360
    ds.use_adaptive_domain = True; ds.adapt_margin = 16; ds.adapt_threshold = 0.0005  # 0,004 подрезало тонкую верхушку столба
    for b in ('front', 'back', 'left', 'right', 'top'): setattr(ds, 'use_collision_border_' + b, False)
    ds.use_collision_border_bottom = True
    # всплытие: beta у Blender не больше 5 (10 молча становилось 5 — купол); добирают жар (пламя до 8, очаг 10) и всплытие по плотности дыма (alpha 1);
    # завихрения слабые — иначе столб разваливается вширь
    ds.alpha = 1.0; ds.beta = 5.0; ds.vorticity = 0.1; ds.flame_vorticity = 0.3
    ds.burning_rate = 0.9; ds.flame_ignition = 1.4; ds.flame_max_temp = 8.0; ds.flame_smoke = 1.8; ds.flame_smoke_color = (0.08, 0.075, 0.07)  # горит топливо — чёрный дым
    ds.use_dissolve_smoke = True; ds.dissolve_speed = 250; ds.use_dissolve_smoke_log = True  # верх столба тает мягко (без среза), форма с 10 с не меняется
    ds.use_adaptive_timesteps = True; ds.timesteps_min = 1; ds.timesteps_max = 6
    fs = em.modifiers[0].flow_settings
    fs.flow_type = 'BOTH'; fs.flow_behavior = 'INFLOW'; fs.fuel_amount = 1.2; fs.temperature = 10.0; fs.density = 0.8; fs.smoke_color = (0.08, 0.075, 0.07)
    fs.use_initial_velocity = True; fs.velocity_coord = (0, 0, 12 * G); fs.velocity_factor = 1.0; fs.subframes = 1; fs.surface_distance = 1.0
    em.hide_render = True
    # без ветра: столб вертикальный (ветер 120 положил пламя набок и выдул дым за край области); в игре его сносит ветер карты
    m = dom.active_material; nt = m.node_tree; pv = next(n for n in nt.nodes if n.type == 'PRINCIPLED_VOLUME')
    pv.inputs['Color'].default_value = (1, 1, 1, 1); pv.inputs['Color Attribute'].default_value = 'color'; pv.inputs['Density'].default_value = 3.0; pv.inputs['Blackbody Intensity'].default_value = 0.0
    at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'flame'; at.label = 'Пламя'
    ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.label = 'Пламя: цвет'
    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = 22.0; mul.label = 'Пламя: сила'
    nt.links.new(at.outputs['Fac'], ramp.inputs['Fac']); nt.links.new(at.outputs['Fac'], mul.inputs[0])
    nt.links.new(ramp.outputs['Color'], pv.inputs['Emission Color']); nt.links.new(mul.outputs['Value'], pv.inputs['Emission Strength'])
    sun = bpy.data.objects.new('Солнце', bpy.data.lights.new('Солнце', 'SUN')); sc.collection.objects.link(sun)
    sun.data.energy = 4.0; sun.rotation_euler = (math.radians(50), 0, math.radians(-40))
    w = bpy.data.worlds.new('World'); sc.world = w; w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs[0].default_value = (0.5, 0.5, 0.5, 1); bg.inputs[1].default_value = 0.8
    cam = bpy.data.objects.new('Камера', bpy.data.cameras.new('Камера')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 160 * G; cam.data.clip_end = 2000  # столб с верхушкой ≈ 30 м (× 4 в игре) — в кадре с запасом
    tgt = Vector((0, 0, 76 * G)); el = math.radians(15); d = 400 * G
    cam.location = tgt + Vector((0, -d * math.cos(el), d * math.sin(el))); cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.film_transparent = True; sc.render.resolution_x = 256; sc.render.resolution_y = 512
    sc.cycles.samples = 96; sc.cycles.use_denoising = True; sc.cycles.volume_bounces = 1; sc.cycles.max_bounces = 4; sc.cycles.sample_clamp_indirect = 0.5
    bpy.ops.wm.save_as_mainfile(filepath=path)
    print('сцена burn', path, flush=True)

def key(fs, f, on): fs.use_inflow = on; fs.keyframe_insert('use_inflow', frame=f)
def flow(o, kind, dens, col, temp):
    m = o.modifiers.new('Fluid', 'FLUID'); m.fluid_type = 'FLOW'; f = m.flow_settings
    f.flow_type = kind; f.flow_behavior = 'INFLOW'; f.density = dens; f.smoke_color = col; f.temperature = temp; return f

if __name__ == '__main__':
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else globals().get('ARGS')
    (build_burn(a[1]) if a[0] == 'burn' else build(a[0], a[1]))
