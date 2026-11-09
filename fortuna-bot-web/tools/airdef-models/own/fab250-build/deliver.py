# ФАБ-250 - сдача: превью, экспорт (Sketchfab в трёх качествах + игра), паспорт и отчёт. Mark: «Собирай» (2026-11-08). Запускается ПОСЛЕ build.py и bake.py:
#   FB_OUT="<папка>" FB_TEX=4096 FB_NTEX=2048 /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python build.py --python bake.py --python deliver.py
# Уровень 2: deno run -A tools/airdef-models/preview-candidate.js w_fab250 "$F/fab250.glb" --out "$F/превью-игра" --tex 1024 --ntex 512
import os, sys, json
sys.dont_write_bytecode = True
import bpy
from mathutils import Vector
import modelkit as mk

OUT = os.environ.get('FB_OUT')
if not OUT: raise SystemExit('Задай FB_OUT=<папка модели>')
GAME_TEX, GAME_NTEX = int(os.environ.get('FB_GAME_TEX', '1024')), int(os.environ.get('FB_GAME_NTEX', '512'))
SKETCH_TEX = int(os.environ.get('FB_TEX', '4096'))
sc = bpy.data.scenes['FAB250']; bpy.context.view_layer.update()
G = mk.GEO
objs = [o for o in sc.objects if o.type == 'MESH']
pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))); mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
LEN = round(mx.y - mn.y, 3)
tris = sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)
os.makedirs(OUT + '/снимки', exist_ok=True)
BG = (0.62, 0.64, 0.66)
prev = [os.path.basename(p) for p in mk.previews(OUT, bg=BG, views=[
    ('превью_1_общий.png', Vector((0, 0.0, 0.0)), (-0.62, 0.55, 0.40), 3.0),
    ('превью_2_сбоку.png', Vector((0, 0, 0)), (-1.0, 0.0, 0.08), 2.5),
    ('превью_3_нос.png', Vector((0, 0.48, 0.0)), (-0.6, 0.6, 0.30), 1.0),
    ('превью_4_хвост.png', Vector((0, -0.55, 0.0)), (-0.55, -0.6, 0.45), 1.0)])]
mk.previews(OUT + '/снимки', size=(1600, 900), bg=BG, views=[
    ('правый_борт.png', Vector((0, 0, 0)), (1.0, 0.0, 0.08), 2.5),
    ('ушки.png', Vector((0, mk.Yb_(sum(G['LUGS']) / 2), G['R'])), (0.5, 0.3, 0.8), 0.6),
    ('сзади.png', Vector((0, -0.7, 0.0)), (0.1, -1.0, 0.15), 0.9)])
mk.export(OUT + '/fab250_sketchfab.glb', None)
imgs = [nd for m in bpy.data.materials if m.name.startswith('FB2_') and m.node_tree for nd in m.node_tree.nodes if nd.type == 'TEX_IMAGE' and nd.image is not None]
def use(cpath, npath):
    lc = bpy.data.images.load(cpath, check_existing=False); lc.colorspace_settings.name = 'sRGB'; lc.pack()
    ln = bpy.data.images.load(npath, check_existing=False); ln.colorspace_settings.name = 'Non-Color'; ln.pack()
    for nd in imgs: nd.image = ln if nd.image.colorspace_settings.name == 'Non-Color' else lc
def lite(name, px, fmt):
    im = bpy.data.images['FB2_normal' if 'normal' in name else 'FB2_detail'].copy(); im.scale(px, px); im.file_format = fmt
    p_ = os.path.join(OUT, name)
    try: im.save(filepath=p_, quality=92)
    except TypeError:
        im.filepath_raw = p_; im.save()
    bpy.data.images.remove(im); return p_
use(lite('fab250_detail_2048.jpg', 2048, 'JPEG'), lite('fab250_normal_1024.png', 1024, 'PNG')); mk.export(OUT + '/fab250_sketchfab_2k.glb', None)
use(OUT + f'/fab250_detail_{GAME_TEX}.jpg', OUT + f'/fab250_normal_{GAME_NTEX}.png'); mk.export(OUT + '/fab250_sketchfab_1k.glb', None)
mk.export(OUT + '/fab250.glb', OUT + '/fab250.blend')
R = mk.passport(OUT + '/ПАСПОРТ.json', key='w_fab250', weapon='fab250', name='ФАБ-250', name_en='FAB-250 bomb', glb='fab250.glb', blend='fab250.blend', rev=1,
    build=['build.py', 'bake.py', 'deliver.py'], previews_=prev,
    checks={'silhouette_iou': {'бок': 'по fab250_01 (схема формы, 1030 пикс/м при длине 1,5 м как в игре), диаметр 0,245 по отношению длины к диаметру ~6 на 01-03; IoU не считали'},
            'color': 'светло-серая заводская (линейно 0,76 / 0,79 / 0,86), медиана цилиндра на снимке сбоку sRGB 181/186/196 при фото 02 ~183/186/195'},
    sketchfab={'title': 'FAB-250 Soviet 250 kg Bomb',
               'lead': 'Soviet FAB-250 250 kg high-explosive free-fall bomb, built for a game from reference images. Ogival nose with a nose fuze, three welded bands, two suspension lugs on welded pads, tapered tail cone and a plus-shaped stabilizer of four fins with a ring. Light grey factory paint with a FAB-250 stencil across the body, made-up lot numbers and light wear.',
               'parts': ['ogival nose with fuze', 'three welded bands', 'two suspension lugs', 'tail cone and tube', 'four fins', 'stabilizer ring'],
               'tags': ['fab-250', 'fab', 'bomb', 'aerial-bomb', 'free-fall', 'soviet', 'russian', 'military', 'weapon', 'ordnance', 'aircraft', 'game-ready'],
               'dimensions': f'length {LEN:.2f} m, diameter 0.245 m',
               'textures': f'{SKETCH_TEX} px baked colour map and tangent-space normal map',
               'based': 'Built from scratch in Blender from reference images.',
               'glb': 'fab250_sketchfab.glb'},
    notes=f'Ревизия 1 (2026-11-09). По fab250_01 (форма), 02 (окраска, надпись), 03 (пропорции). В игре название - просто «ФАБ-250» (без М-54), переименует главный чат. Модель {tris} тр.')
R['model']['length_m'] = LEN; R['model']['span_m'] = round(mx.x - mn.x, 3); R['model']['height_m'] = round(mx.z - mn.z, 3)
json.dump(R, open(OUT + '/ОТЧЁТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
pj = json.load(open(OUT + '/ПАСПОРТ.json', encoding='utf-8')); pj['tex'] = GAME_TEX; pj['nTex'] = GAME_NTEX
G2 = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
pj['axes'] = 'glTF: нос (взрыватель) -Z, верх +Y (ушко), начало на оси посередине длины 1,07 м'
pj['lugs_gltf'] = [G2(Vector((0.0, mk.Yb_(al), G['R'] + 0.036))) for al in G['LUGS']]
pj['lugs_note'] = 'два ушка подвески сверху, на 0,345 и 0,544 м от острия взрывателя (шаг 0,2 м); точка - середина дужки; подвес только на внешних узлах'
pj['stations'] = 'только внешние узлы (внутренних отсеков не нужно)'
pj['game_name'] = 'ФАБ-250'
pj['fixed'] = 'FB2_body (корпус с поясами и трубкой), FB2_fuze (взрыватель), FB2_lugs (два ушка), FB2_tail (4 пера «+» и кольцо) - всё неподвижно'
pj['tail_gltf'] = G2(Vector((0.0, mk.Yb_(G['L']), 0.0)))
json.dump(pj, open(OUT + '/ПАСПОРТ.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('сдача готова:', OUT, 'тр.', tris, 'длина', LEN)
