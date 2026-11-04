# deliver.py - КАБ-500С: снимки при дневном свете, крупные планы, экспорт (Sketchfab - текстуры 2048, игра - цвет 1024 + нормали 1024), .blend, паспорт и отчёт. После build.py, bake.py и _collide.py в том же Blender:
#   K5S_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python _collide.py --python deliver.py
# Силуэт с IoU не считается: все картинки в перспективе; форма сверена с ними на снимках с похожих ракурсов (_проба/сравнение_рев2.png).
import os, sys, json
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector
import modelkit as mk
import k5s_geo as g
import _shots

OUT = os.environ.get('K5S_OUT')
if not OUT: raise SystemExit('Задай K5S_OUT=<папка модели>')
GAME_TEX, GAME_NTEX = int(os.environ.get('K5S_GAME_TEX', '1024')), int(os.environ.get('K5S_GAME_NTEX', '1024'))
SKETCH_TEX = int(os.environ.get('K5S_TEX', '2048'))
sc = bpy.data.scenes['KAB500S']; bpy.context.view_layer.update()
st = mk.stats()
ms = [o for o in sc.objects if o.type == 'MESH']
pts = [o.matrix_world @ v.co for o in ms for v in o.data.vertices]
mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
LEN = round(mx.y - mn.y, 3)
print('габарит:', [round(v, 3) for v in (mx - mn)])

prev = [os.path.basename(p) for p in _shots.shots(OUT, size=(1920, 1080), views=[
    ('превью_1_общий.png', Vector((0, 0.10, 0.02)), (-0.60, 0.70, 0.38), 4.6),
    ('превью_2_нос.png', Vector((0, 0.15, 0.02)), (0.58, 0.74, 0.34), 4.7),
    ('превью_3_сбоку.png', Vector((0, 0, 0)), (1.0, 0.0, 0.08), 4.8),
    ('превью_4_хвост.png', Vector((0, -1.05, 0.0)), (0.62, -0.62, 0.44), 1.9)])]
os.makedirs(OUT + '/снимки', exist_ok=True)
_shots.shots(OUT + '/снимки', size=(1600, 900), views=[
    ('крышка_колпак.png', Vector((0, 0.38, 0.20)), (-0.42, 0.45, 0.70), 1.25),
    ('руль_накладка.png', Vector((0.12, 0.65, 0.12)), (0.75, 0.25, 0.60), 0.85),
    ('табличка_швы.png', Vector((0.05, -0.12, 0.03)), (1.0, 0.22, 0.20), 1.55),
    ('проушины.png', Vector((0, -0.28, 0.22)), (0.45, 0.2, 0.8), 0.9),
    ('хвост_планки.png', Vector((0.1, -1.10, 0.1)), (0.62, -0.62, 0.44), 1.1),
    ('короб_низ.png', Vector((0, 0.05, -0.15)), (0.45, 0.25, -0.8), 2.2)])

mk.export(OUT + '/kab500s_sketchfab.glb', None)
lc = bpy.data.images.load(OUT + f'/kab500s_detail_{GAME_TEX}.jpg', check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
ln = bpy.data.images.load(OUT + f'/kab500s_normal_{GAME_NTEX}.png', check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
for m in [m for m in bpy.data.materials if m.name.startswith('K5S_')]:
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image is not None: nd.image = ln if nd.image.name == 'K5S_normal' else lc
mk.export(OUT + '/kab500s.glb', OUT + '/kab500s.blend')

col = {}
try: col = json.load(open(os.path.join(OUT, '_live', 'collide.json'), encoding='utf-8'))
except Exception as e: print('нет итога _collide.py:', e)
R = mk.passport(OUT + '/ПАСПОРТ.json', key='w_kab500s', weapon='kab500s', name='КАБ-500С', name_en='KAB-500S', glb='kab500s.glb', blend='kab500s.blend', rev=1,
    build=['build.py', 'k5s_geo.py', '_decals.py', 'bake.py', '_collide.py', '_shots.py', 'deliver.py'], previews_=prev,
    checks={'moving_parts': col, 'silhouette_iou': {'бок': 'не считается: картинки в перспективе'}, 'wings_vs_lugs': f'верх крыльев при угле 0 ниже верха проушин ({g.R + g.LUG_H:.3f} м); при отклонении верхние крылья поднимаются выше', 'color': 'вариант Mark с красными метками; тон поднят, чтобы быть не темнее референс_2'},
    sketchfab={'title': 'KAB-500S Guided Bomb - Game-Ready, Textured',
               'lead': 'KAB-500S, Russian 500 kg satellite-guided bomb in worn grey paint with red marks. Hand-modelled: long sharp nose cone, lapped skin sheets with rivets and slits, four front rudders on riveted plates, four tail wings on bolted planks, two lifting lugs, mesh hatch, faceted cap, data plate and a belly conduit with clamps. Pivots on real axes. Baked colour and normal maps with dust, grime, scratches and chipped edges.',
               'parts': ['nose cone', 'lapped skin', 'four front rudders', 'riveted plates', 'mesh hatch', 'red cap', 'data plate', 'two lugs', 'belly conduit', 'tail tube', 'four tail wings'],
               'tags': ['kab-500', 'kab-500s', 'bomb', 'guided-bomb', 'gps', 'russia', 'military', 'weapon', 'game-ready', 'textured', 'pbr', 'blender'],
               'dimensions': f'length {LEN:.2f} m, body diameter {2 * g.R:.2f} m, tail span {mx.x - mn.x:.2f} m',
               'textures': f'{SKETCH_TEX} px baked colour map and tangent-space normal map',
               'based': 'Built from scratch in Blender from reference images.',
               'glb': 'kab500s_sketchfab.glb'},
    notes=f'Ревизия 1 (2026-11-04): форма - по референс_1, швы, накладки, табличка, крышка и колпак - по референс_2 и 3; ИНЕРТНАЯ и индекс с буквой Э не перенесены; пиксели картинок не использованы, надписи нарисованы заново (_decals.py), номера на табличке придуманы. '
          f'После замечания Mark «просто и пластиково» добавлены нахлёсты, фаски, крепёж и износ; ряды заклёпок, хомуты короба, трубка и фланец на торце - догадки сборщика. Концы хвостовых крыльев {g.WING_R} м от оси: требование Mark не выше проушин. Диапазоны хода выбраны сборщиком, поворот крыльев на картинках прямо не виден. Для игры - цвет {GAME_TEX} (JPEG) и нормали {GAME_NTEX} (PNG), для Sketchfab - {SKETCH_TEX}.')
R['model']['length_m'] = LEN; R['model']['span_m'] = round(mx.x - mn.x, 3); R['model']['height_m'] = round(mx.z - mn.z, 3)
json.dump(R, open(OUT + '/ОТЧЁТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
pj['axes'] = 'glTF: нос -Z, верх +Y (проушины), начало на оси корпуса посередине длины; в файле все углы 0'
parts = {f'canard_{k}': dict(pivot_gltf=G2(g.CAN_PIVOTS[k]['o']), axis_gltf=G2(g.CAN_PIVOTS[k]['axis']), range_deg=[-g.CAN_RANGE, g.CAN_RANGE], note='начало узла на оси руля, ось радиальная') for k in range(4)}
parts.update({f'wing_{k}': dict(pivot_gltf=G2(g.WING_PIVOTS[k]['o']), axis_gltf=G2(g.WING_PIVOTS[k]['axis']), range_deg=[-g.WING_RANGE, g.WING_RANGE], note='начало узла на оси вдоль корня; при отклонении верхние крылья поднимаются выше проушин') for k in range(4)})
pj['parts'] = parts
pj['fixed'] = 'K5S_body, K5S_lugs, K5S_hatch, K5S_cap, K5S_box, K5S_plaque, K5S_bits, K5S_plates, K5S_planks - неподвижны'
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT)
