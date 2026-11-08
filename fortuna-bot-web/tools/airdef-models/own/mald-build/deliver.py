# ADM-160 MALD - сдача: превью, экспорт, паспорт и отчёт. Mark: «Собирай» (2026-11-08). Запускается ПОСЛЕ build.py, _collide.py и bake.py:
#   MLD_OUT="<папка>" /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python _collide.py --python bake.py --python deliver.py
# Уровень 2: deno run -A tools/airdef-models/preview-candidate.js w_mald "$F/mald.glb" --out "$F/превью-игра" --tex 1024 --ntex 512
# Файл для игры: крылья сложены (углы 0). Файл для Sketchfab: крылья раскрыты.
import os, sys, json, math
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector
import modelkit as mk

OUT = os.environ.get('MLD_OUT')
if not OUT: raise SystemExit('Задай MLD_OUT=<папка модели>')
GAME_TEX, GAME_NTEX = int(os.environ.get('MLD_GAME_TEX', '1024')), int(os.environ.get('MLD_GAME_NTEX', '512'))
SKETCH_TEX = int(os.environ.get('MLD_TEX', '2048'))
sc = bpy.data.scenes['MALD']; bpy.context.view_layer.update()
st = mk.stats()
G = mk.GEO
objs = [o for o in sc.objects if o.type == 'MESH']
pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))); mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
LEN = round(mx.y - mn.y, 3)
print('габариты сложенной:', [round(v, 3) for v in mn], [round(v, 3) for v in mx], 'длина', LEN)
os.makedirs(OUT + '/снимки', exist_ok=True)
BG = (0.62, 0.64, 0.66)
W1, W2 = bpy.data.objects['wing1'], bpy.data.objects['wing2']
def wings(open_):
    for k, o in ((1, W1), (2, W2)): o.rotation_euler = (0, 0, math.radians(mk.WING[k]['open_deg'] if open_ else 0.0))
    bpy.context.view_layer.update()
wings(True)
ptso = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]; SPAN = max(p.x for p in ptso) - min(p.x for p in ptso)
prev = [os.path.basename(p) for p in mk.previews(OUT, bg=BG, views=[('превью_1_общий.png', Vector((0, 0.0, -0.05)), (-0.62, 0.55, 0.50), 4.3)])]
mk.previews(OUT + '/снимки', size=(1600, 900), bg=BG, views=[
    ('раскрыты_снизу.png', Vector((0, 0.0, -0.1)), (-0.45, 0.30, -0.84), 4.0),
    ('раскрыты_сверху.png', Vector((0, 0.0, 0.0)), (0.0001, 0.0001, 1.0), 4.0)])
mk.export(OUT + '/mald_sketchfab.glb', None)
wings(False)
prev += [os.path.basename(p) for p in mk.previews(OUT, bg=BG, views=[
    ('превью_2_сбоку.png', Vector((0, 0, 0)), (1.0, 0.0, 0.04), 4.0),
    ('превью_3_хвост.png', Vector((0, -1.15, -0.05)), (0.65, -0.55, -0.35), 1.25),
    ('превью_4_голова.png', Vector((0, 1.0, -0.02)), (0.75, 0.55, 0.25), 1.15)])]
mk.previews(OUT + '/снимки', size=(1600, 900), bg=BG, views=[
    ('упоры_маркировка.png', Vector((0, 0.15, 0.05)), (0.75, 0.25, 0.45), 1.3),
    ('сложены_снизу.png', Vector((0, 0.0, -0.1)), (-0.42, 0.28, -0.86), 3.6),
    ('правый_борт.png', Vector((0, 0.0, 0.0)), (-1.0, 0.0, 0.05), 3.9)])
lc = bpy.data.images.load(OUT + f'/mald_detail_{GAME_TEX}.jpg', check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
ln = bpy.data.images.load(OUT + f'/mald_normal_{GAME_NTEX}.png', check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
for m in [m for m in bpy.data.materials if m.name.startswith('MLD_') and m.node_tree]:
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image is not None: nd.image = ln if nd.image.name == 'MLD_normal' else lc
mk.export(OUT + '/mald.glb', OUT + '/mald.blend')
col = {}
try: col = json.load(open(os.path.join(OUT, '_live', 'collide.json'), encoding='utf-8'))
except Exception as e: print('нет итога _collide.py:', e)
tris = sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)
R = mk.passport(OUT + '/ПАСПОРТ.json', key='w_mald', weapon='mald', name='ADM-160 MALD', name_en='ADM-160 MALD', glb='mald.glb', blend='mald.blend', rev=1,
    build=['build.py', '_collide.py', 'bake.py', 'deliver.py'], previews_=prev,
    checks={'collisions': col, 'silhouette_iou': {'бок': 'фото с перспективой (03, 05), IoU не считали; пропорции сняты с фото 03 (920 пикс. = 2,84 м)'},
            'color': 'светло-серая (линейно 0,44 / 0,45 / 0,465), проба сбоку sRGB ~143-151 при фото 03-05 ~137-160'},
    sketchfab={'title': 'ADM-160 MALD Air-Launched Decoy',
               'lead': 'Miniature air-launched decoy ADM-160 MALD built for a game. Light grey paint with a yellow nose band, seams, rivets, hatches and made-up stencil markings (no real serial numbers). Two scissor wings swing out from one pivot under the belly; the wings are separate parts on their real axis. In this file the wings are open.',
               'parts': ['ogive nose', 'squared body sections', 'two scissor wings on one pivot', 'three tail fins', 'ventral air intake', 'hollow nozzle', 'two suspension lugs', 'cable ducts'],
               'tags': ['mald', 'adm-160', 'decoy', 'air-launched', 'jet', 'missile', 'military', 'weapon', 'usaf', 'game-ready', 'textured', 'blender'],
               'dimensions': f'length {LEN:.2f} m, wing span {SPAN:.2f} m',
               'textures': f'{SKETCH_TEX} px baked colour map and tangent-space normal map',
               'based': 'Built from scratch in Blender from public photos.',
               'glb': 'mald_sketchfab.glb'},
    notes=f'Ревизия 1 (2026-11-08). Форма по фото 01-06, окраска по 03-05, кольцо по 04. Крылья на общей оси под корпусом (фото 03: сложены вдоль низа вперёд и назад). Кили неподвижны (на 05 одинаковы сложенными и раскрытыми). Маркировка придуманная. Модель {tris} тр.')
R['model']['length_m'] = LEN; R['model']['span_m'] = round(SPAN, 3); R['model']['height_m'] = round(mx.z - mn.z, 3)
json.dump(R, open(OUT + '/ОТЧЁТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
pj['axes'] = 'glTF: нос -Z, верх +Y (упоры), начало на оси корпуса посередине длины; в файле крылья сложены (wing1 назад, wing2 вперёд, друг под другом), все углы 0'
parts = {}
for k, side in ((1, 'левое, x+; в сложенном лежит назад, верхнее'), (2, 'правое, x-; в сложенном лежит вперёд, нижнее')):
    parts[f'wing{k}'] = dict(pivot_gltf=G2(mk.WING[k]['o']), axis_gltf=[0.0, 1.0, 0.0], open_deg=round(mk.WING[k]['open_deg'], 1), folded_deg=0.0,
                             note=f'{side}; общая вертикальная ось под корпусом (a = 1,22 м от носа); оба поворачиваются в одну сторону, раскрытое - стреловидность 8° назад у обоих')
pj['parts'] = parts
pj['fixed'] = 'MLD_body (с соплом), MLD_fixed (упоры, короба, воздухозаборник), MLD_ring (жёлтое кольцо), MLD_pin (ось крыльев), MLD_fin_top / fin_xp / fin_xn - кили, неподвижны (влезает в отсек F-35: ширина по килям 0,63 м)'
pj['nozzle_gltf'] = G2(Vector((0.0, mk.Yb_(G['A_END']), 0.0)))
pj['intake_gltf'] = G2(Vector((0.0, mk.Yb_(2.24), -0.17)))
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT, 'тр.', tris, 'длина', LEN, 'размах', round(SPAN, 3))
