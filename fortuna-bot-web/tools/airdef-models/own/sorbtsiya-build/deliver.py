# «Сорбция» — проверка и сдача: статистика, превью, крупные планы, экспорт, паспорт (силуэта по чертежу нет: поз. 87 нарисована в косой проекции, толщина на ней завышена — IoU не годится; форма и доли длины
# сняты с повёрнутого рисунка вручную). Запускается ПОСЛЕ build.py и bake.py в том же Blender:
#   SRB_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# Уровень 2 (игра, без записи в репозиторий): deno run -A …/tools/airdef-models/preview-candidate.js w_ecm_e "$F/sorbtsiya.glb" --out "$F/превью-игра" --tex 512 --ntex 512 --weapon ecm_e
import os, sys, json
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector
import modelkit as mk

OUT = os.environ.get('SRB_OUT')
if not OUT: raise SystemExit('Задай SRB_OUT=<папка модели>: сюда пишутся превью, экспорт и паспорт')
GAME_TEX, GAME_NTEX = int(os.environ.get('SRB_GAME_TEX', '512')), int(os.environ.get('SRB_GAME_NTEX', '512'))
SKETCH_TEX = int(os.environ.get('SRB_TEX', '2048'))
sc = bpy.data.scenes['SORB']
st = mk.stats()

L = st['length_m']; c = Vector((0.0, 0.0, 0.0))
prev = [os.path.basename(p) for p in mk.previews(OUT, views=[
    ('превью_1_общий.png', c, (-0.55, 0.85, 0.42), 1.7 * L),
    ('превью_2_сбоку.png', c, (1.0, 0.0, 0.05), 1.55 * L),
    ('превью_3_хвост.png', Vector((0.0, -1.85, 0.0)), (0.85, -1.0, 0.42), 1.5),
    ('превью_4_голова.png', Vector((0.0, 1.8, 0.0)), (-0.85, 0.9, 0.35), 1.5)])]
os.makedirs(OUT + '/снимки', exist_ok=True)
mk.previews(OUT + '/снимки', size=(1600, 900), views=[
    ('люк_и_отверстие.png', Vector((0.14, -0.77, -0.06)), (1.0, 0.12, -0.12), 0.95),
    ('шов_метки_заглушка.png', Vector((0.13, 0.80, -0.06)), (1.0, 0.0, -0.10), 1.15),
    ('нос_колпак.png', Vector((0.0, 1.75, 0.0)), (-0.8, 0.8, 0.30), 1.1),
    ('планка_сверху.png', Vector((0.0, 0.0, 0.17)), (0.0, -0.001, 1.0), 5.6),
    ('снизу_шов_развёртки.png', Vector((0.0, 1.3, -0.15)), (0.0, 0.25, -1.0), 0.9),
    ('снизу_у_хвоста.png', Vector((0.0, -1.7, -0.15)), (0.3, -0.5, -1.0), 1.0)])

mk.export(OUT + '/sorbtsiya_sketchfab.glb', None)
lc = bpy.data.images.load(OUT + f'/sorbtsiya_detail_{GAME_TEX}.jpg', check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
ln = bpy.data.images.load(OUT + f'/sorbtsiya_normal_{GAME_NTEX}.png', check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
for m in [m for m in bpy.data.materials if m.name.startswith('SRB_')]:
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image is not None: nd.image = ln if nd.image.name == 'SRB_normal' else lc
mk.export(OUT + '/sorbtsiya.glb', OUT + '/sorbtsiya.blend')
mk.passport(OUT + '/ПАСПОРТ.json', key='w_ecm_e', weapon='ecm_e', name='Станция помех «Сорбция»', name_en='Sorbtsiya', glb='sorbtsiya.glb', blend='sorbtsiya.blend', rev=1,
    build=['build.py', 'bake.py', 'deliver.py', 'srb_pod.py'], previews_=prev,
    sketchfab={'title': 'Sorbtsiya ECM Wing Pod (Su-27) — Low Poly, Textured',
               'lead': 'Sorbtsiya electronic countermeasures (ECM) wing pod carried by the Su-27 fighter on the wingtip: a slender 4.2 m container with two radome end caps, a top mounting rail, a service hatch with an oval opening and a panel seam with fasteners. Hand-modelled low-poly exterior with baked paint wear and a normal map.',
               'parts': ['pointed nose radome cap with its collar', 'cylindrical body', 'blunt tail radome cap with its collar', 'top mounting rail', 'service hatch', 'round plug and two tail pins'],
               'tags': ['sorbtsiya', 'ecm', 'jammer', 'electronic warfare', 'pod', 'su-27', 'flanker', 'russian', 'soviet', 'military', 'weapon', 'aircraft', 'lowpoly', 'game-ready', 'textured', 'blender'],
               'dimensions': f"length {st['length_m']:.2f} m, diameter {2 * mk.RB * mk.S:.2f} m",
               'textures': f'{SKETCH_TEX} px baked colour map and tangent-space normal map',
               'glb': 'sorbtsiya_sketchfab.glb'},
    notes='Ревизия 1 (2026-10-24): по рисунку поз. 87 «Крыльевой контейнер станции помех «Сорбция»» из компоновочной схемы Су-27 (2_компоновка…webp; доли длины — по повёрнутому рисунку _измерения/поз87_повёрнутый.png): '
          'острый носовой колпак 0,42 м с кольцом 0,18 м, цилиндр, хвостовой колпак 0,28 м с кольцом 0,14 м, планка вдоль верха, люк на наружном борту 0,44 м с овальным отверстием, шов с метками через 0,25 м, заглушка и два штифта. '
          'Длина 4,2 м и Ø 0,3 м — со слов Mark; на рисунке (косая проекция) толщина завышена — не использована. Фото Су-27 (5, 6) — место на законцовке и светлая окраска; Су-35 / Су-34 (7–9, «Хибины») — не «Сорбция», только как похожий класс. '
          f'Для игры — цвет {GAME_TEX} (JPEG) и нормали {GAME_NTEX} (PNG), для Sketchfab — {SKETCH_TEX}. Нос (острый колпак) в −Z осей glTF, планка вверх (+Z), люк на +X. Цвета окраски — по фото, без точных RAL.')
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT)
