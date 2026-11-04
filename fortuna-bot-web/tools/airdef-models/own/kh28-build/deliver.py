# deliver.py - Х-28: снимки при дневном свете, крупные планы, экспорт (Sketchfab - текстуры 2048, игра - цвет 1024 + нормали 1024), .blend, паспорт и отчёт. После build.py, bake.py и _collide.py в том же Blender:
#   K28_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python _collide.py --python deliver.py
# Силуэт с IoU не считается: вид на референс_1 снят в перспективе и мал (356 px); форма сверена на снимках с тех же ракурсов (_проба/сравнение.png).
import os, sys, json
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector
import modelkit as mk
import k28_geo as g
import _shots

OUT = os.environ.get('K28_OUT')
if not OUT: raise SystemExit('Задай K28_OUT=<папка модели>')
GAME_TEX, GAME_NTEX = int(os.environ.get('K28_GAME_TEX', '1024')), int(os.environ.get('K28_GAME_NTEX', '1024'))
SKETCH_TEX = int(os.environ.get('K28_TEX', '2048'))
sc = bpy.data.scenes['KH28']; bpy.context.view_layer.update()
st = mk.stats()
ms = [o for o in sc.objects if o.type == 'MESH']
pts = [o.matrix_world @ v.co for o in ms for v in o.data.vertices]
mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
LEN = round(mx.y - mn.y, 3)
print('габарит:', [round(v, 3) for v in (mx - mn)])

prev = [os.path.basename(p) for p in _shots.shots(OUT, size=(1920, 1080), views=[
    ('превью_1_общий.png', Vector((0, 0.05, -0.02)), (-0.86, 0.48, 0.20), 8.8),
    ('превью_2_сбоку.png', Vector((0, 0.0, -0.03)), (1.0, 0.0, 0.07), 8.6),
    ('превью_3_сверху.png', Vector((0, 0.0, 0.0)), (0.12, -0.02, 1.0), 8.6),
    ('превью_4_хвост.png', Vector((0, -2.45, 0.0)), (0.48, -0.80, 0.30), 2.4)])]
os.makedirs(OUT + '/снимки', exist_ok=True)
_shots.shots(OUT + '/снимки', size=(1600, 900), views=[
    ('сопло.png', Vector((0, -2.70, 0.0)), (0.30, -0.90, 0.20), 1.2),
    ('обтекатель.png', Vector((0, 1.95, 0.0)), (-0.72, 0.60, 0.24), 2.7),
    ('узлы_надписи.png', Vector((0.05, -0.15, 0.10)), (0.85, 0.15, 0.48), 3.0),
    ('воздухозаборы_лючки.png', Vector((0.06, -1.65, 0.05)), (0.85, -0.20, 0.42), 2.0),
    ('подбрюшье.png', Vector((0, 0.15, -0.15)), (0.55, 0.25, -0.75), 6.0),
    ('узел_близко.png', Vector((0, 0.055, 0.24)), (0.50, 0.25, 0.80), 0.8)])

mk.export(OUT + '/kh28_sketchfab.glb', None)
lc = bpy.data.images.load(OUT + f'/kh28_detail_{GAME_TEX}.jpg', check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
ln = bpy.data.images.load(OUT + f'/kh28_normal_{GAME_NTEX}.png', check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
for m in [m for m in bpy.data.materials if m.name.startswith('K28_')]:
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image is not None: nd.image = ln if nd.image.name == 'K28_normal' else lc
mk.export(OUT + '/kh28.glb', OUT + '/kh28.blend')

col = {}
try: col = json.load(open(os.path.join(OUT, '_live', 'collide.json'), encoding='utf-8'))
except Exception as e: print('нет итога _collide.py:', e)
R = mk.passport(OUT + '/ПАСПОРТ.json', key='w_kh28', weapon='kh28', name='Х-28', name_en='Kh-28', glb='kh28.glb', blend='kh28.blend', rev=1,
    build=['build.py', 'k28_geo.py', '_decals.py', 'bake.py', '_collide.py', '_shots.py', '_nozzle.py', 'deliver.py'], previews_=prev,
    checks={'rudders': col, 'silhouette_iou': {'бок': 'не считается: картинки в перспективе'}, 'nozzle': 'по решению Mark концы стабилизаторов как на картинке заходят за срез корпуса; нужно vis.nzAx: [0, 0], иначе сопло на стенде (0; 0,13; 2,69). С этой осью расчёт _nozzle.py даёт z = 2,70', 'color': 'миниатюра не темнее референс_1 и светлой части корпуса на референс_2'},
    sketchfab={'title': 'Kh-28 Anti-Radiation Missile - Game-Ready',
               'lead': 'Kh-28, Soviet air-launched anti-radiation missile in light grey with a darker radome and a white tip. Hand-modelled: ogival radome, belly fairing built into the body, low swept wings with root fairings, four all-moving tail surfaces on their own pivots, hollow nozzle, two suspension lugs, dorsal fairings and side air scoops. Baked colour and normal maps with dust, streaks, scratches, chipped edges and soot at the nozzle.',
               'parts': ['radome', 'body with belly fairing', 'low wings', 'root fairings', 'four tail surfaces', 'hollow nozzle', 'two lugs', 'dorsal fairings', 'air scoops'],
               'tags': ['kh-28', 'as-9', 'missile', 'anti-radiation', 'air-to-surface', 'soviet', 'military', 'weapon', 'game-ready', 'textured', 'pbr', 'blender'],
               'dimensions': f'length {LEN:.2f} m, body diameter {2 * g.R:.2f} m, wing span {mx.x - mn.x:.2f} m',
               'textures': f'{SKETCH_TEX} px baked colour map and tangent-space normal map',
               'based': 'Built from scratch in Blender from reference images.',
               'glb': 'kh28_sketchfab.glb'},
    notes=f'Ревизия 1 (2026-11-04): форма - по референс_1, окраска, обтекатель и форма крыльев - по референс_2; подпись на борту не перенесена; пиксели картинок не использованы, надписи нарисованы заново (_decals.py), номера и текст на обтекателе придуманы. '
          f'Вида сверху и сзади нет: размах крыльев {mx.x - mn.x:.2f} м (по памяти), размах стабилизаторов, сопло, ширина подбрюшья, правый борт - додуманы. Рули цельноповоротные, оси и ход выбраны сборщиком, поворот на картинках не виден. Для игры - цвет {GAME_TEX} (JPEG) и нормали {GAME_NTEX} (PNG), для Sketchfab - {SKETCH_TEX}.')
R['model']['length_m'] = LEN; R['model']['span_m'] = round(mx.x - mn.x, 3); R['model']['height_m'] = round(mx.z - mn.z, 3)
json.dump(R, open(OUT + '/ОТЧЁТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
pj['axes'] = 'glTF: нос -Z, верх +Y (подвесные узлы), начало на оси корпуса посередине длины; в файле все углы 0'
pj['parts'] = {n: dict(pivot_gltf=G2(D['o']), axis_gltf=G2(D['axis']), range_deg=[-g.RUD_RANGE, g.RUD_RANGE], note='начало узла на оси руля') for n, D in g.RUD_PIVOTS.items()}
pj['fixed'] = 'K28_body, K28_wings, K28_lugs, K28_bits - неподвижны; складных частей нет'
pj['nozzle'] = dict(nzAx=[0, 0], note='нужно vis.nzAx: [0, 0] для kh28: концы стабилизаторов заходят за срез корпуса (решение Mark), иначе nozzleOf даёт ось на y = 0,13')
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT)
