# Ложная цель - сдача: превью, экспорт, паспорт и отчёт. Mark: «Да, серо-зелёный». Запускается ПОСЛЕ build.py, _collide.py и bake.py:
#   DCE_OUT="<папка>" DCE_PAINT=зелёная /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python _collide.py --python bake.py --python deliver.py
# Уровень 2: deno run -A tools/airdef-models/preview-candidate.js w_decoy_e "$F/decoy_e.glb" --out "$F/превью-игра" --tex 1024 --ntex 512 (стенд полёта тип decoy не показывает)
# Файл для игры: крылья сложены. Файл для Sketchfab: крылья раскрыты.
import os, sys, json, math
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector
import modelkit as mk

OUT = os.environ.get('DCE_OUT')
if not OUT: raise SystemExit('Задай DCE_OUT=<папка модели>')
GAME_TEX, GAME_NTEX = int(os.environ.get('DCE_GAME_TEX', '1024')), int(os.environ.get('DCE_GAME_NTEX', '512'))
SKETCH_TEX = int(os.environ.get('DCE_TEX', '2048'))
sc = bpy.data.scenes['DECOY_E']; bpy.context.view_layer.update()
st = mk.stats()
G = mk.GEO
objs = [o for o in sc.objects if o.type == 'MESH']
pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))); mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
LEN = round(mx.y - mn.y, 3)
print('габариты сложенной в мире:', [round(v, 3) for v in mn], [round(v, 3) for v in mx], 'длина', LEN)
os.makedirs(OUT + '/снимки', exist_ok=True)
BG = (0.34, 0.36, 0.40)
W1, W2 = bpy.data.objects['wing1'], bpy.data.objects['wing2']; A = math.radians(G['WING_OPEN'])
W1.rotation_euler = (0, 0, A); W2.rotation_euler = (0, 0, -A); bpy.context.view_layer.update()
prev = [os.path.basename(p) for p in mk.previews(OUT, bg=BG, views=[('превью_1_общий.png', Vector((0, 0.0, -0.05)), (-0.62, 0.55, 0.50), 4.5)])]
mk.previews(OUT + '/снимки', size=(1600, 900), bg=BG, views=[
    ('раскрыты_сверху.png', Vector((0, 0.0, 0.0)), (0.0001, 0.0001, 1.0), 4.3),
    ('корень_снизу.png', Vector((-0.12, 0.28, -0.20)), (-0.50, 0.42, -0.76), 1.15)])
mk.export(OUT + '/decoy_e_sketchfab.glb', None)
W1.rotation_euler = (0, 0, 0); W2.rotation_euler = (0, 0, 0); bpy.context.view_layer.update()
prev += [os.path.basename(p) for p in mk.previews(OUT, bg=BG, views=[
    ('превью_2_сбоку.png', Vector((0, 0, 0)), (-1.0, 0.0, 0.03), 4.5),
    ('превью_3_хвост.png', Vector((0, -1.20, 0.05)), (-0.62, -0.72, 0.28), 1.35),
    ('превью_4_голова.png', Vector((0, 0.80, 0.02)), (-0.82, 0.45, 0.30), 1.5)])]
mk.previews(OUT + '/снимки', size=(1600, 900), bg=BG, views=[
    ('воздухозаборник.png', Vector((0, -0.75, 0.2)), (-0.55, 0.70, 0.46), 1.25),
    ('упоры.png', Vector((0, 0.15, 0.17)), (-0.70, 0.30, 0.64), 1.15),
    ('сложены_снизу.png', Vector((0, 0.0, -0.1)), (-0.42, 0.28, -0.86), 3.6),
    ('надписи_плюс_X.png', Vector((0, 0.0, 0.0)), (1.0, 0.0, 0.05), 2.0)])
lc = bpy.data.images.load(OUT + f'/decoy_e_detail_{GAME_TEX}.jpg', check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
ln = bpy.data.images.load(OUT + f'/decoy_e_normal_{GAME_NTEX}.png', check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
for m in [m for m in bpy.data.materials if m.name.startswith('DCE_') and m.node_tree]:
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image is not None: nd.image = ln if nd.image.name == 'DCE_normal' else lc
mk.export(OUT + '/decoy_e.glb', OUT + '/decoy_e.blend')
col = {}
try: col = json.load(open(os.path.join(OUT, '_live', 'collide.json'), encoding='utf-8'))
except Exception as e: print('нет итога _collide.py:', e)
tris = sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)
SPAN = 2 * (0.165 + 0.68 * math.sin(A))
R = mk.passport(OUT + '/ПАСПОРТ.json', key='w_decoy_e', weapon='decoy_e', name='Ложная цель (имитатор)', name_en='Decoy', glb='decoy_e.glb', blend='decoy_e.blend', rev=1,
    build=['build.py', '_collide.py', 'bake.py', 'deliver.py'], previews_=prev,
    checks={'collisions': col, 'silhouette_iou': {'бок': 'картинок нет, форма выдумана'}, 'color': 'серо-зелёный #727c6d, рядом Х-59М #717671, КАБ-500Кр #505863 (миниатюры игры)'},
    sketchfab={'title': 'Air-Launched Decoy - Fictional Design',
               'lead': 'A fictional small air-launched jet decoy made for a game, not a copy of any real weapon. Grey-green paint with a light nose fairing, seams, rivets, hatches and made-up stencil markings. Folding wings and four tail rudders are separate parts with pivots on their real axes. In this file the wings are open; they fold back under the belly.',
               'parts': ['nose fairing', 'squared body sections', 'dorsal air intake', 'hollow nozzle', 'two suspension lugs', 'cable ducts', 'side fairings', 'wing box', 'two folding wings', 'four tail rudders', 'two antennas'],
               'tags': ['decoy', 'air-launched', 'fictional', 'jet', 'missile', 'military', 'weapon', 'aircraft', 'game-ready', 'textured', 'blender', 'sci-fi'],
               'dimensions': f'length {LEN:.2f} m, body width {2 * mk.RB * mk.S:.2f} m, wing span about {SPAN:.2f} m',
               'textures': f'{SKETCH_TEX} px baked colour map and tangent-space normal map',
               'based': 'Own design, built from scratch in Blender.',
               'glb': 'decoy_e_sketchfab.glb'},
    notes=f'Ревизия 1 (2026-11-04): форма выдумана по заданию, картинок нет. Mark: «Да, серо-зелёный». Надписи условные, есть ИМИТАТОР. Ходы рулей выбраны сборщиком. Стенд полёта тип decoy не показывает: сопло посчитано по формуле nozzleOf, (0; 0; 1,35). Модель {tris} тр.')
R['model']['length_m'] = LEN; R['model']['span_m'] = round(mx.x - mn.x, 3); R['model']['height_m'] = round(mx.z - mn.z, 3)
json.dump(R, open(OUT + '/ОТЧЁТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
pj['axes'] = 'glTF: нос -Z, верх +Y (упоры), начало на оси корпуса посередине длины; в файле крылья сложены назад, все углы 0'
parts = {}
for k in (1, 2):
    parts[f'wing{k}'] = dict(pivot_gltf=G2(mk.WING[k]['o']), axis_gltf=[0.0, 1.0, 0.0], open_deg=mk.WING[k]['open_deg'], folded_deg=0.0, note='вертикальная ось у корня по передней кромке; раскрытое - стреловидность 10°, как в wings: deploy')
for k in range(4):
    parts[f'rudder_{k}'] = dict(pivot_gltf=G2(mk.RUD[k]['o']), axis_gltf=G2(mk.RUD[k]['axis']), range_deg=[-G['RUD_RANGE'], G['RUD_RANGE']], note='радиальная ось; ход выбран сборщиком')
pj['parts'] = parts
pj['fixed'] = 'DCE_body (с соплом), DCE_fixed (подложка крыльев, воздухозаборник, упоры, короба, обтекатели, антенны), DCE_seats - неподвижны'
pj['nozzle_gltf'] = [0.0, 0.0, 1.4]
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT, 'тр.', tris)
