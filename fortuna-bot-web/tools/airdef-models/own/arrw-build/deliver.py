# ARRW (AGM-183A) — проверка и сдача: статистика, превью, крупные планы, экспорт, паспорт (по образцу ../PrSM и ../Кинжал). Запускается ПОСЛЕ build.py и bake.py в той же сессии:
#   ARW_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# Что получается: arrw.glb — для игры (плоский, текстуры 512, без анимации); arrw_sketchfab.glb — для Sketchfab (полные текстуры); arrw.blend — сцена целиком; превью; ПАСПОРТ.json и ОТЧЁТ.json.
# ARW_PREV=fast — превью в EEVEE без пола и неба.
import os, sys, math, json
sys.dont_write_bytecode = True
import bpy
import modelkit as mk                                   # build.py уже подключил библиотеку и построил модель
from mathutils import Vector, Matrix

OUT = os.environ.get('ARW_OUT')
if not OUT: raise SystemExit('Задай ARW_OUT=<папка модели>: сюда пишутся превью, экспорт и паспорт')
GAME_TEX, GAME_NTEX = int(os.environ.get('ARW_GAME_TEX', '512')), int(os.environ.get('ARW_GAME_NTEX', '512'))
SKETCH_TEX = int(os.environ.get('ARW_TEX', '2048'))
PREV = os.environ.get('ARW_PREV', 'cycles')
sc = bpy.data.scenes['ARRW']
st = mk.stats()
Dm = 6.30 / 9.2; Lm = 6.30                              # те же числа, что в build.py
YC = -Lm / 2.0                                          # Y торца; точка x (м от торца) → Y = x + YC


def Y(x): return x + YC
def TY(t): return Y(Lm - t * Dm)                        # t диаметров от кончика → Y


views = [('превью_1_общий.png', Vector((0, 0.0, 0)), (-0.45, -0.85, 0.30), 8.6),
         ('превью_2_сбоку.png', Vector((0, 0.0, 0)), (-1.0, 0.0, 0.10), 9.0),
         ('превью_3_хвост.png', Vector((0, Y(1.1 * Dm), 0)), (-0.55, -0.80, 0.34), 3.6),
         ('превью_4_нос.png', Vector((0, TY(1.8), 0)), (-0.65, 0.75, 0.30), 3.6)]
closeups = [('хвост_рули.png', Vector((0, Y(0.7 * Dm), 0.0)), (-0.80, -0.55, 0.35), 2.2),
            ('торец_винты.png', Vector((0, Y(0.0), 0)), (-0.30, -1.0, 0.15), 1.8),
            ('руль_привод.png', Vector((-0.30, Y(0.7 * Dm), 0.30)), (-0.70, -0.30, 0.60), 1.5),
            ('кольцо_винтов_юбка.png', Vector((0, Y(1.1 * Dm), 0.0)), (-0.30, -0.95, 0.25), 1.7),
            ('проушины_подушки.png', Vector((0, TY(5.6), 0.30)), (-0.45, -0.35, 0.80), 2.0),
            ('люк_оживало.png', Vector((0, TY(3.1), 0.20)), (-0.60, 0.40, 0.70), 2.0),
            ('надпись.png', Vector((0, TY(6.7), 0.0)), (-1.0, 0.0, 0.15), 1.8),
            ('значок_шея.png', Vector((0, TY(3.0), 0.0)), (-0.85, 0.45, 0.25), 1.8),
            ('кольцо_нос.png', Vector((0, TY(1.4), 0)), (-0.70, 0.60, 0.35), 1.8),
            ('кончик.png', Vector((0, TY(0.4), 0)), (-0.50, 0.70, 0.30), 1.1)]


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
    w = bpy.data.worlds.get('zz_studio') or bpy.data.worlds.new('zz_studio'); sc.world = w
    try: w.use_nodes = True
    except Exception: pass
    wn = w.node_tree
    for n in list(wn.nodes): wn.nodes.remove(n)
    bg = wn.nodes.new('ShaderNodeBackground'); bg.inputs['Color'].default_value = (0.62, 0.68, 0.76, 1); bg.inputs['Strength'].default_value = 1.05
    wo = wn.nodes.new('ShaderNodeOutputWorld'); wn.links.new(bg.outputs['Background'], wo.inputs['Surface'])
    if bpy.data.objects.get('zz_floor') is None:
        fm = bpy.data.materials.new('zz_floor'); fm.use_nodes = True; fp = next(n for n in fm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        fp.inputs['Base Color'].default_value = (0.34, 0.35, 0.37, 1); fp.inputs['Roughness'].default_value = 0.9
        me = bpy.data.meshes.new('zz_floor'); me.from_pydata([(-80, -80, -0.68), (80, -80, -0.68), (80, 80, -0.68), (-80, 80, -0.68)], [], [(0, 1, 2, 3)]); me.materials.append(fm)
        fo = bpy.data.objects.new('zz_floor', me); sc.collection.objects.link(fo)
    sunl = bpy.data.objects.get('zz_sunS')
    if sunl is None:
        sd = bpy.data.lights.new('zz_sunS', 'SUN'); sunl = bpy.data.objects.new('zz_sunS', sd); sc.collection.objects.link(sunl)
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
    for nm in ('zz_floor', 'zz_sunS'):
        o = bpy.data.objects.get(nm)
        if o is not None:
            d = o.data; bpy.data.objects.remove(o, do_unlink=True)
            if d is not None and d.users == 0: (bpy.data.meshes if nm == 'zz_floor' else bpy.data.lights).remove(d)


os.makedirs(OUT + '/снимки', exist_ok=True)
if PREV == 'fast':
    prev = [os.path.basename(p) for p in mk.previews(OUT, views=views, bg=(0.62, 0.68, 0.76))]
    mk.previews(OUT + '/снимки', size=(1600, 900), bg=(0.62, 0.68, 0.76), views=closeups)
else:
    prev = [os.path.basename(p) for p in previews_studio(OUT, (1920, 1080), views)]
    previews_studio(OUT + '/снимки', (1600, 900), closeups)
    previews_cleanup()

# игровой файл: плоский, с облегчёнными текстурами (цвет JPEG, нормали PNG), без карты ORM (игра берёт постоянные значения), без анимации
gm = [m for m in bpy.data.materials if m.name.startswith('ARW_') and m.node_tree and any(n.type == 'TEX_IMAGE' for n in m.node_tree.nodes)]
full = {}
lc = bpy.data.images.load(OUT + f'/arrw_detail_{GAME_TEX}.jpg', check_existing=False); lc.colorspace_settings.name = 'sRGB'
ln = bpy.data.images.load(OUT + f'/arrw_normal_{GAME_NTEX}.png', check_existing=False); ln.colorspace_settings.name = 'Non-Color'
for m in gm:
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image is not None:
            full[(m.name, nd.name)] = nd.image; nd.image = ln if 'normal' in nd.image.name.lower() else lc
RM_GAME = {'ARW_body': (0.52, 0.12), 'ARW_fin': (0.55, 0.15), 'ARW_dark': (0.90, 0.0), 'ARW_steel': (0.42, 0.35)}       # без карты окружения металл в игре чернеет: металличность невысокая, цвет — запечённый
orm_links = []
for m in gm:
    pr = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for sock in ('Roughness', 'Metallic'):
        for l in list(pr.inputs[sock].links):
            fr, to = l.from_socket, l.to_socket; m.node_tree.links.remove(l); orm_links.append((m.node_tree, fr, to))
    if m.name in RM_GAME: pr.inputs['Roughness'].default_value, pr.inputs['Metallic'].default_value = RM_GAME[m.name]
mk.export(OUT + '/arrw.glb', None)
for nt_, fr, to in orm_links: nt_.links.new(fr, to)
for m in gm:
    for nd in m.node_tree.nodes:
        if (m.name, nd.name) in full: nd.image = full[(m.name, nd.name)]
bpy.data.images.remove(lc); bpy.data.images.remove(ln)

# файл для Sketchfab (полные текстуры) и итоговый .blend
vl = bpy.context.view_layer; vl.update()
for o in vl.objects: o.select_set(False)
sel = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('ARW_')]
for o in sel: o.select_set(True)
vl.objects.active = sel[0]
# НЕ оборачивать экспортёр в temp_override (в Blender 5.2.2 это роняет программу)
bpy.ops.export_scene.gltf(filepath=OUT + '/arrw_sketchfab.glb', export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_image_format='JPEG', export_jpeg_quality=90,
                          export_materials='EXPORT', export_cameras=False, export_lights=False, export_normals=True)
bpy.data.libraries.write(OUT + '/arrw.blend', {sc}, fake_user=True)

SPAN = st['span_m']
mk.passport(OUT + '/ПАСПОРТ.json', key='w_arrw', weapon='arrw', name='ARRW (AGM-183A)', name_en='AGM-183A ARRW', glb='arrw.glb', blend='arrw.blend',
    build=['build.py', 'bake.py', 'deliver.py', '_текст/make_text.py'], previews_=prev,
    sketchfab={'title': 'AGM-183A ARRW Air-Launched Missile (Low Poly)',
               'lead': 'AGM-183A ARRW: air-launched missile model for a bomber wing pylon: blunt tangent ogive nose with a blue ring, white neck band and a ring of brass screws, a long cylindrical body with two lifting lugs on dark pads, a hatch, a round emblem and large AGM-183A lettering, a second blue ring, a flared tail skirt with a flat end and four trapezoid fins in an X layout with torpedo-shaped actuator pods.',
               'parts': ['body with ogive nose, seams, neck band, blue rings and lettering', 'four tail fins with actuator pods and cheek pads', 'lifting lugs, hatch, side fairings, screw rows and aft hatch plate'],
               'tags': ['arrw', 'agm-183a', 'missile', 'air-launched', 'b-52', 'usaf', 'military', 'lowpoly', 'game-ready', 'blender'],
               'dimensions': f"approx. length {st['length_m']:.2f} m, body diameter {Dm:.2f} m, fin span {SPAN:.2f} m tip to tip",
               'textures': f'{SKETCH_TEX} px baked colour, ORM and normal maps',
               'animation': 'none (static)',
               'glb': 'arrw_sketchfab.glb'},
    notes='Ревизия 1 (2026-10-25): по картинкам Mark (Свои/ARRW/): 1 — рендер на белом фоне (вид спереди-слева, нос рядом с камерой), 2 — рендер на тёмном фоне (вид сзади-слева); картинки 2 и 3 присланы одинаковыми (один файл). '
          'Чертежа нет, оба кадра с сильной перспективой: пропорции оценены по силуэтным линиям цилиндра (точка схода), эллипсам торца и колец (фокусное) и по положениям деталей вдоль оси; длина / диаметр 9,2 (разброс оценок 8,7…9,6). '
          'Масштаб: у ARRW нет прежней модели в игре; длина 6,30 м взята близкой к AGM-86 ALCM в игре (w_agm86.glb 6,319 м, то же подкрыльевое оружие В-52), диаметр 0,685 м; в prepare.js масштаб правится одним числом. '
          'Оси: метры, нос +Y (в glTF −Z), начало — середина длины, ось — Y; рули «×» (45°, 135°, 225°, 315°); верх +Z (проушины, люк, подушки ремней); рендеры сняты со стороны −X (нос слева) — надпись и значок на −X. '
          'Доли от кончика в диаметрах: затупленное оживало до 2,45 (шов), белое кольцо на шее 2,45…2,72, золотые винты на стальной ленте 2,72…2,86, люк 2,95…3,95, значок на 3,4, проушины на 4,88 и 6,26 (подушки ремней от −0,12 до +0,28 диаметра, тонкий ремень по задней кромке), '
          'синие кольца на 1,2 и 7,4 (ширина 0,15), надпись «AGM-183A» с центром на 6,68, шов у рулей 8,02, кольцо винтов 8,11, ступенька юбки 8,29, торец 9,2. Рули: трапеция (корень 1,03 D, кончик 0,59 D, высота 0,55 D), привод-«торпеда» на каждом, «щёки» под рулями. '
          'Окраска: светло-серый корпус, белые рули и приводы, синие кольца, белое кольцо на шее; надпись, мелкий блок строк и значок условные (на кадрах нечитаемы; значок упрощён до круга с полосами). Объекты: ARW_body (корпус и оживало — три полосы ring_uv), ARW_fins, ARW_pods, '
          'ARW_cheeks, ARW_hw (проушины, подушки, люк, обтекатели, кнопка — смарт-проекция), ARW_screws (винты — плоский материал без развёртки). '
          'Не сделано: логотип на носу и рисунок значка, мелкие детали люка и пандус, кронштейны у корней рулей, внутренность торца; сверка модели с кадрами наложением не доведена до конца — положения колец и ремней вдоль оси верны с точностью около 0,3 диаметра. '
          'Новое оружие: в arsenal.js записи arrw пока нет (в «Мульти-волне» баллистики и подкрыльевых ракет у запада нет), META w_arrw: { weapon: \'arrw\', lazy: true, stations: [] } и строку prepare.js добавит integrate-own.js. '
          'Если ракета в игре покажется слишком длинной или тонкой рядом с AGM-86, длину и диаметр можно подправить в prepare.js масштабом по осям.')
# в паспорт — размеры текстур для prepare.js (как у других оружий с текстурами)
pp = OUT + '/ПАСПОРТ.json'
P = json.load(open(pp, encoding='utf-8')); P['tex'] = GAME_TEX; P['nTex'] = GAME_NTEX
json.dump(P, open(pp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT)
