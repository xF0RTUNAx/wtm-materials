# deliver.py - AGM-158 JASSM: снимки при дневном свете (раскрыта и как в файле), крупные планы, экспорт (Sketchfab - текстуры 2048, игра - цвет 1024 + нормали 1024), .blend, паспорт и отчёт. После build.py, bake.py и _collide.py в том же Blender:
#   JSM_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python _collide.py --python deliver.py
# Силуэт с IoU не считается: все картинки в перспективе; форма сверена на снимках с тех же ракурсов (_проба/сравнение.png). В файл уходят сложенные крылья и киль, все углы 0.
import os, sys, json
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector
import modelkit as mk
import jsm_geo as g
import _shots, _pose

OUT = os.environ.get('JSM_OUT')
if not OUT: raise SystemExit('Задай JSM_OUT=<папка модели>')
GAME_TEX, GAME_NTEX = int(os.environ.get('JSM_GAME_TEX', '1024')), int(os.environ.get('JSM_GAME_NTEX', '1024'))
SKETCH_TEX = int(os.environ.get('JSM_TEX', '2048'))
sc = bpy.data.scenes['JASSM']; bpy.context.view_layer.update()
st = mk.stats()
ms = [o for o in sc.objects if o.type == 'MESH']
pts = [o.matrix_world @ v.co for o in ms for v in o.data.vertices]
mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
LEN = round(mx.y - mn.y, 3)
print('габарит (сложена):', [round(v, 3) for v in (mx - mn)])
_pose.pose(True)
wx = max((o.matrix_world @ v.co).x for o in ms for v in o.data.vertices); SPAN = round(2 * wx, 2); print('размах раскрытой:', SPAN)
prev = [os.path.basename(p) for p in _shots.shots(OUT, size=(1920, 1080), views=[
    ('превью_1_общий.png', Vector((0, 0.1, 0.0)), (0.72, 0.60, 0.30), 6.2),
    ('превью_2_хвост.png', Vector((0, -1.0, 0.0)), (0.62, -0.68, 0.40), 4.0),
    ('превью_3_сверху.png', Vector((0, 0.0, 0.0)), (0.10, -0.02, 1.0), 7.2)])]
_pose.pose(False)
prev += [os.path.basename(p) for p in _shots.shots(OUT, size=(1920, 1080), views=[('превью_4_сложена.png', Vector((0, -0.1, -0.1)), (0.50, 0.20, -0.82), 5.4)])]
os.makedirs(OUT + '/снимки', exist_ok=True)
_shots.shots(OUT + '/снимки', size=(1600, 900), views=[
    ('упор_люк_швы.png', Vector((0.02, -0.3, 0.17)), (0.55, 0.30, 0.78), 1.8),
    ('сложена_хвост.png', Vector((0.1, -1.4, 0.03)), (0.50, -0.60, 0.62), 2.6),
    ('сопло_наплывы.png', Vector((0, -2.0, -0.08)), (0.45, -0.85, 0.15), 1.5),
    ('нос_надписи.png', Vector((0.05, 1.3, -0.02)), (0.85, 0.40, 0.20), 2.0),
    ('жёлтый_поясок.png', Vector((0.1, 1.05, 0.05)), (0.75, 0.25, 0.60), 1.1)])

mk.export(OUT + '/jassm_sketchfab.glb', None)
lc = bpy.data.images.load(OUT + f'/jassm_detail_{GAME_TEX}.jpg', check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
ln = bpy.data.images.load(OUT + f'/jassm_normal_{GAME_NTEX}.png', check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
for m in [m for m in bpy.data.materials if m.name.startswith('JSM_')]:
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image is not None: nd.image = ln if nd.image.name == 'JSM_normal' else lc
mk.export(OUT + '/jassm.glb', OUT + '/jassm.blend')

col = {}
try: col = json.load(open(os.path.join(OUT, '_live', 'collide.json'), encoding='utf-8'))
except Exception as e: print('нет итога _collide.py:', e)
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
NOZ = Vector((0.0, g.Yb(g.NOZ_A), g.NOZ_Z))
R = mk.passport(OUT + '/ПАСПОРТ.json', key='w_jassm', weapon='jassm', name='AGM-158 JASSM', name_en='AGM-158 JASSM', glb='jassm.glb', blend='jassm.blend', rev=1,
    build=['build.py', 'jsm_geo.py', '_decals.py', 'bake.py', '_collide.py', '_shots.py', '_pose.py', 'deliver.py'], previews_=prev,
    checks={'deploy': col, 'silhouette_iou': {'бок': 'не считается: картинки в перспективе'}, 'folded_vs_lugs': 'сложенные крылья и киль ниже верха упоров', 'nozzle': 'nozzleOf на стенде даёт (-0,10; 0,00; 2,06); верное значение - nozzle_gltf', 'color': 'тон поднят под референс_4 (бежево-серый, выбор Mark)'},
    sketchfab={'title': 'AGM-158 JASSM Cruise Missile - Game-Ready',
               'lead': 'AGM-158 JASSM, stealth air-launched cruise missile in beige-grey paint with a yellow band and dark seams. Hand-modelled: sharp nose with chines, flat belly, side strakes, offset hollow nozzle, two suspension lugs, top hatch. Folding wings under the belly and a folding fin on the tail spine, each on its own hinge: the model is stored folded. Baked colour and normal maps with dust, streaks, scratches, tape patches and soot.',
               'parts': ['nose with chines', 'body with two seams', 'side strakes', 'hollow nozzle', 'two lugs', 'hatch', 'two folding wings', 'folding fin'],
               'tags': ['agm-158', 'jassm', 'cruise-missile', 'missile', 'stealth', 'air-to-surface', 'military', 'weapon', 'game-ready', 'textured', 'pbr', 'blender'],
               'dimensions': f'length {LEN:.2f} m, body width 0.56 m, wing span {SPAN:.2f} m unfolded',
               'textures': f'{SKETCH_TEX} px baked colour map and tangent-space normal map',
               'based': 'Built from scratch in Blender from reference images. Original markings only.',
               'glb': 'jassm_sketchfab.glb'},
    notes=f'Ревизия 1 (2026-11-04): форма - по референс_1 и 2, окраска и детали - по референс_3 и 4, тон бежево-серый (выбор Mark). Логотипы, опознавательный знак и чужие надписи не перенесены; пиксели картинок не использованы, надписи свои, номера придуманы. '
          f'Сечение, размах {SPAN} м (по памяти), угол раскрытия крыльев 65° и способ складывания киля вбок - додуманы: картинки в перспективе и показывают только раскрытое положение. Для игры - цвет {GAME_TEX} (JPEG) и нормали {GAME_NTEX} (PNG), для Sketchfab - {SKETCH_TEX}.')
R['model']['length_m'] = LEN; R['model']['span_m'] = SPAN; R['model']['height_m'] = round(mx.z - mn.z, 3)
json.dump(R, open(OUT + '/ОТЧЁТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
pj['axes'] = 'glTF: нос -Z, верх +Y (упоры), начало на оси корпуса посередине длины; в файле крылья и киль сложены, все углы 0'
parts = {n: dict(pivot_gltf=G2(D['o']), axis_gltf=[0.0, 1.0, 0.0], open_deg=D['open_deg'], folded_deg=0.0, note='вертикальная ось у корня; поворот вокруг +Y glTF, стреловидность раскрытого 25°') for n, D in g.WING_PIVOTS.items()}
parts['fin'] = dict(pivot_gltf=G2(g.FIN_PIVOT['o']), axis_gltf=G2(g.FIN_PIVOT['axis']), open_deg=g.FIN_PIVOT['open_deg'], folded_deg=0.0, note='ось вдоль корня киля; в файле лежит плашмя на +X; раскрытия в игре пока нет')
pj['parts'] = parts; pj['nozzle_gltf'] = G2(NOZ)
pj['fixed'] = 'JSM_body, JSM_strakes, JSM_spine, JSM_lugs (упоры и люк) - неподвижны'
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT)
