# PrSM — проверка и сдача: статистика, превью, крупные планы, экспорт, паспорт (по образцу ../Кинжал и ../AIM-120). Запускается ПОСЛЕ build.py и bake.py в той же сессии:
#   PSM_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# Что получается: prsm.glb — для игры (плоский, текстуры 512, без анимации); prsm_sketchfab.glb — для Sketchfab (полные текстуры); prsm.blend — сцена целиком; превью; ПАСПОРТ.json и ОТЧЁТ.json.
# PSM_PREV=fast — превью в EEVEE без пола и неба.
import os, sys, math, json
sys.dont_write_bytecode = True
import bpy
import modelkit as mk                                   # build.py уже подключил библиотеку и построил модель
from mathutils import Vector, Matrix

OUT = os.environ.get('PSM_OUT')
if not OUT: raise SystemExit('Задай PSM_OUT=<папка модели>: сюда пишутся превью, экспорт и паспорт')
GAME_TEX, GAME_NTEX = int(os.environ.get('PSM_GAME_TEX', '512')), int(os.environ.get('PSM_GAME_NTEX', '512'))
SKETCH_TEX = int(os.environ.get('PSM_TEX', '2048'))
PREV = os.environ.get('PSM_PREV', 'cycles')
sc = bpy.data.scenes['PRSM']
st = mk.stats()
Dm = 0.504; Lm = 8.4 * Dm
YC = -Lm / 2.0                                          # Y торца; точка x (м от торца) → Y = x + YC


def Y(x): return x + YC


views = [('превью_1_общий.png', Vector((0, 0.0, 0)), (-0.45, -0.85, 0.30), 7.4),
         ('превью_2_сбоку.png', Vector((0, 0.0, 0)), (1.0, 0.0, 0.10), 8.6),
         ('превью_3_хвост.png', Vector((0, Y(0.9 * Dm), 0)), (-0.55, -0.80, 0.34), 2.2),
         ('превью_4_нос.png', Vector((0, Y(7.2 * Dm), 0)), (0.65, 0.75, 0.30), 2.7)]
closeups = [('хвост_рули.png', Vector((0, Y(0.5 * Dm), 0)), (0.80, -0.55, 0.35), 1.7),
            ('сопло_торец.png', Vector((0, Y(0.0), 0)), (-0.30, -1.0, 0.15), 1.3),
            ('руль_ребро.png', Vector((0.20, Y(0.45 * Dm), 0.20)), (0.70, -0.30, 0.60), 1.1),
            ('шов_юбки_винты.png', Vector((0, Y(0.9 * Dm), 0.0)), (0.30, -0.95, 0.25), 1.2),
            ('кольцо_заклёпки.png', Vector((0, Y(3.7 * Dm), 0.0)), (1.0, -0.05, 0.25), 1.5),
            ('трафарет_A.png', Vector((0, Y(3.0 * Dm), 0.05)), (1.0, 0.0, 0.15), 1.2),
            ('основание_оживала.png', Vector((0, Y(5.3 * Dm), 0.0)), (0.85, 0.45, 0.25), 1.6),
            ('лента_нос.png', Vector((0, Y(Lm / Dm * Dm - 2.5 * Dm), 0.0)), (0.70, 0.60, 0.35), 1.7),
            ('кончик_конус.png', Vector((0, Y(Lm - 0.5 * Dm), 0)), (0.50, 0.70, 0.30), 1.0)]


def previews_studio(outdir, size, vws, samples=64):
    """Превью в Cycles: серо-голубая студия (тёмный пол принимает мягкую тень), солнце с боку-сверху от камеры."""
    sys.path.insert(0, '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/_инструменты')
    import gpu_setup
    sc.render.engine = 'CYCLES'; gpu_setup.use_gpu(sc); sc.cycles.samples = samples
    try: sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    except Exception as e: print('шумодав:', e)
    sc.render.film_transparent = False; sc.render.image_settings.color_mode = 'RGB'
    try: sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
    except Exception as e: print('вид:', e)
    w = bpy.data.worlds.get('PSM_studio') or bpy.data.worlds.new('PSM_studio'); sc.world = w
    try: w.use_nodes = True
    except Exception: pass
    wn = w.node_tree
    for n in list(wn.nodes): wn.nodes.remove(n)
    bg = wn.nodes.new('ShaderNodeBackground'); bg.inputs['Color'].default_value = (0.62, 0.68, 0.76, 1); bg.inputs['Strength'].default_value = 1.05
    wo = wn.nodes.new('ShaderNodeOutputWorld'); wn.links.new(bg.outputs['Background'], wo.inputs['Surface'])
    if bpy.data.objects.get('PSM_floor') is None:
        fm = bpy.data.materials.new('PSM_floor'); fm.use_nodes = True; fp = next(n for n in fm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        fp.inputs['Base Color'].default_value = (0.34, 0.35, 0.37, 1); fp.inputs['Roughness'].default_value = 0.9
        me = bpy.data.meshes.new('PSM_floor'); me.from_pydata([(-80, -80, -0.62), (80, -80, -0.62), (80, 80, -0.62), (-80, 80, -0.62)], [], [(0, 1, 2, 3)]); me.materials.append(fm)
        fo = bpy.data.objects.new('PSM_floor', me); sc.collection.objects.link(fo)
    sunl = bpy.data.objects.get('PSM_sunS')
    if sunl is None:
        sd = bpy.data.lights.new('PSM_sunS', 'SUN'); sunl = bpy.data.objects.new('PSM_sunS', sd); sc.collection.objects.link(sunl)
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
    for nm in ('PSM_floor', 'PSM_sunS'):
        o = bpy.data.objects.get(nm)
        if o is not None:
            d = o.data; bpy.data.objects.remove(o, do_unlink=True)
            if d is not None and d.users == 0: (bpy.data.meshes if nm == 'PSM_floor' else bpy.data.lights).remove(d)


os.makedirs(OUT + '/снимки', exist_ok=True)
if PREV == 'fast':
    prev = [os.path.basename(p) for p in mk.previews(OUT, views=views, bg=(0.62, 0.68, 0.76))]
    mk.previews(OUT + '/снимки', size=(1600, 900), bg=(0.62, 0.68, 0.76), views=closeups)
else:
    prev = [os.path.basename(p) for p in previews_studio(OUT, (1920, 1080), views)]
    previews_studio(OUT + '/снимки', (1600, 900), closeups)
    previews_cleanup()

# игровой файл: плоский, с облегчёнными текстурами (цвет JPEG, нормали PNG), без карты ORM (игра берёт постоянные значения), без анимации
gm = [m for m in bpy.data.materials if m.name.startswith('PSM_') and m.node_tree and any(n.type == 'TEX_IMAGE' for n in m.node_tree.nodes)]
full = {}
lc = bpy.data.images.load(OUT + f'/prsm_detail_{GAME_TEX}.jpg', check_existing=False); lc.colorspace_settings.name = 'sRGB'
ln = bpy.data.images.load(OUT + f'/prsm_normal_{GAME_NTEX}.png', check_existing=False); ln.colorspace_settings.name = 'Non-Color'
for m in gm:
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image is not None:
            full[(m.name, nd.name)] = nd.image; nd.image = ln if 'normal' in nd.image.name.lower() else lc
RM_GAME = {'PSM_body': (0.52, 0.12), 'PSM_fin': (0.55, 0.15), 'PSM_dark': (0.90, 0.0), 'PSM_steel': (0.42, 0.35)}       # без карты окружения металл в игре чернеет: металличность невысокая, цвет — запечённый
orm_links = []
for m in gm:
    pr = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for sock in ('Roughness', 'Metallic'):
        for l in list(pr.inputs[sock].links):
            fr, to = l.from_socket, l.to_socket; m.node_tree.links.remove(l); orm_links.append((m.node_tree, fr, to))
    if m.name in RM_GAME: pr.inputs['Roughness'].default_value, pr.inputs['Metallic'].default_value = RM_GAME[m.name]
mk.export(OUT + '/prsm.glb', None)
for nt_, fr, to in orm_links: nt_.links.new(fr, to)
for m in gm:
    for nd in m.node_tree.nodes:
        if (m.name, nd.name) in full: nd.image = full[(m.name, nd.name)]
bpy.data.images.remove(lc); bpy.data.images.remove(ln)

# файл для Sketchfab (полные текстуры) и итоговый .blend
vl = bpy.context.view_layer; vl.update()
for o in vl.objects: o.select_set(False)
sel = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('PSM_')]
for o in sel: o.select_set(True)
vl.objects.active = sel[0]
# НЕ оборачивать экспортёр в temp_override (в Blender 5.2.2 это роняет программу)
bpy.ops.export_scene.gltf(filepath=OUT + '/prsm_sketchfab.glb', export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_image_format='JPEG', export_jpeg_quality=90,
                          export_materials='EXPORT', export_cameras=False, export_lights=False, export_normals=True)
bpy.data.libraries.write(OUT + '/prsm.blend', {sc}, fake_user=True)

SPAN = st['span_m']
mk.passport(OUT + '/ПАСПОРТ.json', key='w_prsm', weapon='prsm', name='PrSM', name_en='PrSM Precision Strike Missile', glb='prsm.glb', blend='prsm.blend',
    build=['build.py', 'bake.py', 'deliver.py', '_текст/make_text.py'], previews_=prev,
    sketchfab={'title': 'PrSM Precision Strike Missile (Low Poly)',
               'lead': 'PrSM Precision Strike Missile: slender ballistic missile with a tangent ogive nose, olive-yellow band and dark tip cone, silver coupling ring with rivet rows, a flared tail skirt with a big nozzle bore and four trapezoidal fins in an X layout.',
               'parts': ['body with ogive nose, seams, silver ring and nozzle bore', 'four tail fins', 'rivet rows, skirt screws and fin ribs'],
               'tags': ['prsm', 'precision strike missile', 'missile', 'ballistic', 'himars', 'm270', 'army', 'usa', 'military', 'lowpoly', 'game-ready', 'blender'],
               'dimensions': f"approx. length {st['length_m']:.2f} m, body diameter {Dm:.2f} m, fin span {SPAN:.2f} m tip to tip",
               'textures': f'{SKETCH_TEX} px baked colour, ORM and normal maps',
               'animation': 'none (static)',
               'glb': 'prsm_sketchfab.glb'},
    notes='Ревизия 1 (2026-10-25): по четырём картинкам Mark (Свои/PrSM/): 1 — рендер в горах (три четверти сзади), 2 — макеты на выставке (белый макет в полный рост: плоский торец с большим соплом, шов, трапециевидные рули с ребром), '
          '3 — рендер в облаках (вид сбоку: кольца, трафарет, заклёпки, конус на кончике), 4 — фото старта с HIMARS (почти ортогональный вид сбоку). Пропорции: длина / диаметр 8,4 — по фото старта (195 пикс. при ширине 24; профиль носа замерен '
          'по строкам фото: касательный оживал 3,25 диаметра, затупленный кончик), на рендерах 1 и 3 ракета выглядит короче и толще (близкая широкоугольная камера) — они взяты только для положений колец, швов и деталей; положения вдоль оси растянуты '
          'в 1,35 раза до масштаба фото. Масштаб: у PrSM нет прежней модели в игре, поэтому длина 4,2336 м взята равной MGM-140 ATACMS в игре (w_atacms.glb 4,23 м: та же пусковая и контейнер), диаметр 0,504 м (ATACMS — 0,607 м). '
          'Оси: метры, нос +Y (в glTF −Z), начало — середина длины, ось — Y; рули «×» (45°, 135°, 225°, 315°); верх +Z; рендеры сняты со стороны +X (нос справа) — трафареты и «лицевая» сторона там. Доли от торца в диаметрах: хвостовая юбка (Ø 1,1) до 0,66 и конус до 0,93, '
          'шов на 0,95, трафарет A на 3,0, двойной ряд заклёпок 3,42/3,50, серебристое кольцо 3,55…3,84, двойной ряд 4,26/4,35 и шов 4,30, основание оживала 5,15 (шов, ряд заклёпок), жёлтая лента с центром на 5,9 (2,5 диаметра от кончика), '
          'шов конуса кончика на 7,6, кончик на 8,4. Рули: трапеция (корень 0,82 диаметра, кончик 0,30, высота над юбкой 0,53; макет даёт крупнее — корень почти во всю юбку, рендеры мельче), на юбке, с лентикулярным ребром на каждой грани. Окраска — серый металл (по рендерам), тёмный нос (по фото старта), '
          'жёлтая лента; текст на трафаретах условный (на картинках нечитаем: название и партия/номер). Объекты: PSM_body (корпус и нос — три полосы ring_uv), PSM_fins (четыре руля, смарт-проекция), PSM_hw (заклёпки, винты, рёбра рулей — плоский материал без развёртки). '
          'Рули показаны раскрытыми, как на рендерах и макете; на фото старта (в пусковом контейнере) они сложены — вариант со сложенными рулями не делался. Не сделано: карманы-вырезы приводов у корня рулей (рендер 1), мелкая надпись «лента-замок» у сопла, '
          'внутренность сопла глубже конуса. Новое оружие: в arsenal.js записи prsm пока нет (в «Мульти-волне» запад без баллистики, ATACMS — единственный), META w_prsm: { weapon: \'prsm\', lazy: true, stations: [] } и строку prepare.js добавит integrate-own.js. '
          'Если ракета в игре покажется слишком тонкой рядом с ATACMS (на рендерах 1 и 3 она толще — близкая широкоугольная камера), диаметр можно поднять в prepare.js масштабом по осям x и y — длина останется.')
# в паспорт — размеры текстур для prepare.js (как у других оружий с текстурами)
pp = OUT + '/ПАСПОРТ.json'
P = json.load(open(pp, encoding='utf-8')); P['tex'] = GAME_TEX; P['nTex'] = GAME_NTEX
json.dump(P, open(pp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT)
