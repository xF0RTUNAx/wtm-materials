# ФАБ-100 - сдача: превью, экспорт (Sketchfab в трёх качествах + игра), паспорт и отчёт. Mark: «Собирай» (2026-11-08). Запускается ПОСЛЕ build.py и bake.py:
#   FB_OUT="<папка>" FB_TEX=4096 FB_NTEX=2048 /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# Уровень 2: deno run -A tools/airdef-models/preview-candidate.js w_fab100 "$F/fab100.glb" --out "$F/превью-игра" --tex 1024 --ntex 512
import os, sys, json
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector
import modelkit as mk

OUT = os.environ.get('FB_OUT')
if not OUT: raise SystemExit('Задай FB_OUT=<папка модели>')
GAME_TEX, GAME_NTEX = int(os.environ.get('FB_GAME_TEX', '1024')), int(os.environ.get('FB_GAME_NTEX', '512'))
SKETCH_TEX = int(os.environ.get('FB_TEX', '4096'))
sc = bpy.data.scenes['FAB100']; bpy.context.view_layer.update()
G = mk.GEO
objs = [o for o in sc.objects if o.type == 'MESH']
pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))); mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
LEN = round(mx.y - mn.y, 3)
tris = sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)
os.makedirs(OUT + '/снимки', exist_ok=True)
BG = (0.62, 0.64, 0.66)
prev = [os.path.basename(p) for p in mk.previews(OUT, bg=BG, views=[
    ('превью_1_общий.png', Vector((0, 0.0, 0.0)), (-0.62, 0.55, 0.40), 2.3),
    ('превью_2_сбоку.png', Vector((0, 0, 0)), (1.0, 0.0, 0.08), 1.9),
    ('превью_3_нос.png', Vector((0, 0.38, 0.0)), (0.6, 0.6, 0.30), 0.85),
    ('превью_4_хвост.png', Vector((0, -0.38, 0.0)), (-0.55, -0.6, 0.45), 0.9)])]
mk.previews(OUT + '/снимки', size=(1600, 900), bg=BG, views=[
    ('левый_борт.png', Vector((0, 0, 0)), (-1.0, 0.0, 0.08), 1.9),
    ('ушко.png', Vector((0, mk.Yb_(G['A_LUG']), G['R'])), (0.5, 0.3, 0.8), 0.45),
    ('сзади.png', Vector((0, -0.5, 0.0)), (0.1, -1.0, 0.15), 0.8)])
mk.export(OUT + '/fab100_sketchfab.glb', None)
imgs = [nd for m in bpy.data.materials if m.name.startswith('FB_') and m.node_tree for nd in m.node_tree.nodes if nd.type == 'TEX_IMAGE' and nd.image is not None]
def use(cpath, npath):
    lc = bpy.data.images.load(cpath, check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
    ln = bpy.data.images.load(npath, check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
    for nd in imgs: nd.image = ln if nd.image.colorspace_settings.name == 'Non-Color' else lc
def lite(name, px, fmt):
    im = bpy.data.images['FB_normal' if 'normal' in name else 'FB_detail'].copy(); im.scale(px, px); im.file_format = fmt
    p_ = os.path.join(OUT, name)
    try: im.save(filepath=p_, quality=92)
    except TypeError:
        im.filepath_raw = p_; im.save()
    bpy.data.images.remove(im); return p_
use(lite('fab100_detail_2048.jpg', 2048, 'JPEG'), lite('fab100_normal_1024.png', 1024, 'PNG')); mk.export(OUT + '/fab100_sketchfab_2k.glb', None)
use(OUT + f'/fab100_detail_{GAME_TEX}.jpg', OUT + f'/fab100_normal_{GAME_NTEX}.png'); mk.export(OUT + '/fab100_sketchfab_1k.glb', None)
mk.export(OUT + '/fab100.glb', OUT + '/fab100.blend')
R = mk.passport(OUT + '/ПАСПОРТ.json', key='w_fab100', weapon='fab100', name='ФАБ-100', name_en='FAB-100 bomb', glb='fab100.glb', blend='fab100.blend', rev=1,
    build=['build.py', 'bake.py', 'deliver.py'], previews_=prev,
    checks={'silhouette_iou': {'бок': 'по 4 фото Mark (выставочные ОФАБ-100-120): длина 1,07 как в игре, Ø 0,27; хвост вровень с корпусом (замечание Mark); IoU не считали'},
            'color': 'заводской серый (линейно 0,33 / 0,355 / 0,38), медиана цилиндра на снимке сбоку sRGB 127/133/139; на фото серый от ~125 (тень, фото 2) до ~155 (фото 4), фото 3 синее'},
    sketchfab={'title': 'FAB-100 Soviet 100 kg Bomb',
               'lead': 'Soviet FAB-100 100 kg high-explosive free-fall bomb, built for a game from photos of exhibition examples. Blunt rounded nose with a red fuze cone, two welded bands at the nose and one at the tail cone, a suspension lug on a welded pad and a box-type stabilizer: four fins and a ring. Factory grey paint with a FAB-100 stencil, made-up lot numbers and light wear.',
               'parts': ['blunt nose with fuze socket', 'red fuze cone', 'welded bands', 'suspension lug on a pad', 'tail cone and tube', 'four fins', 'stabilizer ring'],
               'tags': ['fab-100', 'fab', 'bomb', 'aerial-bomb', 'free-fall', 'soviet', 'russian', 'military', 'weapon', 'ordnance', 'aircraft', 'game-ready'],
               'dimensions': f'length {LEN:.2f} m, diameter 0.27 m',
               'textures': f'{SKETCH_TEX} px baked colour map and tangent-space normal map',
               'based': 'Built from scratch in Blender from public photos.',
               'glb': 'fab100_sketchfab.glb'},
    notes=f'Ревизия 1 (2026-11-08). По 4 фото Mark (ОФАБ-100-120, макеты). В игре название - просто «ФАБ-100» (без М-80), сейчас в arsenal.js name: ФАБ-100М-80. Модель {tris} тр.')
R['model']['length_m'] = LEN; R['model']['span_m'] = round(mx.x - mn.x, 3); R['model']['height_m'] = round(mx.z - mn.z, 3)
json.dump(R, open(OUT + '/ОТЧЁТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
pj['axes'] = 'glTF: нос (взрыватель) -Z, верх +Y (ушко), начало на оси посередине длины 1,07 м'
pj['lug_gltf'] = G2(Vector((0.0, mk.Yb_(G['A_LUG']), G['R'] + 0.030)))
pj['lug_note'] = 'одно ушко подвески сверху, на 0,41 м от острия взрывателя (0,125 м впереди середины длины); точка - середина дужки; подвес - только на внешних узлах'
pj['stations'] = 'только внешние узлы (внутренних отсеков не нужно)'
pj['game_name'] = 'ФАБ-100'
pj['fixed'] = 'FB_body (корпус с обечайками, трубкой и куполом), FB_fuze (гнездо и красный взрыватель), FB_lug (ушко), FB_tail (4 пера и кольцо) - всё неподвижно'
pj['tail_gltf'] = G2(Vector((0.0, mk.Yb_(G['L']), 0.0)))
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT, 'тр.', tris, 'длина', LEN)
