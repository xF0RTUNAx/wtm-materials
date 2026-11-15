# deliver.py - сдача Х-59М (после bake2.py; атласы берутся готовые из _ультра, X59_REUSE=1):
#   kh59m.glb (игра, полётная конфигурация без ускорителя: цвет JPEG 1024, ORM и нормали PNG 512; двигатель, оперение вдвое меньше), kh59m.blend (полные атласы, с ускорителем),
#   kh59m_sketchfab.glb (4096), _2k, _1k, kh59m_start_sketchfab.glb (стартовая: ускоритель, рули сложены), превью с запечёнными текстурами, ПАСПОРТ.json, ОТЧЁТ.json.
#   Blender -b --factory-startup --python deliver.py
# Поза в обоих файлах: рули и элероны в нейтрали (углы 0).
import os, json, math, shutil
import bpy
from mathutils import Vector
os.environ.setdefault('X59_REUSE', '1')
_here = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/mark./Downloads/Воздушное превосходство/Модели/Свои/Х-59М'
os.environ.setdefault('X59_OUT', os.path.join(_here, '_ультра'))
_p = os.path.join(_here, 'bake2.py'); exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'))
BOOSTER.hide_viewport = False; BOOSTER.hide_render = True
DST = _here; BASE = 'kh59m'; GAME_TEX, GAME_NTEX = 1024, 512
TEXD = os.path.join(DST, 'текстуры'); os.makedirs(TEXD, exist_ok=True)
for _n in ('Cube', 'Light', 'Camera'):
    if _n in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects[_n], do_unlink=True)
keep = [o for o in COL.objects if o.type == 'MESH' and o.name != 'booster']
NODES = {tag: [n for n in bpy.data.materials[f'X59_{tag}'].node_tree.nodes if n.type == 'TEX_IMAGE'] for tag in RES}
ORIG = {tag: [(n, n.image, bpy.path.abspath(n.image.filepath)) for n in NODES[tag]] for tag in RES}
_cache = {}


def scaled(path, size, fmt):
    key = (path, size, fmt)
    if key in _cache: return _cache[key]
    src = bpy.data.images.load(path, check_existing=True); im = src.copy(); im.scale(size, size)
    p = os.path.join(TEXD, os.path.splitext(os.path.basename(path))[0] + f'_{size}.' + ('jpg' if fmt == 'JPEG' else 'png'))
    im.filepath_raw = p; im.file_format = fmt
    try: im.save(quality=92)
    except TypeError: im.save()
    bpy.data.images.remove(im); _cache[key] = p; return p


def use_set(col_px, orm_px, nrm_px):
    """подставить в материалы картинки нужного размера (оперение - вдвое меньше корпуса)"""
    for tag in RES:
        k = 1 if tag == 'B' else 2                                              # двигатель, оперение, ускоритель - атлас вдвое меньше
        for n, im0, path in ORIG[tag]:
            kind = 'color' if '_color' in path else ('orm' if '_orm' in path else 'normal')
            px = {'color': col_px, 'orm': orm_px, 'normal': nrm_px}[kind] // k
            new = bpy.data.images.load(scaled(path, px, 'JPEG' if kind == 'color' else 'PNG'), check_existing=True)
            if kind != 'color': new.colorspace_settings.name = 'Non-Color'
            n.image = new


def export(path):
    for o in bpy.context.view_layer.objects: o.select_set(False)
    for o in keep: o.select_set(True)
    bpy.context.view_layer.objects.active = keep[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_materials='EXPORT', export_image_format='AUTO',
                              export_cameras=False, export_lights=False, export_normals=True, export_animations=False)
    log('экспорт', os.path.basename(path), '%.2f МБ' % (os.path.getsize(path) / 1e6))


pose(0.0, 0.0); bpy.context.view_layer.update()
# ── превью с запечёнными текстурами (полные атласы)
sc.render.engine = 'CYCLES'; sc.cycles.samples = 96; sc.cycles.use_denoising = True
sc.view_settings.view_transform = 'AgX'; sc.view_settings.exposure = 0.25
w = bpy.data.worlds.new('V_world'); sc.world = w; w.use_nodes = True; nt = w.node_tree; bg = next(n for n in nt.nodes if n.type == 'BACKGROUND'); bg.inputs[1].default_value = 1.0
_tc = nt.nodes.new('ShaderNodeTexCoord'); _sp = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(_tc.outputs['Generated'], _sp.inputs[0])
_rp = nt.nodes.new('ShaderNodeValToRGB'); nt.links.new(_sp.outputs['Z'], _rp.inputs[0]); _r = _rp.color_ramp; _r.elements[0].position = 0.46; _r.elements[0].color = (0.46, 0.45, 0.43, 1)
_r.elements[1].position = 0.56; _r.elements[1].color = (0.85, 0.89, 0.95, 1); nt.links.new(_rp.outputs['Color'], bg.inputs[0])
ld = bpy.data.lights.new('V_sun', 'SUN'); ld.energy = 4.0; ld.angle = math.radians(3); sun = bpy.data.objects.new('V_sun', ld); sc.collection.objects.link(sun); sun.rotation_euler = (math.radians(40), math.radians(-30), math.radians(-60))
cam = bpy.data.objects.new('V_cam', bpy.data.cameras.new('V_cam')); sc.collection.objects.link(cam); sc.camera = cam
SHOTS = [('превью_1_общий', (-3.2, 3.9, 1.3), (0, 0.3, -0.12), 40, (1920, 1080), (0, 0)), ('превью_2_сбоку', (-10, 0, -0.12), (0, 0, -0.12), 'o5.6', (1920, 640), (0, 0)),
         ('превью_3_голова', (-0.80, 3.35, 0.28), (0, 2.15, 0), 50, (1600, 1000), (0, 0)), ('превью_4_двигатель', (-0.85, 0.75, -0.80), (0, -0.55, -0.42), 45, (1600, 1000), (0, 0)),
         ('превью_5_старт', (-6.2, 1.6, 1.9), (0, -0.30, -0.15), 35, (1920, 1080), 'start'),
         ('снимки/сзади_снизу', (1.3, -4.3, -1.0), (0, -1.6, -0.25), 45, (1920, 1080), (0, 0)), ('снимки/рули_отклонены', (2.5, -3.1, 0.9), (0, -0.5, -0.12), 40, (1920, 1080), (0.8, 0.6)),
         ('снимки/трафареты', (-1.7, 1.05, 0.30), (0, 1.05, 0.0), 35, (1920, 1080), (0, 0)), ('снимки/купол', (-0.28, 3.15, 0.08), (0, 2.45, 0), 70, (1400, 1000), (0, 0)),
         ('снимки/справа', (10, 0, -0.12), (0, 0, -0.12), 'o5.6', (1920, 640), (0, 0))]
os.makedirs(os.path.join(DST, 'снимки'), exist_ok=True); PREV = []
ONLY = [x for x in os.environ.get('X59_SHOTS', '').split(',') if x]                  # X59_SHOTS=имена - только эти кадры, без экспорта
for name, pos, tgt, f, res, ps in SHOTS:
    if ONLY and name not in ONLY: continue
    BOOSTER.hide_render = ps != 'start'; pose(*((0.0, 0.0, 1.0) if ps == 'start' else ps)); cam.location = Vector(pos); cam.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
    sc.render.resolution_x, sc.render.resolution_y = res
    if isinstance(f, str): cam.data.type = 'ORTHO'; cam.data.ortho_scale = float(f[1:])
    else: cam.data.type = 'PERSP'; cam.data.lens = f
    sc.render.filepath = os.path.join(DST, name + '.png'); bpy.ops.render.render(write_still=True); log('снимок', name)
    if name.startswith('превью'): PREV.append(name + '.png')
BOOSTER.hide_render = True; pose(0.0, 0.0)
if ONLY: log('только кадры', ONLY); raise SystemExit(0)
bpy.data.objects.remove(cam, do_unlink=True); bpy.data.objects.remove(sun, do_unlink=True)
# ── Sketchfab: полные атласы (корпус 4096) и облегчённые 2K / 1K
for tag in RES:
    for n, im0, path in ORIG[tag]:
        if '_color' in path:                                                    # цвет в JPEG (меньше файл), нормали и ORM - PNG
            n.image = bpy.data.images.load(scaled(path, SIZES[tag], 'JPEG'), check_existing=True)
export(os.path.join(DST, BASE + '_sketchfab.glb'))
keep.append(BOOSTER); pose(0.0, 0.0, 1.0); export(os.path.join(DST, BASE + '_start_sketchfab.glb')); keep.remove(BOOSTER); pose(0.0, 0.0)
use_set(2048, 1024, 2048); export(os.path.join(DST, BASE + '_sketchfab_2k.glb'))
use_set(1024, 512, 1024); export(os.path.join(DST, BASE + '_sketchfab_1k.glb'))
# ── игра: цвет 1024, ORM и нормали 512 (оперение - 512 / 256)
use_set(GAME_TEX, GAME_NTEX, GAME_NTEX); glb = os.path.join(DST, BASE + '.glb'); export(glb)
for tag in RES:
    for n, im0, path in ORIG[tag]: n.image = im0
for im in bpy.data.images:
    if im.filepath: im.filepath = bpy.path.relpath(bpy.path.abspath(im.filepath), start=DST)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(DST, BASE + '.blend'), copy=True, relative_remap=True, compress=True)
tri = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in keep)
pts = [o.matrix_world @ v.co for o in keep for v in o.data.vertices]
mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))); mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
parts = {}
for n, W in MOVE.items():
    o = bpy.data.objects[n]; nm = {'can': 'носовой руль, цельноповоротный', 'ail': 'элерон на задней кромке крыла у корня'}[W['kind']]
    parts[n] = dict(pivot_gltf=G2(o.matrix_world.translation), axis_gltf=G2(W['axis']), lim_deg=list(W['lim']), neutral_deg=0.0, note=nm)
col = {}
try: col = json.load(open(os.path.join(DST, '_live', 'collide.json'), encoding='utf-8'))
except Exception as e: log('нет итога _collide.py:', e)
# сопло двигателя: срез - самая задняя точка жаропрочной части гондолы, на оси гондолы
eng = bpy.data.objects['engine']; hi_ = {i for i, m in enumerate(eng.data.materials) if m and 'heat' in m.name.lower()}
ey = min((eng.matrix_world @ eng.data.vertices[v].co).y for p_ in eng.data.polygons for v in p_.vertices)
noz = dict(exit_gltf=G2(Vector((0.0, ey, ENG['z']))), dir_gltf=[0.0, 0.0, 1.0], r=round(ENG['rx'], 4), note='срез сопла подвесного ТРД под корпусом (ось гондолы на 0,434 м ниже оси ракеты), струя назад (+Z glTF)')
SRC = ['01-05 - картинки Mark (чертёж 04 - основа формы и размеров)',
       '10 Х-59МЭ, МАКС-2007 - https://commons.wikimedia.org/wiki/File:%D0%A5-59%D0%9C%D0%AD.JPG (CC0)',
       '11 Х-59МЭ, головная часть - https://commons.wikimedia.org/wiki/File:%D0%A5-59%D0%9C%D0%AD-head.JPG (CC0)',
       '12 Х-59МК, Армия-2020 - https://commons.wikimedia.org/wiki/File:Army-2020-290.JPG (CC0)',
       '13 Х-59МК, Армия-2017 - https://commons.wikimedia.org/wiki/File:ARMY-2017_by_Ali_Khara_56.jpg (CC BY 4.0, Ali Khara)',
       '14 обломки, Сумы - https://commons.wikimedia.org/wiki/File:%D0%A5-59.jpg (CC BY)',
       '15, 16 утилизация, Харьковская обл. - https://commons.wikimedia.org/wiki/File:Disposal_of_a_missile_in_Kharkiv_Oblast_(2024-02-19)_1.jpg и _2.jpg (CC BY 4.0, Нацполиция)']
P = dict(key='w_kh59m', weapon='kh59m', name='Х-59М', name_en='Kh-59M', rev=1, own=True,
         files=dict(glb=BASE + '.glb', blend=BASE + '.blend', sketchfab=[BASE + '_sketchfab.glb', BASE + '_sketchfab_2k.glb', BASE + '_sketchfab_1k.glb', BASE + '_start_sketchfab.glb'],
                    build=['x59kit.py', 'build.py', '_paint.py', 'make_decals.py', 'bake2.py', 'deliver.py', '_collide.py', '_limits.py', '_fold.py', '_views.py', '_overlay.py', '_sheet.py', '_trial.py', '_trial_sheet.py']),
         tex=GAME_TEX, nTex=GAME_NTEX, ormTex=GAME_NTEX,
         axes='glTF: нос −Z, верх +Y, начало на оси корпуса посередине полётной длины 5,10 м (НЕ как у прежней чужой Х-31: там scale 5,69/189 и своя перестановка осей); оперение крестом «×» (45°)',
         size_m=dict(length=round(mx.y - mn.y, 3), width=round(mx.x - mn.x, 3), height=round(mx.z - mn.z, 3), body_diameter=round(2 * R, 3), wing_span=round(2 * WNG['s1'], 3),
                     canard_span=round(2 * CAN['s1'], 3), length_with_booster=round(L / 2 - (YA(BST['a_ex'])) , 3)),
         size_note='Игровой файл - полётная конфигурация (как ракета висит на Су-34, фото 02, 05), длина 5,10 м. 5,69 м, которые сейчас в игре и в seats-data (kh59m: 5.69), - длина со стартовым ускорителем; '
                   'после подмены пересчитать посадку seats-gen.js для kh59m (и kh59mk2, если оставить ей эту модель). Высота включает гондолу двигателя под корпусом (ось гондолы на 0,434 м ниже оси).',
         parts=parts,
         parts_note='can1…can4 - носовые рули (цельноповоротные, ±15°), ail1…ail4 - элероны у корня крыльев (±15°, 1 и 3 против 2 и 4 при крене); поворот вокруг axis_gltf через pivot_gltf. '
                    'Ход проверен _limits.py и _collide.py: касаний нет. Складывание рулей (только стартовая конфигурация, в игре не нужно): поворот на 65,5° назад вокруг касательной оси у задней точки корня (FOLD в build.py), касаний нет (_fold.py).',
         nozzle_gltf=noz['exit_gltf'], nozzle=noz,
         glass='dome - стекло купола ТВ-головки (X59_glass: Alpha 0,14, BLENDED), под ним seeker - объектив, подвес, блоки, жгуты (свои материалы X59_optic, X59_cam, X59_wire, X59_wireo, X59_brass); не запекаются',
         booster='Стартовый ускоритель (объект booster) - только в kh59m.blend и kh59m_start_sketchfab.glb; в игровой файл не входит.',
         mk2='Х-59МК2 моделью не годится: у неё другой корпус (плоский, с гранями под малую заметность, складные крылья сверху, другой воздухозаборник). Модель Х-59М можно оставить ей временно, как и сейчас Х-31 за обе, но точной она для МК2 не будет - лучше своя модель позже.',
         swap_notes=['Подмена по фразе «модель Х-59М готова»: integrate-own.js с этой папкой, ключ w_kh59m, оружие kh59m (models.js: weapon [\'kh59m\', \'kh59mk2\'] - решить, оставить ли МК2 на этой модели, см. mk2).',
                     'nose: -z, scale 1 (своя модель); старый рецепт w_kh59m в prepare.js (kh31.glb, scale 5,69/189,07, axes) заменить.',
                     'Узлы can1…can4 и ail1…ail4 - свои части (groups в prepare.js: /(^|\\/)(can\\d|ail\\d)(\\/|$)/), остальное body; integrate-own стирает groups - вернуть после подмены.',
                     'Купол - прозрачный материал X59_glass (как X25_glass у Х-25МЛ).',
                     'Длина 5,10 м вместо 5,69: seats-gen.js для kh59m (и kh59mk2) - пересчитать посадку на подвеске Су-34 (ext под левой гондолой, seatZ).',
                     'Сопло для факела: nozzle_gltf (срез сопла гондолы под корпусом, а не на оси ракеты).',
                     'Убрать кредит «Kh31» (lelo, CC BY) из games/airdef/models/credits.js и CREDITS.md - он только у w_kh59m; kh31.glb больше не нужен.',
                     'Иконки wpn:kh59m (и kh59mk2) перепечь (thumbs-bake.js), ktx-models.js w_kh59m, GLB_V w_kh59m - новая версия.'],
         sources=SRC,
         notes='Ревизия 1 (2026-11-15). Форма по чертежу 04 (виды сбоку, спереди, сзади; наложение - _показ/лист_формы.jpg), детали по фото 02, 05, 10, 11. Масштаб: стартовая длина чертежа = 5,69 м (линейка чертежа даёт 5,80, расхождение 2 %). '
               'Окраска - некрашеный металл, проба одобрена Mark 2026-11-15 («запекай»). Все номера и трафареты выдуманы (make_decals.py), кроме названия «Х-59М».')
json.dump(P, open(os.path.join(DST, 'ПАСПОРТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
R_ = dict(name_en='Kh-59M', rev=1, previews=PREV,
          model=dict(tris=tri, length_m=round(mx.y - mn.y, 3), span_m=round(2 * WNG['s1'], 3), height_m=round(mx.z - mn.z, 3), glb_mb=round(os.path.getsize(glb) / 1e6, 2)),
          textures=dict(full=f'корпус {SIZE}, двигатель, оперение и ускоритель {SIZE // 2} (цвет, ORM, нормали)', game='корпус: цвет 1024 JPEG, ORM и нормали 512 PNG; двигатель и оперение вдвое меньше',
                        normal='с детальной копии: фаски 4 мм корпус / 1,5 мм остальное + швы, лючки, заклёпки'),
          checks=dict(collisions=col, color='некрашеный металл (линейно 0,60 / 0,61 / 0,63, металл 0,85): медиана борта на пробе sRGB 165 при фото 05 (ракета в тени под крылом) около 116 - не темнее',
                      silhouette='наложение на чертёж 04 сбоку совпадает; виды спереди и сзади - _показ/лист_формы.jpg'),
          sketchfab=dict(title='Kh-59M Ovod-M TV-Guided Cruise Missile', glb=BASE + '_sketchfab.glb',
                         lead='Soviet Kh-59M Ovod-M TV-guided missile with an underslung turbojet, built for a game from photos and a three-view drawing. Bare grey metal with panel tones, rivets and seams in the normal map, grime and nozzle soot, made-up stencils. Glass seeker dome with the camera and wiring inside, compressor blades in the intake. A second file shows the launch setup with booster and folded canards.',
                         parts=['body', 'glass seeker dome', 'TV camera', 'engine pod', 'four canards', 'four wings', 'four ailerons'],
                         tags=['kh-59', 'kh-59m', 'ovod', 'missile', 'cruise-missile', 'air-to-surface', 'soviet', 'russian', 'military', 'weapon', 'game-ready', 'pbr'],
                         dimensions=f'length {mx.y - mn.y:.2f} m, with booster 5.69 m, body diameter {2 * R:.2f} m, wing span {2 * WNG["s1"]:.2f} m',
                         textures=f'{SIZE} px baked colour, ORM and normal maps; 2K and 1K versions included',
                         based='Built from scratch in Blender from public photos and drawings.'))
json.dump(R_, open(os.path.join(DST, 'ОТЧЁТ.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
log('deliver.py: готово', BASE, 'тр.', tri, PREV, 'сопло', noz['exit_gltf'])
