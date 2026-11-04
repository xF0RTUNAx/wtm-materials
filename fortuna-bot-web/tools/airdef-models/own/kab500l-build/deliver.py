# deliver.py - КАБ-500Л: превью, крупные планы, экспорт (Sketchfab - текстуры 2048, игра - цвет 1024 + нормали 512), .blend, паспорт и отчёт. После build.py, bake.py и _collide.py в том же Blender:
#   KAB_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python _collide.py --python deliver.py
# Силуэт с IoU не считается: все картинки в перспективе; форма сверена с ними на снимках с тех же ракурсов (_проба/сравнение.png).
import os, sys, json
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector
import modelkit as mk
import kab_geo as g

OUT = os.environ.get('KAB_OUT')
if not OUT: raise SystemExit('Задай KAB_OUT=<папка модели>')
GAME_TEX, GAME_NTEX = int(os.environ.get('KAB_GAME_TEX', '1024')), int(os.environ.get('KAB_GAME_NTEX', '512'))
SKETCH_TEX = int(os.environ.get('KAB_TEX', '2048'))
sc = bpy.data.scenes['KAB500L']; bpy.context.view_layer.update()
st = mk.stats()
ms = [o for o in sc.objects if o.type == 'MESH']
pts = [o.matrix_world @ v.co for o in ms for v in o.data.vertices]
mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
LEN = round(mx.y - mn.y, 3)
print('габарит:', [round(v, 3) for v in (mx - mn)])

prev = [os.path.basename(p) for p in mk.previews(OUT, bg=(0.46, 0.49, 0.53), views=[
    ('превью_1_общий.png', Vector((0, 0.05, 0.02)), (0.90, 0.18, 0.32), 5.6),
    ('превью_2_нос.png', Vector((0, 0.2, 0.03)), (-0.86, 0.48, 0.14), 5.2),
    ('превью_3_сверху.png', Vector((0, 0.15, 0.0)), (0.34, 0.78, 0.50), 5.0),
    ('превью_4_хвост.png', Vector((0, -1.05, 0.0)), (0.62, -0.62, 0.44), 2.2)])]
os.makedirs(OUT + '/снимки', exist_ok=True)
mk.previews(OUT + '/снимки', size=(1600, 900), bg=(0.46, 0.49, 0.53), views=[
    ('головка.png', Vector((0, 1.28, 0.0)), (0.38, 0.85, 0.32), 1.3),
    ('руль_накладка.png', Vector((0.15, 0.70, 0.15)), (0.75, 0.25, 0.60), 0.9),
    ('проушины_люк.png', Vector((0, 0.1, 0.17)), (0.28, 0.32, 1.0), 2.6),
    ('надписи_заклёпки.png', Vector((0.05, -0.15, 0.03)), (1.0, 0.0, 0.18), 1.1),
    ('хвост_планки.png', Vector((0.1, -1.15, 0.1)), (0.62, -0.62, 0.44), 1.1),
    ('короб_низ.png', Vector((0, 0.0, -0.1)), (0.45, 0.25, -0.8), 3.0)])

mk.export(OUT + '/kab500l_sketchfab.glb', None)
lc = bpy.data.images.load(OUT + f'/kab500l_detail_{GAME_TEX}.jpg', check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
ln = bpy.data.images.load(OUT + f'/kab500l_normal_{GAME_NTEX}.png', check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
for m in [m for m in bpy.data.materials if m.name.startswith('K5L_')]:
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image is not None: nd.image = ln if nd.image.name == 'K5L_normal' else lc
mk.export(OUT + '/kab500l.glb', OUT + '/kab500l.blend')

col = {}
try: col = json.load(open(os.path.join(OUT, '_live', 'collide.json'), encoding='utf-8'))
except Exception as e: print('нет итога _collide.py:', e)
R = mk.passport(OUT + '/ПАСПОРТ.json', key='w_kab500l', weapon='kab500l', name='КАБ-500Л', name_en='KAB-500L', glb='kab500l.glb', blend='kab500l.blend', rev=1,
    build=['build.py', 'kab_geo.py', '_decals.py', 'bake.py', '_collide.py', 'deliver.py'], previews_=prev,
    checks={'moving_parts': col, 'silhouette_iou': {'бок': 'не считается: картинки в перспективе'}, 'wings_vs_lugs': f'верх крыльев при угле 0 ниже верха проушин ({g.R + g.LUG_H:.3f} м); при отклонении верхние крылья поднимаются выше', 'color': 'вариант 1 Mark, тон поднят: не темнее референс_3'},
    sketchfab={'title': 'KAB-500L Laser-Guided Bomb - Low Poly, Textured',
               'lead': 'KAB-500L, Soviet and Russian 500 kg laser-guided bomb in blue-grey metal with darker bands and stencilled markings. Hand-modelled: open seeker head with stabilising ring on a hinge, four short front rudders on bolted plates, four tail wings on hinged planks, two lifting lugs, hatch cover and a conduit along the belly. Moving parts have pivots on their real axes. Baked colour and normal maps, rivets in the normal map.',
               'parts': ['seeker head and ring', 'nose cone', 'four front rudders', 'bolted plates', 'hatch cover', 'two lugs', 'belly conduit', 'tail tube', 'four tail wings'],
               'tags': ['kab-500', 'kab-500l', 'bomb', 'laser-guided', 'guided-bomb', 'russia', 'military', 'weapon', 'lowpoly', 'game-ready', 'textured', 'blender'],
               'dimensions': f'length {LEN:.2f} m, body diameter {2 * g.R:.2f} m, tail span {mx.x - mn.x:.2f} m',
               'textures': f'{SKETCH_TEX} px baked colour map and tangent-space normal map',
               'based': 'Built from scratch in Blender from reference images.',
               'glb': 'kab500l_sketchfab.glb'},
    notes=f'Ревизия 1 (2026-11-04): форма - по референс_1, материал, швы, накладки и открытая головка - по референс_2 и 3; надпись УЧЕБНАЯ, красные заглушка и крышка люка не перенесены; пиксели картинок не использованы, надписи нарисованы заново (_decals.py), партия, ВВ, обр. и предупреждение придуманы, масса 525 кг - из игры. '
          f'Концы хвостовых крыльев {g.WING_R} м от оси против примерно 0,435 по чертежу: требование Mark не выше проушин. Диапазоны хода выбраны сборщиком, на картинках их нет. Для игры - цвет {GAME_TEX} (JPEG) и нормали {GAME_NTEX} (PNG), для Sketchfab - {SKETCH_TEX}.')
R['model']['length_m'] = LEN; R['model']['span_m'] = round(mx.x - mn.x, 3); R['model']['height_m'] = round(mx.z - mn.z, 3)
json.dump(R, open(OUT + '/ОТЧЁТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
pj['axes'] = 'glTF: нос -Z, верх +Y (проушины), начало на оси корпуса посередине длины; в файле все углы 0'
parts = {f'canard_{k}': dict(pivot_gltf=G2(g.CAN_PIVOTS[k]['o']), axis_gltf=G2(g.CAN_PIVOTS[k]['axis']), range_deg=[-g.CAN_RANGE, g.CAN_RANGE], note='начало узла на оси руля, ось радиальная') for k in range(4)}
parts.update({f'wing_{k}': dict(pivot_gltf=G2(g.WING_PIVOTS[k]['o']), axis_gltf=G2(g.WING_PIVOTS[k]['axis']), range_deg=[-g.WING_RANGE, g.WING_RANGE], note='начало узла на оси вдоль корня; при отклонении верхние крылья поднимаются выше проушин') for k in range(4)})
parts['seeker'] = dict(pivot_gltf=G2(Vector((0, g.Yb(g.A_PIV), 0))), range_deg=[-20, 20], note='шарнир на вершине конуса (шар в гнезде), поворот в любую сторону: две поперечные оси')
pj['parts'] = parts
pj['fixed'] = 'K5L_body, K5L_lugs, K5L_hatch, K5L_box, K5L_bits, K5L_plates, K5L_planks - неподвижны'
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT)
