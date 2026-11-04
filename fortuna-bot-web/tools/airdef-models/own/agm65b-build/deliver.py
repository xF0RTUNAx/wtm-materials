# deliver.py - AGM-65B: превью, крупные планы, экспорт (Sketchfab - текстуры 2048, игра - цвет 1024 + нормали 512), .blend, паспорт и отчёт. Запускается ПОСЛЕ build.py, bake.py и _collide.py в том же Blender:
#   AGM_OUT="<папка модели>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python _collide.py --python deliver.py
# Силуэт с IoU не считается: все картинки - перспектива (IoU только для чертежей); форма сверена с ними на снимках с тех же ракурсов.
import os, sys, json
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector
import modelkit as mk
import agm_geo as g

OUT = os.environ.get('AGM_OUT')
if not OUT: raise SystemExit('Задай AGM_OUT=<папка модели>')
GAME_TEX, GAME_NTEX = int(os.environ.get('AGM_GAME_TEX', '1024')), int(os.environ.get('AGM_GAME_NTEX', '512'))
SKETCH_TEX = int(os.environ.get('AGM_TEX', '2048'))
sc = bpy.data.scenes['AGM65B']; bpy.context.view_layer.update()
st = mk.stats()
ms = [o for o in sc.objects if o.type == 'MESH']
pts = [o.matrix_world @ v.co for o in ms for v in o.data.vertices]
mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
LEN = round(mx.y - mn.y, 3)
print('габарит:', [round(v, 3) for v in (mx - mn)])

prev = [os.path.basename(p) for p in mk.previews(OUT, bg=(0.46, 0.49, 0.53), views=[
    ('превью_1_общий.png', Vector((0, 0.15, 0.02)), (0.62, 0.72, 0.42), 3.0),
    ('превью_2_сбоку.png', Vector((0, 0, 0)), (1.0, 0.0, 0.05), 3.1),
    ('превью_3_хвост.png', Vector((0, -0.40, 0.0)), (-0.55, -0.80, 0.22), 2.9),
    ('превью_4_голова.png', Vector((0, 0.75, 0.0)), (-0.52, 0.80, 0.20), 1.7)])]
os.makedirs(OUT + '/снимки', exist_ok=True)
mk.previews(OUT + '/снимки', size=(1600, 900), bg=(0.46, 0.49, 0.53), views=[
    ('сопло_сзади.png', Vector((0, -1.15, 0.0)), (-0.10, -1.0, 0.10), 0.95),
    ('стекло_оптика.png', Vector((0, 1.15, 0.0)), (0.25, 1.0, 0.12), 0.80),
    ('упор_рельс.png', Vector((0, -0.20, 0.17)), (0.30, 0.45, 1.0), 2.0),
    ('заклёпки_надписи.png', Vector((0.05, 0.0, 0.03)), (1.0, 0.1, 0.25), 1.0),
    ('руль.png', Vector((0.15, -1.10, 0.15)), (0.8, -0.5, 0.6), 0.7)])

mk.export(OUT + '/agm65b_sketchfab.glb', None)
lc = bpy.data.images.load(OUT + f'/agm65b_detail_{GAME_TEX}.jpg', check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
ln = bpy.data.images.load(OUT + f'/agm65b_normal_{GAME_NTEX}.png', check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
for m in [m for m in bpy.data.materials if m.name.startswith('M65_')]:
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image is not None: nd.image = ln if nd.image.name == 'M65_normal' else lc
mk.export(OUT + '/agm65b.glb', OUT + '/agm65b.blend')

col = {}
try: col = json.load(open(os.path.join(OUT, '_live', 'collide.json'), encoding='utf-8'))
except Exception as e: print('нет итога _collide.py:', e)
R = mk.passport(OUT + '/ПАСПОРТ.json', key='w_agm65b', weapon='agm65b', name='AGM-65B Maverick', name_en='AGM-65B Maverick', glb='agm65b.glb', blend='agm65b.blend', rev=1,
    build=['build.py', 'agm_geo.py', '_decals.py', 'bake.py', '_collide.py', 'deliver.py'], previews_=prev,
    checks={'rudders': col, 'silhouette_iou': {'бок': 'не считается: картинки в перспективе'}, 'color': 'белый корпус на пробе #e6e8e8, на референс_1 #dee2e7'},
    sketchfab={'title': 'AGM-65B Maverick Missile - Low Poly, Textured',
               'lead': 'AGM-65B Maverick, US air-to-ground TV-guided missile with the white paint scheme, black and brown bands, a red ring around the seeker window and stencilled markings. Hand-modelled: seeker glass with optics inside, four long fixed wings, four tail control fins on their own pivots, hollow rocket nozzle, forward hanger and long launch rail. Baked colour and normal maps, rivets in the normal map.',
               'parts': ['seeker glass and optics', 'nose section', 'black steel band', 'forward hanger', 'long launch rail', 'four long wings', 'four tail fins', 'brown band', 'hollow nozzle'],
               'tags': ['agm-65', 'agm-65b', 'maverick', 'missile', 'air-to-ground', 'usaf', 'military', 'weapon', 'lowpoly', 'game-ready', 'textured', 'blender'],
               'dimensions': f'length {LEN:.2f} m, body diameter {2 * g.R:.2f} m, wing span {2 * g.WING_R:.2f} m',
               'textures': f'{SKETCH_TEX} px baked colour map and tangent-space normal map',
               'based': 'Built from scratch in Blender from reference images.',
               'glb': 'agm65b_sketchfab.glb'},
    notes=f'Ревизия 1 (2026-11-04): окраска и надписи - по белой ракете референс_1 (65B), форма упоров, рельса, заклёпок и сопла - по референс_2 и 3 (другие версии, жёлтый поясок и их надписи не перенесены); пиксели картинок не использованы, надписи нарисованы заново (_decals.py), номера в мелких строках придуманы. '
          f'Длина {LEN} м (прежняя 2,495), Ø 0,30, размах 0,72. Диапазон рулей ±{g.RUD_RANGE:.0f}° выбран сборщиком (на картинках его нет). Для игры - цвет {GAME_TEX} (JPEG) и нормали {GAME_NTEX} (PNG), для Sketchfab - {SKETCH_TEX}.')
R['model']['length_m'] = LEN; R['model']['span_m'] = round(mx.x - mn.x, 3); R['model']['height_m'] = round(mx.z - mn.z, 3)
json.dump(R, open(OUT + '/ОТЧЁТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
pj['axes'] = 'glTF: нос -Z, верх +Y (упоры и рельс), начало на оси корпуса посередине длины; в файле все углы рулей 0'
pj['parts'] = {f'rudder_{k}': dict(pivot_gltf=G2(g.RUD_PIVOTS[k]['o']), axis_gltf=G2(g.RUD_PIVOTS[k]['axis']), range_deg=[-g.RUD_RANGE, g.RUD_RANGE], note='начало узла на оси руля, ось радиальная') for k in range(4)}
pj['fixed'] = 'M65_body, M65_wings, M65_lugs, M65_nozzle, M65_tailbits, M65_seats, M65_optics, M65_glass - неподвижны; складных частей нет'
pj['materials'] = dict(glass='M65_glass: прозрачное стекло головки (BLEND), под ним M65_optics с M65_lens и M65_optic - плоские материалы, без текстур')
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT)
