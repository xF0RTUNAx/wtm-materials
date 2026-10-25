# «Кинжал» (Х-47М2) — проверка и сдача: статистика, превью, крупные планы, экспорт, паспорт (по образцу ../AIM-120 и ../9М79). Запускается ПОСЛЕ build.py и bake.py в той же сессии:
#   KNZ_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# Что получается: kinzhal.glb — для игры (плоский, текстуры 512, без анимации); kinzhal_sketchfab.glb — для Sketchfab (полные текстуры); kinzhal.blend — сцена целиком; превью; ПАСПОРТ.json и ОТЧЁТ.json.
# KNZ_PREV=fast — превью в EEVEE без пола и неба.
import os, sys, math, json
sys.dont_write_bytecode = True
import bpy
import modelkit as mk                                   # build.py уже подключил библиотеку и построил модель
from mathutils import Vector, Matrix

OUT = os.environ.get('KNZ_OUT')
if not OUT: raise SystemExit('Задай KNZ_OUT=<папка модели>: сюда пишутся превью, экспорт и паспорт')
GAME_TEX, GAME_NTEX = int(os.environ.get('KNZ_GAME_TEX', '512')), int(os.environ.get('KNZ_GAME_NTEX', '512'))
SKETCH_TEX = int(os.environ.get('KNZ_TEX', '2048'))
PREV = os.environ.get('KNZ_PREV', 'cycles')
sc = bpy.data.scenes['KINZHAL']
st = mk.stats()
YC = -7.194 / 2.0                                       # Y хвоста; точка x (м от хвоста) → Y = x + YC


def Y(x): return x + YC


views = [('превью_1_общий.png', Vector((0, 0.0, 0)), (-0.50, -0.80, 0.32), 10.4),
         ('превью_2_сбоку.png', Vector((0, 0.0, 0)), (1.0, 0.0, 0.34), 12.4),
         ('превью_3_хвост.png', Vector((0, Y(1.15), 0)), (-0.55, -0.80, 0.34), 4.4),
         ('превью_4_нос.png', Vector((0, Y(5.9), 0)), (0.65, 0.75, 0.30), 5.4)]
closeups = [('хвост_рули.png', Vector((0, Y(0.95), 0)), (-0.60, -0.70, 0.30), 3.6),
            ('торец_хвоста.png', Vector((0, Y(0.0), 0)), (-0.35, -1.0, 0.18), 2.6),
            ('большой_руль.png', Vector((0.15, Y(1.45), 0.55)), (0.90, 0.20, 0.50), 3.1),
            ('короб_сверху.png', Vector((0, Y(2.95), 0.45)), (0.60, -0.50, 0.70), 2.9),
            ('щели_низ.png', Vector((0, Y(3.55), -0.35)), (0.45, 0.25, -0.85), 3.0),
            ('конус_стык.png', Vector((0, Y(3.9), 0)), (0.60, 0.60, 0.40), 3.1),
            ('кончик_носа.png', Vector((0, Y(6.65), 0)), (0.50, 0.70, 0.30), 2.4),
            ('лючок_корпус.png', Vector((-0.33, Y(1.42), -0.33)), (-0.75, 0.05, -0.65), 1.45)]


def previews_studio(outdir, size, vws, samples=64):
    """Превью в Cycles: серо-голубая студия (тёмный пол принимает мягкую тень — белая ракета не сливается с фоном), солнце с боку-сверху от камеры."""
    sys.path.insert(0, '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/_инструменты')
    import gpu_setup
    sc.render.engine = 'CYCLES'; gpu_setup.use_gpu(sc); sc.cycles.samples = samples
    try: sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    except Exception as e: print('шумодав:', e)
    sc.render.film_transparent = False; sc.render.image_settings.color_mode = 'RGB'
    try: sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
    except Exception as e: print('вид:', e)
    w = bpy.data.worlds.get('KNZ_studio') or bpy.data.worlds.new('KNZ_studio'); sc.world = w
    try: w.use_nodes = True
    except Exception: pass
    wn = w.node_tree
    for n in list(wn.nodes): wn.nodes.remove(n)
    bg = wn.nodes.new('ShaderNodeBackground'); bg.inputs['Color'].default_value = (0.58, 0.63, 0.70, 1); bg.inputs['Strength'].default_value = 0.95
    wo = wn.nodes.new('ShaderNodeOutputWorld'); wn.links.new(bg.outputs['Background'], wo.inputs['Surface'])
    if bpy.data.objects.get('KNZ_floor') is None:
        fm = bpy.data.materials.new('KNZ_floor'); fm.use_nodes = True; fp = next(n for n in fm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        fp.inputs['Base Color'].default_value = (0.30, 0.31, 0.33, 1); fp.inputs['Roughness'].default_value = 0.9
        me = bpy.data.meshes.new('KNZ_floor'); me.from_pydata([(-80, -80, -1.15), (80, -80, -1.15), (80, 80, -1.15), (-80, 80, -1.15)], [], [(0, 1, 2, 3)]); me.materials.append(fm)
        fo = bpy.data.objects.new('KNZ_floor', me); sc.collection.objects.link(fo)
    sunl = bpy.data.objects.get('KNZ_sunS')
    if sunl is None:
        sd = bpy.data.lights.new('KNZ_sunS', 'SUN'); sunl = bpy.data.objects.new('KNZ_sunS', sd); sc.collection.objects.link(sunl)
    sunl.data.energy = 2.8; sunl.data.angle = math.radians(2.5); sunl.data.color = (1.0, 0.97, 0.92)
    for o in sc.objects:
        if o.type == 'LIGHT' and o is not sunl: o.hide_render = True
    cam = mk._camera(); cam.data.type = 'PERSP'; cam.data.lens = 50; cam.data.clip_start, cam.data.clip_end = 0.02, 300
    out = []
    for name, tgt, d, dist in vws:
        dv = Vector(d).normalized(); cam.location = Vector(tgt) + dv * dist
        cam.rotation_euler = (Vector(tgt) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        hz = Vector((dv.x, dv.y, 0.0)).normalized(); hz = Matrix.Rotation(math.radians(38), 3, 'Z') @ hz
        frm = hz * math.cos(math.radians(50)) + Vector((0, 0, math.sin(math.radians(50))))
        sunl.rotation_euler = (-frm).to_track_quat('-Z', 'Y').to_euler()
        out.append(mk._render(os.path.join(outdir, name), size[0], size[1]))
    return out


def previews_cleanup():
    for nm in ('KNZ_floor', 'KNZ_sunS'):
        o = bpy.data.objects.get(nm)
        if o is not None:
            d = o.data; bpy.data.objects.remove(o, do_unlink=True)
            if d is not None and d.users == 0: (bpy.data.meshes if nm == 'KNZ_floor' else bpy.data.lights).remove(d)


os.makedirs(OUT + '/снимки', exist_ok=True)
if PREV == 'fast':
    prev = [os.path.basename(p) for p in mk.previews(OUT, views=views, bg=(0.58, 0.63, 0.70))]
    mk.previews(OUT + '/снимки', size=(1600, 900), bg=(0.58, 0.63, 0.70), views=closeups)
else:
    prev = [os.path.basename(p) for p in previews_studio(OUT, (1920, 1080), views)]
    previews_studio(OUT + '/снимки', (1600, 900), closeups)
    previews_cleanup()

# игровой файл: плоский, с облегчёнными текстурами (цвет JPEG, нормали PNG), без карты ORM (игра берёт постоянные значения), без анимации
gm = [m for m in bpy.data.materials if m.name.startswith('KNZ_') and m.node_tree and any(n.type == 'TEX_IMAGE' for n in m.node_tree.nodes)]
full = {}
lc = bpy.data.images.load(OUT + f'/kinzhal_detail_{GAME_TEX}.jpg', check_existing=False); lc.colorspace_settings.name = 'sRGB'
ln = bpy.data.images.load(OUT + f'/kinzhal_normal_{GAME_NTEX}.png', check_existing=False); ln.colorspace_settings.name = 'Non-Color'
for m in gm:
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image is not None:
            full[(m.name, nd.name)] = nd.image; nd.image = ln if 'normal' in nd.image.name.lower() else lc
RM_GAME = {'KNZ_body': (0.62, 0.0), 'KNZ_fin': (0.64, 0.0), 'KNZ_dark': (0.90, 0.0), 'KNZ_steel': (0.55, 0.45)}
orm_links = []
for m in gm:
    pr = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for sock in ('Roughness', 'Metallic'):
        for l in list(pr.inputs[sock].links):
            fr, to = l.from_socket, l.to_socket; m.node_tree.links.remove(l); orm_links.append((m.node_tree, fr, to))
    if m.name in RM_GAME: pr.inputs['Roughness'].default_value, pr.inputs['Metallic'].default_value = RM_GAME[m.name]
mk.export(OUT + '/kinzhal.glb', None)
for nt_, fr, to in orm_links: nt_.links.new(fr, to)
for m in gm:
    for nd in m.node_tree.nodes:
        if (m.name, nd.name) in full: nd.image = full[(m.name, nd.name)]
bpy.data.images.remove(lc); bpy.data.images.remove(ln)

# файл для Sketchfab (полные текстуры) и итоговый .blend
vl = bpy.context.view_layer; vl.update()
for o in vl.objects: o.select_set(False)
sel = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('KNZ_')]
for o in sel: o.select_set(True)
vl.objects.active = sel[0]
# НЕ оборачивать экспортёр в temp_override (в Blender 5.2.2 это роняет программу)
bpy.ops.export_scene.gltf(filepath=OUT + '/kinzhal_sketchfab.glb', export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_image_format='JPEG', export_jpeg_quality=90,
                          export_materials='EXPORT', export_cameras=False, export_lights=False, export_normals=True)
bpy.data.libraries.write(OUT + '/kinzhal.blend', {sc}, fake_user=True)

SPAN = st['span_m']
mk.passport(OUT + '/ПАСПОРТ.json', key='w_kinzhal', weapon='kinzhal', name='Х-47М2 «Кинжал»', name_en='Kh-47M2 Kinzhal', glb='kinzhal.glb', blend='kinzhal.blend',
    build=['build.py', 'bake.py', 'deliver.py'], previews_=prev,
    sketchfab={'title': 'Kh-47M2 Kinzhal Missile (Low Poly, Textured)',
               'lead': 'Kh-47M2 Kinzhal air-launched ballistic missile: long conical nose with a ring seam, cylindrical body, tapered tail section, two sets of clipped-delta stabilizers in a plus layout, a dorsal cable duct, panel slots and white paint.',
               'parts': ['body with nose cone, seams and panel slots', 'four large and four small stabilizers with oval access covers', 'dorsal duct, round hatches and screws'],
               'tags': ['kinzhal', 'kh-47m2', 'kh47m2', 'missile', 'ballistic', 'russian', 'mig-31', 'military', 'lowpoly', 'game-ready', 'blender'],
               'dimensions': f"approx. length {st['length_m']:.2f} m, body diameter 0.93 m, stabilizer span {SPAN:.2f} m tip to tip",
               'textures': f'{SKETCH_TEX} px baked colour, ORM and normal maps',
               'animation': 'none (static)',
               'glb': 'kinzhal_sketchfab.glb'},
    notes='Ревизия 1 (2026-10-25): по трём картинкам Mark (Свои/Кинжал/): 1 — фото носа и оперения (тёмно-серая окраска, овальные лючки на рулях, круглый лючок, швы), 2 — МиГ-31К с белой ракетой (весь профиль, хвост, две пары рулей, щели), '
          '3 — серый рендер (длинный конус с кольцом у кончика, продольный короб сверху, щели-«двойки»). Длина 7,194 м — как у прежней игровой модели w_kinzhal (правило сборщика), Ø 0,93 м (отношение 7,7 — по фото 2). '
          'Оси: метры, нос +Y (в glTF −Z), начало — середина длины, ось — Y; верх +Z — сторона подвески (продольный короб), щели — на нижнем боку. Доли длины от хвоста (фото 2, вдоль оси): стык конуса с цилиндром 0,54 (фото — 0,56, рендер — 0,52), '
          'хвостовая часть — усечённый конус с плоским торцом до 0,13 длины (закругление ≈ 11°, не ступенька: так на фото 2), большие рули — на 0,14…0,26 (корень 0,86 м, высота 0,52 м), малые — на 0,04…0,12, короб сверху 0,27…0,54. '
          'Рули — «+», два комплекта (по фото 1 и 2: на фото 2 видны две пары, разнесённые вдоль оси). Объекты: KNZ_body (корпус и конус — полосы ring_uv: цилиндр и конус рядом), KNZ_fins (восемь рулей, смарт-проекция), '
          'KNZ_hw (короб, лючки, винты, овалы на рулях — плоские материалы без развёртки). Щели и тон кончика запечены в цвет и рельеф по координатам модели. Окраска белая (фото 2); на фото 1 ракета тёмно-серая — другая окраска по слову Mark. '
          'Не сделано: чёрный глянцевый клин у корня ближнего руля (фото 1 — похоже на тень/уплотнение), белый фланец у плеча на фото 1 (по фото 2 это не часть ракеты), мелкие надписи. '
          'В игру: пока не ставилась; ключ w_kinzhal, оружие kinzhal, нос −Z; масштаб по прежней длине 7,194 м.')
# в паспорт — размеры текстур для prepare.js (как у Х-55 и других оружий с текстурами)
pp = OUT + '/ПАСПОРТ.json'
P = json.load(open(pp, encoding='utf-8')); P['tex'] = GAME_TEX; P['nTex'] = GAME_NTEX
json.dump(P, open(pp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT)
