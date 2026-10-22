# УМПК (ФАБ-500М-62 с комплектом) — проверка и сдача: статистика, превью, экспорт, паспорт (силуэта по чертежу нет: ортогонального вида комплекта на картинках не было). Запускается ПОСЛЕ build.py и bake.py в том же Blender:
#   UMP_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py --python animate.py
# Уровень 2 (игра, без записи в репозиторий): deno run -A …/tools/airdef-models/preview-candidate.js w_umpk "$F/umpk.glb" --out "$F/превью-игра" --tex 512 --ntex 512 --weapon umpk
import os, sys, json
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector
import modelkit as mk

OUT = os.environ.get('UMP_OUT')
if not OUT: raise SystemExit('Задай UMP_OUT=<папка модели>: сюда пишутся превью, экспорт и паспорт')
GAME_TEX, GAME_NTEX = int(os.environ.get('UMP_GAME_TEX', '512')), int(os.environ.get('UMP_GAME_NTEX', '512'))
SKETCH_TEX = int(os.environ.get('UMP_TEX', '2048'))
sc = bpy.data.scenes['UMPK']
st = mk.stats()

L = st['length_m']; c = Vector((0.0, 0.0, 0.0))
prev = [os.path.basename(p) for p in mk.previews(OUT, views=[
    ('превью_1_общий.png', c, (-0.75, 0.85, 0.55), 2.6 * L),
    ('превью_2_сбоку.png', c, (-1.0, 0.0, 0.04), 1.3 * L),
    ('превью_3_хвост.png', Vector((0.0, -1.0, 0.0)), (0.85, -1.0, 0.45), 2.0),
    ('превью_4_голова.png', Vector((0.0, 0.6, -0.15)), (-0.85, 0.9, -0.25), 1.8)])]
os.makedirs(OUT + '/снимки', exist_ok=True)
mk.previews(OUT + '/снимки', size=(1600, 900), views=[
    ('снизу_общий.png', Vector((0.0, 0.0, -0.1)), (-0.5, 0.6, -0.8), 3.0),
    ('модуль_клин_крыло.png', Vector((0.0, 0.85, -0.3)), (-0.9, 0.45, -0.1), 1.3),
    ('руль_на_кольце.png', Vector((0.0, -1.15, 0.2)), (0.7, -1.0, 0.7), 1.2),
    ('вид_сверху.png', c, (0.0, 0.0, 1.0), 3.2)])

mk.export(OUT + '/umpk_sketchfab.glb', None)
lc = bpy.data.images.load(OUT + f'/umpk_detail_{GAME_TEX}.jpg', check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
ln = bpy.data.images.load(OUT + f'/umpk_normal_{GAME_NTEX}.png', check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
for m in [m for m in bpy.data.materials if m.name.startswith(('F50_', 'UMP_'))]:
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image is not None: nd.image = ln if nd.image.name == 'UMP_normal' else lc
mk.export(OUT + '/umpk.glb', OUT + '/umpk.blend')
mk.passport(OUT + '/ПАСПОРТ.json', key='w_umpk', weapon='umpk', name='ФАБ-500 с УМПК', name_en='UMPK', glb='umpk.glb', blend='umpk.blend', rev=1,
    build=['build.py', 'bake.py', 'deliver.py', 'animate.py', 'fab_bomb.py', 'umpk_kit.py'], previews_=prev,
    sketchfab={'title': 'FAB-500 M-62 with UMPK Glide Kit — Animated, Low Poly',
               'lead': 'FAB-500 M-62 Soviet 500 kg aviation bomb fitted with the UMPK unified gliding and correction kit: an underbelly module with a pointed wedge, two folding wings (2.5 m and about 1 m span) and four control vanes clamped to the tail ring. Animated: the bomb hangs wings-down on a rack, is released, rolls 180 degrees and the wings unfold. Hand-modelled low-poly exterior with baked paint wear, rivet rows and a normal map.',
               'parts': ['FAB-500 M-62 bomb (fuze, bands with lugs, tail, ring stabilizer)', 'underbelly module with a pointed wedge nose and hangers', 'front wing, 2.5 m span', 'rear wing, about 1 m span', 'four tail control vanes with clamps', 'rack with a short pylon (animation only)'],
               'tags': ['umpk', 'fab-500', 'glide bomb', 'guided bomb', 'bomb', 'soviet', 'russian', 'military', 'weapon', 'aircraft', 'animation', 'animated', 'lowpoly', 'game-ready', 'textured', 'blender'],
               'dimensions': f"length {st['length_m']:.2f} m, body diameter 0.43 m, front wing span {st['span_m']:.1f} m",
               'textures': f'{SKETCH_TEX} px baked colour map and tangent-space normal map',
               'animation': 'looped 8 s sequence: release from the rack, 180-degree roll, wing deployment (the rack with a pylon stub exists only for the animation)',
               'glb': 'umpk_sketchfab_anim.glb'},
    notes='Ревизия 1 (2026-10-22): бомба — та же, что в «ФАБ-500М62» (fab_bomb.py), комплект — umpk_kit.py: модуль под бомбой (клин, коробка, подвесы на бандажах, балка по брюху, труба-направляющая), крылья-доски раскрыты '
          '(переднее 2,5 м на 0,62 м от носа, заднее ≈ 1,05 м на 1,76 м) — размеры по инфографике 5 (вид сверху), четыре руля хвостового блока на кольце крестом ×. Игра складывает крылья по частям UMP_wingA / UMP_wingB (META wings: fold). '
          'Анимация для Sketchfab (animate.py, umpk_sketchfab_anim.glb): подвес крыльями вниз → сброс → переворот на 180° → раскрытие крыльев, петля 8 с; консоли крыльев отдельные, с осями у борта модуля, балка-подвес есть только в анимации; в игровом файле анимации нет. '
          f'Для игры — цвет {GAME_TEX} (JPEG) и нормали {GAME_NTEX} (PNG), для Sketchfab — {SKETCH_TEX}. Нос в −Z осей glTF, ушки вверх (+Z), модуль снизу (−Z). Размеры комплекта — приближённые (ортогонального чертежа не было).')
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT)
